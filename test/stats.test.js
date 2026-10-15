// Step 4b: standard stats from the call history, stat privacy (every stat starts hidden; the owner picks
// who sees each one), the stats card, and the verification labels.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client, readEvents } from "./helpers.js";

const Q = 15 * 60000;

describe("stats cards", () => {
  let srv, hs, odin, loki, guest, battle, bot, token, P;
  const R = n => P + n * Q;
  const card = c => c.get("/api/v1/entrants/valhalla/card");
  const settings = c => c.get(`/api/v1/entrants/${bot}/stat-settings`);
  const put = (c, stats) => c.req("PUT", `/api/v1/entrants/${bot}/stat-settings`, { stats });
  const valueOf = (s, key) => s.stats.find(x => x.key === key);
  // Calls for past rounds, made just before each round's lock by moving the call clock.
  async function callRound(n, direction, leadMs = 30000) {
    srv.app.arena.calls.now = () => R(n) - leadMs;
    const r = await fetch(`${srv.base}/api/v1/bot/calls`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction, round: new Date(R(n)).toISOString() }) });
    srv.app.arena.calls.now = () => Date.now();
    assert.equal(r.status, 201);
  }
  const result = (n, r) => hs.req("PUT", `/api/v1/battles/${battle.id}/rounds/${R(n)}/metrics`, { result: r });

  before(async () => {
    srv = await startServer();
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    P = Math.floor(Date.now() / Q) * Q - 10 * Q;
    battle = (await hs.post("/api/v1/battles", { title: "History night", startsAt: P, rounds: 12, status: "open" })).json.battle;
    const a = (await odin.post(`/api/v1/battles/${battle.id}/applications`, { kind: "bot", name: "Valhalla", creatorName: "Odin" })).json.application;
    bot = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
    // Rounds 0–5: calls and results give W W L W W L. Round 1's first call is changed before the lock.
    const calls = ["up", "up", "down", "up", "down", "down"], results = ["up", "up", "up", "up", "down", "up"];
    for (let i = 0; i < 6; i++) await callRound(i, calls[i], 30000 + i * 10000);
    await callRound(1, "down", 120000); // earlier, then...
    await callRound(1, "up", 20000); // ...changed: the latest call counts
    for (let i = 0; i < 6; i++) await result(i, results[i]);
    await callRound(6, "up"); // round 6 has a call but no result yet
  });
  after(() => srv.stop());

  test("standard stats are worked out from the call history", async () => {
    const s = (await settings(odin)).json;
    const v = k => valueOf(s, k).value;
    assert.equal(v("calls"), 7, "rounds called, including one not scored yet");
    assert.deepEqual([v("wins"), v("losses")], [4, 2]);
    assert.equal(v("hit_rate"), 0.6667);
    assert.equal(valueOf(s, "hit_rate").n, 6);
    assert.equal(v("current_streak"), -1, "the latest scored call was wrong");
    assert.deepEqual([v("longest_win_streak"), v("longest_loss_streak")], [2, 1]);
    // Latest call per round: rounds 0–5 at 30–80 s before the lock (round 1's is 20 s), round 6 at 30 s.
    assert.equal(v("avg_lead"), Math.round((30000 + 20000 + 50000 + 60000 + 70000 + 80000 + 30000) / 7));
    const hours = valueOf(s, "best_hours"), wins = [1, 1, 0, 1, 1, 0];
    const expected = {};
    for (let i = 0; i < 6; i++) {
      const h = `${String(new Date(R(i)).getUTCHours()).padStart(2, "0")}:00`;
      expected[h] = expected[h] || { w: 0, n: 0 };
      expected[h].n++;
      expected[h].w += wins[i];
    }
    assert.deepEqual(hours.counts, Object.fromEntries(Object.entries(expected).map(([h, b]) => [h, b.n])));
    assert.equal(hours.timezone, "UTC");
    const days = valueOf(s, "daily_record").value;
    assert.deepEqual(days.reduce((a, d) => [a[0] + d.w, a[1] + d.l], [0, 0]), [4, 2]);
  });

  test("results entered by hand say so; Kalshi results make stats verified", async () => {
    let s = (await settings(odin)).json;
    assert.equal(valueOf(s, "hit_rate").verification, "recorded by host");
    assert.equal(valueOf(s, "calls").verification, "verified", "call counts come from server-stamped calls");
    srv.app.arena.ledger.append([0, 1, 2].map(i => ({ t: "score", market: "KXBTC15M", round: R(i), result: ["up", "up", "up"][i], source: "kalshi" })), null);
    s = (await settings(odin)).json;
    assert.deepEqual([valueOf(s, "hit_rate").verification, valueOf(s, "hit_rate").sources], ["mixed", { kalshi: 3, host: 3 }]);
    srv.app.arena.ledger.append([3, 4, 5].map(i => ({ t: "score", market: "KXBTC15M", round: R(i), result: ["up", "down", "up"][i - 3], source: "kalshi" })), null);
    s = (await settings(odin)).json;
    assert.equal(valueOf(s, "hit_rate").verification, "verified");
    assert.equal(valueOf(s, "hit_rate").value, 0.6667, "same results, now from Kalshi");
  });

  test("every stat starts hidden: nobody's card shows anything", async () => {
    const s = (await settings(odin)).json;
    assert.ok(s.stats.every(x => x.visibility === "hidden"));
    for (const c of [guest, loki, hs, odin]) assert.deepEqual((await card(c)).json.stats, []);
  });

  test("the owner chooses who sees each stat; the server leaves the rest out", async () => {
    const r = await put(odin, { hit_rate: { visibility: "public", label: "Accuracy" }, wins: { visibility: "members" }, losses: { visibility: "private" }, best_hours: { visibility: "public" } });
    assert.equal(r.status, 200);
    const keys = async c => (await card(c)).json.stats.map(x => x.key).sort();
    assert.deepEqual(await keys(guest), ["best_hours", "hit_rate"]);
    assert.deepEqual(await keys(loki), ["best_hours", "hit_rate", "wins"]);
    assert.deepEqual(await keys(hs), ["best_hours", "hit_rate", "wins"], "admins read like members: private means private");
    assert.deepEqual(await keys(odin), ["best_hours", "hit_rate", "losses", "wins"]);
    const g = (await card(guest)).json;
    assert.equal(g.viewer, "guest");
    assert.equal(g.schema, "d3mon.statcard/v1");
    const hr = g.stats.find(x => x.key === "hit_rate");
    assert.deepEqual([hr.label, hr.value, hr.source, hr.visibility], ["Accuracy", 0.6667, "standard", undefined]);
    const raw = JSON.stringify(g);
    for (const hidden of ["losses", "longest_loss_streak", "current_streak", "daily_record", "Wrong calls"]) assert.ok(!raw.includes(hidden), `${hidden} never reaches a guest`);
  });

  test("labels, descriptions and order are the owner's; clearing them restores the defaults", async () => {
    await put(odin, { wins: { order: 1, description: "Right calls since day one" }, hit_rate: { order: 2 } });
    let c = (await card(odin)).json.stats;
    assert.deepEqual(c.slice(0, 2).map(x => x.key), ["wins", "hit_rate"]);
    assert.equal(c[0].description, "Right calls since day one");
    await put(odin, { hit_rate: { label: "" }, wins: { description: "" } });
    c = (await card(odin)).json.stats;
    assert.equal(c.find(x => x.key === "hit_rate").label, "Hit rate");
    assert.equal(c.find(x => x.key === "wins").description, "Calls that matched the round's result");
  });

  test("only the owner changes settings, and only with valid values", async () => {
    assert.equal((await put(guest, { hit_rate: { visibility: "public" } })).status, 401);
    assert.equal((await put(loki, { hit_rate: { visibility: "public" } })).status, 404);
    assert.equal((await put(hs, { hit_rate: { visibility: "public" } })).status, 404, "not even admins");
    assert.equal((await settings(loki)).status, 404);
    for (const [stats, field] of [
      [{ made_up_stat: { visibility: "public" } }, "stats.made_up_stat"], [{ hit_rate: { visibility: "everyone" } }, "stats.hit_rate.visibility"],
      [{ hit_rate: { label: "x".repeat(41) } }, "stats.hit_rate.label"], [{ hit_rate: { order: -1 } }, "stats.hit_rate.order"],
      [{ hit_rate: { colour: "red" } }, "stats.hit_rate.colour"], [{ hit_rate: { label: "sk-ant-api03-abcdefghijklmnopqrstu" } }, "stats.hit_rate.label"],
    ]) {
      const r = await put(odin, stats);
      assert.equal(r.status, 400, field);
      assert.equal(r.json.error.field, field);
    }
    assert.equal((await odin.db("get", { path: `arena_statsettings/${bot}` })).status, 403, "/api/db can't read settings");
  });

  test("hiding a stat never deletes its history", async () => {
    const lines = srv.app.arena.ledger.lines.length;
    await put(odin, { hit_rate: { visibility: "hidden" }, best_hours: { visibility: "hidden" } });
    assert.ok(!(await card(guest)).json.stats.some(x => x.key === "hit_rate"));
    assert.equal(srv.app.arena.ledger.lines.length, lines);
    await put(odin, { hit_rate: { visibility: "public" } });
    assert.equal((await card(guest)).json.stats.find(x => x.key === "hit_rate").value, 0.6667, "back, unchanged");
  });

  test("battle calls stay on the battle board whatever the stat settings", async () => {
    await put(odin, Object.fromEntries(["calls", "wins", "losses", "hit_rate"].map(k => [k, { visibility: "hidden" }])));
    const b = (await guest.get(`/api/v1/battles/${battle.id}/board`)).json;
    assert.deepEqual(b.rounds[0].calls.map(c => [c.direction, c.correct]), [["up", true]]);
    assert.deepEqual(b.entrants.map(e => [e.right, e.wrong]), [[4, 2]]);
  });

  test("cards refresh live when stats or settings change", async () => {
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=entrant:${bot}`, { signal: ac.signal });
    const it = readEvents(res.body)[Symbol.asyncIterator]();
    const next = async () => { for (;;) { const { value } = await it.next(); if (value.event !== "hello") return value; } };
    await put(odin, { calls: { visibility: "public" } });
    assert.equal((await next()).event, "stats.updated");
    await result(6, "up");
    const events = [(await next()).event, (await next()).event];
    assert.ok(events.includes("stats.updated"), events.join());
    ac.abort();
  });

  test("a suspended entrant's card is gone for everyone but its owner and admins", async () => {
    const path = `arena_entrants/${bot}`, e = srv.app.store.get(path).data;
    srv.app.store.set(path, { ...e, status: "suspended" });
    assert.equal((await card(guest)).status, 404);
    assert.equal((await card(odin)).status, 200);
    srv.app.store.set(path, e);
  });

  test("the card page is served", async () => {
    for (const p of ["/card", "/js/arena-card.js"]) assert.equal((await guest.get(p)).status, 200, p);
  });
});
