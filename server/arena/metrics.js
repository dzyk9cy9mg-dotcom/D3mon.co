// Battle metrics, the manual fallback (step 3): HardSmoke records each round for the whole lineup at
// once: each entrant's call, whether it was right, its speed and its profit, plus the round's result.
//
// Everything goes into the ledger as new lines ("metric" and "score"), so corrections never erase what
// was there before; readers take the latest line. Entries are labelled "recorded by host". From step 5,
// a Kalshi result for a round takes precedence over one entered by hand.
//
//   speedMs  how long before the round locked the call was made (lead time; more is earlier)
//   profit   US dollars, signed, to the cent
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";

const DIRS = ["up", "down"];
const MAX_ENTRIES = 50;
const ENTRY_FIELDS = {
  entrantId: { type: "string", required: true, pattern: /^[A-Za-z0-9]{8,40}$/, max: 40 },
  call: { type: "enum", values: DIRS },
  correct: { type: "boolean" },
  speedMs: { type: "integer", min: 0, max: 24 * 3600 * 1000 },
  profit: { type: "number", min: -1e6, max: 1e6, decimals: 2 },
  void: { type: "boolean" },
};
const RECORD_FIELDS = {
  result: { type: "enum", values: DIRS },
  entries: { type: "array", max: MAX_ENTRIES, default: [], of: { type: "object", fields: ENTRY_FIELDS } },
};
const METRIC_KEYS = ["call", "correct", "speedMs", "profit"];
const HOST = { source: "host", verification: "recorded by host" };

export class Metrics {
  constructor({ ledger, registry, feed, userName = () => null }) {
    this.ledger = ledger;
    this.registry = registry;
    this.feed = feed;
    this.userName = userName;
    // Indexes over the ledger: score lines per market round, metric lines per battle, in write order.
    this.scores = new Map();
    this.byBattle = new Map();
    const index = lines => {
      for (const l of lines) {
        const [map, key] = l.t === "score" ? [this.scores, `${l.market}|${l.round}`] : l.t === "metric" ? [this.byBattle, l.battleId] : [];
        if (!map) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(l);
      }
    };
    index(ledger.lines);
    ledger.on("append", index);
  }

  // ---------- reading ----------
  // The result that counts for a round: Kalshi's when there is one, otherwise the latest entered by hand.
  result(market, round) {
    let best = null;
    for (const l of this.scores.get(`${market}|${round}`) || []) {
      if (!best || (l.source === "kalshi") > (best.source === "kalshi") || ((l.source === "kalshi") === (best.source === "kalshi") && l.at >= best.at)) best = l;
    }
    return best;
  }

