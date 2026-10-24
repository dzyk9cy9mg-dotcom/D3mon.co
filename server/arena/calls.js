// Calls (step 4): a bot's up/down call for a Kalshi BTC 15-minute round, sent with its key, or a
// caller's, made with the Up/Down buttons. Bots call DURING the round, like Kalshi traders, so a
// call is accepted from before the round starts until its calls close: by default any time until the
// round ends (callWindowMin 15), or earlier where a battle sets it (0 means before the round starts). The server stamps
// each call with its own clock, and the same clock decides whether calls are still open.
//
// One call per entrant per round, final when made: a retry of the same call changes nothing, a
// different one is refused ("already_called"). A call is never moved to another round on its own.
//
// Callers' calls (chart readers, people) are sealed until the calls close: everyone sees that a call
// arrived and when, but its direction is shown only to the caller and admins until then, so nobody
// can copy it. Bots' and chart scripts' calls are sealed the same way (owner, 2026-10-23: people pay to subscribe
// to these bots, so their calls mustn't be copied for free; this reverses 2026-10-17's "shown the moment they're
// made"). During the round everyone sees only the crowd's totals for bots and scripts (roundCalls().crowd), and only
// once at least CROWD_MIN have called, so a lone bot's call can't be read off the totals. Outside battles a bot's
// calls close when the round ends, so it's revealed at the round's end. Two exceptions (owner, 2026-10-23):
// a call made in a Battle of the Bots round (battleIds not empty) is shown live, since the battle is a show; and the
// Capstone room shows its featured entrants' calls the moment they come in (vip.js). A bot's "why" always waits
// for the round's end, battles included.
// At the close every direction is revealed (round.locked), and once the round has a result each call is
// scored (round.scored): "verified" when Kalshi settled it, "recorded by host" when HardSmoke did.
//
// The "why" (owner, 2026-10-24: "the reasoning behind every call"): any call may carry one short reason, up to
// 280 characters. It stays with the caller, the bot's owner and admins until the calls close, then everyone sees
// it, for every kind (a bot's direction is public at once, but its reasoning isn't, so nobody can borrow it).
// Like the call, it's final when made: a retry can't add or change it.
//
// Ledger line: { t: "call", entrantId, market, round, dir, why?, via: "bot-key" | "button", keyId?,
//                battleIds: battles the entrant was in for that round when it called,
//                closesAt: when calls for that round closed for this entrant (older lines: the round start) }
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { ROUND_MS, callWindowMs, DEFAULT_CALL_WINDOW_MIN, methodFor } from "./registry.js";
import { paper } from "./prices.js";

export const MARKET = "KXBTC15M";
const MAX_AHEAD_MS = 24 * 3600 * 1000; // calls can be made up to a day ahead
export const CROWD_MIN = 3;
const DIRS = ["up", "down"];
export const WHY_MAX = 280;
const iso = ms => new Date(ms).toISOString();
export const nextRound = now => Math.floor(now / ROUND_MS) * ROUND_MS + ROUND_MS;
export const currentRound = now => Math.floor(now / ROUND_MS) * ROUND_MS;
const closesAtOf = l => (Number.isFinite(l.closesAt) ? l.closesAt : l.round);
const MIN_MS = 60000;

// Paper results over a list of call views: profit on $1 contracts at Kalshi's prices, and the average price paid.
export function paperTotals(views) {
  const priced = views.filter(c => c.price), scored = priced.filter(c => c.paperPerContract !== undefined);
  const sum = scored.reduce((a, c) => a + c.paperPerContract, 0);
  return {
    priced: priced.length,
    paperPerContract: scored.length ? Math.round(sum * 10000) / 10000 : null,
    avgPaid: priced.length ? Math.round((priced.reduce((a, c) => a + c.price.paid, 0) / priced.length) * 10000) / 10000 : null,
  };
}

