// Battle results and winner badges (owner, 2026-10-19: HardSmoke's Saturday battles; "badges would be cool").
// Worked out from the ledger on each request, nothing stored, with the tournaments' rule so a host can't sway
// them: only rounds Kalshi settled count, and only calls the entrant made in this battle (`battleIds`).
// Rank: most correct calls, then accuracy, then the earlier average call; exact ties share a rank. A battle's
// results are final once every round is settled by Kalshi, or 30 minutes after its end; its winners (rank 1,
// with at least one correct call) get a badge on their profile.
import { MARKET } from "./calls.js";
import { ROUND_MS } from "./registry.js";
import { NOTICE } from "./tournaments.js";
import { paper } from "./prices.js";

const FINAL_GRACE_MS = 30 * 60000; // as the tournaments
const SCORING = "Most correct calls, then accuracy, then the earlier average call. Only settled rounds count.";

export class BattleResults {
  constructor({ registry, calls, metrics, now = () => Date.now() }) {
    Object.assign(this, { registry, calls, metrics, now });
  }

  // GET /battles/:id/results
  results(ctx, id) {
    return this.#compute(this.registry.battleFor(ctx, id), this.now());
  }

  // The badges an entrant has won, newest first.
  badges(entrantId) {
    const e = this.registry.entrantById(entrantId);
    if (!e) return [];
    const now = this.now(), out = [];
    for (const b of this.registry.allBattles()) {
      if (b.status === "draft" || !(b.entrants || []).includes(e.id)) continue;
      const r = this.#compute(b, now);
      if (r.status === "final" && r.winners.includes(e.id)) out.push({ kind: "battle_winner", battleId: b.id, title: b.title, at: r.endsAt, shared: r.winners.length > 1 });
    }
    return out.sort((x, y) => y.at - x.at);
  }

  #compute(b, now) {
    const endsAt = b.startsAt + b.rounds * b.roundMs;
    const settled = new Map();
    for (let r = b.startsAt; r < endsAt && r + ROUND_MS <= now; r += ROUND_MS) {
      const s = this.metrics.result(MARKET, r);
      if (s && s.source === "kalshi") settled.set(r, s.result);
    }
    const rows = [];
    for (const id of b.entrants || []) {
      const e = this.registry.entrantById(id);
      if (!e) continue;
      let played = 0, called = 0, correct = 0, leadSum = 0, priced = 0, paperSum = 0;
      const mine = new Map();
      for (const l of this.calls.byEntrant.get(id) || []) if (l.market === MARKET && (l.battleIds || []).includes(b.id) && l.round >= b.startsAt && l.round < endsAt) mine.set(l.round, l);
      for (const [r, result] of settled) {
        played++;
        const c = mine.get(r);
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
    rows.sort((x, y) => y.correct - x.correct || (y.accuracy ?? -1) - (x.accuracy ?? -1) || (y.avgLeadMs ?? -1) - (x.avgLeadMs ?? -1) || x.entrant.name.localeCompare(y.entrant.name));
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.rank = prev && prev.correct === row.correct && prev.accuracy === row.accuracy && prev.avgLeadMs === row.avgLeadMs ? prev.rank : i + 1;
    });
    const status = now < b.startsAt ? "upcoming" : now < endsAt ? "live" : settled.size === b.rounds || now >= endsAt + FINAL_GRACE_MS ? "final" : "scoring";
    const winners = status === "final" ? rows.filter(r => r.rank === 1 && r.correct > 0).map(r => r.entrant.id) : [];
    return { battle: { id: b.id, title: b.title }, startsAt: b.startsAt, endsAt, rounds: b.rounds, settledRounds: settled.size, status, winners, standings: rows, scoring: SCORING, notice: NOTICE };
  }
}
