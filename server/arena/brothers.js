// Kain and Abel (owner, 2026-10-24): two AI characters members play against, for fun. Each brother takes the call
// of a different bot that called this round through the bot API (bots and chart scripts with a key) and that call is
// shown as his. Since 2026-10-23 they call live: the first bots to call give the brothers their calls at once (which
// brother is random), and everyone sees a brother's call straight away. Which bot each brother took is kept for
// admins only (owner: "just post what the bot called"; "make it so it's not indicated what bot they used"), so the
// bot owners' own calls, sealed until the round ends, can't be traced. The public fine print says the calls come from
// bots on D3MON. Members make their own calls with the floor's Up/Down votes and see how they do against them.
//
// A brother's call is priced at the bot's own price (Kalshi's, when the bot called), so the paper results are the
// same ones the bot earned. One bot that called: only one brother plays. None: both sit the round out.
//
// Ledger lines:
//   { t: "brother_call", brother: "abel" | "kain", round, market, dir, callId, entrantId, live? }
//   { t: "brothers_settings", on, exclude: [entrantId] }        admins; the latest counts
//   { t: "brother_video", brother, type, size } | { t: "brother_video", brother, removed: true }
//
// Intro videos (owner, 2026-10-23): an admin uploads one video file per brother (MP4 or WebM, checked by its bytes,
// up to VIDEO_MAX). It's streamed straight to <data>/brothers/<key>.mp4|webm, never held in memory, and served
// publicly in byte ranges so phones can play it.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ApiError } from "./validate.js";
import { isAdmin } from "../rules.js";
import { ROUND_MS } from "./registry.js";
import { MARKET, currentRound } from "./calls.js";
import { paper } from "./prices.js";
import { periodAt } from "./tournaments.js";

export const BROTHERS = [
  { key: "abel", name: "Abel", tagline: "The researcher. Reads the world." },
  { key: "kain", name: "Kain", tagline: "The chart man. Reads the market." },
];
export const NOTICE = "Kain and Abel are AI characters. Their calls come from bots on D3MON. Paper only, for fun. Not financial advice. D3MON never trades.";
const PERIODS = ["daily", "weekly", "monthly"];
const RECENT = 12;
export const VIDEO_MAX = 200 * 1024 * 1024;
const VIDEO_EXT = { "video/mp4": ".mp4", "video/webm": ".webm" };
const r4 = x => Math.round(x * 10000) / 10000;

export class Brothers {
  constructor({ ledger, calls, metrics, prices, registry, votes, feed, dir = null, now = () => Date.now() }) {
    Object.assign(this, { ledger, calls, metrics, prices, registry, votes, feed, dir, now });
    this.videos = {}; // brother -> { type, size, at }
    this.byRound = new Map(); // round -> { abel: line, kain: line }
    this.cfg = { on: true, exclude: [] };
    for (const l of ledger.lines) this.#index(l);
    ledger.on("append", lines => {
      for (const l of lines) this.#index(l);
      // a bot's call during the round: a brother may take it (after this append has finished)
      if (this.live) for (const l of lines) if (l.t === "call" && l.via === "bot-key") queueMicrotask(() => { try { this.takeLive(l); } catch (err) { console.error(err); } });
    });
    this.live = false; // switched on by start(); tests call takeLive() themselves
    this.timer = null;
  }