const BOT_CALL = {
  schema: { type: "enum", values: ["d3mon.call/v1"], required: true },
  market: { type: "enum", values: [MARKET], required: true },
  round: { type: "string", max: 40 },
  direction: { type: "enum", values: DIRS, required: true },
  why: { type: "string", max: WHY_MAX },
};
const BUTTON_CALL = {
  direction: { type: "enum", values: DIRS, required: true },
  round: { type: "string", max: 40 },
  why: { type: "string", max: WHY_MAX },
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

  // One call as this reader may see it: sealed (no direction) until its calls close, unless it's theirs.
  view(l, ctx) {
    const now = this.now(), locksAt = closesAtOf(l), locked = now >= locksAt, e = this.registry.entrantById(l.entrantId);
    const out = { id: l.id, entrantId: l.entrantId, name: e ? e.name : null, market: l.market, round: l.round, receivedAt: l.at, intoRoundMs: l.at - l.round, via: l.via, locksAt, locked };
    const live = !!e && e.kind !== "caller" && (l.battleIds || []).length > 0; // Battle of the Bots: shown live
    if (locked || live || this.#canSeeDirection(ctx, l.entrantId)) out.direction = l.dir;
    else out.sealed = true;
    if (l.why) {
      const whyAt = e && e.kind !== "caller" ? Math.max(locksAt, l.round + ROUND_MS) : locksAt; // a bot's reasoning waits for the round's end
      if (now >= whyAt || this.#canSeeDirection(ctx, l.entrantId)) out.why = l.why;
      else out.hasWhy = true; // that there is a reason is public; the reason itself waits for the close
    }
    const r = locked ? this.metrics.result(l.market, l.round) : null;
    if (r) Object.assign(out, { result: r.result, correct: l.dir === r.result, verification: r.source === "kalshi" ? "verified" : "recorded by host" });
    // Kalshi's price for the side it backed when it called, and the paper result on a $1 contract. Only
    // once its direction can be seen: the price paid would give a sealed call's direction away.
    const p = out.direction && this.prices ? this.prices.forCall(l.id) : null;
    if (p) {
      out.price = { paid: p.paid, side: p.side, quotedAt: p.quotedAt, source: p.source };
      if (r) out.paperPerContract = paper(p.paid, out.correct);
    }
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

  // Every entrant's call in one round, as this reader may see it (callers sealed until their calls close).
  // GET /rounds/:round/calls, for the trading floor. Newest first.
  roundCalls(ctx, round) {
    const r = Number(round);
    if (!Number.isInteger(r) || r % ROUND_MS) throw new ApiError(400, "invalid_argument", "A round is the start of a 15-minute round, in milliseconds.", "round");
    const latest = new Map();
    for (const l of this.byRound.get(`${MARKET}|${r}`) || []) latest.set(l.entrantId, l);
    const calls = [];
    for (const l of latest.values()) {
      const e = this.registry.entrantById(l.entrantId);
      if (!e || (e.status !== "active" && !isAdmin(ctx))) continue;
      calls.push({ ...this.view(l, ctx), kind: e.kind, slug: e.slug });
    }
    calls.sort((a, b) => b.receivedAt - a.receivedAt);
    const s = this.metrics.result(MARKET, r);
    return { market: MARKET, round: r, endsAt: r + ROUND_MS, result: s && this.now() >= r + ROUND_MS ? s.result : null, crowd: this.crowd(r), calls };
  }

  // The bots' and chart scripts' calls this round as totals only: { called, up, down } (up and down are null until
  // at least CROWD_MIN have called). Callers aren't counted: their calls stay wholly sealed until the close.
  crowd(round) {
    const latest = new Map();
    for (const l of this.byRound.get(`${MARKET}|${round}`) || []) {
      const e = this.registry.entrantById(l.entrantId);
      if (e && e.status === "active" && e.kind !== "caller") latest.set(l.entrantId, l.dir);
    }
    const dirs = [...latest.values()], show = dirs.length >= CROWD_MIN;
    return { called: dirs.length, up: show ? dirs.filter(d => d === "up").length : null, down: show ? dirs.filter(d => d === "down").length : null, min: CROWD_MIN };
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
      const locksAt = round + callWindowMs(b);
      const r = now >= locksAt ? this.metrics.result(b.market, round) : null;
      return {
        round, index, locksAt, endsAt: round + b.roundMs, locked: now >= locksAt, over: now >= round + b.roundMs,
        result: r ? r.result : null, verification: r ? (r.source === "kalshi" ? "verified" : "recorded by host") : null,
        calls: ids.map(id => this.latest(id, b.market, round, b.id)).filter(Boolean).map(l => this.view(l, ctx)),
      };
    });
    const entrants = ids.map(id => this.registry.entrantById(id)).filter(Boolean).map(e => {
      const mine = rounds.flatMap(r => r.calls.filter(c => c.entrantId === e.id));
      return { entrantId: e.id, name: e.name, slug: e.slug, kind: e.kind, inLineup: (b.entrants || []).includes(e.id),
        called: mine.length, right: mine.filter(c => c.correct === true).length, wrong: mine.filter(c => c.correct === false).length,
        ...paperTotals(mine) };
    });
    return { battleId: b.id, title: b.title, status: b.status, market: b.market, roundMs: b.roundMs, callWindowMin: callWindowMs(b) / MIN_MS, now, rounds, entrants };
  }

  // ---------- making calls ----------
  // When calls for a round close for this entrant: the strictest window of the battles it's in then.
  closesAt(entrantId, round) {
    const bs = this.registry.battlesFor(entrantId, round);
    return round + (bs.length ? Math.min(...bs.map(callWindowMs)) : DEFAULT_CALL_WINDOW_MIN * MIN_MS);
  }

  // The round a call is for, and when its calls close. Without "round": the round now open for calls
  // (the current one while its calls are open; the next one where calls close at the start).
  #target(e, raw, now) {
    let round;
    if (raw === undefined || raw === "") {
      round = currentRound(now);
      if (this.closesAt(e.id, round) <= round) round += ROUND_MS; // a "before the round" battle: call the next one
    } else {
      round = Date.parse(raw);
      if (!Number.isFinite(round) || round % ROUND_MS) throw new ApiError(400, "invalid_argument", `"round" is a round's start time, on a quarter hour, like "${iso(currentRound(now))}".`, "round");
      if (round > now + MAX_AHEAD_MS) throw new ApiError(400, "invalid_argument", "Calls can be made up to 24 hours ahead.", "round");
    }
    const closesAt = this.closesAt(e.id, round);
    if (now >= closesAt) {
      const next = currentRound(now) + ROUND_MS;
      throw new ApiError(409, "round_locked", `Calls for the round that started at ${iso(round)} closed at ${iso(closesAt)}. The next round starts at ${iso(next)}.`, "round");
    }
    return { round, closesAt };
  }

  // #target has checked the clock just before this, and nothing here waits, so no call can slip past it.
  #place(e, { raw, dir, why, via, keyId }, by) {
    const now = this.now(), { round, closesAt } = this.#target(e, raw, now);
    const battles = this.registry.battlesFor(e.id, round), methods = battles.map(b => methodFor(b, e));
    // Bots and scripts call the way each battle they're in says: the button only where every one of them uses it.
    if (e.kind !== "caller" && via === "button" && !(methods.length && methods.every(m => m === "manual")))
      throw new ApiError(409, "use_bot_key", `${e.name} sends its calls with its bot key for the round that starts at ${iso(round)}. The call button is for battles set to manual calls.`, "direction");
    if (via === "bot-key" && methods.includes("manual"))
      throw new ApiError(409, "use_call_button", `${e.name} is set to manual calls in a battle for the round that starts at ${iso(round)}. Make that call with the call button on /my.`, "direction");
    const prev = this.latest(e.id, MARKET, round);
    if (prev && prev.dir === dir) return { line: prev, unchanged: true }; // a retry, or the same call again
    if (prev) throw new ApiError(409, "already_called", `Already called ${prev.dir} for the round that started at ${iso(round)}, at ${iso(prev.at)}. One call per round, and it's final.`, "direction");
    const battleIds = battles.map(b => b.id);
    const line = { t: "call", entrantId: e.id, market: MARKET, round, dir, via, battleIds, closesAt };
    if (why) line.why = why;
    if (keyId) line.keyId = keyId;
    const [saved] = this.ledger.append([line], by, now); // stamped by the same clock that checked the window
    this.#received(saved, e);
    return { line: saved, unchanged: false };
  }

  // POST /api/v1/bot/calls, authenticated with the bot's key (auth = { key, entrant }).
  fromBot(auth, body) {
    const f = check(body, BOT_CALL);
    const { line, unchanged } = this.#place(auth.entrant, { raw: f.round, dir: f.direction, why: f.why, via: "bot-key", keyId: auth.key.id }, auth.key.ownerId);
    return { ok: true, unchanged, call: { id: line.id, round: iso(line.round), direction: line.dir, ...(line.why ? { why: line.why } : {}), receivedAt: iso(line.at), locksAt: iso(closesAtOf(line)) } };
  }

  // POST /api/v1/entrants/:id/call: a caller pressing Up or Down, or a bot's owner in a battle set to manual calls. Same lock as the bots.
  fromButton(ctx, entrantId, body) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const e = this.registry.entrantById(entrantId);
    if (!e || e.ownerId !== ctx.uid) throw new ApiError(404, "not_found", "That isn't one of your entrants.");
    if (e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended.`);
    const f = check(body, BUTTON_CALL);
    const { line, unchanged } = this.#place(e, { raw: f.round, dir: f.direction, why: f.why, via: "button" }, ctx.uid);
    return { unchanged, call: this.view(line, ctx) };
  }

  // ---------- live events ----------
  #received(l, e) {
    const event = ctx => ({ battleIds: l.battleIds, ...this.view(l, ctx) });
    this.feed.publish(`entrant:${e.id}`, "call.received", event);
    for (const id of l.battleIds) this.feed.publish(`battle:${id}`, "call.received", event);
  }

  // Reveal every call whose calls closed in (from, to]: the lock moment of each round, per entrant.
  lockDue(from, to) {
    const groups = new Map(); // round -> the counting calls that just locked
    for (let r = currentRound(from) - ROUND_MS; r <= to; r += ROUND_MS) {
      const latestBy = new Map();
      for (const l of this.byRound.get(`${MARKET}|${r}`) || []) latestBy.set(l.entrantId, l);
      for (const l of latestBy.values()) {
        const c = closesAtOf(l);
        if (c > from && c <= to) { if (!groups.has(r)) groups.set(r, []); groups.get(r).push(l); }
      }
    }
    for (const [round, lines] of groups) {
      const battles = new Map(); // battleId -> calls
      for (const l of lines) {
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

  // Wakes at every minute boundary (calls close on whole minutes) to reveal what just locked.
  // Timers drift, so each wake re-reads the clock and covers everything since the last wake.
  start() {
    const wait = now => Math.max(50, (Math.floor(now / MIN_MS) + 1) * MIN_MS - now + 20);
    const tick = () => {
      const now = this.now();
      try { this.lockDue(this.lastLock, now); } catch (e) { console.error(e); }
      this.lastLock = now;
      this.timer = setTimeout(tick, wait(now));
      this.timer.unref?.();
    };
    this.lastLock = this.now();
    this.timer = setTimeout(tick, wait(this.lastLock));
    this.timer.unref?.();
  }

  stop() {
    clearTimeout(this.timer);
  }
}
