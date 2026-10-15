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
//
// Custom stats (step 4c): the owner defines up to 20 of their own (key, label, type, unit,
// description), and the bot sends their values with its key (POST /api/v1/bot/stats, d3mon.stats/v1).
// They're always labelled "self-reported", start hidden like every stat, and each value sent is kept in
// the ledger ({ t: "stat", entrantId, key, value, asOf }); the latest one is shown.
import { ApiError, check, cleanText } from "./validate.js";
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

export const CUSTOM_TYPES = ["number", "integer", "percent", "duration", "text", "series", "histogram"];
const CUSTOM_KEY = /^[a-z][a-z0-9_]{1,31}$/;
const MAX_CUSTOM = 20;
const CUSTOM_FIELDS = {
  type: { type: "enum", values: CUSTOM_TYPES },
  label: { type: "string", max: 40 },
  unit: { type: "string", max: 12 },
  description: { type: "string", max: 160 },
  visibility: { type: "enum", values: ["hidden", "private", "members", "public"] },
  order: { type: "integer", min: 0, max: 999 },
  remove: { type: "boolean" },
};
const BOT_STATS = {
  schema: { type: "enum", values: ["d3mon.stats/v1"], required: true },
  asOf: { type: "string", max: 40 },
  values: { type: "array", required: true, min: 1, max: 50, of: { type: "object", fields: { key: { type: "string", required: true, max: 32 }, value: { type: "any", required: true } } } },
};
const iso = ms => new Date(ms).toISOString();

const SETTING_FIELDS = {
  visibility: { type: "enum", values: VISIBILITY },
  label: { type: "string", max: 40 },
  description: { type: "string", max: 160 },
  order: { type: "integer", min: 0, max: 999 },
};

const rate = (w, n) => (n ? Math.round((w / n) * 10000) / 10000 : null);

