// The "why" on a call (owner, 2026-10-24: "the reasoning behind every call"): optional, up to 280
// characters, private to its owner and admins until the calls close, then shown to everyone; final with the call.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000, MIN = 60000;
const CALL = { schema: "d3mon.call/v1", market: "KXBTC15M", direction: "up" };

describe("the why on a call", () => {
  let srv, hs, abel, freya, guest, battle, bot, caller, token;
  const P = Math.floor(Date.now() / Q) * Q - 2 * Q;
  const R = n => P + n * Q;
  const at = ms => { srv.app.arena.calls.now = () => ms; };
  const asBot = body => fetch(`${srv.base}/api/v1/bot/calls`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, json: await r.json() }));
  const onBoard = async (c, n, id) => (await c.get(`/api/v1/battles/${battle.id}/board`)).json.rounds[n].calls.find(x => x.entrantId === id);

  before(async () => {
    srv = await startServer();
    [hs, abel, freya, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await abel.register("abel", "abel-pass-12", "Abel");
    await freya.register("freya", "freya-pass-1", "Freya");
    battle = (await hs.post("/api/v1/battles", { title: "Brothers", startsAt: P, rounds: 8, status: "open", callWindowMin: 5 })).json.battle;
    const approve = async (c, body) => {
      const a = (await c.post(`/api/v1/battles/${battle.id}/applications`, body)).json.application;
      return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    };
    bot = await approve(abel, { kind: "bot", name: "Abel", creatorName: "Abel" });
    caller = await approve(freya, { kind: "caller", name: "Freya Calls", creatorName: "Freya" });
    await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { status: "live" });
    token = (await abel.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
  });
  after(() => srv.stop());

  test("bots don't carry a why any more (owner, 2026-10-23): one sent is dropped; a battle bot's call is live", async () => {
    at(R(3) + MIN);
    const r = await asBot({ ...CALL, why: "Fed at 2 PM, dollar up, Up looks overpriced" });
    assert.equal(r.status, 201, "a bot that still sends one isn't broken");
    assert.equal(r.json.call.why, undefined, "but it isn't kept");
    const g = await onBoard(guest, 3, bot);
    assert.deepEqual([g.direction, g.why, g.hasWhy], ["up", undefined, undefined], "in a battle everyone sees the call at once");
    assert.equal((await onBoard(hs, 3, bot)).why, undefined, "not even admins: it was never stored");
  });

  test("a caller's why is sealed with the call, and revealed with it", async () => {
    at(R(4) + MIN);
    const r = await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down", why: "Lower high on the 5-minute" });
    assert.equal(r.json.call.why, "Lower high on the 5-minute");
    const g = await onBoard(guest, 4, caller);
    assert.deepEqual([g.sealed, g.direction, g.why, g.hasWhy], [true, undefined, undefined, true]);
    at(R(4) + 5 * MIN);
    const after = await onBoard(guest, 4, caller);
    assert.deepEqual([after.direction, after.why], ["down", "Lower high on the 5-minute"]);
  });

  test("the why is final with the call: a retry can't add or change it", async () => {
    at(R(5) + MIN);
    await asBot(CALL);
    const again = await asBot({ ...CALL, why: "Thought of a reason later" });
    assert.deepEqual([again.json.unchanged, again.json.call.why], [true, undefined]);
    at(R(5) + 6 * MIN);
    const v = await onBoard(guest, 5, bot);
    assert.deepEqual([v.why, v.hasWhy], [undefined, undefined], "no reason given, nothing shown");
  });

  test("no why is fine; too long, not text or a secret is refused", async () => {
    at(R(6) + MIN);
    const long = await asBot({ ...CALL, why: "x".repeat(281) });
    assert.deepEqual([long.status, long.json.error.field], [400, "why"]);
    assert.equal((await asBot({ ...CALL, why: 42 })).status, 400);
    const secret = await asBot({ ...CALL, why: "abandon ability able about above absent absorb abstract absurd abuse access accident" });
    assert.equal(secret.json.error.code, "looks_like_secret");
    const ok = await asBot({ ...CALL, why: "   " });
    assert.deepEqual([ok.status, ok.json.call.why], [201, undefined], "a blank why counts as none");
    srv.app.arena.calls.now = () => Date.now();
  });
});
