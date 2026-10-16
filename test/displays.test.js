// Stats Hub phase 3: display slots. HardSmoke names a slot and picks its bots, stats, layout and order;
// any page shows it by name through the widget or GET /api/v1/displays/:key. Every reader sees only what
// each owner shares with them, exactly as on the cards.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client, readEvents } from "./helpers.js";

const Q = 15 * 60000;
const nextQuarter = (k = 1) => Math.floor(Date.now() / Q) * Q + k * Q;

describe("display slots", () => {
  let srv, hs, odin, loki, thor, guest, battle, other, hammer, wolf, chartist, raven;
  const save = (key, body, c = hs) => c.req("PUT", `/api/v1/display-slots/${key}`, body);
  const show = (key, c = guest, q = "") => c.get(`/api/v1/displays/${key}${q}`);
  const names = r => r.json.entrants.map(e => e.name);
  const values = (r, name) => Object.keys(r.json.entrants.find(e => e.name === name)?.values || {}).sort();

  before(async () => {
    srv = await startServer();
    [hs, odin, loki, thor, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    await thor.register("thor", "thor-pass-12", "Thor");
    battle = (await hs.post("/api/v1/battles", { title: "Night one", startsAt: nextQuarter(-4), rounds: 8, status: "open", kinds: ["bot", "script", "caller"] })).json.battle;
    other = (await hs.post("/api/v1/battles", { title: "Night two", startsAt: nextQuarter(40), status: "open", kinds: ["bot"] })).json.battle;
    const enter = async (b, c, kind, name) => {
      const a = (await c.post(`/api/v1/battles/${b.id}/applications`, { kind, name, creatorName: name })).json.application;
      return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    };
    hammer = await enter(battle, odin, "bot", "Hammer");
    raven = await enter(battle, thor, "caller", "Raven");
    chartist = await enter(battle, loki, "script", "Chartist");
    wolf = await enter(other, odin, "bot", "ArbWolf");
    const token = (await odin.post(`/api/v1/entrants/${hammer}/keys`, {})).json.token;
    await fetch(`${srv.base}/api/v1/bot/stats`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ schema: "d3mon.stats/v1", values: [{ key: "win_rate", value: 0.62 }, { key: "total_profit", value: 184.25 }, { key: "roi", value: 0.2 }, { key: "strategy", value: "Momentum fade" }] }) });
    await odin.req("PUT", `/api/v1/entrants/${hammer}/stat-settings`, { stats: { win_rate: { visibility: "public" }, total_profit: { visibility: "members" }, roi: { visibility: "private" } } });
    await loki.post(`/api/v1/entrants/${chartist}/stats`, { schema: "d3mon.stats/v1", values: [{ key: "win_rate", value: 0.55 }] });
    await loki.req("PUT", `/api/v1/entrants/${chartist}/stat-settings`, { stats: { win_rate: { visibility: "public" } } });
    // Raven calls a past round, scored by Kalshi, and shows the verified record.
    const r0 = nextQuarter(-3);
    srv.app.arena.calls.now = () => r0 - 30000;
    await thor.post(`/api/v1/entrants/${raven}/call`, { direction: "up", round: new Date(r0).toISOString() });
    srv.app.arena.calls.now = () => Date.now();
    srv.app.arena.ledger.append([{ t: "score", market: "KXBTC15M", round: r0, result: "up", source: "kalshi" }], null);
    await thor.req("PUT", `/api/v1/entrants/${raven}/stat-settings`, { stats: { v_record: { visibility: "public" }, v_win_rate: { visibility: "members" } } });
  });
  after(() => srv.stop());

  test("the example slot is there, and only HardSmoke sets slots up", async () => {
    const l = await hs.get("/api/v1/display-slots");
    assert.equal(l.status, 200);
    const s = l.json.slots.find(x => x.key === "battle-sidebar");
    assert.deepEqual([s.layout, s.bots], ["row", { mode: "battle", battle: "page" }]);
    assert.ok(l.json.stats.some(x => x.key === "v_win_rate") && l.json.stats.some(x => x.key === "win_rate"));
    assert.equal((await guest.get("/api/v1/display-slots")).status, 401);
    assert.equal((await odin.get("/api/v1/display-slots")).status, 403);
    assert.equal((await save("mine", { name: "x", bots: { mode: "page" }, stats: ["win_rate"] }, odin)).status, 403);
    assert.equal((await odin.db("get", { path: "arena_displays/battle-sidebar" })).status, 403, "/api/db can't read slots");
  });

  test("bad slots are refused", async () => {
    for (const [key, body, field] of [
      ["Bad_Key", { name: "x", bots: { mode: "page" }, stats: ["win_rate"] }, "key"],
      ["s1", { bots: { mode: "page" }, stats: ["win_rate"] }, "name"],
      ["s1", { name: "x", stats: ["win_rate"] }, "bots"],
      ["s1", { name: "x", bots: { mode: "specific", entrants: [hammer, raven] }, stats: ["win_rate"] }, "bots.entrants"],
      ["s1", { name: "x", bots: { mode: "list", entrants: ["nobody12345"] }, stats: ["win_rate"] }, "bots.entrants[0]"],
      ["s1", { name: "x", bots: { mode: "battle", battle: "nobattle123" }, stats: ["win_rate"] }, "bots.battle"],
      ["s1", { name: "x", bots: { mode: "page" }, stats: ["made_up"] }, "stats[0]"],
      ["s1", { name: "x", bots: { mode: "page" }, stats: [] }, "stats"],
      ["s1", { name: "x", bots: { mode: "page" }, stats: ["win_rate"], layout: "pie" }, "layout"],
      ["s1", { name: "x", bots: { mode: "page" }, stats: ["win_rate"], order: "win_rate" }, "order"],
      ["s1", { name: "x", bots: { mode: "page" }, stats: ["win_rate"], colour: "red" }, "colour"],
    ]) {
      const r = await save(key, body);
      assert.equal(r.status, 400, `${key} ${JSON.stringify(body)}`);
      assert.equal(r.json.error.field, field);
    }
    assert.equal((await show("s1")).status, 404, "nothing was saved");
  });

  test("each reader sees only what the owners share with them", async () => {
    assert.equal((await save("home-featured", { name: "Home featured", title: "Featured", layout: "card", bots: { mode: "list", entrants: [hammer, raven] }, stats: ["win_rate", "total_profit", "roi", "strategy", "v_record", "v_win_rate"] })).status, 200);
    const g = await show("home-featured");
    assert.equal(g.json.schema, "d3mon.display/v1");
    assert.deepEqual(values(g, "Hammer"), ["win_rate"]);
    assert.deepEqual(values(g, "Raven"), ["v_record"]);
    assert.deepEqual(values(await show("home-featured", loki), "Hammer"), ["total_profit", "win_rate"]);
    assert.deepEqual(values(await show("home-featured", hs), "Hammer"), ["total_profit", "win_rate"], "admins read like members: private means private");
    assert.deepEqual(values(await show("home-featured", odin), "Hammer"), ["roi", "total_profit", "win_rate"], "the owner sees their private stat");
    const raw = JSON.stringify(g.json);
    for (const secret of ["184.25", "Momentum"]) assert.ok(!raw.includes(secret), `${secret} never reaches a guest`);
    const v = g.json.entrants.find(e => e.name === "Raven").values.v_record;
    assert.deepEqual([v.value, v.verification, v.source], [{ w: 1, l: 0 }, "verified", "verified"]);
    assert.deepEqual(g.json.columns.map(c => c.key), ["win_rate", "total_profit", "roi", "strategy", "v_record", "v_win_rate"], "the slot's stat order");
  });

  test("bots: a battle's lineup, the one on the main page, or the one the page names", async () => {
    assert.deepEqual(names(await show("battle-sidebar", guest, `?battle=${battle.id}`)), ["Hammer", "Raven", "Chartist"], "lineup order");
    assert.equal((await show("battle-sidebar")).json.note, "Pick a battle.");
    await save("main-lineup", { name: "Main lineup", bots: { mode: "battle", battle: "current" }, stats: ["win_rate"] });
    assert.equal((await show("main-lineup")).json.note, "No battle is on right now.");
    await hs.req("PATCH", `/api/v1/battles/${other.id}`, { onMainPage: true });
    assert.deepEqual(names(await show("main-lineup")), ["ArbWolf"]);
    await save("night-one", { name: "Night one", bots: { mode: "battle", battle: battle.id }, stats: ["win_rate"], order: "name", limit: 2 });
    assert.deepEqual(names(await show("night-one")), ["Chartist", "Hammer"], "by name, at most 2");
  });

  test("a profile slot shows the entrant the page names", async () => {
    await save("bot-profile", { name: "Bot profile", layout: "card", bots: { mode: "page" }, stats: ["win_rate", "v_record"] });
    assert.deepEqual(names(await show("bot-profile", guest, "?e=chartist")), ["Chartist"]);
    assert.equal((await show("bot-profile")).json.note, "This display shows the entrant the page names.");
    assert.deepEqual(names(await show("bot-profile", guest, "?e=nobody")), []);
  });

  test("suspended entrants are left out; a slot that's off is gone", async () => {
    const p = `arena_entrants/${hammer}`, e = srv.app.store.get(p).data;
    srv.app.store.set(p, { ...e, status: "suspended" });
    assert.deepEqual(names(await show("home-featured", odin)), ["Raven"], "even for its owner here");
    srv.app.store.set(p, e);
    await save("home-featured", { status: "off" });
    assert.equal((await show("home-featured")).status, 404);
    assert.equal((await show("home-featured", hs)).status, 200, "HardSmoke can still preview it");
    await save("home-featured", { status: "on" });
  });

  test("pages update live when a slot changes", async () => {
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=display:home-featured`, { signal: ac.signal });
    const it = readEvents(res.body)[Symbol.asyncIterator]();
    assert.equal((await it.next()).value.event, "hello");
    await save("home-featured", { layout: "ticker" });
    const e = (await it.next()).value;
    assert.equal(e.event, "display.updated");
    assert.equal((await show("home-featured")).json.slot.layout, "ticker");
    ac.abort();
  });

  test("the pages and the widget are served, and /board shows the example slot", async () => {
    for (const p of ["/displays", "/js/arena-displays.js", "/js/d3mon-widget.js"]) assert.equal((await guest.get(p)).status, 200, p);
    const board = (await guest.get("/board")).text;
    assert.ok(board.includes('data-d3mon-display="battle-sidebar"') && board.includes("js/d3mon-widget.js"));
  });
});
