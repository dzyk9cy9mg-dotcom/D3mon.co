// Calls (step 4): a bot's up/down call for a Kalshi BTC 15-minute round, sent with its key, or a
// caller's, made with the Up/Down buttons. The server stamps each call with its own clock and only
// accepts it before the round starts; at the start the round locks and nothing more can change.
//
// Sealed until the lock: everyone sees that a call arrived and when, but its direction is shown only
// to the entrant's owner and admins until the round starts, so nobody can copy a rival's call. At the
// start the directions are revealed (round.locked), and once the round has a result each call is
// scored (round.scored): "verified" when Kalshi settled it, "recorded by host" when HardSmoke did.
//
// Ledger line: { t: "call", entrantId, market, round, dir, via: "bot-key" | "button", keyId?,
//                battleIds: battles the entrant was in for that round when it called }
// The latest call before the lock counts; earlier ones stay in the ledger.
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { ROUND_MS } from "./registry.js";

export const MARKET = "KXBTC15M";
const MAX_AHEAD_MS = 24 * 3600 * 1000; // calls can be made up to a day ahead
const DIRS = ["up", "down"];
const iso = ms => new Date(ms).toISOString();
export const nextRound = now => Math.floor(now / ROUND_MS) * ROUND_MS + ROUND_MS;

const BOT_CALL = {
  schema: { type: "enum", values: ["d3mon.call/v1"], required: true },
  market: { type: "enum", values: [MARKET], required: true },
  round: { type: "string", max: 40 },
  direction: { type: "enum", values: DIRS, required: true },
};
const BUTTON_CALL = {
  direction: { type: "enum", values: DIRS, required: true },
  round: { type: "string", max: 40 },
};

export class Calls {
  constructor({ ledger, registry, metrics, feed, now = () => Date.now() }) {
    Object.assign(this, { ledger, registry, metrics, feed, now });
    this.byRound = new Map(); // "<market>|<round>" -> call lines, in write order
    this.byEntrant = new Map(); // entrantId -> call lines, in write order
    const index = lines => {
      for (const l of lines) {
        if (l.t !== "call") continue;
        for (const [map, key] of [[this.byRound, `${l.market}|${l.round}`], [this.byEntrant, l.entrantId]]) {
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(l);
        }
      }
    };
    index(ledger.lines);
    ledger.on("append", lines => {
      index(lines);
      for (const l of lines) if (l.t === "score") this.#scored(l);
    });
    this.timer = null;
  }

