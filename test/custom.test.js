// Step 4c: custom stats (defined by the owner, sent by the bot, always "self-reported", like the list stats) and showing a
// battle's lineup on the current main page (config/battleRoster).
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000;
const nextQuarter = (k = 1) => Math.floor(Date.now() / Q) * Q + k * Q;

describe("custom stats", () => {
  let srv, hs, odin, loki, guest, bot, token;
  const define = (custom, c = odin) => c.req("PUT", `/api/v1/entrants/${bot}/stat-settings`, { custom });
  const push = (values, extra = {}, tok = token) => fetch(`${srv.base}/api/v1/bot/stats`, {
    method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.stats/v1", values, ...extra }),
  }).then(async r => ({ status: r.status, json: await r.json() }));
  const card = c => c.get("/api/v1/entrants/valhalla/card");
  const statLines = () => srv.app.arena.ledger.lines.filter(l => l.t === "stat");

  before(async () => {
    srv = await startServer();
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    const b = (await hs.post("/api/v1/battles", { title: "Night one", startsAt: nextQuarter(), status: "open" })).json.battle;
    const a = (await odin.post(`/api/v1/battles/${b.id}/applications`, { kind: "bot", name: "Valhalla", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
  });
  after(() => srv.stop());

  test("the owner defines custom stats; they start hidden", async () => {
    const r = await define({
      avg_edge: { type: "percent", label: "Average edge", unit: "%", description: "Edge over Kalshi's price" },
      best_session: { type: "text", label: "Best session" }, trades: { type: "integer", label: "Trades" },
      hold_time: { type: "duration", label: "Average hold" }, pnl: { type: "number", label: "Paper P&L", unit: "$" },
      equity: { type: "series", label: "Equity curve" }, by_hour: { type: "histogram", label: "Edge by hour" },
    });
    assert.equal(r.status, 200);
    const custom = r.json.stats.filter(s => s.source === "custom");
    assert.equal(custom.length, 7);
    assert.ok(custom.every(s => s.visibility === "hidden" && s.verification === "self-reported" && s.value === null));
    assert.deepEqual((await card(odin)).json.stats, []);
  });

  test("bad definitions are refused", async () => {
    for (const [custom, field, code = "invalid_argument"] of [
      [{ win_rate: { type: "number", label: "Mine" } }, "custom.win_rate"], [{ "Bad-Key": { type: "number", label: "x" } }, "custom.Bad-Key"],
      [{ api_key: { type: "number", label: "x" } }, "custom.api_key", "looks_like_secret"], [{ newstat: { label: "No type" } }, "custom.newstat.type"],
      [{ newstat: { type: "number" } }, "custom.newstat.label"], [{ newstat: { type: "colour", label: "x" } }, "custom.newstat.type"],
      [{ newstat: { type: "number", label: "x", format: "money" } }, "custom.newstat.format"],
      [{ newstat: { type: "number", label: "x", colour: "red" } }, "custom.newstat.colour"],
    ]) {
      const r = await define(custom);
      assert.equal(r.status, 400, JSON.stringify(custom));
      assert.deepEqual([r.json.error.code, r.json.error.field], [code, field]);
    }
    assert.equal((await define({ x2: { type: "number", label: "x" } }, loki)).status, 404, "only the owner");
    assert.equal((await define({ x2: { type: "number", label: "x" } }, hs)).status, 404, "not even admins");
    const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`extra_${i}`, { type: "number", label: `Extra ${i}` }]));
    assert.equal((await define(many)).json.error.code, "too_many_stats", "7 + 14 > 20");
  });

  test("the bot sends values; each must match its stat's type", async () => {
    const good = [
      { key: "avg_edge", value: 0.034 }, { key: "best_session", value: "London open" }, { key: "trades", value: 412 },
      { key: "hold_time", value: 540000 }, { key: "pnl", value: -12.5 },
      { key: "equity", value: Array.from({ length: 500 }, (_, i) => ({ t: `d${i}`, v: 1 + i / 1000 })) }, { key: "by_hour", value: { "13:00": 0.04, "14:00": -0.01 } },
    ];
    const r = await push(good);
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.accepted, good.map(v => v.key));
    for (const [value, key] of [
      [1.2, "avg_edge"], ["0.5", "avg_edge"], [3.5, "trades"], [-1, "hold_time"], ["", "best_session"], ["x".repeat(501), "best_session"],
      [[{ t: "a", v: "1" }], "equity"], [[{ t: "a", v: 1, extra: 2 }], "equity"], [Array.from({ length: 501 }, () => ({ t: "a", v: 1 })), "equity"],
      [{ a: "x" }, "by_hour"], [[1, 2], "by_hour"], [Infinity, "pnl"],
    ]) {
      const bad = await push([{ key, value }]);
      assert.equal(bad.status, 400, `${key}=${JSON.stringify(value).slice(0, 40)}`);
      assert.equal(bad.json.error.field, "values[0].value");
    }
  });

  test("bad pushes are refused, and nothing is written", async () => {
    const before = statLines().length;
    assert.equal((await push([{ key: "not_mine", value: 1 }])).json.error.code, "not_defined");
    assert.equal((await push([{ key: "trades", value: 1 }, { key: "trades", value: 2 }])).json.error.field, "values[1].key");
    assert.equal((await push([{ key: "best_session", value: "my key is sk-ant-api03-abcdefghijklmnopqrstu" }])).json.error.code, "looks_like_secret");
    assert.equal((await push([{ key: "trades", value: 1 }], { asOf: "2020-01-01T00:00:00Z" })).json.error.field, "asOf");
    assert.equal((await push([{ key: "trades", value: 1 }], { schema: "d3mon.stats/v2" })).json.error.field, "schema");
    assert.equal((await push([], {})).json.error.field, "values");
    assert.equal((await odin.post("/api/v1/bot/stats", { schema: "d3mon.stats/v1", values: [{ key: "trades", value: 1 }] })).status, 401, "a session can't push");
    assert.equal(statLines().length, before);
  });

  test("unchanged values are skipped; changes add to the history and the latest shows", async () => {
    const before = statLines().length;
    const same = await push([{ key: "trades", value: 412 }]);
    assert.deepEqual([same.json.accepted, same.json.unchanged], [[], ["trades"]]);
    assert.equal(statLines().length, before);
    const asOf = new Date(Date.now() - 3600000).toISOString();
    await push([{ key: "trades", value: 420 }], { asOf });
    assert.deepEqual(statLines().filter(l => l.key === "trades").map(l => l.value), [412, 420], "both kept");
    const s = (await odin.get(`/api/v1/entrants/${bot}/stat-settings`)).json.stats.find(x => x.key === "trades");
    assert.deepEqual([s.value, s.asOf], [420, asOf]);
  });

  test("custom stats follow the owner's privacy choices and say they're self-reported", async () => {
    await define({ avg_edge: { visibility: "public", order: 1 }, trades: { visibility: "members" }, pnl: { visibility: "private" } });
    await odin.req("PUT", `/api/v1/entrants/${bot}/stat-settings`, { stats: { win_rate: { visibility: "public" } } });
    await push([{ key: "win_rate", value: 0.6 }]);
    const keys = async c => (await card(c)).json.stats.map(x => x.key);
    assert.deepEqual(await keys(guest), ["avg_edge", "win_rate"]);
    assert.deepEqual((await keys(loki)).sort(), ["avg_edge", "trades", "win_rate"]);
    assert.deepEqual((await keys(hs)).sort(), ["avg_edge", "trades", "win_rate"]);
    assert.deepEqual((await keys(odin)).sort(), ["avg_edge", "pnl", "trades", "win_rate"]);
    const g = (await card(guest)).json.stats;
    const edge = g.find(x => x.key === "avg_edge"), hit = g.find(x => x.key === "win_rate");
    assert.deepEqual([edge.source, edge.verification, edge.value, edge.label, edge.unit], ["custom", "self-reported", 0.034, "Average edge", "%"]);
    assert.ok(edge.asOf);
    assert.deepEqual([hit.source, hit.verification], ["catalog", "self-reported"]);
    assert.equal(edge.category, "Custom");
    assert.ok(!JSON.stringify(g).includes("Paper P&L"), "private stats never reach a guest");
  });

  test("a stat's type is locked once it has values; removing keeps the history", async () => {
    assert.equal((await define({ trades: { type: "number" } })).json.error.code, "type_locked");
    assert.equal((await define({ trades: { label: "Trades taken" } })).status, 200, "relabelling is fine");
    const kept = statLines().filter(l => l.key === "trades").length;
    const r = await define({ trades: { remove: true } });
    assert.ok(!r.json.stats.some(x => x.key === "trades"));
    assert.deepEqual(r.json.removedCustom.map(x => x.key), ["trades"]);
    assert.equal((await push([{ key: "trades", value: 1 }])).json.error.code, "not_defined", "the bot can't send a removed stat");
    assert.equal(statLines().filter(l => l.key === "trades").length, kept, "history kept");
    const back = (await define({ trades: { type: "integer", label: "Trades taken" } })).json.stats.find(x => x.key === "trades");
    assert.equal(back.value, 420, "brought back with its last value");
  });

  test("a bot can't flood its stats", async () => {
    let limited = 0;
    for (let i = 0; i < 12; i++) if ((await push([{ key: "pnl", value: i }])).status === 429) limited++;
    assert.ok(limited >= 1, `${limited} refused`);
  });
});