  // Latest metric line per round and entrant for one battle: Map("<round>|<entrantId>" -> line).
  #latest(battleId) {
    const out = new Map();
    for (const l of this.byBattle.get(battleId) || []) out.set(`${l.round}|${l.entrantId}`, l);
    return out;
  }

  // Lineup order first, then anyone who has entries but has since left the lineup.
  #people(b, latest) {
    const ids = [...(b.entrants || [])];
    for (const l of latest.values()) if (!ids.includes(l.entrantId)) ids.push(l.entrantId);
    return ids.map(id => this.registry.entrantById(id)).filter(Boolean);
  }

  #entryView(l, e, result, ctx) {
    const out = { entrantId: e.id, name: e.name, slug: e.slug, ...HOST, at: l.at };
    for (const k of METRIC_KEYS) if (l[k] !== undefined) out[k] = l[k];
    // A result corrected after the entries were made can disagree with them; say so instead of hiding it.
    if (result && l.call && typeof l.correct === "boolean" && (l.call === result) !== l.correct) out.mismatch = true;
    if (isAdmin(ctx)) Object.assign(out, { by: l.by, byName: this.userName(l.by) });
    return out;
  }

  #roundView(b, index, latest, people, ctx) {
    const round = b.startsAt + index * b.roundMs;
    const r = this.result(b.market, round);
    const entries = [];
    for (const e of people) {
      const l = latest.get(`${round}|${e.id}`);
      if (l && !l.void) entries.push(this.#entryView(l, e, r?.result, ctx));
    }
    return {
      round, index, endsAt: round + b.roundMs, over: round + b.roundMs <= Date.now(),
      result: r ? r.result : null, resultSource: r ? (r.source === "kalshi" ? "kalshi" : "host") : null,
      entries,
    };
  }

  view(ctx, battleId, { history = false } = {}) {
    const b = this.registry.battleFor(ctx, battleId);
    const latest = this.#latest(b.id), people = this.#people(b, latest);
    const rounds = Array.from({ length: b.rounds }, (_, i) => this.#roundView(b, i, latest, people, ctx));
    // The battle's own record per entrant, in lineup order. Not a ranking.
    const totals = people.map(e => {
      const mine = rounds.flatMap(r => r.entries.filter(x => x.entrantId === e.id));
      const speeds = mine.filter(x => x.speedMs !== undefined).map(x => x.speedMs);
      const profits = mine.filter(x => x.profit !== undefined).map(x => x.profit);
      return {
        entrantId: e.id, name: e.name, slug: e.slug, inLineup: (b.entrants || []).includes(e.id), recorded: mine.length,
        right: mine.filter(x => x.correct === true).length, wrong: mine.filter(x => x.correct === false).length,
        avgSpeedMs: speeds.length ? Math.round(speeds.reduce((a, x) => a + x, 0) / speeds.length) : null,
        profit: profits.length ? Math.round(profits.reduce((a, x) => a + x, 0) * 100) / 100 : null, ...HOST,
      };
    });
    const out = { battleId: b.id, market: b.market, roundMs: b.roundMs, rounds, totals };
    if (history) {
      if (!isAdmin(ctx)) throw new ApiError(403, "not_granted", "Only HardSmoke and the site admins can see the entry history.");
      const roundSet = new Set(rounds.map(r => r.round));
      const scores = [...roundSet].flatMap(r => this.scores.get(`${b.market}|${r}`) || []);
      out.history = [...(this.byBattle.get(b.id) || []), ...scores].sort((x, y) => x.at - y.at || x.seq - y.seq)
        .map(l => ({ ...l, byName: this.userName(l.by) }));
    }
    return out;
  }

  // ---------- recording ----------
  record(ctx, battleId, roundParam, body) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!isAdmin(ctx) || !ctx.canWrite) throw new ApiError(403, "not_granted", "Only HardSmoke and the site admins can record metrics.");
    const b = this.registry.battleFor(ctx, battleId);
    if (b.status === "draft") throw new ApiError(409, "battle_draft", "This battle is still a draft. Open it before recording rounds.");
    const round = Number(roundParam);
    const index = (round - b.startsAt) / b.roundMs;
    if (!Number.isSafeInteger(round) || !Number.isInteger(index) || index < 0 || index >= b.rounds)
      throw new ApiError(404, "not_found", `That isn't one of this battle's ${b.rounds} rounds.`);
    if (round + b.roundMs > Date.now()) throw new ApiError(409, "round_not_over", "This round hasn't finished yet. Record it once it has settled.");

    const f = check(body, RECORD_FIELDS);
    if (!f.result && !f.entries.length) throw new ApiError(400, "invalid_argument", "Send the round's result, its entries, or both.");
    const latest = this.#latest(b.id);
    const result = f.result || this.result(b.market, round)?.result || null;
    const seen = new Set(), lines = [];

    f.entries.forEach((en, i) => {
      const at = `entries[${i}]`;
      if (seen.has(en.entrantId)) throw new ApiError(400, "invalid_argument", `${at} repeats an entrant.`, `${at}.entrantId`);
      seen.add(en.entrantId);
      const prev = latest.get(`${round}|${en.entrantId}`);
      if (!(b.entrants || []).includes(en.entrantId) && !prev)
        throw new ApiError(409, "not_in_lineup", `${at} isn't in this battle's lineup.`, `${at}.entrantId`);
      let line;
      if (en.void) {
        if (METRIC_KEYS.some(k => en[k] !== undefined)) throw new ApiError(400, "invalid_argument", `${at} clears the entry, so it can't also set values.`, at);
        if (!prev || prev.void) return; // nothing to clear
        line = { void: true };
      } else {
        line = {};
        for (const k of METRIC_KEYS) if (en[k] !== undefined) line[k] = en[k];
        if (result && line.call) {
          const derived = line.call === result;
          if (line.correct === undefined) line.correct = derived;
          else if (line.correct !== derived)
            throw new ApiError(400, "invalid_argument", `${at} says the call was ${line.correct ? "right" : "wrong"}, but ${line.call} against a round that went ${result} was ${derived ? "right" : "wrong"}.`, `${at}.correct`);
        }
        if (line.correct === undefined) throw new ApiError(400, "invalid_argument", `${at} needs "correct" (or a call and the round's result).`, `${at}.correct`);
        if (prev && !prev.void && METRIC_KEYS.every(k => prev[k] === line[k])) return; // unchanged
      }
      lines.push({ t: "metric", battleId: b.id, round, entrantId: en.entrantId, ...line });
    });

    const current = this.result(b.market, round);
    if (f.result && !(current && current.result === f.result && current.source !== "kalshi")) {
      if (current?.source === "kalshi" && current.result !== f.result)
        throw new ApiError(409, "kalshi_result", `Kalshi settled this round ${current.result}. Results from Kalshi can't be overridden by hand.`, "result");
      if (current?.source !== "kalshi") lines.unshift({ t: "score", market: b.market, round, result: f.result, source: "admin", battleId: b.id });
    }

    if (lines.length) this.ledger.append(lines, ctx.uid);
    this.#changed(b, index, lines);
    return this.view(ctx, b.id).rounds[index];
  }

  #changed(b, index, lines) {
    if (!lines.length) return;
    const draft = b.status === "draft";
    const roundFor = ctx => {
      const latest = this.#latest(b.id);
      return this.#roundView(b, index, latest, this.#people(b, latest), ctx);
    };
    this.feed.publish(`battle:${b.id}`, "round.metrics", roundFor, ctx => !draft || isAdmin(ctx));
    for (const id of new Set(lines.filter(l => l.entrantId).map(l => l.entrantId)))
      this.feed.publish(`entrant:${id}`, "round.metrics", ctx => ({ battleId: b.id, ...roundFor(ctx) }));
  }
}
