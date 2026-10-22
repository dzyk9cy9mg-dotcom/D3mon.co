// Tournaments (owner, 2026-10-17): hourly, daily, weekly and monthly tournaments that run by themselves,
// for bots and chart scripts whose owner turns on "Join tournaments". Plan: docs/TOURNAMENTS.md.
//
// Step 1 is the switch. It counts from the next round, so a bot can't join halfway through a round it
// has already seen. Turning it off keeps the rounds already played. Every switch is a ledger line, and
// the latest line whose round has come decides whether an entrant is in for a given round.
//
// Ledger line: { t: "tournament_entry", entrantId, on, from: the round start it counts from }
//
// Step 3 is the standings. Four tournaments run at once: hourly, daily (from midnight), weekly (from
// Monday midnight) and monthly (from the 1st), in US Eastern time like Kalshi. They're worked out from
// the ledger whenever they're asked for, so nothing is stored: an entrant scores in a round it was in,
// and only once Kalshi has settled that round (a result entered by hand doesn't count). A round Kalshi
// never settles counts for nobody. Rank: most correct calls (a missed round scores nothing), then
// higher accuracy, then the earlier average call.
//
// Tournament ids name the period in Eastern time: hourly-2026-10-17T18, daily-2026-10-17,
// weekly-2026-10-12 (its Monday) and monthly-2026-10. The hour repeated when clocks go back is "…T01b".
//
// Step 5 saves the final standings. Once a tournament has ended and Kalshi has settled all its rounds (or
// 30 minutes after it ended, whichever comes first), its standings are written to the ledger and never
// rewritten. A Kalshi correction that arrives later doesn't change them: the tournament is flagged instead.
//
// Ledger line: { t: "tournament_final", tournamentId, startsAt, endsAt, settledRounds, standings: [...] }
//
// Step 5b is the admin controls. An admin can remove a bot from the tournaments, from the round in
// progress onward (rounds before stay), with a reason only its owner and admins see; its owner can't
// rejoin until an admin restores it (from the next round). An admin can pause all tournaments: from the
// round in progress until the round after the resume, rounds count for nobody. Every action is a ledger line.
//
// Ledger lines: { t: "tournament_removal", entrantId, removed, reason, from }
//               { t: "tournament_pause", paused, reason, from }
import { paper } from "./prices.js";
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { nextRound, currentRound, MARKET } from "./calls.js";
import { ROUND_MS } from "./registry.js";

export const TOURNAMENT_KINDS = ["bot", "script"]; // callers can be added later
export const PERIODS = ["hourly", "daily", "weekly", "monthly"];
export const TIME_ZONE = "America/New_York";
export const NOTICE = "For entertainment. Not financial advice. D3MON never trades.";
const TITLES = { hourly: "Hourly", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const HOUR = 3600000;
const FINAL_GRACE_MS = 30 * 60000; // matches the Kalshi poller's "still unsettled" flag
const LOOKBACK = { hourly: 48, daily: 14, weekly: 6, monthly: 3 }; // past tournaments checked for saving
const SCORING = "Most correct calls, then accuracy, then the earlier average call. Only settled rounds count.";

// ---------- Eastern time ----------
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
function et(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) };
}
// The instant an Eastern wall-clock time happens (its first time, if clocks go back). Days roll over.
function etToMs(y, m, d, h = 0) {
  const want = Date.UTC(y, m - 1, d, h);
  let t = want + 5 * HOUR; // Eastern is 4 or 5 hours behind UTC
  for (let i = 0; i < 3; i++) {
    const p = et(t);
    t += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  }
  if (et(t - HOUR).h === et(t).h) t -= HOUR; // the hour repeated when clocks go back: take the first
  return t;
}
const pad = n => String(n).padStart(2, "0");