describe("the battle lineup on the main page", () => {
  let srv, hs, owners, battle, other;
  const roster = async () => (await new Client(srv.base).db("get", { path: "config/battleRoster" })).json.data;
  const enter = async (b, i, kind, name) => {
    const a = (await owners[i].post(`/api/v1/battles/${b.id}/applications`, { kind, name, creatorName: `Owner ${i}` })).json.application;
    return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application;
  };

  before(async () => {
    srv = await startServer();
    hs = new Client(srv.base);
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    owners = [];
    for (let i = 0; i < 4; i++) { const c = new Client(srv.base); await c.register(`owner${i}`, "owner-pass-12", `Owner ${i}`); owners.push(c); }
    battle = (await hs.post("/api/v1/battles", { title: "Saturday night", startsAt: nextQuarter(4), status: "draft" })).json.battle;
    other = (await hs.post("/api/v1/battles", { title: "Sunday night", startsAt: nextQuarter(100), status: "open" })).json.battle;
    // The roster HardSmoke kept by hand on the current page, with a stream link.
    srv.app.store.set("config/battleRoster", { bots: [{ name: "Valhalla", url: "https://twitch.tv/valhalla" }, { name: "Old Bot" }], callers: [], t: 1 });
  });
  after(() => srv.stop());

  test("a draft can't go on the main page, and nothing changes until a battle is switched on", async () => {
    assert.equal((await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { onMainPage: true })).json.error.code, "battle_draft");
    await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { status: "open" });
    await enter(battle, 0, "bot", "Valhalla");
    assert.deepEqual((await roster()).bots.map(b => b.name), ["Valhalla", "Old Bot"], "untouched");
    assert.equal((await owners[0].req("PATCH", `/api/v1/battles/${battle.id}`, { onMainPage: true })).status, 403, "admins only");
  });

  test("switching it on copies the lineup, keeping stream links, and records the old roster", async () => {
    await enter(battle, 1, "caller", "Freya Calls");
    const r = await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { onMainPage: true });
    assert.equal(r.json.battle.onMainPage, true);
    const ro = await roster();
    assert.deepEqual(ro.bots, [{ name: "Valhalla", url: "https://twitch.tv/valhalla" }]);
    assert.deepEqual(ro.callers, [{ name: "Freya Calls" }]);
    assert.equal(ro.arenaBattleId, battle.id);
    const line = srv.app.arena.ledger.lines.filter(l => l.t === "roster").at(-1);
    assert.deepEqual(line.previous.bots.map(b => b.name), ["Valhalla", "Old Bot"], "the old roster is kept in the history");
  });

  test("lineup changes follow live, including on the current page's own live feed", async () => {
    const page = await new Client(srv.base).events();
    await new Client(srv.base).post("/api/sub", { cid: page.cid, sid: 1, kind: "doc", path: "config/battleRoster" });
    await page.next(e => e.event === "snap" && e.data.sid === 1);
    const app = await enter(battle, 2, "bot", "Gungnir");
    const snap = await page.next(e => e.event === "snap" && e.data.sid === 1 && e.data.data?.bots?.length === 2);
    assert.deepEqual(snap.data.data.bots.map(b => b.name), ["Valhalla", "Gungnir"]);
    await hs.post(`/api/v1/applications/${app.id}/review`, { decision: "reopen" });
    assert.deepEqual((await roster()).bots.map(b => b.name), ["Valhalla"]);
    page.close();
  });

  test("only one battle feeds the main page at a time", async () => {
    await enter(other, 3, "script", "Rune Script");
    await hs.req("PATCH", `/api/v1/battles/${other.id}`, { onMainPage: true });
    assert.equal((await hs.get(`/api/v1/battles/${battle.id}`)).json.battle.onMainPage, false);
    assert.deepEqual((await roster()).bots.map(b => b.name), ["Rune Script"]);
    await enter(battle, 2, "bot", "Mjolnir");
    assert.deepEqual((await roster()).bots.map(b => b.name), ["Rune Script"], "the other battle no longer writes it");
  });
});
