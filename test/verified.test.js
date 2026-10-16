// Verified stats (worked out by the server from an entrant's own calls and the round results) for
// callers and bots, and self-reported stats typed in on /my by bot and script owners.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";
import { betterThanChance, VERIFIED } from "../server/arena/verified.js";

const Q = 15 * 60000;

test("better than chance: how unlikely a record is by coin flips", () => {
  assert.equal(betterThanChance(9, 9), null, "not before 10 scored calls");
  assert.equal(betterThanChance(6, 10), 0.623, "1 - 386/1024");
  assert.equal(betterThanChance(5, 10), 0.377);
  assert.ok(betterThanChance(60, 100) > 0.97 && betterThanChance(60, 100) < 0.99);
  assert.ok(betterThanChance(500, 1000) < 0.5, "a coin-flip record isn't skill");
});

describe("verified stats and typed-in stats", () => {
  let srv, hs, odin, loki, thor, guest, battle, P, raven, fox, hammer, chartist, hammerToken;
  const R = n => P + n * Q;
  const sv = (s, k) => s.stats.find(x => x.key === k);
  // Rounds 0–9. Raven (a caller) goes against the crowd; Fox (a caller) and Hammer (a bot) always call up.
  const results = ["down", "down", "up", "down", "down", "down", "up", "down", "down", "down"];
  const ravenCalls = ["down", "down", "down", "up", "down", "down", "down", "down", "down", "up"];

  async function enter(c, kind, name) {
    const a = (await c.post(`/api/v1/battles/${battle.id}/applications`, { kind, name, creatorName: name })).json.application;
    return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
  }
  async function at(n, fn) {
    srv.app.arena.calls.now = () => R(n) - 30000;
    try { return await fn(); } finally { srv.app.arena.calls.now = () => Date.now(); }
  }
  const button = (c, id, n, direction) => at(n, async () => assert.equal((await c.post(`/api/v1/entrants/${id}/call`, { direction, round: new Date(R(n)).toISOString() })).status, 201));
  const botCall = (n, direction) => at(n, async () => assert.equal((await fetch(`${srv.base}/api/v1/bot/calls`, { method: "POST", headers: { authorization: `Bearer ${hammerToken}`, "content-type": "application/json" },
    body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction, round: new Date(R(n)).toISOString() }) })).status, 201));

  before(async () => {
    srv = await startServer();
    [hs, odin, loki, thor, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    await thor.register("thor", "thor-pass-12", "Thor");
    P = Math.floor(Date.now() / Q) * Q - 10 * Q;
    battle = (await hs.post("/api/v1/battles", { title: "Callers night", startsAt: P, rounds: 12, status: "open", kinds: ["caller", "bot", "script"] })).json.battle;
    raven = await enter(odin, "caller", "Raven");
    fox = await enter(loki, "caller", "Fox");
    hammer = await enter(thor, "bot", "Hammer");
    chartist = await enter(loki, "script", "Chartist");
    hammerToken = (await thor.post(`/api/v1/entrants/${hammer}/keys`, {})).json.token;
    for (let i = 0; i < 10; i++) {
      await button(odin, raven, i, ravenCalls[i]);
      await button(loki, fox, i, "up");
      await botCall(i, "up");
    }
    for (let i = 0; i < 5; i++) await hs.req("PUT", `/api/v1/battles/${battle.id}/rounds/${R(i)}/metrics`, { result: results[i] });
    srv.app.arena.ledger.append([5, 6, 7, 8, 9].map(i => ({ t: "score", market: "KXBTC15M", round: R(i), result: results[i], source: "kalshi" })), null);
  });
  after(() => srv.stop());

  test("a caller's stats are worked out from their calls", async () => {
    const s = (await odin.get(`/api/v1/entrants/${raven}/stat-settings`)).json;
    assert.equal(s.stats.length, VERIFIED.length, "callers have verified stats only");
    assert.ok(s.stats.every(x => x.source === "verified" && x.visibility === "hidden"));
    const v = k => sv(s, k).value;
    assert.deepEqual([v("v_win_rate"), sv(s, "v_win_rate").n], [0.6, 10]);
    assert.equal(v("v_chance"), 0.623);
    assert.deepEqual(v("v_record"), { w: 6, l: 4 });
    assert.deepEqual(v("v_form"), ["w", "w", "l", "l", "w", "w", "l", "w", "w", "l"]);
    assert.deepEqual([v("v_current_streak"), v("v_best_win_streak"), v("v_worst_loss_streak")], [-1, 2, 2]);
    assert.deepEqual([v("v_up_down"), sv(s, "v_up_down").counts], [{ up: 0, down: 0.75 }, { up: 2, down: 8 }]);
    assert.deepEqual([v("v_crowd"), sv(s, "v_crowd").n], [0.75, 8], "went against Fox and Hammer 8 times, right 6");
    assert.deepEqual([v("v_participation"), sv(s, "v_participation").n], [0.9091, 11], "10 of the 11 battle rounds so far");
    assert.deepEqual(v("v_battles"), [{ t: "Callers night", w: 6, l: 4, called: 10, rounds: 11 }]);
    assert.equal(v("v_lead"), 30000);
    assert.equal(v("v_calls"), 10);
    assert.deepEqual(v("v_last_30_days").w + v("v_last_30_days").l, 10);
    assert.deepEqual([sv(s, "v_win_rate").verification, sv(s, "v_win_rate").sources], ["mixed", { kalshi: 5, host: 5 }]);
    assert.equal(sv(s, "v_lead").verification, "verified", "lead time needs no result");
    const fx = (await loki.get(`/api/v1/entrants/${fox}/stat-settings`)).json;
    assert.equal(sv(fx, "v_crowd").value, null, "Fox never went against the crowd");
  });

  test("a caller chooses who sees each one; the server leaves out the rest", async () => {
    assert.deepEqual((await guest.get("/api/v1/entrants/raven/card")).json.stats, [], "all hidden at first");
    const r = await odin.req("PUT", `/api/v1/entrants/${raven}/stat-settings`, { stats: { v_win_rate: { visibility: "public" }, v_chance: { visibility: "public" }, v_record: { visibility: "members" }, v_crowd: { visibility: "private", label: "Contrarian" } } });
    assert.equal(r.status, 200);
    const keys = async c => (await c.get("/api/v1/entrants/raven/card")).json.stats.map(x => x.key).sort();
    assert.deepEqual(await keys(guest), ["v_chance", "v_win_rate"]);
    assert.deepEqual(await keys(loki), ["v_chance", "v_record", "v_win_rate"]);
    assert.deepEqual(await keys(hs), ["v_chance", "v_record", "v_win_rate"], "admins read like members");
    assert.deepEqual(await keys(odin), ["v_chance", "v_crowd", "v_record", "v_win_rate"]);
    const wr = (await guest.get("/api/v1/entrants/raven/card")).json.stats.find(x => x.key === "v_win_rate");
    assert.deepEqual([wr.value, wr.source, wr.verification, wr.category], [0.6, "verified", "mixed", "Verified results"]);
  });

  test("callers can't add self-reported or custom stats", async () => {
    assert.equal((await odin.req("PUT", `/api/v1/entrants/${raven}/stat-settings`, { stats: { win_rate: { visibility: "public" } } })).json.error.field, "stats.win_rate");
    assert.equal((await odin.req("PUT", `/api/v1/entrants/${raven}/stat-settings`, { custom: { mine: { type: "number", label: "x" } } })).json.error.code, "callers_verified_only");
    assert.equal((await odin.post(`/api/v1/entrants/${raven}/stats`, { schema: "d3mon.stats/v1", values: [{ key: "win_rate", value: 0.99 }] })).json.error.code, "callers_verified_only");
  });

  test("a bot's card can put what it claims next to what it did", async () => {
    const s = (await thor.get(`/api/v1/entrants/${hammer}/stat-settings`)).json;
    assert.deepEqual([...new Set(s.stats.map(x => x.source))], ["verified", "catalog"]);
    await fetch(`${srv.base}/api/v1/bot/stats`, { method: "POST", headers: { authorization: `Bearer ${hammerToken}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.stats/v1", values: [{ key: "win_rate", value: 0.9 }] }) });
    await thor.req("PUT", `/api/v1/entrants/${hammer}/stat-settings`, { stats: { win_rate: { visibility: "public" }, v_win_rate: { visibility: "public" } } });
    const c = Object.fromEntries((await guest.get("/api/v1/entrants/hammer/card")).json.stats.map(x => [x.key, [x.value, x.verification]]));
    assert.deepEqual(c, { v_win_rate: [0.2, "mixed"], win_rate: [0.9, "self-reported"] });
    assert.equal((await thor.req("PUT", `/api/v1/entrants/${hammer}/stat-settings`, { custom: { v_fake: { type: "percent", label: "Verified" } } })).json.error.field, "custom.v_fake", "v_ keys are reserved");
    assert.equal((await hs.req("PUT", "/api/v1/stat-catalog", { stats: { v_fake: { type: "percent", label: "x", category: "Risk" } } })).json.error.field, "stats.v_fake");
    assert.equal((await fetch(`${srv.base}/api/v1/bot/stats`, { method: "POST", headers: { authorization: `Bearer ${hammerToken}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.stats/v1", values: [{ key: "v_win_rate", value: 1 }] }) })).status, 400, "nobody can send a verified stat");
  });

  test("a script's owner types stats in on /my", async () => {
    const post = (c, values, id = chartist) => c.post(`/api/v1/entrants/${id}/stats`, { schema: "d3mon.stats/v1", values });
    const r = await post(loki, [{ key: "win_rate", value: 0.58 }, { key: "wins_losses", value: { w: 58, l: 42 } }, { key: "strategy", value: "RSI divergence on the 15-minute chart" }]);
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.accepted, ["win_rate", "wins_losses", "strategy"]);
    const s = (await loki.get(`/api/v1/entrants/${chartist}/stat-settings`)).json;
    assert.deepEqual([sv(s, "win_rate").value, sv(s, "win_rate").verification, sv(s, "win_rate").via], [0.58, "self-reported", "owner"]);
    assert.equal(srv.app.arena.ledger.lines.filter(l => l.t === "stat" && l.entrantId === chartist).every(l => l.via === "owner"), true);
    assert.equal((await post(loki, [{ key: "win_rate", value: 0.58 }])).json.unchanged[0], "win_rate");
    assert.equal((await post(loki, [{ key: "win_rate", value: 7 }])).json.error.field, "values[0].value");
    assert.equal((await post(loki, [{ key: "strategy", value: "my key sk-ant-api03-abcdefghijklmnopqrstu" }])).json.error.code, "looks_like_secret");
    assert.equal((await post(odin, [{ key: "win_rate", value: 0.99 }])).status, 404, "only the owner");
    assert.equal((await post(hs, [{ key: "win_rate", value: 0.99 }])).status, 404, "not even admins");
    assert.equal((await post(guest, [{ key: "win_rate", value: 0.99 }])).status, 401);
    assert.deepEqual((await guest.get("/api/v1/entrants/chartist/card")).json.stats, [], "typed-in stats start hidden too");
  });
});

// The old main page keeps its community Up/Down game; its battle header just points battle callers to
// /my, where calls are locked by the server, and to the live board. (Temporary, until the 3D site.)
test("the main page's battle header links to the battle call and the board", async () => {
  const srv = await startServer();
  try {
    const html = (await new Client(srv.base).get("/")).text;
    const header = html.slice(html.indexOf('id="battle"'), html.indexOf("</div>", html.indexOf('class="bctl"')));
    for (const href of ['href="apply"', 'href="my"', 'href="board"']) assert.ok(header.includes(href), href);
    for (const p of ["/my", "/board"]) assert.equal((await new Client(srv.base).get(p)).status, 200, p);
  } finally {
    await srv.stop();
  }
});