// The tournament of a kind that's running at `ms`: { id, kind, startsAt, endsAt }.
export function periodAt(kind, ms) {
  const p = et(ms);
  let start, end, label;
  if (kind === "hourly") {
    start = Math.floor(ms / HOUR) * HOUR; // Eastern is a whole number of hours from UTC
    end = start + HOUR;
    const q = et(start);
    label = `${q.y}-${pad(q.m)}-${pad(q.d)}T${pad(q.h)}${etToMs(q.y, q.m, q.d, q.h) === start ? "" : "b"}`;
  } else if (kind === "daily") {
    start = etToMs(p.y, p.m, p.d); end = etToMs(p.y, p.m, p.d + 1);
    label = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  } else if (kind === "weekly") {
    start = etToMs(p.y, p.m, p.d - p.wd); end = etToMs(p.y, p.m, p.d - p.wd + 7);
    const q = et(start);
    label = `${q.y}-${pad(q.m)}-${pad(q.d)}`;
  } else if (kind === "monthly") {
    start = etToMs(p.y, p.m, 1); end = etToMs(p.y, p.m + 1, 1);
    label = `${p.y}-${pad(p.m)}`;
  } else return null;
  return { id: `${kind}-${label}`, kind, startsAt: start, endsAt: end };
}

// The period an id names, or null. The id must be exactly the one periodAt gives for its start.
export function periodById(id) {
  const m = /^(hourly|daily|weekly|monthly)-(\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2})(b?))?)?$/.exec(String(id));
  if (!m) return null;
  const [, kind, y, mo, d, h, b] = m;
  if (kind === "monthly" ? d !== undefined : d === undefined || (kind === "hourly") !== (h !== undefined)) return null;
  const at = etToMs(+y, +mo, d ? +d : 1, h ? +h : 0) + (b ? HOUR : 0);
  const p = periodAt(kind, at);
  return p && p.id === id ? p : null;
}

const SWITCH = { on: { type: "boolean", required: true } };
const REMOVAL = { removed: { type: "boolean", required: true }, reason: { type: "string", max: 300 } };
const PAUSE = { paused: { type: "boolean", required: true }, reason: { type: "string", max: 300 } };

export class Tournaments {
  constructor({ ledger, registry, feed, calls, metrics, now = () => Date.now() }) {
    Object.assign(this, { ledger, registry, feed, calls, metrics, now });
    this.byEntrant = new Map(); // entrantId -> tournament_entry lines, in write order
    this.finals = new Map(); // tournamentId -> its tournament_final line
    this.empty = new Set(); // ended tournaments past their grace time that nobody played: nothing to save
    this.removals = new Map(); // entrantId -> tournament_removal lines, in write order
    this.pauses = []; // tournament_pause lines, in write order
    const index = lines => {
      for (const l of lines) {
        if (l.t === "tournament_removal") { if (!this.removals.has(l.entrantId)) this.removals.set(l.entrantId, []); this.removals.get(l.entrantId).push(l); }
        if (l.t === "tournament_pause") this.pauses.push(l);
        if (l.t === "tournament_final" && !this.finals.has(l.tournamentId)) this.finals.set(l.tournamentId, l);
        if (l.t !== "tournament_entry") continue;
        if (!this.byEntrant.has(l.entrantId)) this.byEntrant.set(l.entrantId, []);
        this.byEntrant.get(l.entrantId).push(l);
      }
    };
    index(ledger.lines);
    ledger.on("append", lines => {
      index(lines);
      // Standings change when Kalshi settles a round, a call arrives or a bot joins or leaves. The event is
      // only a nudge: readers fetch the standings again.
      const kinds = new Set(lines.filter(l => (l.t === "score" && l.source === "kalshi") || ["call", "tournament_entry", "tournament_removal", "tournament_pause"].includes(l.t)).map(l => l.t));
      if (kinds.size) this.feed.publish("tournaments", "tournament.updated", () => ({ reason: [...kinds] }));
    });
  }

