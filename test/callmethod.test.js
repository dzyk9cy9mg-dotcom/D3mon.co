// How bots and scripts call in a battle (owner, 2026-10-22, for Halloween): each owner picks automatic (its key) or
// by hand (the Up/Down buttons on /my) per battle, unless HardSmoke sets it for everyone. During a battle with a bot
// on the buttons, its key's calls aren't taken, and outside one, the buttons aren't.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000;

describe("battle call methods", () => {
  let srv, hs, odin, loki, guest, battle, bot, bot2, caller, token;
  const P = Math.floor(Date.now() / Q) * Q - 2 * Q; // started 2 rounds ago; runs 8
  const R = n => new Date(P + n * Q).toISOString();
  const asBot = (method, path, body) => fetch(srv.base + path, {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }).then(async r => ({ status: r.status, json: await r.json() }));
  const at = n => { srv.app.arena.calls.now = () => P + n * Q + 60000; }; // one minute into round n
  const botCall = (n, direction = "up") => asBot("POST", "/api/v1/bot/calls", { schema: "d3mon.call/v1", market: "KXBTC15M", direction, round: R(n) });
  const button = (c, id, n, direction = "up") => c.post(`/api/v1/entrants/${id}/call`, { direction, round: R(n) });
  const method = (c, id, m) => c.req("PUT", `/api/v1/battles/${battle.id}/entrants/${id}/call-method`, { method: m });
  const view = async () => (await guest.get(`/api/v1/battles/${battle.id}`)).json.battle;

  before(async () => {
    srv = await startServer();
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    battle = (await hs.post("/api/v1/battles", { title: "Halloween", startsAt: P, rounds: 8, status: "open" })).json.battle;
    const approve = async (c, body) => {
      const a = (await c.post(`/api/v1/battles/${battle.id}/applications`, body)).json.application;
      return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    };
    bot = await approve(odin, { kind: "bot", name: "Valhalla", creatorName: "Odin" });
    bot2 = await approve(odin, { kind: "script", name: "Rune Lines", creatorName: "Odin" });
    caller = await approve(loki, { kind: "caller", name: "Loki Calls", creatorName: "Loki" });
    await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { status: "live" });
    token = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
  });
  after(() => srv.stop());

  test("by default each owner picks, and bots and scripts call with their key", async () => {
    const b = await view();
    assert.equal(b.callMethod, "owner");
    assert.deepEqual(Object.fromEntries(b.entrants.map(e => [e.name, e.callMethod])), { Valhalla: "auto", "Rune Lines": "auto", "Loki Calls": "manual" });
    at(2);
    assert.equal((await botCall(2)).status, 201);
    const r = await button(odin, bot2, 2);
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "use_bot_key");
  });

  test("only the owner (or an admin) picks; callers always use the buttons", async () => {
    assert.equal((await method(guest, bot, "manual")).status, 401);
    assert.equal((await method(loki, bot, "manual")).status, 404);
    assert.equal((await method(loki, caller, "auto")).status, 409);
    assert.equal((await method(odin, bot, "sometimes")).status, 400);
    const r = await method(odin, bot, "manual");
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.battle.entrants.find(e => e.id === bot).callMethod, "manual");
  });

  test("by hand: the buttons work and the key's calls aren't taken; bot/me says so", async () => {
    at(3);
    const k = await botCall(3);
    assert.equal(k.status, 409);
    assert.equal(k.json.error.code, "manual_calls");
    assert.equal((await asBot("GET", "/api/v1/bot/me")).json.keyCallsTaken, false);
    const b = await button(odin, bot, 3, "down");
    assert.equal(b.status, 201, JSON.stringify(b.json));
    assert.equal(b.json.call.direction, "down");
    assert.equal(b.json.call.via, "button");
    assert.equal((await button(loki, bot, 4)).status, 404, "not someone else's bot");
  });

  test("a call already made stays when the owner switches back", async () => {
    assert.equal((await method(odin, bot, "auto")).status, 200);
    at(3);
    assert.equal((await botCall(3, "down")).json.unchanged, true, "same call again is fine");
    assert.equal((await botCall(3, "up")).json.error.code, "already_called");
    at(4);
    assert.equal((await botCall(4)).status, 201);
    assert.equal((await asBot("GET", "/api/v1/bot/me")).json.keyCallsTaken, true);
  });

  test("HardSmoke can set everyone; then owners can't change it", async () => {
    assert.equal((await odin.req("PATCH", `/api/v1/battles/${battle.id}`, { callMethod: "manual" })).status, 403);
    assert.equal((await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { callMethod: "everyone" })).status, 400);
    assert.equal((await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { callMethod: "manual" })).status, 200);
    const b = await view();
    assert.ok(b.entrants.every(e => e.callMethod === "manual"));
    const r = await method(odin, bot, "auto");
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "set_by_host");
    at(5);
    assert.equal((await botCall(5)).status, 409);
    assert.equal((await button(odin, bot2, 5)).status, 201, "a script on the buttons too");
  });

  test("after the battle, keys work again and the buttons don't", async () => {
    at(9);
    assert.equal((await botCall(9)).status, 201);
    assert.equal((await button(odin, bot2, 9)).json.error.code, "use_bot_key");
    srv.app.arena.calls.now = () => Date.now();
  });
});
