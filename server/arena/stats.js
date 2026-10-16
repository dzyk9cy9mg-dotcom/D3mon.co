// Stat cards (Stats Hub). A card can carry two kinds of stat:
//   - verified stats (verified.js, keys "v_…"): worked out by the server from the entrant's own
//     server-stamped calls and the round results. Every entrant has them; they're a caller's whole card.
//   - self-reported stats: sent by a bot or script's owner, with the bot's key (POST /api/v1/bot/stats)
//     or typed in on /my (POST /api/v1/entrants/:id/stats). D3MON.CO doesn't check them.
// Battles keep their own server scoring (calls, results and the board), whatever these settings say.
//
// A bot or script can report two kinds of stat:
//   - the standard ones in HardSmoke's stat list (catalog.js, editable on /catalog), the same for every bot;
//   - up to 20 custom extras its owner defines (key, label, type, unit, format, description).
// Each value sent is kept in the ledger ({ t: "stat", entrantId, key, value, asOf }); the latest one is shown.
//
// Each owner decides, stat by stat, who may see them: every stat starts hidden, and the owner picks
// Public, Members only or Private, with their own label, order and description. The server leaves out
// what a reader may not see before building the card, and hiding a stat never deletes any history.
//
//   arena_statsettings/<entrantId>  { verified: { <v_key>: { visibility, label?, description?, order? } },
//                                     catalog: { <key>: { visibility, label?, description?, order? } },
//                                     custom: { <key>: { type, label, unit?, format?, description?, visibility?, order?, removed? } } }
// (An older `stats` field holds settings for the site-computed stats this replaced. It's kept, unused,
// so those choices can't leak onto the new self-reported stats.)
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { TYPES, FORMATS, STAT_KEY, STAT_KEY_HINT, RESERVED_PREFIX, checkValue, defaultFormat } from "./catalog.js";
import { VERIFIED } from "./verified.js";

const VERIFIED_BY_KEY = new Map(VERIFIED.map(v => [v.key, v]));

export const SETTINGS = "arena_statsettings";
export const VISIBILITY = ["hidden", "private", "members", "public"];
export const CUSTOM_TYPES = Object.keys(TYPES);
const MAX_CUSTOM = 20;
const CUSTOM_CATEGORY = "Custom";
const CUSTOM_FIELDS = {
  type: { type: "enum", values: CUSTOM_TYPES },
  label: { type: "string", max: 40 },
  unit: { type: "string", max: 12 },
  format: { type: "enum", values: Object.keys(FORMATS) },
  description: { type: "string", max: 160 },
  visibility: { type: "enum", values: VISIBILITY },
  order: { type: "integer", min: 0, max: 9999 },
  remove: { type: "boolean" },
};
const BOT_STATS = {
  schema: { type: "enum", values: ["d3mon.stats/v1"], required: true },
  asOf: { type: "string", max: 40 },
  values: { type: "array", required: true, min: 1, max: 50, of: { type: "object", fields: { key: { type: "string", required: true, max: 32 }, value: { type: "any", required: true } } } },
};
const SETTING_FIELDS = {
  visibility: { type: "enum", values: VISIBILITY },
  label: { type: "string", max: 40 },
  description: { type: "string", max: 160 },
  order: { type: "integer", min: 0, max: 9999 },
};
const iso = ms => new Date(ms).toISOString();

export class Stats {
  constructor({ store, registry, catalog, verified, calls, ledger, feed }) {
    Object.assign(this, { store, registry, catalog, verified, calls, feed, ledger });
    // The latest self-reported value of each stat: entrantId -> Map(key -> ledger line).
    this.latest = new Map();
    this.history = new Map(); // entrantId -> Map(key -> every ledger line, oldest first), for the monitor
    this.keysWithValues = new Set();
    const index = lines => {
      for (const l of lines) {
        if (l.t !== "stat") continue;
        if (!this.latest.has(l.entrantId)) { this.latest.set(l.entrantId, new Map()); this.history.set(l.entrantId, new Map()); }
        this.latest.get(l.entrantId).set(l.key, l);
        const h = this.history.get(l.entrantId);
        if (!h.has(l.key)) h.set(l.key, []);
        h.get(l.key).push(l);
        this.keysWithValues.add(l.key);
      }
    };
    index(ledger.lines);
    ledger.on("append", lines => {
      index(lines);
      // A value, a call or a result changes someone's card: a result, everyone who called that round.
      const touched = new Set();
      for (const l of lines) {
        if (l.t === "stat" || l.t === "call") touched.add(l.entrantId);
        if (l.t === "score") for (const c of calls.byRound.get(`${l.market}|${l.round}`) || []) touched.add(c.entrantId);
      }
      for (const id of touched) this.#changed(id);
    });
  }

