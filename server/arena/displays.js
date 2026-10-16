// Display slots (Stats Hub phase 3): named places where stats are shown, such as "home featured bot",
// "battle sidebar" or "bot profile". HardSmoke sets each one up on /displays (which bots, which stats,
// a layout and an order), and any page shows one by name with the widget (js/d3mon-widget.js) or
// GET /api/v1/displays/:key, so pages, and later the 3D site, never decide what to show themselves.
//
//   arena_displays/<key>  { key, name, title, status: "on"|"off", layout: "card"|"row"|"ticker"|"chart",
//                           bots: { mode, entrants?, battle? }, stats: [keys], order: "listed"|"name", limit }
//
// Bots, by mode:
//   specific  one entrant;          list  several, in the order given;
//   battle    a battle's lineup: a battle id, "current" (the battle on the main page, else a live one),
//             or "page" (the page says which, e.g. /board's selected battle);
//   page      the entrant the page names (e.g. a bot's profile page).
// Order is "listed" or "name", never by a stat's value: sorting bots by a number is a leaderboard.
//
// Privacy is the cards' own: each entrant's stats come from Stats.card() for this reader, so only stats
// its owner shows to this reader appear, and entrants that aren't active are left out.
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { VERIFIED } from "./verified.js";

const DISPLAYS = "arena_displays";
const KEY = /^[a-z][a-z0-9-]{1,39}$/;
export const LAYOUTS = ["card", "row", "ticker", "chart"];
export const MODES = ["specific", "list", "battle", "page"];
const MAX_ENTRANTS = 18; // a widget follows each entrant's feed topic, plus the slot's and the stat list's (20 at most)
const MAX_STATS = 12;

const FIELDS = {
  name: { type: "string", max: 60 },
  title: { type: "string", max: 80 },
  status: { type: "enum", values: ["on", "off"] },
  layout: { type: "enum", values: LAYOUTS },
  bots: { type: "object", fields: {
    mode: { type: "enum", values: MODES, required: true },
    entrants: { type: "array", max: MAX_ENTRANTS, unique: true, of: { type: "string", max: 40 } },
    battle: { type: "string", max: 40 },
  } },
  stats: { type: "array", max: MAX_STATS, unique: true, of: { type: "string", max: 32 } },
  order: { type: "enum", values: ["listed", "name"] },
  limit: { type: "integer", min: 1, max: MAX_ENTRANTS },
};

// The example on /board: the selected battle's lineup, with verified stats first.
export const SEED = [{
  key: "battle-sidebar", name: "Battle sidebar", title: "Lineup stats", status: "on", layout: "row",
  bots: { mode: "battle", battle: "page" }, stats: ["v_win_rate", "v_record", "v_form", "v_current_streak", "win_rate"], order: "listed", limit: 12,
}];

export class Displays {
  constructor({ store, registry, stats, catalog, feed }) {
    Object.assign(this, { store, registry, stats, catalog, feed });
  }

  seed() {
    for (const d of SEED) if (!this.store.get(`${DISPLAYS}/${d.key}`).exists) this.store.set(`${DISPLAYS}/${d.key}`, { ...d, createdAt: Date.now(), updatedAt: Date.now() }, null);
  }