export class Stats {
  constructor({ store, registry, calls, metrics, ledger, feed }) {
    Object.assign(this, { store, registry, calls, metrics, feed, ledger });
    // The latest self-reported value of each custom stat: entrantId -> Map(key -> ledger line).
    this.custom = new Map();
    const index = lines => {
      for (const l of lines) {
        if (l.t !== "stat") continue;
        if (!this.custom.has(l.entrantId)) this.custom.set(l.entrantId, new Map());
        this.custom.get(l.entrantId).set(l.key, l);
      }
    };
    index(ledger.lines);
    // A result changes the stats of everyone who called that round: tell their cards to refresh.
    ledger.on("append", lines => {
      index(lines);
      const touched = new Set();
      for (const l of lines) {
        if (l.t === "score") for (const c of calls.byRound.get(`${l.market}|${l.round}`) || []) touched.add(c.entrantId);
        if (l.t === "call" || l.t === "stat") touched.add(l.entrantId);
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
  #doc(entrantId) {
    const d = this.store.get(`${SETTINGS}/${entrantId}`).data || {};
    return { stats: d.stats || {}, custom: d.custom || {} };
  }

  // Each stat, standard and custom, with its default and the owner's choices merged in.
  #defs(entrantId) {
    const { stats: own, custom } = this.#doc(entrantId);
    const standard = STANDARD.map(s => {
      const d = BY_KEY.get(s.key), o = own[s.key] || {};
      return { key: s.key, type: d.type, unit: d.unit, source: "standard", visibility: o.visibility || "hidden",
        label: o.label || d.label, description: o.description ?? d.description, order: o.order ?? d.order,
        defaultLabel: d.label, defaultDescription: d.description };
    });
    const mine = Object.entries(custom).filter(([, c]) => !c.removed).map(([key, c]) => ({
      key, type: c.type, unit: c.unit || "", source: "custom", visibility: c.visibility || "hidden",
      label: c.label, description: c.description || "", order: c.order ?? 100, defaultLabel: c.label, defaultDescription: c.description || "",
    }));
    return [...standard, ...mine];
  }

  // A custom stat's latest value, always "self-reported".
  #customValue(entrantId, key) {
    const l = this.custom.get(entrantId)?.get(key);
    return { value: l ? l.value : null, asOf: l ? iso(l.asOf) : null, verification: "self-reported", sources: null };
  }

  #values(entrantId, defs) {
    const computed = defs.some(d => d.source === "standard") ? this.compute(entrantId) : {};
    return Object.fromEntries(defs.map(d => [d.key, d.source === "custom" ? this.#customValue(entrantId, d.key) : computed[d.key]]));
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
    const defs = this.#defs(e.id), values = this.#values(e.id, defs);
    const removed = Object.entries(this.#doc(e.id).custom).filter(([, c]) => c.removed).map(([key, c]) => ({ key, label: c.label, type: c.type }));
    return { entrantId: e.id, slug: e.slug, visibility: VISIBILITY, customTypes: CUSTOM_TYPES, maxCustom: MAX_CUSTOM, removedCustom: removed,
      stats: defs.map(d => ({ ...d, ...values[d.key] })).sort((a, b) => a.order - b.order) };
  }

  // { stats: { <standard key>: { visibility?, label?, description?, order? } },
  //   custom: { <key>: { type?, label?, unit?, description?, visibility?, order?, remove? } } }
  // Only what's sent changes. An empty standard label or description goes back to the default.
  // A new custom stat needs a type and a label; its type can't change once values have been sent;
  // `remove: true` takes it off the card and stops the bot sending it, but keeps its history, and
  // defining the same key again brings it back.
  updateSettings(ctx, entrantId, body) {
    const e = this.#owned(ctx, entrantId);
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const f = check(body, {
      stats: { type: "object", fields: Object.fromEntries(STANDARD.map(s => [s.key, { type: "object", fields: SETTING_FIELDS }])) },
      custom: { type: "map", keyPattern: CUSTOM_KEY, keyHint: "Custom stat keys are 2 to 32 lowercase letters, digits or _, starting with a letter.", max: 50, of: { type: "object", fields: CUSTOM_FIELDS } },
    });
    if (!f.stats && !f.custom) throw new ApiError(400, "invalid_argument", "Send \"stats\", \"custom\" or both.");
    const doc = this.#doc(e.id), stats = { ...doc.stats }, custom = { ...doc.custom };
    for (const [key, change] of Object.entries(f.stats || {})) {
      const merged = { ...(stats[key] || {}), ...change };
      for (const k of ["label", "description"]) if (merged[k] === "") delete merged[k];
      stats[key] = merged;
    }
    for (const [key, change] of Object.entries(f.custom || {})) {
      const at = `custom.${key}`, prev = custom[key];
      if (BY_KEY.has(key)) throw new ApiError(400, "invalid_argument", `"${key}" is a standard stat. Pick another name.`, at);
      if (change.remove) {
        if (prev) custom[key] = { ...prev, removed: true };
        continue;
      }
      const { remove, ...rest } = change;
      const merged = { ...(prev || {}), ...rest, removed: false };
      for (const k of ["unit", "description"]) if (merged[k] === "") delete merged[k];
      if (!merged.type) throw new ApiError(400, "invalid_argument", `"${at}.type" is required for a new stat.`, `${at}.type`);
      if (!merged.label) throw new ApiError(400, "invalid_argument", `"${at}.label" is required.`, `${at}.label`);
      if (prev && prev.type !== merged.type && this.custom.get(e.id)?.has(key))
        throw new ApiError(409, "type_locked", `"${key}" already has ${prev.type} values, so its type can't change. Make a new stat instead.`, `${at}.type`);
      custom[key] = merged;
    }
    if (Object.values(custom).filter(c => !c.removed).length > MAX_CUSTOM)
      throw new ApiError(409, "too_many_stats", `Up to ${MAX_CUSTOM} custom stats. Remove one first.`, "custom");
    this.store.set(`${SETTINGS}/${e.id}`, { entrantId: e.id, stats, custom, updatedAt: Date.now() }, ctx.uid);
    this.#changed(e.id);
    return this.settings(ctx, e.id);
  }

  // ---------- custom values from the bot ----------
  // POST /api/v1/bot/stats with the bot's key (auth = { key, entrant }).
  // beforeWrite() runs only when something will be written (the caller's rate limit).
  fromBot(auth, body, beforeWrite = () => {}) {
    const f = check(body, BOT_STATS);
    const now = Date.now();
    let asOf = now;
    if (f.asOf) {
      asOf = Date.parse(f.asOf);
      if (!Number.isFinite(asOf)) throw new ApiError(400, "invalid_argument", `"asOf" is a time like "${iso(now)}".`, "asOf");
      if (asOf > now + 5 * 60000 || asOf < now - 30 * 86400000) throw new ApiError(400, "invalid_argument", `"asOf" must be within the last 30 days.`, "asOf");
    }
    const defs = this.#doc(auth.entrant.id).custom, latest = this.custom.get(auth.entrant.id) || new Map();
    const seen = new Set(), lines = [], accepted = [], unchanged = [];
    f.values.forEach(({ key, value }, i) => {
      const at = `values[${i}]`, def = defs[key];
      if (seen.has(key)) throw new ApiError(400, "invalid_argument", `${at} repeats "${key}".`, `${at}.key`);
      seen.add(key);
      if (!def || def.removed) throw new ApiError(400, "not_defined", `"${key}" isn't one of this bot's stats. The owner defines custom stats on /my first.`, `${at}.key`);
      const v = checkCustom(def.type, value, `${at}.value`);
      const prev = latest.get(key);
      if (prev && JSON.stringify(prev.value) === JSON.stringify(v)) { unchanged.push(key); return; }
      lines.push({ t: "stat", entrantId: auth.entrant.id, key, value: v, asOf });
      accepted.push(key);
    });
    if (lines.length) {
      beforeWrite();
      this.ledger.append(lines, auth.key.ownerId);
    }
    return { ok: true, accepted, unchanged, asOf: iso(asOf) };
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
    const values = shown.length ? this.#values(e.id, shown) : {};
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

// Checks one self-reported value against its stat's declared type, and returns it cleaned.
function checkCustom(type, v, field) {
  const bad = what => new ApiError(400, "invalid_argument", `"${field}" must be ${what}.`, field);
  const finite = x => typeof x === "number" && Number.isFinite(x);
  const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
  switch (type) {
    case "number": if (!finite(v) || Math.abs(v) > 1e12) throw bad("a number"); return v;
    case "integer": if (!Number.isSafeInteger(v)) throw bad("a whole number"); return v;
    case "percent": if (!finite(v) || v < 0 || v > 1) throw bad("a fraction from 0 to 1 (0.61 means 61%)"); return v;
    case "duration": if (!Number.isSafeInteger(v) || v < 0 || v > 1e11) throw bad("milliseconds, a whole number 0 or more"); return v;
    case "text": {
      const t = typeof v === "string" ? cleanText(v) : "";
      if (!t || [...t].length > 80) throw bad("text, 1 to 80 characters");
      return t;
    }
    case "series": {
      if (!Array.isArray(v) || v.length > 500) throw bad("a list of up to 500 {\"t\", \"v\"} points");
      return v.map((p, i) => {
        const t = isObj(p) && typeof p.t === "string" ? cleanText(p.t) : "";
        if (!isObj(p) || Object.keys(p).some(k => k !== "t" && k !== "v") || !t || t.length > 32 || !finite(p.v)) throw bad(`a list of {"t": label, "v": number} points (point ${i} isn't)`);
        return { t, v: p.v };
      });
    }
    case "histogram": {
      if (!isObj(v) || Object.keys(v).length > 48) throw bad("an object of up to 48 named numbers");
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        const name = cleanText(k);
        if (!name || name.length > 24 || !finite(x)) throw bad(`an object of named numbers ("${k}" isn't)`);
        out[name] = x;
      }
      return out;
    }
    default: throw bad("a known type");
  }
}
