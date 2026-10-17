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

export class Tournaments {
  constructor({ ledger, registry, feed, calls, metrics, now = () => Date.now() }) {
    Object.assign(this, { ledger, registry, feed, calls, metrics, now });
    this.byEntrant = new Map(); // entrantId -> tournament_entry lines, in write order
    const index = lines => {
      for (const l of lines) {
        if (l.t !== "tournament_entry") continue;
        if (!this.byEntrant.has(l.entrantId)) this.byEntrant.set(l.entrantId, []);
        this.byEntrant.get(l.entrantId).push(l);
      }
    };
    index(ledger.lines);
    ledger.on("append", index);
  }

  // Whether an entrant plays in the tournaments for the round starting at `round`.
  inAt(entrantId, round) {
    let on = false;
    for (const l of this.byEntrant.get(entrantId) || []) if (l.from <= round) on = l.on;
    return on;
  }

  // Anyone can see whether an entrant has joined (standings are public). Its owner and admins also see the history.
  view(ctx, id) {
    const e = this.#entrant(ctx, id);
    const lines = this.byEntrant.get(e.id) || [];
    const last = lines[lines.length - 1];
    const out = { entrantId: e.id, eligible: TOURNAMENT_KINDS.includes(e.kind), on: !!last?.on, from: last ? last.from : null, playingNow: this.inAt(e.id, currentRound(this.now())) };
    if (isAdmin(ctx) || ctx.uid === e.ownerId) out.history = lines.map(l => ({ on: l.on, from: l.from, at: l.at, by: l.by }));
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
    const now = this.now(), from = nextRound(now);
    const lines = this.byEntrant.get(e.id) || [];
    const last = lines[lines.length - 1];
    if (!!last?.on === f.on) return { ...this.view(ctx, id), unchanged: true };
    this.ledger.append([{ t: "tournament_entry", entrantId: e.id, on: f.on, from }], ctx.uid, now);
    const event = c => this.view(c, e.id);
    this.feed.publish(`entrant:${e.id}`, "entrant.tournaments", event);
    return this.view(ctx, id);
  }

  // ---------- standings ----------
  // GET /tournaments: the four tournaments running now.
  current() {
    const now = this.now();
    return { timeZone: TIME_ZONE, notice: NOTICE, now, tournaments: PERIODS.map(k => this.#summary(periodAt(k, now), now)) };
  }

  // GET /tournaments/:id: one tournament's standings, live while it runs and final once it has ended.
  standings(id) {
    const p = periodById(id), now = this.now();
    if (!p || p.startsAt > now) throw new ApiError(404, "not_found", "No such tournament.");
    const rounds = [];
    for (let r = p.startsAt; r < p.endsAt && r + ROUND_MS <= now; r += ROUND_MS) rounds.push(r); // rounds that have ended
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
      for (let r = p.startsAt; r < p.endsAt && r <= now; r += ROUND_MS) if (this.inAt(entrantId, r)) inRounds.push(r);
      if (!inRounds.length) continue; // never in this tournament
      const calls = new Map();
      for (const l of this.calls.byEntrant.get(entrantId) || []) if (l.market === MARKET && l.round >= p.startsAt && l.round < p.endsAt) calls.set(l.round, l);
      let played = 0, called = 0, correct = 0, leadSum = 0;
      for (const r of inRounds) {
        const result = settled.get(r);
        if (!result) continue; // not settled by Kalshi (yet)
        played++;
        const c = calls.get(r);
        if (!c) continue; // missed
        called++;
        if (c.dir === result) correct++;
        leadSum += (Number.isFinite(c.closesAt) ? c.closesAt : c.round) - c.at;
      }
      rows.push({
        entrant: { id: e.id, name: e.name, slug: e.slug, kind: e.kind, creatorName: e.creatorName },
        played, calls: called, correct, wrong: called - correct, missed: played - called,
        accuracy: called ? correct / called : null, avgLeadMs: called ? Math.round(leadSum / called) : null,
      });
    }
    rows.sort((a, b) => b.correct - a.correct || (b.accuracy ?? -1) - (a.accuracy ?? -1) || (b.avgLeadMs ?? -1) - (a.avgLeadMs ?? -1) || a.entrant.name.localeCompare(b.entrant.name));
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.rank = prev && prev.correct === row.correct && prev.accuracy === row.accuracy && prev.avgLeadMs === row.avgLeadMs ? prev.rank : i + 1;
    });
    return { ...this.#summary(p, now, settled.size), notice: NOTICE, timeZone: TIME_ZONE, scoring: "Most correct calls, then accuracy, then the earlier average call. Only rounds Kalshi settled count.", standings: rows };
  }

  #summary(p, now, settledRounds) {
    const out = { id: p.id, kind: p.kind, title: `${TITLES[p.kind]} tournament`, startsAt: p.startsAt, endsAt: p.endsAt,
      rounds: Math.round((p.endsAt - p.startsAt) / ROUND_MS), status: now >= p.endsAt ? "final" : "live" };
    if (settledRounds !== undefined) out.settledRounds = settledRounds;
    return out;
  }

  #entrant(ctx, id) {
    const e = this.registry.getEntrant(ctx, id); // 404s for unknown or hidden entrants
    return this.registry.entrantById(e.id);
  }
}