  #index(l) {
    if (l.t === "brother_call") {
      if (!this.byRound.has(l.round)) this.byRound.set(l.round, {});
      this.byRound.get(l.round)[l.brother] = l;
    } else if (l.t === "brother_video") {
      if (l.removed) delete this.videos[l.brother]; else this.videos[l.brother] = { type: l.type, size: l.size, at: l.at };
    } else if (l.t === "brothers_settings") this.cfg = { on: l.on !== false, exclude: l.exclude || [] };
  }

  // ---------- picking
  // The bots that called this round through the bot API: the latest call of each active, not excluded bot or script.
  candidates(round) {
    const latest = new Map();
    for (const l of this.calls.byRound.get(`${MARKET}|${round}`) || []) latest.set(l.entrantId, l);
    return [...latest.values()].filter(l => {
      const e = this.registry.entrantById(l.entrantId);
      return l.via === "bot-key" && e && e.status === "active" && !this.cfg.exclude.includes(e.id);
    });
  }

  // The brothers who haven't called yet this round, and the bots already taken.
  #free(round) {
    const got = this.byRound.get(round) || {};
    return { brothers: BROTHERS.filter(b => !got[b.key]), used: new Set(Object.values(got).map(l => l.entrantId)) };
  }
  #write(lines, round) {
    if (!lines.length) return [];
    const out = this.ledger.append(lines, null, this.now());
    this.feed.publish("brothers", "brothers.called", { round, calls: this.#roundCalls(round, {}) });
    return out;
  }

  // Live (owner, 2026-10-23: "Kain and Abel can call as soon as they have it"): when a bot or script calls through
  // its key during the round, a brother who hasn't called yet takes that call at once (chosen at random), and
  // everyone sees it straight away, never which bot it came from. A different bot is needed for the other brother.
  takeLive(l) {
    if (!this.cfg.on || l.t !== "call" || l.via !== "bot-key" || l.market !== MARKET) return [];
    const now = this.now();
    if (now < l.round || now >= l.round + ROUND_MS) return [];
    const e = this.registry.entrantById(l.entrantId);
    if (!e || e.status !== "active" || this.cfg.exclude.includes(e.id)) return [];
    const { brothers, used } = this.#free(l.round);
    if (!brothers.length || used.has(l.entrantId)) return [];
    const b = brothers[crypto.randomInt(brothers.length)];
    return this.#write([{ t: "brother_call", brother: b.key, round: l.round, market: MARKET, dir: l.dir, callId: l.id, entrantId: l.entrantId, live: true }], l.round);
  }

  // After a round ends: any brother still without a call takes a random bot that called and wasn't taken (covers a
  // restart that missed a call). One bot: only one brother plays. None: both sit the round out.
  pick(round) {
    if (!this.cfg.on || this.now() < round + ROUND_MS) return [];
    const { brothers, used } = this.#free(round);
    const pool = this.candidates(round).filter(l => !used.has(l.entrantId));
    for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return this.#write(brothers.slice(0, pool.length).map((b, i) => ({ t: "brother_call", brother: b.key, round, market: MARKET, dir: pool[i].dir, callId: pool[i].id, entrantId: pool[i].entrantId })), round);
  }

  // Picks for the round that just ended (and the one before, if a restart missed it).
  pickDue() {
    const cur = currentRound(this.now());
    for (const r of [cur - 2 * ROUND_MS, cur - ROUND_MS]) {
      try { this.pick(r); } catch (e) { console.error(e); }
    }
  }

  // Wakes 2 s after every round ends: calls for a round close by its end, so the pool is complete.
  start() {
    this.live = true;
    const tick = () => {
      this.pickDue();
      const now = this.now();
      this.timer = setTimeout(tick, currentRound(now) + ROUND_MS + 2000 - now);
      this.timer.unref?.();
    };
    tick();
  }

  stop() { clearTimeout(this.timer); }

  // ---------- scoring
  // One brother's call as everyone sees it, with its price and result once there is one.
  #callView(l, ctx) {
    const p = this.prices ? this.prices.forCall(l.callId) : null, r = this.metrics.result(MARKET, l.round);
    const out = { dir: l.dir, paid: p ? p.paid : null };
    if (r) Object.assign(out, { result: r.result, correct: r.result === l.dir, profit: p ? paper(p.paid, r.result === l.dir) : null });
    if (isAdmin(ctx)) { const e = this.registry.entrantById(l.entrantId); out.from = e ? { name: e.name, slug: e.slug } : null; }
    return out;
  }

  #roundCalls(round, ctx) {
    const got = this.byRound.get(round) || {}, out = {};
    for (const b of BROTHERS) out[b.key] = got[b.key] ? this.#callView(got[b.key], ctx) : null;
    return out;
  }

  // A member's round: all their floor trades in it, summed. Decided once every trade is cashed out or settled.
  #memberRound(trades) {
    const outs = trades.map(t => this.votes.outcome(t));
    const decided = outs.every(o => o.status === "cashed" || o.status === "settled");
    const priced = outs.filter(o => o.profit !== null);
    const profit = priced.length ? r4(priced.reduce((a, o) => a + o.profit, 0)) : null;
    const won = !decided ? null : profit !== null ? profit > 0 : outs.every(o => o.success);
    return { trades: trades.length, dirs: [...new Set(trades.map(t => t.entry.dir))], decided, won, profit };
  }

  #memberRounds(uid) {
    const by = new Map();
    for (const t of this.votes.byUser.get(uid) || []) {
      if (!by.has(t.entry.round)) by.set(t.entry.round, []);
      by.get(t.entry.round).push(t);
    }
    return by;
  }

  // Rounds played, decided, won and paper profit per $1 between `from` and `to` (round starts).
  #tally(rows) {
    const decided = rows.filter(x => x.won !== null && x.won !== undefined), priced = decided.filter(x => x.profit !== null);
    const wins = decided.filter(x => x.won).length;
    return {
      played: rows.length, decided: decided.length, wins,
      winRate: decided.length ? Math.round((wins / decided.length) * 1000) / 10 : null,
      profit: priced.length ? r4(priced.reduce((a, x) => a + x.profit, 0)) : null,
    };
  }

  #brotherRows(key, from, to) {
    const rows = [];
    for (const [round, got] of this.byRound) {
      if (round < from || round >= to || !got[key]) continue;
      const v = this.#callView(got[key], {});
      rows.push({ won: v.result ? v.correct : null, profit: v.profit ?? null });
    }
    return rows;
  }

  // GET /brothers: the brothers, this round's clock, their recent rounds (with the reader's own beside them) and the
  // standings for today, this week and this month (US Eastern, like the tournaments).
  view(ctx) {
    const now = this.now(), round = currentRound(now), mine = ctx.uid ? this.#memberRounds(ctx.uid) : null;
    const rounds = [...this.byRound.keys()].sort((a, b) => b - a).slice(0, RECENT).map(r => {
      const res = this.metrics.result(MARKET, r);
      return { round: r, result: res ? res.result : null, calls: this.#roundCalls(r, ctx), ...(mine ? { you: mine.has(r) ? this.#memberRound(mine.get(r)) : null } : {}) };
    });
    const standings = {};
    for (const kind of PERIODS) {
      const p = periodAt(kind, now), s = { from: p.startsAt, to: p.endsAt };
      for (const b of BROTHERS) s[b.key] = this.#tally(this.#brotherRows(b.key, p.startsAt, p.endsAt));
      if (mine) s.you = this.#tally([...mine].filter(([r]) => r >= p.startsAt && r < p.endsAt).map(([, ts]) => this.#memberRound(ts)));
      standings[kind] = s;
    }
    return {
      brothers: BROTHERS.map(b => ({ ...b, ai: true, video: this.videoInfo(b.key) })), on: this.cfg.on,
      now: { round, endsAt: round + ROUND_MS, calls: this.#roundCalls(round, ctx) }, rounds, standings, notice: NOTICE,
    };
  }

  // ---------- admins
  #admin(ctx) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins can do that.");
  }

  // GET /brothers/settings: on or off, and every active bot and script with whether it's left out.
  settings(ctx) {
    this.#admin(ctx);
    const bots = this.registry.allEntrants().filter(e => e.status === "active" && e.kind !== "caller")
      .map(e => ({ id: e.id, name: e.name, slug: e.slug, kind: e.kind, excluded: this.cfg.exclude.includes(e.id) }));
    return { on: this.cfg.on, bots };
  }

  // PUT /brothers/settings { on?, exclude?: [entrantId] }
  setSettings(ctx, body = {}) {
    this.#admin(ctx);
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_argument", "Send a JSON object.");
    for (const k of Object.keys(body)) if (!["on", "exclude"].includes(k)) throw new ApiError(400, "invalid_argument", `Unknown field "${k}".`, k);
    const next = { ...this.cfg };
    if (body.on !== undefined) {
      if (typeof body.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", "on");
      next.on = body.on;
    }
    if (body.exclude !== undefined) {
      if (!Array.isArray(body.exclude) || body.exclude.length > 500 || body.exclude.some(id => typeof id !== "string" || !this.registry.entrantById(id)))
        throw new ApiError(400, "invalid_argument", "exclude is a list of bot and script ids.", "exclude");
      next.exclude = [...new Set(body.exclude)];
    }
    this.ledger.append([{ t: "brothers_settings", on: next.on, exclude: next.exclude }], ctx.uid, this.now());
    return this.settings(ctx);
  }

  // ---------- intro videos
  #key(key) {
    if (!BROTHERS.some(b => b.key === key)) throw new ApiError(404, "not_found", "No such brother.");
    return key;
  }
  #path(key, type) { return path.join(this.dir, `${key}${VIDEO_EXT[type]}`); }

  // What the page needs to play a brother's video, or null.
  videoInfo(key) {
    const v = this.videos[key];
    return v ? { url: `api/v1/brothers/video/${key}?v=${v.at}`, type: v.type, size: v.size } : null;
  }

  // The file to serve for GET /brothers/video/:key, or null.
  videoFile(key) {
    const v = this.videos[this.#key(key)];
    return v && this.dir ? this.#path(key, v.type) : null;
  }

  // PUT /brothers/video/:key with the file as the body: admins only. The role is checked before a byte is read.
  async saveVideo(ctx, key, req) {
    this.#admin(ctx);
    this.#key(key);
    if (!this.dir) throw new ApiError(503, "unavailable", "Video uploads aren't set up on this server.");
    const len = Number(req.headers["content-length"] || 0);
    if (len > VIDEO_MAX) throw new ApiError(413, "quota_exceeded", `The video is too big. The most is ${VIDEO_MAX / 1024 / 1024} MB.`);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = path.join(this.dir, `.${key}-${crypto.randomBytes(6).toString("hex")}.part`);
    let size = 0, head = Buffer.alloc(0);
    try {
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(tmp);
        let failed = false;
        const fail = err => { if (failed) return; failed = true; req.unpipe?.(out); out.destroy(); req.resume(); reject(err); };
        req.on("data", c => {
          size += c.length;
          if (head.length < 16) head = Buffer.concat([head, c.subarray(0, 16)]);
          if (size > VIDEO_MAX) fail(new ApiError(413, "quota_exceeded", `The video is too big. The most is ${VIDEO_MAX / 1024 / 1024} MB.`));
        });
        req.on("error", fail);
        out.on("error", fail);
        out.on("finish", () => { if (!failed) resolve(); });
        req.pipe(out);
      });
      // Real video by its first bytes: MP4/MOV has "ftyp" at byte 4, WebM starts with the EBML mark.
      const type = head.subarray(4, 8).toString("latin1") === "ftyp" ? "video/mp4"
        : head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? "video/webm" : null;
      if (!type || size < 1024) throw new ApiError(400, "invalid_argument", "That isn't an MP4 or WebM video.");
      for (const t of Object.keys(VIDEO_EXT)) if (t !== type) fs.rmSync(this.#path(key, t), { force: true });
      fs.renameSync(tmp, this.#path(key, type));
      this.ledger.append([{ t: "brother_video", brother: key, type, size }], ctx.uid, this.now());
      this.feed.publish("brothers", "brothers.video", { brother: key });
      return { brother: key, video: this.videoInfo(key) };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  // DELETE /brothers/video/:key: admins take a video down.
  removeVideo(ctx, key) {
    this.#admin(ctx);
    const v = this.videos[this.#key(key)];
    if (!v) throw new ApiError(404, "not_found", "There's no video to remove.");
    if (this.dir) fs.rmSync(this.#path(key, v.type), { force: true });
    this.ledger.append([{ t: "brother_video", brother: key, removed: true }], ctx.uid, this.now());
    this.feed.publish("brothers", "brothers.video", { brother: key });
    return { brother: key, video: null };
  }
}