  // Whether an entrant plays in the tournaments for the round starting at `round`: joined, and not removed.
  inAt(entrantId, round) {
    return this.#latest(this.byEntrant.get(entrantId), round, "on") && !this.removedAt(entrantId, round);
  }
  removedAt(entrantId, round) { return this.#latest(this.removals.get(entrantId), round, "removed"); }
  // Whether the round starting at `round` falls in a pause (it counts for nobody).
  pausedAt(round) { return this.#latest(this.pauses, round, "paused"); }
  #latest(lines, round, field) {
    let v = false;
    for (const l of lines || []) if (l.from <= round) v = l[field];
    return v;
  }
  #pauseNow() {
    const last = this.pauses[this.pauses.length - 1];
    return last && last.paused ? { since: last.from, reason: last.reason || "" } : null;
  }

  // Anyone can see whether an entrant has joined (standings are public). Its owner and admins also see the history.
  view(ctx, id) {
    const e = this.#entrant(ctx, id);
    const lines = this.byEntrant.get(e.id) || [];
    const last = lines[lines.length - 1];
    const rm = (this.removals.get(e.id) || []).at(-1);
    const out = { entrantId: e.id, eligible: TOURNAMENT_KINDS.includes(e.kind), on: !!last?.on, from: last ? last.from : null, playingNow: this.inAt(e.id, currentRound(this.now())),
      removed: !!rm?.removed };
    if (isAdmin(ctx) || ctx.uid === e.ownerId) {
      out.history = lines.map(l => ({ on: l.on, from: l.from, at: l.at, by: l.by }));
      if (rm?.removed) out.removal = { reason: rm.reason || "", from: rm.from, at: rm.at };
    }
    return out;
  }