  #admin(ctx) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only HardSmoke can set up display slots.");
  }
  #get(key) { return KEY.test(key) ? this.store.get(`${DISPLAYS}/${key}`).data || null : null; }

  // The stats a slot may name: everything in the stat list (retired ones too, so a slot doesn't break)
  // and the verified stats.
  #statMeta(key) {
    const v = VERIFIED.find(x => x.key === key);
    if (v) return { key, label: v.label, type: v.type, format: v.format, unit: v.unit, category: v.category, source: "verified" };
    const c = this.store.get(`arena_statcatalog/${key}`).data;
    return c ? { key, label: c.label, type: c.type, format: c.format, unit: c.unit, category: c.category, source: "catalog" } : null;
  }

  // ---------- HardSmoke's setup ----------
  list(ctx) {
    this.#admin(ctx);
    return {
      layouts: LAYOUTS, modes: MODES,
      stats: [...VERIFIED.map(v => this.#statMeta(v.key)), ...this.catalog.all().filter(s => !s.retired).map(s => this.#statMeta(s.key))],
      slots: this.store.query({ collection: DISPLAYS }).map(r => r.data).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // PUT /display-slots/:key: creates or changes a slot; only what's sent changes.
  save(ctx, key, body) {
    this.#admin(ctx);
    if (!KEY.test(key)) throw new ApiError(400, "invalid_argument", "A slot's key is 2 to 40 lowercase letters, digits or -, starting with a letter, like \"home-featured\".", "key");
    const f = check(body, FIELDS, { partial: true });
    const prev = this.#get(key);
    const s = { ...(prev || { key, status: "on", layout: "card", order: "listed", limit: 6, stats: [], createdAt: Date.now() }), ...f };
    if (!s.name) throw new ApiError(400, "invalid_argument", "\"name\" is required for a new slot.", "name");
    if (!s.bots) throw new ApiError(400, "invalid_argument", "\"bots\" is required for a new slot: say which bots it shows.", "bots");
    const b = s.bots;
    if (b.mode === "specific" || b.mode === "list") {
      const ids = b.entrants || [];
      if (!ids.length || (b.mode === "specific" && ids.length !== 1)) throw new ApiError(400, "invalid_argument", b.mode === "specific" ? "Pick one entrant." : "Pick at least one entrant.", "bots.entrants");
      ids.forEach((id, i) => { if (!this.registry.entrantById(id)) throw new ApiError(400, "invalid_argument", `No entrant "${id}".`, `bots.entrants[${i}]`); });
      s.bots = { mode: b.mode, entrants: ids };
    } else if (b.mode === "battle") {
      const which = b.battle || "current";
      if (which !== "current" && which !== "page" && !this.registry.allBattles().some(x => x.id === which)) throw new ApiError(400, "invalid_argument", `No battle "${which}".`, "bots.battle");
      s.bots = { mode: "battle", battle: which };
    } else s.bots = { mode: "page" };
    s.stats.forEach((k, i) => { if (!this.#statMeta(k)) throw new ApiError(400, "invalid_argument", `"${k}" isn't in the stat list or the verified stats.`, `stats[${i}]`); });
    if (!s.stats.length) throw new ApiError(400, "invalid_argument", "Pick at least one stat.", "stats");
    s.updatedAt = Date.now();
    this.store.set(`${DISPLAYS}/${key}`, s, ctx.uid);
    this.feed.publish(`display:${key}`, "display.updated", { key });
    return s;
  }

  // ---------- showing a slot ----------
  #battleFor(which, pageBattle) {
    const all = this.registry.allBattles().filter(b => b.status !== "draft");
    if (which === "page") return all.find(b => b.id === pageBattle) || null;
    if (which === "current") return all.find(b => b.onMainPage) || all.filter(b => b.status === "live").sort((a, b) => b.startsAt - a.startsAt)[0] || null;
    return all.find(b => b.id === which) || null;
  }

  // GET /displays/:key?e=<entrant slug>&battle=<id>: the slot as this reader may see it.
  render(ctx, key, { entrant = null, battle = null } = {}) {
    const s = this.#get(key);
    if (!s || (s.status !== "on" && !isAdmin(ctx))) throw new ApiError(404, "not_found", "No such display.");
    let ids = [], b = null, note = null;
    if (s.bots.mode === "specific" || s.bots.mode === "list") ids = s.bots.entrants;
    else if (s.bots.mode === "page") {
      const e = entrant ? this.registry.entrantById(entrant) || this.registry.entrantBySlug(entrant) : null;
      if (e) ids = [e.id]; else note = "This display shows the entrant the page names.";
    } else {
      b = this.#battleFor(s.bots.battle, battle);
      if (b) ids = b.entrants || []; else note = s.bots.battle === "page" ? "Pick a battle." : "No battle is on right now.";
    }
    let entrants = ids.map(id => this.registry.entrantById(id)).filter(e => e && e.status === "active");
    if (s.order === "name") entrants.sort((x, y) => x.name.localeCompare(y.name));
    entrants = entrants.slice(0, s.limit);
    const columns = s.stats.map(k => this.#statMeta(k)).filter(Boolean);
    const want = new Set(s.stats);
    return {
      schema: "d3mon.display/v1", generatedAt: new Date().toISOString(),
      slot: { key: s.key, name: s.name, title: s.title || "", layout: s.layout, status: s.status },
      ...(b ? { battle: { id: b.id, title: b.title, status: b.status } } : {}),
      ...(note ? { note } : {}),
      columns,
      entrants: entrants.map(e => {
        const card = this.stats.card(ctx, e.id);
        const values = {};
        for (const st of card.stats) if (want.has(st.key)) {
          const { key: k, visibility, defaultLabel, defaultDescription, ...rest } = st;
          values[k] = rest;
        }
        return { id: e.id, slug: e.slug, name: e.name, kind: e.kind, creatorName: e.creatorName, values };
      }),
    };
  }
}