  // ---------- reading ----------
  // The call that counts for an entrant in a round: its latest. With battleId, only calls made in that battle.
  latest(entrantId, market, round, battleId = null) {
    const list = this.byRound.get(`${market}|${round}`) || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      if (l.entrantId === entrantId && (!battleId || (l.battleIds || []).includes(battleId))) return l;
    }
    return null;
  }

  #canSeeDirection(ctx, entrantId) {
    if (isAdmin(ctx)) return true;
    const e = this.registry.entrantById(entrantId);
    return !!(e && ctx.uid && e.ownerId === ctx.uid);
  }

  // One call as this reader may see it: sealed (no direction) before the lock unless it's theirs.
  view(l, ctx) {
    const now = this.now(), locked = now >= l.round, e = this.registry.entrantById(l.entrantId);
    const out = { id: l.id, entrantId: l.entrantId, name: e ? e.name : null, market: l.market, round: l.round, receivedAt: l.at, via: l.via, locked };
    if (locked || this.#canSeeDirection(ctx, l.entrantId)) out.direction = l.dir;
    else out.sealed = true;
    const r = locked ? this.metrics.result(l.market, l.round) : null;
    if (r) Object.assign(out, { result: r.result, correct: l.dir === r.result, verification: r.source === "kalshi" ? "verified" : "recorded by host" });
    return out;
  }

  entrantCalls(ctx, entrantId, { limit = 200 } = {}) {
    const e = this.registry.entrantById(entrantId) || this.registry.entrantBySlug(entrantId);
    if (!e || (e.status !== "active" && !isAdmin(ctx) && e.ownerId !== ctx.uid)) throw new ApiError(404, "not_found", "No such entrant.");
    const seen = new Set(), out = [];
    const lines = this.byEntrant.get(e.id) || [];
    for (let i = lines.length - 1; i >= 0 && out.length < Math.min(Math.max(1, limit), 1000); i--) {
      const key = `${lines[i].market}|${lines[i].round}`;
      if (seen.has(key)) continue; // an earlier, superseded call for the same round
      seen.add(key);
      out.push(this.view(lines[i], ctx));
    }
    return out.sort((a, b) => b.round - a.round);
  }

  // The live battle board: every round of the battle with each entrant's call and the result.
  board(ctx, battleId) {
    const b = this.registry.battleFor(ctx, battleId), now = this.now();
    const ids = [...(b.entrants || [])];
    const rounds = Array.from({ length: b.rounds }, (_, i) => {
      const round = b.startsAt + i * b.roundMs;
      for (const l of this.byRound.get(`${b.market}|${round}`) || []) if ((l.battleIds || []).includes(b.id) && !ids.includes(l.entrantId)) ids.push(l.entrantId);
      return round;
    }).map((round, index) => {
      const r = now >= round ? this.metrics.result(b.market, round) : null;
      return {
        round, index, locksAt: round, endsAt: round + b.roundMs, locked: now >= round, over: now >= round + b.roundMs,
        result: r ? r.result : null, verification: r ? (r.source === "kalshi" ? "verified" : "recorded by host") : null,
        calls: ids.map(id => this.latest(id, b.market, round, b.id)).filter(Boolean).map(l => this.view(l, ctx)),
      };
    });
    const entrants = ids.map(id => this.registry.entrantById(id)).filter(Boolean).map(e => {
      const mine = rounds.flatMap(r => r.calls.filter(c => c.entrantId === e.id));
      return { entrantId: e.id, name: e.name, slug: e.slug, kind: e.kind, inLineup: (b.entrants || []).includes(e.id),
        called: mine.length, right: mine.filter(c => c.correct === true).length, wrong: mine.filter(c => c.correct === false).length };
    });
    return { battleId: b.id, title: b.title, status: b.status, market: b.market, roundMs: b.roundMs, now, rounds, entrants };
  }

  // ---------- making calls ----------
  #round(raw, now) {
    let round;
    if (raw === undefined || raw === "") round = nextRound(now);
    else {
      round = Date.parse(raw);
      if (!Number.isFinite(round) || round % ROUND_MS) throw new ApiError(400, "invalid_argument", `"round" is a round's start time, on a quarter hour, like "${iso(nextRound(now))}".`, "round");
    }
    if (round <= now) throw new ApiError(409, "round_locked", `That round locked at ${iso(round)}. Calls must arrive before a round starts. The next round starts at ${iso(nextRound(now))}.`, "round");
    if (round > now + MAX_AHEAD_MS) throw new ApiError(400, "invalid_argument", "Calls can be made up to 24 hours ahead.", "round");
    return round;
  }

  // #round has checked the lock just before this, and nothing here waits, so no call can slip past it.
  #place(e, { round, dir, via, keyId }, by) {
    const prev = this.latest(e.id, MARKET, round);
    if (prev && prev.dir === dir) return { line: prev, unchanged: true }; // a retry, or the same call again
    const battleIds = this.registry.battlesFor(e.id, round).map(b => b.id);
    const line = { t: "call", entrantId: e.id, market: MARKET, round, dir, via, battleIds };
    if (keyId) line.keyId = keyId;
    const [saved] = this.ledger.append([line], by, this.now()); // stamped by the same clock that checked the lock
    this.#received(saved, e);
    return { line: saved, unchanged: false };
  }

  // POST /api/v1/bot/calls, authenticated with the bot's key (auth = { key, entrant }).
  fromBot(auth, body) {
    const f = check(body, BOT_CALL);
    const round = this.#round(f.round, this.now());
    const { line, unchanged } = this.#place(auth.entrant, { round, dir: f.direction, via: "bot-key", keyId: auth.key.id }, auth.key.ownerId);
    return { ok: true, unchanged, call: { id: line.id, round: iso(line.round), direction: line.dir, receivedAt: iso(line.at), locksAt: iso(line.round) } };
  }

  // POST /api/v1/entrants/:id/call, for a caller pressing Up or Down. Same lock as the bots.
  fromButton(ctx, entrantId, body) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const e = this.registry.entrantById(entrantId);
    if (!e || e.ownerId !== ctx.uid) throw new ApiError(404, "not_found", "That isn't one of your entrants.");
    if (e.kind !== "caller") throw new ApiError(409, "use_bot_key", "Bots and scripts send their calls with their API key. The buttons are for callers.");
    if (e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended.`);
    const f = check(body, BUTTON_CALL);
    const round = this.#round(f.round, this.now());
    const { line, unchanged } = this.#place(e, { round, dir: f.direction, via: "button" }, ctx.uid);
    return { unchanged, call: this.view(line, ctx) };
  }

  // ---------- live events ----------
  #received(l, e) {
    const event = ctx => ({ battleIds: l.battleIds, ...this.view(l, ctx) });
    this.feed.publish(`entrant:${e.id}`, "call.received", event);
    for (const id of l.battleIds) this.feed.publish(`battle:${id}`, "call.received", event);
  }

  // At each round's start, reveal every call for it.
  lockRound(round) {
    const lines = this.byRound.get(`${MARKET}|${round}`) || [];
    const latestBy = new Map();
    for (const l of lines) latestBy.set(l.entrantId, l);
    const battles = new Map(); // battleId -> calls
    for (const l of latestBy.values()) {
      this.feed.publish(`entrant:${l.entrantId}`, "round.locked", ctx => ({ round, market: MARKET, calls: [this.view(l, ctx)] }));
      for (const id of l.battleIds || []) {
        if (!battles.has(id)) battles.set(id, []);
        battles.get(id).push(l);
      }
    }
    for (const [id, ls] of battles) {
      const kept = ls.filter(l => this.latest(l.entrantId, MARKET, round, id) === l);
      this.feed.publish(`battle:${id}`, "round.locked", ctx => ({ battleId: id, round, market: MARKET, calls: kept.map(l => this.view(l, ctx)) }));
    }
  }

  // A result arrived (by hand now, from Kalshi in step 5): score that round's calls.
  #scored(score) {
    const lines = this.byRound.get(`${score.market}|${score.round}`) || [];
    const latestBy = new Map();
    for (const l of lines) latestBy.set(l.entrantId, l);
    if (!latestBy.size) return;
    const head = { round: score.round, market: score.market, result: this.metrics.result(score.market, score.round)?.result ?? score.result };
    const battles = new Set();
    for (const l of latestBy.values()) {
      this.feed.publish(`entrant:${l.entrantId}`, "round.scored", ctx => ({ ...head, calls: [this.view(l, ctx)] }));
      for (const id of l.battleIds || []) battles.add(id);
    }
    for (const id of battles) {
      const kept = [...latestBy.values()].map(l => this.latest(l.entrantId, score.market, score.round, id)).filter(Boolean);
      this.feed.publish(`battle:${id}`, "round.scored", ctx => ({ battleId: id, ...head, calls: kept.map(l => this.view(l, ctx)) }));
    }
  }

  // Wakes at every round start to lock it. Timers drift, so each wake re-reads the clock.
  start() {
    const tick = () => {
      const now = this.now(), round = Math.floor(now / ROUND_MS) * ROUND_MS;
      if (round !== this.lastLocked) {
        this.lastLocked = round;
        try { this.lockRound(round); } catch (e) { console.error(e); }
      }
      this.timer = setTimeout(tick, Math.max(50, nextRound(now) - now + 20));
      this.timer.unref?.();
    };
    this.lastLocked = Math.floor(this.now() / ROUND_MS) * ROUND_MS; // the current round locked before we started
    this.timer = setTimeout(tick, Math.max(50, nextRound(this.now()) - this.now() + 20));
    this.timer.unref?.();
  }

  stop() {
    clearTimeout(this.timer);
  }
}