  // The owner's on/off switch: PUT /entrants/:id/tournaments { on }.
  set(ctx, id, body) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const f = check(body, SWITCH);
    const e = this.#entrant(ctx, id);
    if (e.ownerId !== ctx.uid) throw new ApiError(403, "not_granted", "Only this entrant's owner can change that.");
    if (!TOURNAMENT_KINDS.includes(e.kind)) throw new ApiError(409, "kind_not_allowed", "Tournaments are for bots and chart scripts for now.", "on");
    if (e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended.`, "on");
    const rm = (this.removals.get(e.id) || []).at(-1);
    if (f.on && rm?.removed) throw new ApiError(409, "removed", `An admin removed ${e.name} from the tournaments${rm.reason ? `: ${rm.reason}` : ""}. Ask an admin about it.`, "on");
    const now = this.now(), from = nextRound(now);
    const lines = this.byEntrant.get(e.id) || [];
    const last = lines[lines.length - 1];
    if (!!last?.on === f.on) return { ...this.view(ctx, id), unchanged: true };
    this.ledger.append([{ t: "tournament_entry", entrantId: e.id, on: f.on, from }], ctx.uid, now);
    const event = c => this.view(c, e.id);
    this.feed.publish(`entrant:${e.id}`, "entrant.tournaments", event);
    return this.view(ctx, id);
  }

  // ---------- admin controls ----------
  #requireAdmin(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!isAdmin(ctx) || !ctx.canWrite) throw new ApiError(403, "not_granted", "Only admins can do that.");
  }

  // PUT /entrants/:id/tournaments/removal { removed, reason }: removal counts from the round in progress,
  // a restore from the next round.
  remove(ctx, id, body) {
    this.#requireAdmin(ctx);
    const f = check(body, REMOVAL);
    const e = this.#entrant(ctx, id);
    if (f.removed && !f.reason) throw new ApiError(400, "invalid_argument", "Say why the bot is being removed.", "reason");
    const now = this.now();
    if (this.#latest(this.removals.get(e.id), Infinity, "removed") === f.removed) return { ...this.view(ctx, e.id), unchanged: true };
    this.ledger.append([{ t: "tournament_removal", entrantId: e.id, removed: f.removed, reason: f.reason || "", from: f.removed ? currentRound(now) : nextRound(now) }], ctx.uid, now);
    this.feed.publish(`entrant:${e.id}`, "entrant.tournaments", c => this.view(c, e.id));
    return this.view(ctx, e.id);
  }

  // PUT /tournaments/pause { paused, reason }: a pause covers the round in progress; a resume counts from the next round.
  pause(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, PAUSE);
    if (f.paused && !f.reason) throw new ApiError(400, "invalid_argument", "Say why the tournaments are paused. Everyone sees it.", "reason");
    const now = this.now();
    if (!!this.#pauseNow() === f.paused) return { paused: this.#pauseNow(), unchanged: true };
    this.ledger.append([{ t: "tournament_pause", paused: f.paused, reason: f.reason || "", from: f.paused ? currentRound(now) : nextRound(now) }], ctx.uid, now);
    return { paused: this.#pauseNow() };
  }

  // GET /tournaments/admin: the pause history and every bot removed now.
  adminView(ctx) {
    this.#requireAdmin(ctx);
    const removed = [];
    for (const [entrantId, lines] of this.removals) {
      const last = lines.at(-1), e = this.registry.entrantById(entrantId);
      if (last.removed && e) removed.push({ entrant: { id: e.id, name: e.name, slug: e.slug, kind: e.kind, creatorName: e.creatorName }, reason: last.reason, from: last.from, at: last.at, by: last.by });
    }
    return { paused: this.#pauseNow(), pauses: this.pauses.map(l => ({ paused: l.paused, reason: l.reason, from: l.from, at: l.at, by: l.by })), removed };
  }

  // ---------- standings ----------
  // GET /tournaments: the four tournaments running now.
  current() {
    const now = this.now();
    return { timeZone: TIME_ZONE, notice: NOTICE, now, paused: this.#pauseNow(), tournaments: PERIODS.map(k => this.#summary(periodAt(k, now), now)) };
  }

  // GET /tournaments/:id: one tournament's standings: live while it runs, "scoring" while its last rounds
  // are settled, then "final" from the saved line.
  standings(id) {
    const p = periodById(id), now = this.now();
    if (!p || p.startsAt > now) throw new ApiError(404, "not_found", "No such tournament.");
    const live = this.#compute(p, now);
    const saved = this.finals.get(p.id);
    const out = { ...this.#summary(p, now, live.settled), notice: NOTICE, timeZone: TIME_ZONE, scoring: SCORING, paused: this.#pauseNow(), pausedRounds: live.paused, standings: live.rows };
    if (!saved) {
      if (now >= p.endsAt) out.status = "scoring";
      return out;
    }
    // Saved: the standings are the saved ones. A later Kalshi correction is shown as a flag, never applied.
    const key = rows => rows.map(r => `${r.entrant.id}:${r.rank}:${r.correct}:${r.played}`).join(",");
    return { ...out, status: "final", savedAt: saved.at, settledRounds: saved.settledRounds, standings: saved.standings,
      ...(key(saved.standings) !== key(live.rows) ? { corrected: true, correctedNote: "Kalshi corrected a result after these standings were saved. The saved standings stand." } : {}) };
  }

  // Saves the standings of tournaments that have ended and are fully settled (or past their grace time).
  // Runs every minute; returns the ids it saved.
  finalizeDue(now = this.now()) {
    const saved = [];
    for (const kind of PERIODS) {
      let p = periodAt(kind, now);
      for (let i = 0; i < LOOKBACK[kind]; i++) {
        p = periodAt(kind, p.startsAt - 1);
        if (this.finals.has(p.id) || this.empty.has(p.id)) continue;
        const c = this.#compute(p, now);
        const late = now >= p.endsAt + FINAL_GRACE_MS;
        if (c.settled < c.ended && !late) continue; // wait for Kalshi
        if (!c.rows.length) { if (late) this.empty.add(p.id); continue; }
        this.ledger.append([{ t: "tournament_final", tournamentId: p.id, startsAt: p.startsAt, endsAt: p.endsAt, settledRounds: c.settled, standings: c.rows }], null, now);
        saved.push(p.id);
      }
    }
    if (saved.length) this.feed.publish("tournaments", "tournament.updated", () => ({ reason: ["final"], saved }));
    return saved;
  }

  start() {
    this.stop();
    const tick = () => { try { this.finalizeDue(); } catch (e) { console.error("tournaments:", e); } };
    this.timer = setInterval(tick, 60000);
    this.timer.unref?.();
    setTimeout(tick, 5000).unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // The standings as of `now`, from the ledger: rows, rounds ended so far, and how many Kalshi settled.
  #compute(p, now) {
    const rounds = [];
    let paused = 0;
    for (let r = p.startsAt; r < p.endsAt && r + ROUND_MS <= now; r += ROUND_MS) { // rounds that have ended, outside pauses
      if (this.pausedAt(r)) paused++;
      else rounds.push(r);
    }
    const settled = new Map(); // round -> "up" | "down", Kalshi's result only
    for (const r of rounds) {
      const s = this.metrics.result(MARKET, r);
      if (s && s.source === "kalshi") settled.set(r, s.result);
    }
    const rows = [];
    for (const entrantId of this.byEntrant.keys()) {
      const e = this.registry.entrantById(entrantId);
      if (!e || e.status !== "active" || !TOURNAMENT_KINDS.includes(e.kind)) continue;
      const inRounds = [];
      for (let r = p.startsAt; r < p.endsAt && r <= now; r += ROUND_MS) if (this.inAt(entrantId, r)) inRounds.push(r); // paused rounds are never settled, so they never count
      if (!inRounds.length) continue; // never in this tournament
      const calls = new Map();
      for (const l of this.calls.byEntrant.get(entrantId) || []) if (l.market === MARKET && l.round >= p.startsAt && l.round < p.endsAt) calls.set(l.round, l);
      let played = 0, called = 0, correct = 0, leadSum = 0, priced = 0, paperSum = 0;
      for (const r of inRounds) {
        const result = settled.get(r);
        if (!result) continue; // not settled by Kalshi (yet)
        played++;
        const c = calls.get(r);
        if (!c) continue; // missed
        called++;
        if (c.dir === result) correct++;
        const price = this.calls.prices?.forCall(c.id); // shown beside the ranking, never part of it
        if (price) { priced++; paperSum += paper(price.paid, c.dir === result); }
        leadSum += (Number.isFinite(c.closesAt) ? c.closesAt : c.round) - c.at;
      }
      rows.push({
        entrant: { id: e.id, name: e.name, slug: e.slug, kind: e.kind, creatorName: e.creatorName },
        played, calls: called, correct, wrong: called - correct, missed: played - called,
        accuracy: called ? correct / called : null, avgLeadMs: called ? Math.round(leadSum / called) : null,
        pricedCalls: priced, paperPerContract: priced ? Math.round(paperSum * 10000) / 10000 : null,
      });
    }
    rows.sort((a, b) => b.correct - a.correct || (b.accuracy ?? -1) - (a.accuracy ?? -1) || (b.avgLeadMs ?? -1) - (a.avgLeadMs ?? -1) || a.entrant.name.localeCompare(b.entrant.name));
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.rank = prev && prev.correct === row.correct && prev.accuracy === row.accuracy && prev.avgLeadMs === row.avgLeadMs ? prev.rank : i + 1;
    });
    return { rows, ended: rounds.length, settled: settled.size, paused };
  }

  #summary(p, now, settledRounds) {
    const out = { id: p.id, kind: p.kind, title: `${TITLES[p.kind]} tournament`, startsAt: p.startsAt, endsAt: p.endsAt,
      rounds: Math.round((p.endsAt - p.startsAt) / ROUND_MS), status: now >= p.endsAt ? "final" : "live",
      previous: periodAt(p.kind, p.startsAt - 1).id, next: now >= p.endsAt ? periodAt(p.kind, p.endsAt).id : null };
    if (settledRounds !== undefined) out.settledRounds = settledRounds;
    return out;
  }

  #entrant(ctx, id) {
    const e = this.registry.getEntrant(ctx, id); // 404s for unknown or hidden entrants
    return this.registry.entrantById(e.id);
  }
}