  hasValues(key) { return this.keysWithValues.has(key); }

  // For the admin monitor (monitor.js), which applies the owner's visibility itself.
  defsFor(e) { return this.#defs(e); }
  valuesFor(e, defs) { return this.#values(e.id, defs); }
  historyOf(entrantId, key) { return this.history.get(entrantId)?.get(key) || []; }

  // ---------- settings ----------
  #doc(entrantId) {
    const d = this.store.get(`${SETTINGS}/${entrantId}`).data || {};
    return { data: d, verified: d.verified || {}, catalog: d.catalog || {}, custom: d.custom || {} };
  }

  // Each stat this entrant can show, list and custom, with its defaults and the owner's choices merged in.
  // An owner's own custom stat wins over a list stat with the same key (it was theirs first, so the
  // list stat added later doesn't apply to this entrant).
  // Callers have verified stats only: they have no bot key, and their results speak for themselves.
  #defs(e) {
    const entrantId = e.id;
    const { verified: ownV, catalog: own, custom } = this.#doc(entrantId);
    const server = VERIFIED.map(v => {
      const o = ownV[v.key] || {};
      return { key: v.key, type: v.type, unit: v.unit, format: v.format, category: v.category, source: "verified",
        visibility: o.visibility || "hidden", label: o.label || v.label, description: o.description ?? v.description, order: o.order ?? v.order,
        defaultLabel: v.label, defaultDescription: v.description };
    });
    if (e.kind === "caller") return server;
    const mine = Object.entries(custom).filter(([, c]) => !c.removed).map(([key, c]) => ({
      key, type: c.type, unit: c.unit || "", format: c.format || defaultFormat(c.type), category: CUSTOM_CATEGORY, source: "custom",
      visibility: c.visibility || "hidden", label: c.label, description: c.description || "", order: c.order ?? 10000,
      defaultLabel: c.label, defaultDescription: c.description || "",
    }));
    const taken = new Set(Object.keys(custom)); // removed ones too: the key stays theirs, with its history
    const list = this.catalog.all().filter(s => !s.retired && !taken.has(s.key)).map(s => {
      const o = own[s.key] || {};
      return { key: s.key, type: s.type, unit: s.unit, format: s.format, category: s.category, source: "catalog",
        visibility: o.visibility || "hidden", label: o.label || s.label, description: o.description ?? s.description, order: o.order ?? s.order,
        defaultLabel: s.label, defaultDescription: s.description };
    });
    return [...server, ...list, ...mine];
  }

