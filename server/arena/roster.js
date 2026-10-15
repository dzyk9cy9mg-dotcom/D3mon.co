// Shows one battle's lineup on the current main page (step 4c). The page (public/js/d3mon.js) reads its
// Battle of the Bots roster from config/battleRoster: { bots: [{ name, url? }], callers: [...] }.
// HardSmoke picks which battle feeds it (the battle's onMainPage switch, one battle at a time), and
// from then on every lineup change is copied there, so the current page stays in step until the 3D
// site replaces it. Stream links already on the roster are kept for names that stay.
//
// Every write is recorded in the ledger ({ t: "roster", battleId, bots, callers, previous }), so an
// overwritten roster can always be recovered.
import { slugify } from "./validate.js";

export const ROSTER_PATH = "config/battleRoster";

export class Roster {
  constructor({ store, registry, ledger }) {
    Object.assign(this, { store, registry, ledger });
  }

  // The battle shown on the main page, if any (drafts never are).
  current() {
    return this.registry.allBattles().find(b => b.onMainPage && b.status !== "draft") || null;
  }

  // Copies the current battle's lineup to the main page. Writes only when something changed.
  sync(by = null) {
    const b = this.current();
    if (!b) return false;
    const prev = this.store.get(ROSTER_PATH).data || {};
    const urls = new Map([...(prev.bots || []), ...(prev.callers || [])].filter(x => x && x.name && x.url).map(x => [slugify(x.name), x.url]));
    const entry = e => (urls.has(e.slug) ? { name: e.name, url: urls.get(e.slug) } : { name: e.name });
    const lineup = (b.entrants || []).map(id => this.registry.entrantById(id)).filter(Boolean);
    const bots = lineup.filter(e => e.kind !== "caller").map(entry);
    const callers = lineup.filter(e => e.kind === "caller").map(entry);
    const same = (x, y) => JSON.stringify(x || []) === JSON.stringify(y || []);
    if (same(prev.bots, bots) && same(prev.callers, callers)) return false;
    this.store.set(ROSTER_PATH, { ...prev, bots, callers, t: Date.now(), arenaBattleId: b.id }, by);
    this.ledger.append([{ t: "roster", battleId: b.id, bots, callers, previous: { bots: prev.bots || [], callers: prev.callers || [] } }], by);
    return true;
  }
}
