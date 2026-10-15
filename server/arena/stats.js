// Stat cards (step 4b). Standard stats are worked out by the server from an entrant's raw call history
// (the ledger), so nobody can type them in. Each owner decides, stat by stat, who may see them:
// every stat starts hidden, and the owner picks Public, Members only or Private, with their own label,
// order and description. The server leaves out what a reader may not see before building the card,
// and hiding a stat never deletes any history.
//
//   arena_statsettings/<entrantId>  { stats: { <key>: { visibility, label?, description?, order? } } }
//
// Verification: a stat built from round results says where they came from: "verified" when Kalshi
// settled every round it counts, "recorded by host" when HardSmoke did, "mixed" when both (with the
// counts in `sources`). Stats that need no result (calls made, time before the lock) come straight
// from server-stamped calls, so they're "verified".
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";

export const SETTINGS = "arena_statsettings";
export const VISIBILITY = ["hidden", "private", "members", "public"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAILY_DAYS = 90;

// The standard stats, in their default order. Owners can relabel, reorder and describe them.
export const STANDARD = [
  { key: "calls", label: "Calls made", type: "integer", unit: "", description: "Rounds this entrant called, stamped by the server" },
  { key: "wins", label: "Right calls", type: "integer", unit: "", description: "Calls that matched the round's result" },
  { key: "losses", label: "Wrong calls", type: "integer", unit: "", description: "Calls that didn't match the round's result" },
  { key: "hit_rate", label: "Hit rate", type: "percent", unit: "%", description: "Share of scored calls that were right" },
  { key: "current_streak", label: "Current streak", type: "streak", unit: "", description: "Right (+) or wrong (−) calls in a row, up to the latest scored round" },
  { key: "longest_win_streak", label: "Longest winning streak", type: "integer", unit: "", description: "Most right calls in a row" },
  { key: "longest_loss_streak", label: "Longest losing streak", type: "integer", unit: "", description: "Most wrong calls in a row" },
  { key: "avg_lead", label: "Average time before the lock", type: "duration", unit: "ms", description: "How early calls arrive before the round starts" },
  { key: "best_hours", label: "Best trading times", type: "histogram", unit: "%", description: "Hit rate by hour of the day the round started (UTC)" },
  { key: "weekdays", label: "Hit rate by weekday", type: "histogram", unit: "%", description: "Hit rate by day of the week the round started (UTC)" },
  { key: "daily_record", label: "Daily record", type: "series", unit: "%", description: `Right and wrong calls per day (UTC), last ${DAILY_DAYS} days` },
];
const BY_KEY = new Map(STANDARD.map((s, i) => [s.key, { ...s, order: i + 1 }]));

const SETTING_FIELDS = {
  visibility: { type: "enum", values: VISIBILITY },
  label: { type: "string", max: 40 },
  description: { type: "string", max: 160 },
  order: { type: "integer", min: 0, max: 999 },
};

const rate = (w, n) => (n ? Math.round((w / n) * 10000) / 10000 : null);

export class Stats {
  constructor({ store, registry, calls, metrics, ledger, feed }) {
    Object.assign(this, { store, registry, calls, metrics, feed });
    // A result changes the stats of everyone who called that round: tell their cards to refresh.
    ledger.on("append", lines => {
      const touched = new Set();
      for (const l of lines) {
        if (l.t === "score") for (const c of calls.byRound.get(`${l.market}|${l.round}`) || []) touched.add(c.entrantId);
        if (l.t === "call") touched.add(l.entrantId);
      }
      for (const id of touched) this.#changed(id);
    });
  }

  // ---------- the numbers ----------
  // The latest call per round (the one that counts), scored where a result exists.
  #history(entrantId) {
    const latest = new Map();
    for (const l of this.calls.byEntrant.get(entrantId) || []) latest.set(`${l.market}|${l.round}`, l);
    const now = this.calls.now();
    return [...latest.values()].filter(l => l.round <= now).sort((a, b) => a.round - b.round).map(l => {
      const r = this.metrics.result(l.market, l.round);
      return { round: l.round, at: l.at, dir: l.dir, result: r ? r.result : null, source: r ? (r.source === "kalshi" ? "kalshi" : "host") : null };
    });
  }

  compute(entrantId) {
    const h = this.#history(entrantId);
    const scored = h.filter(x => x.result);
    const right = x => x.dir === x.result;
    const sources = list => ({ kalshi: list.filter(x => x.source === "kalshi").length, host: list.filter(x => x.source === "host").length });
    const verif = list => {
      const s = sources(list);
      return { verification: !list.length || !s.host ? "verified" : !s.kalshi ? "recorded by host" : "mixed", sources: s };
    };
    const wins = scored.filter(right).length;

    let cur = 0, bestW = 0, bestL = 0, runW = 0, runL = 0;
    for (const x of scored) {
      if (right(x)) { runW++; runL = 0; } else { runL++; runW = 0; }
      bestW = Math.max(bestW, runW);
      bestL = Math.max(bestL, runL);
    }
    cur = runW ? runW : -runL;

    const bucket = keyOf => {
      const m = new Map();
      for (const x of scored) {
        const k = keyOf(new Date(x.round));
        const b = m.get(k) || { w: 0, n: 0 };
        b.n++;
        if (right(x)) b.w++;
        m.set(k, b);
      }
      return m;
    };
    const histogram = (m, keys) => {
      const value = {}, counts = {};
      for (const k of keys) if (m.has(k)) { value[k] = rate(m.get(k).w, m.get(k).n); counts[k] = m.get(k).n; }
      return { value, counts };
    };
    const hours = histogram(bucket(d => `${String(d.getUTCHours()).padStart(2, "0")}:00`), Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`));
    const days = histogram(bucket(d => DAYS[d.getUTCDay()]), DAYS);
    const since = Date.now() - DAILY_DAYS * 86400000;
    const daily = bucket(d => d.toISOString().slice(0, 10));
    const series = [...daily.entries()].filter(([day]) => Date.parse(day) >= since - 86400000).sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([t, b]) => ({ t, v: rate(b.w, b.n), w: b.w, l: b.n - b.w }));
    const leads = h.map(x => x.round - x.at).filter(v => v >= 0);

    const server = { verification: "verified", sources: null };
    return {
      calls: { value: h.length, ...server },
      wins: { value: wins, ...verif(scored) },
      losses: { value: scored.length - wins, ...verif(scored) },
      hit_rate: { value: rate(wins, scored.length), n: scored.length, ...verif(scored) },
      current_streak: { value: cur, ...verif(scored) },
      longest_win_streak: { value: bestW, ...verif(scored) },
      longest_loss_streak: { value: bestL, ...verif(scored) },
      avg_lead: { value: leads.length ? Math.round(leads.reduce((a, v) => a + v, 0) / leads.length) : null, n: leads.length, ...server },
      best_hours: { ...hours, timezone: "UTC", ...verif(scored) },
      weekdays: { ...days, timezone: "UTC", ...verif(scored) },
      daily_record: { value: series, timezone: "UTC", ...verif(scored) },
    };
  }

  // ---------- settings ----------
  #settings(entrantId) {
    return this.store.get(`${SETTINGS}/${entrantId}`).data?.stats || {};
  }

  // Each standard stat with its default and the owner's choices merged in.
  #defs(entrantId) {
    const own = this.#settings(entrantId);
    return STANDARD.map(s => {
      const d = BY_KEY.get(s.key), o = own[s.key] || {};
      return { key: s.key, type: d.type, unit: d.unit, source: "standard", visibility: o.visibility || "hidden",
        label: o.label || d.label, description: o.description ?? d.description, order: o.order ?? d.order,
        defaultLabel: d.label, defaultDescription: d.description };
    });
  }

  #owned(ctx, entrantId) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    const e = this.registry.entrantById(entrantId);
    if (!e || e.ownerId !== ctx.uid) throw new ApiError(404, "not_found", "That isn't one of your entrants.");
    return e;
  }

  // The owner's view: every stat, hidden ones included, with its current value and settings.
  settings(ctx, entrantId) {
    const e = this.#owned(ctx, entrantId);
    const values = this.compute(e.id);
    return { entrantId: e.id, slug: e.slug, visibility: VISIBILITY, stats: this.#defs(e.id).map(d => ({ ...d, ...values[d.key] })).sort((a, b) => a.order - b.order) };
  }

  // { stats: { <key>: { visibility?, label?, description?, order? } } }. Only what's sent changes.
  // An empty label or description goes back to the default.
  updateSettings(ctx, entrantId, body) {
    const e = this.#owned(ctx, entrantId);
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const f = check(body, { stats: { type: "object", required: true, fields: Object.fromEntries(STANDARD.map(s => [s.key, { type: "object", fields: SETTING_FIELDS }])) } });
    const cur = this.#settings(e.id), next = { ...cur };
    for (const [key, change] of Object.entries(f.stats)) {
      const merged = { ...(cur[key] || {}), ...change };
      for (const k of ["label", "description"]) if (merged[k] === "") delete merged[k];
      next[key] = merged;
    }
    this.store.set(`${SETTINGS}/${e.id}`, { entrantId: e.id, stats: next, updatedAt: Date.now() }, ctx.uid);
    this.#changed(e.id);
    return this.settings(ctx, e.id);
  }

  // ---------- the card ----------
  // Who is reading decides what's in it: guests see public stats, members also members-only ones, and
  // the owner also private ones. Hidden stats appear on no card. Admins read like members.
  card(ctx, idOrSlug) {
    const e = this.registry.entrantById(idOrSlug) || this.registry.entrantBySlug(idOrSlug);
    if (!e || (e.status !== "active" && !isAdmin(ctx) && e.ownerId !== ctx.uid)) throw new ApiError(404, "not_found", "No such entrant.");
    const viewer = ctx.uid && ctx.uid === e.ownerId ? "owner" : ctx.uid ? "member" : "guest";
    const allowed = new Set(viewer === "owner" ? ["public", "members", "private"] : viewer === "member" ? ["public", "members"] : ["public"]);
    const shown = this.#defs(e.id).filter(d => allowed.has(d.visibility)).sort((a, b) => a.order - b.order);
    const values = shown.length ? this.compute(e.id) : {};
    return {
      schema: "d3mon.statcard/v1", generatedAt: new Date().toISOString(), viewer,
      entrant: { id: e.id, slug: e.slug, name: e.name, kind: e.kind, creatorName: e.creatorName },
      stats: shown.map(d => {
        const { defaultLabel, defaultDescription, ...rest } = d;
        const out = { ...rest, ...values[d.key], window: "all" };
        if (viewer !== "owner") delete out.visibility; // readers needn't know who else can see it
        return out;
      }),
    };
  }

  #changed(entrantId) {
    this.feed.publish(`entrant:${entrantId}`, "stats.updated", { entrantId });
  }
}