  // Each stat's value. Self-reported ones are the latest sent; verified ones are worked out now.
  #values(entrantId, defs) {
    const computed = defs.some(d => d.source === "verified") ? this.verified.compute(entrantId) : {};
    return Object.fromEntries(defs.map(d => {
      if (d.source === "verified") return [d.key, computed[d.key]];
      const l = this.latest.get(entrantId)?.get(d.key);
      return [d.key, { value: l ? l.value : null, asOf: l ? iso(l.asOf) : null, verification: "self-reported", via: l ? (l.via || "bot-key") : null }];
    }));
  }

  #owned(ctx, entrantId) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    const e = this.registry.entrantById(entrantId);
    if (!e || e.ownerId !== ctx.uid) throw new ApiError(404, "not_found", "That isn't one of your entrants.");
    return e;
  }

  // The owner's view: every stat, hidden ones included, with its latest value and settings.
  settings(ctx, entrantId) {
    const e = this.#owned(ctx, entrantId);
    const removed = Object.entries(this.#doc(e.id).custom).filter(([, c]) => c.removed).map(([key, c]) => ({ key, label: c.label, type: c.type }));
    const defs = this.#defs(e), values = this.#values(e.id, defs);
    return { entrantId: e.id, slug: e.slug, kind: e.kind, visibility: VISIBILITY, customTypes: CUSTOM_TYPES, types: Object.fromEntries(Object.entries(TYPES).map(([t, x]) => [t, x.formats])),
      maxCustom: e.kind === "caller" ? 0 : MAX_CUSTOM, removedCustom: removed,
      stats: defs.map(d => ({ ...d, ...values[d.key] })).sort((a, b) => a.order - b.order) };
  }

  // { stats: { <verified or list key>: { visibility?, label?, description?, order? } },
  //   custom: { <key>: { type?, label?, unit?, format?, description?, visibility?, order?, remove? } } }
  // Only what's sent changes. An empty label or description goes back to the default.
  // A new custom stat needs a type and a label; its type can't change once values have been sent;
  // `remove: true` takes it off the card and stops the bot sending it, but keeps its history, and
  // defining the same key again brings it back. Callers have verified stats only.
  updateSettings(ctx, entrantId, body) {
    const e = this.#owned(ctx, entrantId);
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const f = check(body, {
      stats: { type: "map", keyPattern: STAT_KEY, keyHint: STAT_KEY_HINT, max: 200, of: { type: "object", fields: SETTING_FIELDS } },
      custom: { type: "map", keyPattern: STAT_KEY, keyHint: `Custom stat keys: ${STAT_KEY_HINT.toLowerCase()}`, max: 50, of: { type: "object", fields: CUSTOM_FIELDS } },
    });
    if (!f.stats && !f.custom) throw new ApiError(400, "invalid_argument", "Send \"stats\", \"custom\" or both.");
    if (f.custom && e.kind === "caller") throw new ApiError(409, "callers_verified_only", "A caller's card shows verified stats from their calls, so there are no custom stats.", "custom");
    const doc = this.#doc(e.id), ownV = { ...doc.verified }, own = { ...doc.catalog }, custom = { ...doc.custom };
    for (const [key, change] of Object.entries(f.stats || {})) {
      const isVerified = VERIFIED_BY_KEY.has(key);
      if (!isVerified && (e.kind === "caller" || !this.catalog.get(key) || custom[key]))
        throw new ApiError(400, "invalid_argument", `"${key}" isn't one of this entrant's stats. Custom stats go under "custom".`, `stats.${key}`);
      const into = isVerified ? ownV : own;
      const merged = { ...(into[key] || {}), ...change };
      for (const k of ["label", "description"]) if (merged[k] === "") delete merged[k];
      into[key] = merged;
    }
    for (const [key, change] of Object.entries(f.custom || {})) {
      const at = `custom.${key}`, prev = custom[key];
      if (!prev && key.startsWith(RESERVED_PREFIX)) throw new ApiError(400, "invalid_argument", `Keys starting "${RESERVED_PREFIX}" are for verified stats. Pick another name.`, at);
      if (this.catalog.has(key) && !prev) throw new ApiError(400, "invalid_argument", `"${key}" is in the stat list already. Send it as a standard stat, or pick another name.`, at);
      if (change.remove) {
        if (prev) custom[key] = { ...prev, removed: true };
        continue;
      }
      const { remove, ...rest } = change;
      const merged = { ...(prev || {}), ...rest, removed: false };
      for (const k of ["unit", "description"]) if (merged[k] === "") delete merged[k];
      if (!merged.type) throw new ApiError(400, "invalid_argument", `"${at}.type" is required for a new stat.`, `${at}.type`);
      if (!merged.label) throw new ApiError(400, "invalid_argument", `"${at}.label" is required.`, `${at}.label`);
      if (prev && prev.type !== merged.type && this.latest.get(e.id)?.has(key))
        throw new ApiError(409, "type_locked", `"${key}" already has ${prev.type} values, so its type can't change. Make a new stat instead.`, `${at}.type`);
      if (merged.format && !TYPES[merged.type].formats.includes(merged.format)) {
        if (rest.format) throw new ApiError(400, "invalid_argument", `"${at}.format" for a ${merged.type} stat is one of: ${TYPES[merged.type].formats.join(", ")}.`, `${at}.format`);
        delete merged.format; // the type changed: back to its default format
      }
      custom[key] = merged;
    }
    if (Object.values(custom).filter(c => !c.removed).length > MAX_CUSTOM)
      throw new ApiError(409, "too_many_stats", `Up to ${MAX_CUSTOM} custom stats. Remove one first.`, "custom");
    this.store.set(`${SETTINGS}/${e.id}`, { ...doc.data, entrantId: e.id, verified: ownV, catalog: own, custom, updatedAt: Date.now() }, ctx.uid);
    this.#changed(e.id);
    return this.settings(ctx, e.id);
  }

  // ---------- self-reported values ----------
  // From the bot: POST /api/v1/bot/stats with its key (auth = { key, entrant }).
  // From the owner, typed in on /my: POST /api/v1/entrants/:id/stats (chart scripts often can't send a key).
  // Both take d3mon.stats/v1: any active stat in the list, or one of the owner's custom stats.
  // beforeWrite() runs only when something will be written (the rate limit).
  fromBot(auth, body, beforeWrite = () => {}) {
    return this.#accept(auth.entrant, body, auth.key.ownerId, "bot-key", beforeWrite);
  }

  fromOwner(ctx, entrantId, body, beforeWrite = () => {}) {
    const e = this.#owned(ctx, entrantId);
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    if (e.kind === "caller") throw new ApiError(409, "callers_verified_only", "A caller's stats come from their calls, so they can't be typed in.");
    if (e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended.`);
    return this.#accept(e, body, ctx.uid, "owner", beforeWrite);
  }

  #accept(entrant, body, uid, via, beforeWrite) {
    const f = check(body, BOT_STATS);
    const now = Date.now();
    let asOf = now;
    if (f.asOf) {
      asOf = Date.parse(f.asOf);
      if (!Number.isFinite(asOf)) throw new ApiError(400, "invalid_argument", `"asOf" is a time like "${iso(now)}".`, "asOf");
      if (asOf > now + 5 * 60000 || asOf < now - 30 * 86400000) throw new ApiError(400, "invalid_argument", `"asOf" must be within the last 30 days.`, "asOf");
    }
    const custom = this.#doc(entrant.id).custom, latest = this.latest.get(entrant.id) || new Map();
    const seen = new Set(), lines = [], accepted = [], unchanged = [];
    f.values.forEach(({ key, value }, i) => {
      const at = `values[${i}]`, own = custom[key] && !custom[key].removed ? custom[key] : null;
      const def = own || (custom[key] ? null : this.catalog.get(key));
      if (seen.has(key)) throw new ApiError(400, "invalid_argument", `${at} repeats "${key}".`, `${at}.key`);
      seen.add(key);
      if (!def) throw new ApiError(400, "not_defined", `"${key}" isn't in the stat list or this entrant's custom stats. See GET /api/v1/stat-catalog, or define it on /my first.`, `${at}.key`);
      const v = checkValue(def.type, value, `${at}.value`);
      const prev = latest.get(key);
      if (prev && JSON.stringify(prev.value) === JSON.stringify(v)) { unchanged.push(key); return; }
      lines.push({ t: "stat", entrantId: entrant.id, key, value: v, asOf, via });
      accepted.push(key);
    });
    if (lines.length) {
      beforeWrite();
      this.ledger.append(lines, uid);
    }
    return { ok: true, accepted, unchanged, asOf: iso(asOf) };
  }

  // ---------- the card ----------
  // Who is reading decides what's in it: guests see public stats, members also members-only ones, and
  // the owner also private ones. Hidden stats appear on no card, and nor do stats with no value yet.
  // Admins read like members.
  card(ctx, idOrSlug) {
    const e = this.registry.entrantById(idOrSlug) || this.registry.entrantBySlug(idOrSlug);
    if (!e || (e.status !== "active" && !isAdmin(ctx) && e.ownerId !== ctx.uid)) throw new ApiError(404, "not_found", "No such entrant.");
    const viewer = ctx.uid && ctx.uid === e.ownerId ? "owner" : ctx.uid ? "member" : "guest";
    const allowed = new Set(viewer === "owner" ? ["public", "members", "private"] : viewer === "member" ? ["public", "members"] : ["public"]);
    const shown = this.#defs(e).filter(d => allowed.has(d.visibility)).sort((a, b) => a.order - b.order);
    const values = shown.length ? this.#values(e.id, shown) : {};
    const stats = shown.filter(d => values[d.key].value !== null).map(d => {
      const { defaultLabel, defaultDescription, ...rest } = d;
      const out = { ...rest, ...values[d.key] };
      if (viewer !== "owner") delete out.visibility; // readers needn't know who else can see it
      return out;
    });
    return {
      schema: "d3mon.statcard/v2", generatedAt: new Date().toISOString(), viewer,
      entrant: { id: e.id, slug: e.slug, name: e.name, kind: e.kind, creatorName: e.creatorName },
      stats,
    };
  }

  #changed(entrantId) {
    this.feed.publish(`entrant:${entrantId}`, "stats.updated", { entrantId });
  }
}
