// Per-battle call method (owner, 2026-10-22): bots and scripts call automatically with their key, or by hand
// with the call button. Owners pick before the battle starts, unless an admin sets it for the whole lineup.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000;
const CALL = { schema: "d3mon.call/v1", market: "KXBTC15M", direction: "up" };

describe("call method per battle", () => {
  let srv, hs, odin, freya, loki, live, soon, bot, caller, token;
  const now = Math.floor(Date.now() / Q) * Q;
  const asBot = body => fetch(srv.base + "/api/v1/bot/calls", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async r => ({ status: r.status, json: await r.json() }));
  const pick = (c, b, e, method) => c.req("PUT", `/api/v1/battles/${b}/entrants/${e}/call-method`, { method });

  before(async () => {
    srv = await startServer();
    [hs, odin, freya, loki] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
    await loki.register("loki", "loki-pass-12", "Loki");
    live = (await hs.post("/api/v1/battles", { title: "Live one", startsAt: now - Q, rounds: 8, status: "open" })).json.battle;
    soon = (await hs.post("/api/v1/battles", { title: "Halloween", startsAt: now + 8 * Q, rounds: 4, status: "open" })).json.battle;
    const approve = async (c, b, body) => {
      const a = (await c.post(`/api/v1/battles/${b}/applications`, body)).json.application;
      return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    };
    bot = await approve(odin, live.id, { kind: "bot", name: "Valhalla", creatorName: "Odin" });
    caller = await approve(freya, live.id, { kind: "caller", name: "Freya Calls", creatorName: "Freya" });
    await approve(odin, soon.id, { kind: "bot", creatorName: "Odin", entrantId: bot });
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
  });
  after(() => srv.stop());

  test("battles let owners pick by default, and bots start automated", async () => {
    const b = (await odin.get(`/api/v1/battles/${soon.id}`)).json.battle;
    assert.equal(b.callMethod, "owner");
    assert.equal(b.entrants.find(e => e.id === bot).callMethod, "auto");
    assert.equal((await odin.post(`/api/v1/entrants/${bot}/call`, { direction: "up" })).json.error.code, "use_bot_key", "no button while automated");
  });

  test("the owner picks before the battle starts; nobody else can", async () => {
    assert.equal((await loki.req("PUT", `/api/v1/battles/${soon.id}/entrants/${bot}/call-method`, { method: "manual" })).status, 404);
    assert.equal((await pick(odin, soon.id, bot, "sideways")).status, 400);
    const r = await pick(odin, soon.id, bot, "manual");
    assert.equal(r.status, 200);
    assert.equal(r.json.battle.entrants.find(e => e.id === bot).callMethod, "manual");
    assert.equal((await pick(freya, live.id, caller, "auto")).status, 409, "callers always use the button");
  });

  test("an admin can set the whole lineup, which locks owners out", async () => {
    await hs.req("PATCH", `/api/v1/battles/${soon.id}`, { callMethod: "auto" });
    const r = await pick(odin, soon.id, bot, "manual");
    assert.equal(r.json.error.code, "method_locked");
    assert.equal((await odin.get(`/api/v1/battles/${soon.id}`)).json.battle.entrants.find(e => e.id === bot).callMethod, "auto");
    await hs.req("PATCH", `/api/v1/battles/${soon.id}`, { callMethod: "owner" });
    assert.equal((await odin.get(`/api/v1/battles/${soon.id}`)).json.battle.entrants.find(e => e.id === bot).callMethod, "manual", "the owner's pick comes back");
  });

  test("once a battle has started only an admin can change it", async () => {
    assert.equal((await pick(odin, live.id, bot, "manual")).json.error.code, "battle_started");
    assert.equal((await pick(hs, live.id, bot, "manual")).status, 200);
  });

  test("a manual bot calls with the button, and its key is refused for that round", async () => {
    assert.equal((await asBot(CALL)).json.error.code, "use_call_button");
    const r = await odin.post(`/api/v1/entrants/${bot}/call`, { direction: "down" });
    assert.equal(r.status, 201);
    assert.equal(r.json.call.via, "button");
    assert.deepEqual(r.json.call.battleIds ?? [live.id], [live.id]);
  });

  test("back to automated: the key works and the button doesn't", async () => {
    await pick(hs, live.id, bot, "auto");
    const next = new Date(now + Q).toISOString();
    assert.equal((await asBot({ ...CALL, round: next })).status, 201);
    assert.equal((await odin.post(`/api/v1/entrants/${bot}/call`, { direction: "up", round: next })).json.error.code, "use_bot_key");
  });
});
