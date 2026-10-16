// The stats monitor (Stats Hub phase 2): HardSmoke's view of every entrant × every stat, with health
// alerts. Admins only, and never a leaderboard.
//
// Owners' privacy still wins here: a value is shown only when its owner made it Public or Members only
// (what any signed-in member could see on the card anyway). For hidden and private stats the monitor
// shows the activity (when it was updated, how often, how it arrived, any errors), never the value.
//
// Alerts (thresholds are settings, arena_monitor/settings):
//   quiet     a bot or script with no stats and no calls for quietHours (or ever)
//   stale     a stat its owner made visible that hasn't been updated for staleDays (or ever)
//   rejected  pushes the server refused in the last rejectHours. Only the error code, the field and a
//             valid-looking key name are kept, never what was sent: it might have been a secret.
//   kalshi    rounds Kalshi still hasn't settled (the same list /metrics shows)
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { STAT_KEY } from "./catalog.js";

const SETTINGS = "arena_monitor/settings";
const REJECTS = "arena_rejects";
const KEEP_REJECTS = 50;
const HOUR = 3600000;
export const DEFAULTS = { quietHours: 24, staleDays: 7, rejectHours: 24 };
const SETTING_FIELDS = {
  quietHours: { type: "integer", min: 1, max: 720 },
  staleDays: { type: "integer", min: 1, max: 365 },
  rejectHours: { type: "integer", min: 1, max: 168 },
};
const SHOWN = new Set(["public", "members"]); // what a member may see; the monitor shows no more
const THROTTLE_MS = 2000;
const iso = ms => (ms ? new Date(ms).toISOString() : null);

export class Monitor {
  constructor({ store, registry, stats, catalog, calls, ledger, kalshi, feed, userName }) {
    Object.assign(this, { store, registry, stats, catalog, calls, kalshi, feed, userName });
    this.timer = null;
    // A new value or call changes the monitor: tell open monitor pages, at most every 2 seconds.
    ledger.on("append", lines => { if (lines.some(l => l.t === "stat" || l.t === "call" || l.t === "score")) this.#changed(); });
  }

  #admin(ctx) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only HardSmoke can see the stats monitor.");
  }

  settings() {
    const { updatedAt, ...saved } = this.store.get(SETTINGS).data || {};
    return { ...DEFAULTS, ...saved };
  }

  updateSettings(ctx, body) {
    this.#admin(ctx);
    const f = check(body, SETTING_FIELDS);
    if (!Object.keys(f).length) throw new ApiError(400, "invalid_argument", "Send quietHours, staleDays or rejectHours.");
    const { updatedAt, ...cur } = this.store.get(SETTINGS).data || {};
    this.store.set(SETTINGS, { ...cur, ...f, updatedAt: Date.now() }, ctx.uid);
    this.#changed();
    return this.settings();
  }

  // Called when the server refuses a push from a bot (key) or an owner (typed in on /my).
  reject(entrantId, kind, via, err, body) {
    if (!entrantId || !err || typeof err.status !== "number" || !err.code || err.status === 429 || err.status >= 500) return;
    let key = null;
    const m = /^values\[(\d+)\]/.exec(err.field || "");
    const sent = m && body && Array.isArray(body.values) ? body.values[+m[1]] : null;
    if (sent && typeof sent.key === "string" && STAT_KEY.test(sent.key)) key = sent.key;
    const doc = this.store.get(`${REJECTS}/${entrantId}`).data || { entrantId, list: [] };
    const list = [...doc.list, { at: Date.now(), kind, via, code: err.code, field: err.field || null, ...(key ? { key } : {}) }].slice(-KEEP_REJECTS);
    this.store.set(`${REJECTS}/${entrantId}`, { entrantId, list }, null);
    this.#changed();
  }

  #rejects(entrantId) {
    return (this.store.get(`${REJECTS}/${entrantId}`).data || { list: [] }).list;
  }

