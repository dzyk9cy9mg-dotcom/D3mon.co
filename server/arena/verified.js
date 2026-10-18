// Verified stats: worked out by the server from an entrant's own calls, which the server stamped and
// locked at the round start, scored against each round's result. Nobody can type them in, so they're
// labelled by where the results came from: "verified" when Kalshi settled every round counted,
// "recorded by host" when HardSmoke entered them, "mixed" when both (with the counts in `sources`).
// Stats that need no result (calls made, lead time, participation) are always "verified".
//
// Every entrant gets them: callers (who have no bot key, so this is their whole card) and bots, whose
// cards can show these next to the stats they send themselves. Like every stat they start hidden.
import { paper } from "./prices.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86400000;
const MIN_FOR_CHANCE = 10;
const FORM_LENGTH = 20;
const CATEGORY = "Verified results";

// Keys start with "v_", which the stat list and custom stats can't use, so they never collide.
export const VERIFIED_PREFIX = "v_";
export const VERIFIED = [
  ["v_win_rate", "Win rate", "percent", "percent", "%", "Share of scored calls that were right"],
  ["v_chance", "Better than chance", "percent", "percent", "%", `How sure we can be the win rate isn't luck (a coin flip wins half the time). Shown after ${MIN_FOR_CHANCE} scored calls`],
  ["v_record", "Record", "record", "record", "", "Right and wrong calls, all time"],
  ["v_last_30_days", "Last 30 days", "record", "record", "", "Right and wrong calls over the last 30 days (UTC)"],
  ["v_last_7_days", "Last 7 days", "record", "record", "", "Right and wrong calls over the last 7 days (UTC)"],
  ["v_today", "Today", "record", "record", "", "Right and wrong calls today (UTC)"],
  ["v_form", "Recent form", "form", "form", "", `The last ${FORM_LENGTH} scored calls, oldest first`],
  ["v_current_streak", "Current streak", "integer", "streak", "", "Right (+) or wrong (−) calls in a row"],
  ["v_best_win_streak", "Best win streak", "integer", "plain", "", "Most right calls in a row"],
  ["v_worst_loss_streak", "Worst losing streak", "integer", "plain", "", "Most wrong calls in a row"],
  ["v_participation", "Battle rounds called", "percent", "percent", "%", "Share of the battle rounds so far that were called, so easy rounds can't be picked"],
  ["v_battles", "Battle record", "battles", "battles", "", "Right and wrong calls in each battle entered"],
  ["v_up_down", "Win rate on up / down calls", "histogram", "percent", "%", "Win rate on each direction, with how many of each"],
  ["v_hours", "Best hours", "histogram", "percent", "%", "Win rate by hour of the day the round started (UTC)"],
  ["v_days", "Best days", "histogram", "percent", "%", "Win rate by day of the week (UTC)"],
  ["v_lead", "Average lead time", "duration", "duration", "", "How long before the calls closed the call was made"],
  ["v_crowd", "Against the crowd", "percent", "percent", "%", "Win rate when going against most others who called that round"],
  ["v_calls", "Calls made", "integer", "plain", "", "Rounds called, including ones not scored yet"],
  // Priced at Kalshi's own price for the side called, read by the server the moment the call arrived (paper only).
  ["v_paper", "Paper profit per $1", "money", "money", "$", "Profit if every call had bought one $1 Kalshi contract at the price when it was made. Paper only: D3MON never trades"],
  ["v_avg_paid", "Average price paid", "money", "money", "$", "What Kalshi charged, on average, for the side called, when it was called. Cheaper means the call went against the market"],
  ["v_edge", "Beat the odds by", "return", "percent", "%", "Win rate minus the average price paid: above zero means the calls were right more often than Kalshi's prices expected"],
].map(([key, label, type, format, unit, description], i) => ({ key, label, type, format, unit, description, category: CATEGORY, order: i + 1 }));

const rate = (w, n) => (n ? Math.round((w / n) * 10000) / 10000 : null);

