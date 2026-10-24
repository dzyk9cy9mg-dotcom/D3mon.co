// Stats Hub phase 2: HardSmoke's stats monitor. Every entrant × every stat, admins only. Owners' privacy
// still wins: values are shown only for Public and Members-only stats; hidden and private ones show
// activity alone. Alerts for quiet bots, stale stats, refused pushes and Kalshi gaps.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client, readEvents } from "./helpers.js";

const Q = 15 * 60000, H = 3600000;
const nextQuarter = (k = 1) => Math.floor(Date.now() / Q) * Q + k * Q;

describe("the stats monitor", () => {
  let srv, hs, odin, loki, thor, guest, hammer, chartist, raven, token, admin;
  const push = (values, tok = token) => fetch(`${srv.base}/api/v1/bot/stats`, {
    method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.stats/v1", values }),
  }).then(async r => ({ status: r.status, json: await r.json() }));
  const view = (now = Date.now()) => srv.app.arena.monitor.view(admin, now);
  const row = (v, id) => v.entrants.find(e => e.id === id);
  const alertOf = (v, id, type) => row(v, id).alerts.find(a => a.type === type);
  const rejectsDoc = id => srv.app.store.get(`arena_rejects/${id}`).data;

  before(async () => {
    srv = await startServer();
    [hs, odin, loki, thor, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    await thor.register("thor", "thor-pass-12", "Thor");
    admin = { uid: hs.user.uid ?? hs.user.id, role: "owner" };
    const b = (await hs.post("/api/v1/battles", { title: "Night one", startsAt: nextQuarter(), status: "open", kinds: ["bot", "script", "caller"] })).json.battle;
    const enter = async (c, kind, name) => {
      const a = (await c.post(`/api/v1/battles/${b.id}/applications`, { kind, name, creatorName: name })).json.application;
      return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    };
    hammer = await enter(odin, "bot", "Hammer");
    chartist = await enter(loki, "script", "Chartist");
    raven = await enter(thor, "caller", "Raven");
    token = (await odin.post(`/api/v1/entrants/${hammer}/keys`, {})).json.token;
    assert.equal((await push([{ key: "win_rate", value: 0.62 }, { key: "total_profit", value: 184.25 }, { key: "strategy", value: "Momentum fade after news candles" }])).status, 201);
    await odin.req("PUT", `/api/v1/entrants/${hammer}/stat-settings`, { stats: { win_rate: { visibility: "public" }, total_profit: { visibility: "private" } } });
  });
  after(() => srv.stop());

  test("admins only", async () => {
    assert.equal((await guest.get("/api/v1/monitor")).status, 401);
    assert.equal((await odin.get("/api/v1/monitor")).status, 403);
    assert.equal((await odin.get(`/api/v1/monitor/entrants/${hammer}/stats/win_rate`)).status, 403, "not even for your own bot: use /my");
    const r = await hs.get("/api/v1/monitor");
    assert.equal(r.status, 200);
    assert.equal(r.json.schema, "d3mon.monitor/v1");
    assert.deepEqual(r.json.entrants.map(e => e.name).sort(), ["Chartist", "Hammer", "Raven"]);
    assert.equal((await odin.db("get", { path: `arena_rejects/${hammer}` })).status, 403, "/api/db can't read the rejection log");
  });

  test("verified results are always shown to admins on the monitor, whatever the owner's setting (owner, 2026-10-23)", async () => {
    const e = (await hs.get("/api/v1/monitor")).json.entrants.find(x => x.id === hammer);
    const verified = Object.values(e.cells).filter(c => c.verification && c.verification !== "self-reported");
    assert.ok(verified.length, "there are verified stats");
    assert.ok(verified.every(c => c.shown && "value" in c), "every verified value is there for admins");
    assert.ok(verified.some(c => c.visibility === "hidden"), "even ones the owner keeps hidden from the public");
  });

  test("self-reported values only where the owner shows them; hidden and private show activity alone", async () => {
    const v = (await hs.get("/api/v1/monitor")).json, cells = row(v, hammer).cells;
    assert.deepEqual([cells.win_rate.shown, cells.win_rate.value, cells.win_rate.updates, cells.win_rate.via], [true, 0.62, 1, "bot-key"]);
    assert.deepEqual([cells.total_profit.shown, "value" in cells.total_profit, cells.total_profit.hasValue, cells.total_profit.updates], [false, false, true, 1]);
    assert.ok(cells.total_profit.asOf, "when it was updated is still shown");
    assert.deepEqual([cells.strategy.visibility, "value" in cells.strategy, cells.strategy.hasValue], ["hidden", false, true]);
    assert.equal("value" in cells.v_win_rate, true, "verified results are always shown to admins here");
    const raw = JSON.stringify(v);
    for (const secret of ["184.25", "Momentum fade"]) assert.ok(!raw.includes(secret), `${secret} never reaches the monitor`);
    assert.ok(v.columns.some(c => c.key === "v_win_rate" && c.source === "verified") && v.columns.some(c => c.key === "win_rate" && c.source === "catalog"));
    // History: times for every value, values only for a shown stat.
    const shown = (await hs.get(`/api/v1/monitor/entrants/${hammer}/stats/win_rate`)).json;
    assert.deepEqual(shown.history.map(x => x.value), [0.62]);
    await push([{ key: "total_profit", value: 190 }]);
    const hidden = (await hs.get(`/api/v1/monitor/entrants/${hammer}/stats/total_profit`)).json;
    assert.equal(hidden.history.length, 2);
    assert.ok(hidden.history.every(x => !("value" in x) && x.asOf && x.via === "bot-key"));
    assert.equal((await hs.get(`/api/v1/monitor/entrants/${hammer}/stats/not_a_stat`)).status, 404);
  });

  test("when the owner makes a stat public, it shows", async () => {
    await odin.req("PUT", `/api/v1/entrants/${hammer}/stat-settings`, { stats: { total_profit: { visibility: "members" } } });
    assert.equal(row(view(), hammer).cells.total_profit.value, 190);
    await odin.req("PUT", `/api/v1/entrants/${hammer}/stat-settings`, { stats: { total_profit: { visibility: "private" } } });
    assert.equal("value" in row(view(), hammer).cells.total_profit, false, "and hides again");
  });

  test("quiet: a bot or script that sends nothing", async () => {
    let v = view();
    assert.equal(alertOf(v, chartist, "quiet").detail, "never sent a stat or a call");
    assert.equal(alertOf(v, hammer, "quiet"), undefined, "Hammer just sent");
    assert.equal(alertOf(v, raven, "quiet"), undefined, "callers aren't expected to send anything");
    v = view(Date.now() + 25 * H);
    assert.match(alertOf(v, hammer, "quiet").detail, /nothing for 2[45] h/);
    assert.equal(v.summary.quiet, 2);
  });

  test("stale: a stat the owner shows that stopped updating", async () => {
    await odin.req("PUT", `/api/v1/entrants/${hammer}/stat-settings`, { stats: { total_calls: { visibility: "public" } } });
    let s = alertOf(view(), hammer, "stale");
    assert.deepEqual(s.stats, [{ key: "total_calls", never: true }], "public but never sent");
    s = alertOf(view(Date.now() + 8 * 24 * H), hammer, "stale");
    assert.deepEqual(s.stats.map(x => x.key).sort(), ["total_calls", "total_profit", "win_rate"], "hidden 'strategy' isn't counted");
  });

  test("refused pushes are logged, without what was sent", async () => {
    await push([{ key: "win_rate", value: 7 }]);
    await push([{ key: "made_up", value: 1 }]);
    await push([{ key: "strategy", value: "my key is sk-ant-api03-abcdefghijklmnopqrstu" }]);
    const late = await fetch(`${srv.base}/api/v1/bot/calls`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction: "up", round: new Date(nextQuarter(-1)).toISOString() }) });
    assert.equal(late.status, 409);
    await loki.post(`/api/v1/entrants/${chartist}/stats`, { schema: "d3mon.stats/v1", values: [{ key: "roi", value: -5 }] });
    await odin.post(`/api/v1/entrants/${chartist}/stats`, { schema: "d3mon.stats/v1", values: [{ key: "roi", value: -5 }] }); // not Odin's: not logged against Chartist
    const r = alertOf(view(), hammer, "rejected");
    assert.deepEqual(r.rejects.map(x => [x.kind, x.code, x.field, x.key ?? null]), [
      ["stats", "invalid_argument", "values[0].value", "win_rate"], ["stats", "not_defined", "values[0].key", "made_up"],
      ["stats", "looks_like_secret", "values[0].value", "strategy"], ["call", "round_locked", "round", null],
    ]);
    assert.deepEqual(alertOf(view(), chartist, "rejected").rejects.map(x => [x.via, x.key]), [["owner", "roi"]]);
    const stored = JSON.stringify([rejectsDoc(hammer), rejectsDoc(chartist)]);
    for (const sent of ["sk-ant", "abcdefghijklmnop", '"value"']) assert.ok(!stored.includes(sent), `${sent} isn't kept`);
    assert.equal(alertOf(view(Date.now() + 25 * H), hammer, "rejected"), undefined, "gone after rejectHours");
  });

  test("HardSmoke can change the thresholds", async () => {
    assert.equal((await odin.req("PUT", "/api/v1/monitor/settings", { quietHours: 1 })).status, 403);
    for (const [body, field] of [[{ quietHours: 0 }, "quietHours"], [{ staleDays: 1000 }, "staleDays"], [{ colour: "red" }, "colour"]])
      assert.equal((await hs.req("PUT", "/api/v1/monitor/settings", body)).json.error.field, field);
    const r = await hs.req("PUT", "/api/v1/monitor/settings", { quietHours: 2, staleDays: 30 });
    assert.deepEqual(r.json.settings, { quietHours: 2, staleDays: 30, rejectHours: 24 });
    assert.ok(alertOf(view(Date.now() + 3 * H), hammer, "quiet"), "quiet after 2 hours now");
    assert.equal(alertOf(view(Date.now() + 8 * 24 * H), hammer, "stale").stats.length, 1, "only the never-sent one within 30 days");
    await hs.req("PUT", "/api/v1/monitor/settings", { quietHours: 24, staleDays: 7 });
  });

  test("Kalshi gaps show at the top", async () => {
    const k = srv.app.arena.kalshi, real = k.missing;
    k.missing = () => [nextQuarter(-8)];
    try {
      const v = view();
      assert.equal(v.summary.kalshi, 1);
      assert.equal(v.alerts[0].type, "kalshi");
    } finally { k.missing = real; }
  });

  test("open monitor pages update live, for admins only", async () => {
    assert.equal((await guest.get("/api/v1/feed?topics=admin:monitor")).status, 401);
    assert.equal((await odin.get("/api/v1/feed?topics=admin:monitor")).status, 403);
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=admin:monitor`, { headers: { cookie: hs.cookie }, signal: ac.signal });
    const it = readEvents(res.body)[Symbol.asyncIterator]();
    assert.equal((await it.next()).value.event, "hello");
    await push([{ key: "win_rate", value: 0.63 }]);
    const e = await it.next();
    assert.equal(e.value.event, "monitor.updated");
    ac.abort();
  });

  test("the monitor page is served", async () => {
    for (const p of ["/monitor", "/js/arena-monitor.js"]) assert.equal((await guest.get(p)).status, 200, p);
  });
});