  #lastCall(entrantId) {
    const list = this.calls.byEntrant.get(entrantId) || [];
    return list.length ? list[list.length - 1].at : null;
  }

  // One stat of one entrant, as HardSmoke may see it.
  #cell(entrantId, d, value) {
    const shown = SHOWN.has(d.visibility);
    const out = { visibility: d.visibility, shown };
    if (d.source === "verified") {
      Object.assign(out, { verification: value.verification, hasValue: value.value !== null });
      if (shown) Object.assign(out, { value: value.value, ...(value.n !== undefined ? { n: value.n } : {}), ...(value.counts ? { counts: value.counts } : {}) });
      return out;
    }
    const h = this.stats.historyOf(entrantId, d.key), last = h[h.length - 1];
    Object.assign(out, { verification: "self-reported", hasValue: !!last, updates: h.length, asOf: iso(last?.asOf), receivedAt: iso(last?.at), via: last ? last.via || "bot-key" : null });
    if (shown && last) out.value = last.value;
    return out;
  }

  // GET /monitor: every entrant (suspended ones too) with every stat, and the alerts.
  view(ctx, now = Date.now()) {
    this.#admin(ctx);
    const cfg = this.settings();
    const columns = new Map();
    const entrants = this.registry.allEntrants().sort((a, b) => a.name.localeCompare(b.name)).map(e => {
      const defs = this.stats.defsFor(e), values = this.stats.valuesFor(e, defs);
      const cells = {}, custom = [];
      for (const d of defs) {
        if (d.source === "custom") { custom.push({ key: d.key, label: d.label, type: d.type, ...this.#cell(e.id, d, values[d.key]) }); continue; }
        if (!columns.has(d.key)) {
          const def = d.source === "verified" ? d : this.catalog.get(d.key) || d;
          columns.set(d.key, { key: d.key, label: def.defaultLabel || def.label, category: d.category, source: d.source, type: d.type, format: d.format, order: def.order ?? d.order });
        }
        cells[d.key] = this.#cell(e.id, d, values[d.key]);
      }
      const selfReported = [...Object.values(cells), ...custom].filter(c => c.verification === "self-reported");
      const lastStatAt = Math.max(0, ...selfReported.map(c => (c.receivedAt ? Date.parse(c.receivedAt) : 0))) || null;
      const lastCallAt = this.#lastCall(e.id);
      const lastActivity = Math.max(lastStatAt || 0, lastCallAt || 0) || null;

      const alerts = [];
      if (e.kind !== "caller" && e.status === "active" && (!lastActivity || now - lastActivity > cfg.quietHours * HOUR))
        alerts.push({ type: "quiet", detail: lastActivity ? `nothing for ${Math.floor((now - lastActivity) / HOUR)} h` : "never sent a stat or a call" });
      const stale = [];
      for (const [key, c] of [...Object.entries(cells), ...custom.map(c => [c.key, c])]) {
        if (c.verification !== "self-reported" || c.visibility === "hidden") continue;
        if (!c.receivedAt) stale.push({ key, never: true });
        else if (now - Date.parse(c.receivedAt) > cfg.staleDays * 24 * HOUR) stale.push({ key, since: c.receivedAt });
      }
      if (stale.length) alerts.push({ type: "stale", detail: `${stale.length} visible stat${stale.length === 1 ? "" : "s"} not updated in ${cfg.staleDays} days`, stats: stale });
      const rejects = this.#rejects(e.id).filter(r => now - r.at <= cfg.rejectHours * HOUR).map(r => ({ ...r, at: iso(r.at) }));
      if (rejects.length) alerts.push({ type: "rejected", detail: `${rejects.length} refused in ${cfg.rejectHours} h`, rejects });
      return {
        id: e.id, slug: e.slug, name: e.name, kind: e.kind, status: e.status, owner: this.userName(e.ownerId),
        lastCallAt: iso(lastCallAt), lastStatAt: iso(lastStatAt), lastActivity: iso(lastActivity), calls: (this.calls.byEntrant.get(e.id) || []).length,
        alerts, cells, custom,
      };
    });
    const missing = this.kalshi ? this.kalshi.missing(now) : [];
    const global = missing.length ? [{ type: "kalshi", detail: `${missing.length} round${missing.length === 1 ? "" : "s"} not settled by Kalshi`, rounds: missing.map(iso) }] : [];
    const count = t => entrants.filter(e => e.alerts.some(a => a.type === t)).length;
    return {
      schema: "d3mon.monitor/v1", generatedAt: iso(now), settings: cfg,
      columns: [...columns.values()].sort((a, b) => (a.source === b.source ? a.order - b.order : a.source === "verified" ? -1 : 1)),
      summary: { entrants: entrants.length, quiet: count("quiet"), stale: count("stale"), rejected: count("rejected"), kalshi: missing.length },
      alerts: global, entrants,
    };
  }

  // GET /monitor/entrants/:id/stats/:key: one stat's full history. Values only where the owner shows them.
  history(ctx, entrantId, key) {
    this.#admin(ctx);
    const e = this.registry.entrantById(entrantId);
    if (!e) throw new ApiError(404, "not_found", "No such entrant.");
    const d = this.stats.defsFor(e).find(x => x.key === key);
    const lines = this.stats.historyOf(e.id, key);
    if (!d && !lines.length) throw new ApiError(404, "not_found", "No such stat for this entrant.");
    const visibility = d ? d.visibility : "hidden", shown = SHOWN.has(visibility);
    if (d && d.source === "verified") return { entrantId: e.id, key, label: d.label, source: "verified", visibility, shown, note: "Verified stats are worked out from calls and results, so they have no history of their own.", history: [] };
    return {
      entrantId: e.id, key, label: d ? d.label : key, source: d ? d.source : "retired", visibility, shown,
      history: lines.slice().reverse().map(l => ({ asOf: iso(l.asOf), receivedAt: iso(l.at), via: l.via || "bot-key", ...(shown ? { value: l.value } : {}) })),
    };
  }

  #changed() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.feed.publish("admin:monitor", "monitor.updated", {}, ctx => isAdmin(ctx));
    }, THROTTLE_MS);
    this.timer.unref?.();
  }

  stop() { clearTimeout(this.timer); }
}