// The chance of doing at least this well by luck alone is P(X >= w) for X ~ Binomial(n, 1/2);
// "better than chance" is 1 minus that.
export function betterThanChance(w, n) {
  if (n < MIN_FOR_CHANCE) return null;
  const lf = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  let p = 0;
  for (let k = w; k <= n; k++) p += Math.exp(lf[n] - lf[k] - lf[n - k] - n * Math.LN2);
  return Math.round(Math.max(0, Math.min(1, 1 - p)) * 10000) / 10000;
}

export class Verified {
  constructor({ calls, metrics, registry }) {
    Object.assign(this, { calls, metrics, registry });
  }

  // The latest call per round (the one that counts) once its calls have closed (a caller's call is
  // still sealed until then, and a stat could give its direction away), scored where a result exists.
  #history(entrantId) {
    const latest = new Map();
    for (const l of this.calls.byEntrant.get(entrantId) || []) latest.set(`${l.market}|${l.round}`, l);
    const now = this.calls.now();
    return [...latest.values()].filter(l => (Number.isFinite(l.closesAt) ? l.closesAt : l.round) <= now).sort((a, b) => a.round - b.round).map(l => {
      const r = this.metrics.result(l.market, l.round);
      return { line: l, round: l.round, at: l.at, closesAt: Number.isFinite(l.closesAt) ? l.closesAt : l.round, dir: l.dir, result: r ? r.result : null, source: r ? (r.source === "kalshi" ? "kalshi" : "host") : null };
    });
  }

  // What everyone else called in a round: the majority direction, or null on a tie or when nobody did.
  #crowd(entrantId, market, round) {
    const theirs = new Map();
    for (const l of this.calls.byRound.get(`${market}|${round}`) || []) if (l.entrantId !== entrantId) theirs.set(l.entrantId, l.dir);
    const up = [...theirs.values()].filter(d => d === "up").length, down = theirs.size - up;
    return up > down ? "up" : down > up ? "down" : null;
  }

  compute(entrantId, now = Date.now()) {
    const h = this.#history(entrantId);
    const scored = h.filter(x => x.result);
    const right = x => x.dir === x.result;
    const verif = list => {
      const s = { kalshi: list.filter(x => x.source === "kalshi").length, host: list.filter(x => x.source === "host").length };
      return { verification: !s.host ? "verified" : !s.kalshi ? "recorded by host" : "mixed", sources: s };
    };
    const server = { verification: "verified", sources: null };
    const record = list => ({ w: list.filter(right).length, l: list.filter(x => !right(x)).length });
    const wins = scored.filter(right).length;

    let runW = 0, runL = 0, bestW = 0, bestL = 0;
    for (const x of scored) {
      if (right(x)) { runW++; runL = 0; } else { runL++; runW = 0; }
      bestW = Math.max(bestW, runW);
      bestL = Math.max(bestL, runL);
    }

    const today = Math.floor(now / DAY_MS) * DAY_MS;
    const since = ms => scored.filter(x => x.round >= ms);

    const bucket = (list, keyOf, keys) => {
      const m = new Map();
      for (const x of list) {
        const k = keyOf(x), b = m.get(k) || { w: 0, n: 0 };
        b.n++;
        if (right(x)) b.w++;
        m.set(k, b);
      }
      const value = {}, counts = {};
      for (const k of keys) if (m.has(k)) { value[k] = rate(m.get(k).w, m.get(k).n); counts[k] = m.get(k).n; }
      return { value, counts };
    };
    const hourKeys = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

    // Battles: the rounds of each battle this entrant is in, so far, and the calls made in that battle.
    const battles = this.registry.allBattles().filter(b => b.status !== "draft" && (b.entrants || []).includes(entrantId)).sort((a, b) => a.startsAt - b.startsAt);
    let battleRounds = 0, battleCalled = 0;
    const perBattle = [];
    for (const b of battles) {
      let w = 0, l = 0, called = 0, rounds = 0;
      for (let i = 0; i < b.rounds; i++) {
        const round = b.startsAt + i * b.roundMs;
        if (round > this.calls.now()) break;
        rounds++;
        const c = this.calls.latest(entrantId, b.market, round, b.id);
        if (!c) continue;
        called++;
        const r = this.metrics.result(b.market, round);
        if (r) c.dir === r.result ? w++ : l++;
      }
      battleRounds += rounds;
      battleCalled += called;
      if (rounds) perBattle.push({ t: b.title, w, l, called, rounds });
    }

    const crowd = scored.map(x => ({ x, c: this.#crowd(entrantId, x.line.market, x.round) })).filter(({ x, c }) => c && c !== x.dir).map(({ x }) => x);
    const leads = h.map(x => x.closesAt - x.at).filter(v => v >= 0);
    const priceOf = x => this.calls.prices?.forCall(x.line.id) || null;
    const priced = h.filter(priceOf), pricedScored = scored.filter(priceOf);
    const avg = list => list.length ? list.reduce((a, x) => a + priceOf(x).paid, 0) / list.length : null;
    const paperSum = pricedScored.reduce((a, x) => a + paper(priceOf(x).paid, right(x)), 0);

    return {
      v_win_rate: { value: rate(wins, scored.length), n: scored.length, ...verif(scored) },
      v_chance: { value: betterThanChance(wins, scored.length), n: scored.length, ...verif(scored) },
      v_record: { value: scored.length ? record(scored) : null, ...verif(scored) },
      v_last_30_days: { value: h.length ? record(since(today - 29 * DAY_MS)) : null, ...verif(since(today - 29 * DAY_MS)) },
      v_last_7_days: { value: h.length ? record(since(today - 6 * DAY_MS)) : null, ...verif(since(today - 6 * DAY_MS)) },
      v_today: { value: h.length ? record(since(today)) : null, ...verif(since(today)) },
      v_form: { value: scored.length ? scored.slice(-FORM_LENGTH).map(x => (right(x) ? "w" : "l")) : null, ...verif(scored.slice(-FORM_LENGTH)) },
      v_current_streak: { value: scored.length ? (runW || -runL) : null, ...verif(scored) },
      v_best_win_streak: { value: scored.length ? bestW : null, ...verif(scored) },
      v_worst_loss_streak: { value: scored.length ? bestL : null, ...verif(scored) },
      v_participation: { value: rate(battleCalled, battleRounds), n: battleRounds, ...server },
      v_battles: { value: perBattle.length ? perBattle : null, ...verif(scored.filter(x => (x.line.battleIds || []).length)) },
      v_up_down: { ...(scored.length ? bucket(scored, x => x.dir, ["up", "down"]) : { value: null }), ...verif(scored) },
      v_hours: { ...(scored.length ? bucket(scored, x => `${String(new Date(x.round).getUTCHours()).padStart(2, "0")}:00`, hourKeys) : { value: null }), timezone: "UTC", ...verif(scored) },
      v_days: { ...(scored.length ? bucket(scored, x => DAYS[new Date(x.round).getUTCDay()], DAYS) : { value: null }), timezone: "UTC", ...verif(scored) },
      v_lead: { value: leads.length ? Math.round(leads.reduce((a, v) => a + v, 0) / leads.length) : null, n: leads.length, ...server },
      v_crowd: { value: rate(crowd.filter(right).length, crowd.length), n: crowd.length, ...verif(crowd) },
      v_calls: { value: h.length || null, ...server },
      v_paper: { value: pricedScored.length ? Math.round(paperSum * 10000) / 10000 : null, n: pricedScored.length, ...verif(pricedScored) },
      v_avg_paid: { value: priced.length ? Math.round(avg(priced) * 10000) / 10000 : null, n: priced.length, ...server },
      v_edge: { value: pricedScored.length ? Math.round((pricedScored.filter(right).length / pricedScored.length - avg(pricedScored)) * 10000) / 10000 : null, n: pricedScored.length, ...verif(pricedScored) },
    };
  }
}
