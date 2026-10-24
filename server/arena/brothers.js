// Kain and Abel (owner, 2026-10-24): two AI characters members play against, for fun. Every round, once it ends,
// each brother takes the call of a different bot that called that round through the bot API (bots and chart
// scripts with a key), picked at random, and that call is shown as his. Members make their own calls during the
// round with the floor's Up/Down votes, and see how they do against the brothers. The brothers' calls only exist
// once the round is over, so nobody can copy them. Which bot each brother took is kept for admins only (owner:
// "just post what the bot called"); the public fine print says the calls come from bots on D3MON.
//
// A brother's call is priced at the bot's own price (Kalshi's, when the bot called), so the paper results are the
// same ones the bot earned. One bot that called: only Abel plays. None: both sit the round out.
//
// Ledger lines:
//   { t: "brother_call", brother: "abel" | "kain", round, market, dir, callId, entrantId }
//   { t: "brothers_settings", on, exclude: [entrantId] }        admins; the latest counts
import crypto from "node:crypto";
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
const r4 = x => Math.round(x * 10000) / 10000;

export class Brothers {
  constructor({ ledger, calls, metrics, prices, registry, votes, feed, now = () => Date.now() }) {
    Object.assign(this, { ledger, calls, metrics, prices, registry, votes, feed, now });
    this.byRound = new Map(); // round -> { abel: line, kain: line }
    this.cfg = { on: true, exclude: [] };
    for (const l of ledger.lines) this.#index(l);
    ledger.on("append", lines => { for (const l of lines) this.#index(l); });
    this.timer = null;
  }

  #index(l) {
    if (l.t === "brother_call") {
      if (!this.byRound.has(l.round)) this.byRound.set(l.round, {});
      this.byRound.get(l.round)[l.brother] = l;
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

  // Makes the brothers' calls for a round that has ended, once. Returns what was written.
  pick(round) {
    if (!this.cfg.on || this.byRound.has(round) || this.now() < round + ROUND_MS) return [];
    const pool = this.candidates(round);
    for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const lines = BROTHERS.slice(0, pool.length).map((b, i) => ({ t: "brother_call", brother: b.key, round, market: MARKET, dir: pool[i].dir, callId: pool[i].id, entrantId: pool[i].entrantId }));
    if (!lines.length) return [];
    const out = this.ledger.append(lines, null, this.now());
    this.feed.publish("brothers", "brothers.called", { round, calls: this.#roundCalls(round, {}) });
    return out;
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
      brothers: BROTHERS.map(b => ({ ...b, ai: true })), on: this.cfg.on,
      now: { round, endsAt: round + ROUND_MS, revealAt: round + ROUND_MS }, rounds, standings, notice: NOTICE,
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
}
