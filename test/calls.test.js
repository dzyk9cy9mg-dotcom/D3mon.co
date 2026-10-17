// Step 4a, revised 2026-10-17: bot keys, calls made DURING the round until its calls close (a few
// minutes in, set per battle), one final call per round, sealed until the close, caller buttons, the
// live battle board and automatic scoring.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client, readEvents } from "./helpers.js";
import { Calls, nextRound, currentRound } from "../server/arena/calls.js";
import { EventEmitter } from "node:events";

const Q = 15 * 60000;
const CALL = { schema: "d3mon.call/v1", market: "KXBTC15M", direction: "up" };
const MIN = 60000;

// Opens /api/v1/feed for a client; next(match) waits for the first matching event not yet taken.
async function feed(base, client, topics) {
  const ac = new AbortController();
  const res = await fetch(`${base}/api/v1/feed?topics=${encodeURIComponent(topics)}`, { headers: client?.cookie ? { cookie: client.cookie } : {}, signal: ac.signal });
  const queue = [];
  let wake = null;
  (async () => { try { for await (const e of readEvents(res.body)) { queue.push({ event: e.event, ...JSON.parse(e.data) }); if (wake) wake(); } } catch {} })();
  async function next(match, ms = 2000) {
    const end = Date.now() + ms;
    for (;;) {
      const i = queue.findIndex(match);
      if (i >= 0) return queue.splice(i, 1)[0];
      if (Date.now() >= end) return null;
      await new Promise(r => { const t = setTimeout(r, end - Date.now()); wake = () => { clearTimeout(t); wake = null; r(); }; });
    }
  }
  await next(e => e.event === "hello");
  return { next, close: () => ac.abort() };
}

describe("bot keys and calls", () => {
  let srv, hs, odin, freya, loki, guest, battle, bot, caller, token, key2;
  const P = Math.floor(Date.now() / Q) * Q - 4 * Q; // the battle started 4 rounds ago; it runs 8
  const R = n => P + n * Q;
  const asBot = (tok, method, path, body) => fetch(srv.base + path, {
    method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }).then(async r => ({ status: r.status, json: await r.json() }));
  const at = ms => { srv.app.arena.calls.now = () => ms; }; // move the call clock
  const realTime = () => { srv.app.arena.calls.now = () => Date.now(); };

  before(async () => {
    srv = await startServer();
    [hs, odin, freya, loki, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
    await loki.register("loki", "loki-pass-12", "Loki");
    battle = (await hs.post("/api/v1/battles", { title: "Night one", startsAt: P, rounds: 8, status: "open", callWindowMin: 5 })).json.battle;
    const approve = async (c, body) => {
      const a = (await c.post(`/api/v1/battles/${battle.id}/applications`, body)).json.application;
      return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    };
    bot = await approve(odin, { kind: "bot", name: "Valhalla", creatorName: "Odin" });
    caller = await approve(freya, { kind: "caller", name: "Freya Calls", creatorName: "Freya" });
    await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { status: "live" });
  });
  after(() => srv.stop());

  describe("keys", () => {
    test("only the owner makes keys; the token is shown once and only its hash is kept", async () => {
      assert.equal((await guest.post(`/api/v1/entrants/${bot}/keys`, {})).status, 401);
      assert.equal((await loki.post(`/api/v1/entrants/${bot}/keys`, {})).status, 404);
      assert.equal((await hs.post(`/api/v1/entrants/${bot}/keys`, {})).status, 404, "not even admins: whoever makes a key sees it");
      const r = await odin.post(`/api/v1/entrants/${bot}/keys`, { label: "prod" });
      assert.equal(r.status, 201);
      token = r.json.token;
      assert.match(token, /^d3b_[A-Za-z0-9]{20}_[A-Za-z0-9_-]{43}$/);
      const listed = (await odin.get(`/api/v1/entrants/${bot}/keys`)).json.keys;
      assert.equal(listed.length, 1);
      assert.equal(listed[0].hash, undefined);
      const secret = token.slice("d3b_".length + 20 + 1); // the secret itself can contain "_"
      assert.equal(secret.length, 43);
      assert.ok(!JSON.stringify(listed).includes(secret.slice(0, 12)), "the secret is never shown again");
      assert.equal(listed[0].preview, `d3b_${listed[0].id}_…${token.slice(-4)}`);
      assert.equal((await hs.get(`/api/v1/entrants/${bot}/keys`)).status, 200, "admins can see the list");
      assert.equal((await loki.get(`/api/v1/entrants/${bot}/keys`)).status, 404);
      const raw = (await hs.db("query", { query: { collection: "arena_keys" } })).json.docs;
      assert.deepEqual(raw, [], "/api/db can't read keys, even for admins");
    });

    test("callers don't get keys; key-like labels are refused; three active keys at most", async () => {
      assert.equal((await freya.post(`/api/v1/entrants/${caller}/keys`, {})).json.error.code, "no_keys_for_callers");
      assert.equal((await odin.post(`/api/v1/entrants/${bot}/keys`, { label: "sk-ant-api03-abcdefghijklmnopqrstu" })).json.error.code, "looks_like_secret");
      key2 = (await odin.post(`/api/v1/entrants/${bot}/keys`, { label: "spare" })).json;
      await odin.post(`/api/v1/entrants/${bot}/keys`, {});
      assert.equal((await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.error.code, "too_many_keys");
    });

    test("a key works for its bot only, on bot endpoints only, until it's revoked", async () => {
      const me = await asBot(key2.token, "GET", "/api/v1/bot/me");
      assert.equal(me.status, 200);
      assert.equal(me.json.entrant.id, bot);
      assert.equal(me.json.entrant.altAccount, undefined, "a bot sees its public profile only");
      assert.equal((await asBot(key2.token, "POST", "/api/v1/battles", { title: "x", startsAt: P })).status, 401, "keys don't work on human endpoints");
      assert.equal((await odin.post("/api/v1/bot/calls", CALL)).status, 401, "a session cookie doesn't work on bot endpoints");
      assert.equal((await loki.req("DELETE", `/api/v1/entrants/${bot}/keys/${key2.key.id}`)).status, 404, "strangers can't revoke");
      assert.equal((await hs.req("DELETE", `/api/v1/entrants/${bot}/keys/${key2.key.id}`)).json.key.active, false, "admins can");
      assert.equal((await asBot(key2.token, "GET", "/api/v1/bot/me")).status, 401);
      assert.equal((await odin.post(`/api/v1/entrants/${bot}/keys`, {})).status, 201, "revoking frees a slot");
      assert.ok((await odin.get(`/api/v1/entrants/${bot}/keys`)).json.keys.some(k => k.id === key2.key.id && !k.active), "revoked keys stay listed");
    });

    test("bad tokens all get the same answer", async () => {
      const id = token.slice(4, 24), secret = token.slice(25);
      for (const t of [null, "nope", `d3b_${id}_${"A".repeat(43)}`, `d3b_${"B".repeat(20)}_${secret}`, `${token}x`]) {
        const r = await asBot(t, "GET", "/api/v1/bot/me");
        assert.equal(r.status, 401, String(t));
        assert.equal(r.json.error.code, "bad_key");
      }
      const k = (await odin.get(`/api/v1/entrants/${bot}/keys`)).json.keys.find(x => token.includes(x.id));
      assert.ok(k.lastUsedAt === null || typeof k.lastUsedAt === "number");
    });

    test("a suspended bot's keys stop working", async () => {
      const store = srv.app.store, path = `arena_entrants/${bot}`, e = store.get(path).data;
      store.set(path, { ...e, status: "suspended" });
      assert.equal((await asBot(token, "POST", "/api/v1/bot/calls", CALL)).json.error.code, "entrant_suspended");
      store.set(path, e);
    });
  });

  describe("calls", () => {
    test("a bot's call goes to the round that's open now, stamped by the server", async () => {
      at(R(4) + 2 * MIN);
      const r = await asBot(token, "POST", "/api/v1/bot/calls", CALL);
      assert.equal(r.status, 201);
      assert.equal(r.json.call.round, new Date(R(4)).toISOString(), "the current round, not the next one");
      assert.equal(r.json.call.locksAt, new Date(R(4) + 5 * MIN).toISOString(), "this battle closes calls 5 minutes in");
      assert.equal(r.json.call.receivedAt, new Date(R(4) + 2 * MIN).toISOString());
      assert.equal((await asBot(token, "POST", "/api/v1/bot/calls", CALL)).json.unchanged, true, "a retry adds nothing");
      const changed = await asBot(token, "POST", "/api/v1/bot/calls", { ...CALL, direction: "down" });
      assert.deepEqual([changed.status, changed.json.error.code], [409, "already_called"], "one call per round, and it's final");
      const hist = (await odin.get(`/api/v1/entrants/${bot}/calls`)).json.calls;
      assert.deepEqual(hist.filter(c => c.round === R(4)).map(c => [c.direction, c.intoRoundMs]), [["up", 2 * MIN]]);
      realTime();
    });

    test("the bot's status says which round is open and when its calls close", async () => {
      at(R(4) + 3 * MIN);
      const me = (await asBot(token, "GET", "/api/v1/bot/me")).json;
      assert.deepEqual([me.openRound, me.callsCloseAt, me.callsOpenNow], [new Date(R(4)).toISOString(), new Date(R(4) + 5 * MIN).toISOString(), true]);
      at(R(4) + 6 * MIN);
      const later = (await asBot(token, "GET", "/api/v1/bot/me")).json;
      assert.deepEqual([later.openRound, later.callsOpenNow], [new Date(R(5)).toISOString(), false], "after the close, the next round is the one to call");
      realTime();
    });

    test("bad calls are refused", async () => {
      const cases = [
        [{ ...CALL, schema: "d3mon.call/v2" }, "schema"], [{ ...CALL, market: "KXETH15M" }, "market"], [{ ...CALL, direction: "sideways" }, "direction"],
        [{ ...CALL, round: new Date(R(6) + 60000).toISOString() }, "round"], [{ ...CALL, round: "tomorrow" }, "round"],
        [{ ...CALL, round: new Date(nextRound(Date.now()) + 97 * Q).toISOString() }, "round"], [{ ...CALL, confidence: 0.9 }, "confidence"],
        [{ ...CALL, apiSecret: "x" }, "apiSecret"],
      ];
      for (const [body, field] of cases) {
        const r = await asBot(token, "POST", "/api/v1/bot/calls", body);
        assert.equal(r.status, 400, field);
        assert.equal(r.json.error.field, field);
      }
    });

    test("calls close a few minutes into the round, by the server's clock, and are never moved to another round", async () => {
      at(R(5) + 5 * MIN - 1000);
      assert.equal((await asBot(token, "POST", "/api/v1/bot/calls", { ...CALL, round: new Date(R(5)).toISOString() })).status, 201, "one second before the close");
      at(R(5) + 5 * MIN);
      const late = await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down" });
      assert.deepEqual([late.status, late.json.error.code], [409, "round_locked"], "at the close, even without a round");
      assert.match(late.json.error.message, /closed at .* The next round starts at /);
      const hist = (await freya.get(`/api/v1/entrants/${caller}/calls`)).json.calls;
      assert.ok(!hist.some(c => c.round === R(6)), "not quietly moved to the next round");
      realTime();
      assert.equal((await asBot(token, "POST", "/api/v1/bot/calls", { ...CALL, round: new Date(R(2)).toISOString() })).json.error.code, "round_locked", "past rounds too");
    });

    test("each battle sets its own window; the strictest one applies; 0 means before the round starts", async () => {
      await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { callWindowMin: 2 });
      assert.equal((await guest.get(`/api/v1/battles/${battle.id}`)).json.battle.callWindowMin, 2);
      assert.equal((await guest.get(`/api/v1/battles/${battle.id}/board`)).json.rounds[1].locksAt, R(1) + 2 * MIN);
      at(R(6) + 2 * MIN);
      assert.equal((await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "up" })).json.error.code, "round_locked", "closed at 2 minutes");
      for (const bad of [-1, 16, 2.5, "5"]) assert.equal((await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { callWindowMin: bad })).status, 400, String(bad));
      await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { callWindowMin: 0 });
      at(R(6) + 10 * MIN);
      const pre = await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down" });
      assert.deepEqual([pre.status, pre.json.call.round], [201, R(7)], "a before-the-round battle: the call goes to the next round");
      assert.equal(pre.json.call.locksAt, R(7));
      await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { callWindowMin: 5 });
      realTime();
    });

    test("calls are sealed until the calls close: only the owner and admins see the direction", async () => {
      at(R(6) + MIN);
      await asBot(token, "POST", "/api/v1/bot/calls", CALL);
      const seen = async c => (await c.get(`/api/v1/battles/${battle.id}/board`)).json.rounds[6].calls.find(x => x.entrantId === bot);
      at(R(6) + 4 * MIN);
      for (const c of [guest, loki]) {
        const v = await seen(c);
        assert.deepEqual([v.sealed, v.direction, typeof v.receivedAt], [true, undefined, "number"], "who called and when is public");
      }
      assert.equal((await seen(odin)).direction, "up");
      assert.equal((await seen(hs)).direction, "up");
      const card = (await guest.get(`/api/v1/entrants/${bot}/calls`)).json.calls.find(c => c.round === R(6));
      assert.equal(card.direction, undefined, "sealed in the entrant's history too");
      at(R(6) + 5 * MIN);
      assert.equal((await seen(guest)).direction, "up", "revealed at the close");
      realTime();
    });

    test("callers press Up or Down during the round, with the same window", async () => {
      at(R(5) + MIN);
      assert.equal((await loki.post(`/api/v1/entrants/${caller}/call`, { direction: "up" })).status, 404, "only the caller themself");
      assert.equal((await odin.post(`/api/v1/entrants/${bot}/call`, { direction: "up" })).json.error.code, "use_bot_key");
      const r = await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down" });
      assert.equal(r.status, 201);
      assert.deepEqual([r.json.call.round, r.json.call.direction, r.json.call.via, r.json.call.locksAt], [R(5), "down", "button", R(5) + 5 * MIN]);
      assert.equal((await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "up" })).json.error.code, "already_called");
      assert.equal((await guest.post(`/api/v1/entrants/${caller}/call`, { direction: "up" })).status, 401);
      realTime();
    });

    test("only calls made while in a battle's lineup appear on its board", async () => {
      const other = new Client(srv.base);
      await other.register("thor", "thor-pass-12", "Thor");
      const b2 = (await hs.post("/api/v1/battles", { title: "Other night", startsAt: P, rounds: 8, status: "open" })).json.battle;
      const a = (await other.post(`/api/v1/battles/${b2.id}/applications`, { kind: "bot", name: "Mjolnir", creatorName: "Thor" })).json.application;
      const thorBot = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
      const t = (await other.post(`/api/v1/entrants/${thorBot}/keys`, {})).json.token;
      at(R(6) + 30000);
      await asBot(t, "POST", "/api/v1/bot/calls", CALL);
      realTime();
      const ids = (await guest.get(`/api/v1/battles/${battle.id}/board`)).json.rounds[6].calls.map(c => c.entrantId);
      assert.ok(!ids.includes(thorBot), "not in Night one");
      assert.deepEqual((await guest.get(`/api/v1/battles/${b2.id}/board`)).json.rounds[6].calls.map(c => c.entrantId), [thorBot]);
    });
  });

  test("by default calls are open the whole round, until it ends", async () => {
    const b3 = (await hs.post("/api/v1/battles", { title: "All round", startsAt: P, rounds: 8, status: "open" })).json.battle;
    assert.equal(b3.callWindowMin, 15);
    const other = new Client(srv.base);
    await other.register("baldr", "baldr-pass-12", "Baldr");
    const a = (await other.post(`/api/v1/battles/${b3.id}/applications`, { kind: "bot", name: "Ringhorn", creatorName: "Baldr" })).json.application;
    const id = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    const t = (await other.post(`/api/v1/entrants/${id}/keys`, {})).json.token;
    at(R(5) + 15 * MIN - 1000);
    const ok = await asBot(t, "POST", "/api/v1/bot/calls", CALL);
    assert.deepEqual([ok.status, ok.json.call.round, ok.json.call.locksAt], [201, new Date(R(5)).toISOString(), new Date(R(6)).toISOString()], "one second before the round ends");
    at(R(6) + 14 * MIN);
    assert.equal((await asBot(t, "POST", "/api/v1/bot/calls", CALL)).json.call.round, new Date(R(6)).toISOString(), "14 minutes in, still this round");
    realTime();
  });

  describe("live", () => {
    test("arrivals are announced sealed; the close reveals every call to everyone", async () => {
      const gf = await feed(srv.base, guest, `battle:${battle.id}`);
      const of = await feed(srv.base, odin, `battle:${battle.id}`);
      at(R(7) + 2 * MIN);
      await asBot(token, "POST", "/api/v1/bot/calls", { ...CALL, direction: "down" });
      const g = await gf.next(e => e.event === "call.received");
      assert.deepEqual([g.data.entrantId, g.data.sealed, g.data.direction], [bot, true, undefined]);
      assert.equal((await of.next(e => e.event === "call.received")).data.direction, "down", "the owner sees their own");
      srv.app.arena.calls.lockDue(R(7) + 2 * MIN, R(7) + 4 * MIN);
      assert.equal(await gf.next(e => e.event === "round.locked", 300), null, "nothing locks before the close");
      at(R(7) + 5 * MIN);
      srv.app.arena.calls.lockDue(R(7) + 4 * MIN, R(7) + 5 * MIN);
      const locked = await gf.next(e => e.event === "round.locked");
      assert.equal(locked.data.round, R(7));
      assert.deepEqual(locked.data.calls.map(c => [c.entrantId, c.direction]), [[bot, "down"]]);
      realTime();
      gf.close(); of.close();
    });

    test("a result scores every call for the round, live", async () => {
      // Round 3 has finished. Put calls in during its window, then record its result.
      at(R(3) + 2 * MIN);
      await asBot(token, "POST", "/api/v1/bot/calls", { ...CALL, round: new Date(R(3)).toISOString() });
      await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down", round: new Date(R(3)).toISOString() });
      realTime();
      const gf = await feed(srv.base, guest, `battle:${battle.id},entrant:${caller}`);
      await hs.req("PUT", `/api/v1/battles/${battle.id}/rounds/${R(3)}/metrics`, { result: "up" });
      const ev = await gf.next(e => e.event === "round.scored" && e.topic === `battle:${battle.id}`);
      const byId = Object.fromEntries(ev.data.calls.map(c => [c.entrantId, c]));
      assert.deepEqual([byId[bot].correct, byId[caller].correct, byId[bot].verification], [true, false, "recorded by host"]);
      assert.ok(await gf.next(e => e.event === "round.scored" && e.topic === `entrant:${caller}`));
      const board = (await guest.get(`/api/v1/battles/${battle.id}/board`)).json;
      assert.deepEqual([board.rounds[3].result, board.rounds[3].verification], ["up", "recorded by host"]);
      // From step 5, Kalshi's result is "verified".
      srv.app.arena.ledger.append([{ t: "score", market: "KXBTC15M", round: R(3), result: "up", source: "kalshi" }], null);
      assert.equal((await guest.get(`/api/v1/entrants/${bot}/calls`)).json.calls.find(c => c.round === R(3)).verification, "verified");
      gf.close();
    });

    test("a sealed call never shows up in the entrant's verified stats", async () => {
      // Round 1 of the battle, with its result already known (as if HardSmoke had entered it early).
      srv.app.arena.ledger.append([{ t: "score", market: "KXBTC15M", round: R(1), result: "up", source: "host" }], null);
      const scored = () => srv.app.arena.verified.compute(bot, srv.app.arena.calls.now()).v_win_rate.n;
      at(R(1) + MIN);
      const before = scored();
      await asBot(token, "POST", "/api/v1/bot/calls", { ...CALL, round: new Date(R(1)).toISOString() });
      assert.equal(scored(), before, "still sealed: not counted, so no stat can give its direction away");
      at(R(1) + 5 * MIN);
      assert.equal(scored(), before + 1, "counted once its calls have closed");
      realTime();
    });
  });

  test("the pages are served", async () => {
    for (const p of ["/my", "/board", "/js/arena-my.js", "/js/arena-board.js"]) assert.equal((await guest.get(p)).status, 200, p);
    const c = (await guest.get("/api/v1/clock")).json;
    assert.equal(c.nextRound, nextRound(c.now));
  });
});

test("the timer reveals calls at each minute boundary, covering everything since its last wake", async () => {
  // A clock 120 ms before a minute boundary, running at real speed.
  const boundary = (Math.floor(Date.now() / MIN) + 10) * MIN, t0 = Date.now();
  const now = () => boundary - 120 + (Date.now() - t0);
  const ledger = Object.assign(new EventEmitter(), { lines: [] });
  const calls = new Calls({ ledger, registry: { entrantById: () => null, battlesFor: () => [] }, metrics: { result: () => null }, feed: { publish: () => {} }, now });
  const windows = [];
  calls.lockDue = (from, to) => windows.push([from, to]);
  calls.start();
  await new Promise(r => setTimeout(r, 400));
  calls.stop();
  assert.equal(windows.length, 1);
  assert.ok(windows[0][0] <= boundary - 100 && windows[0][1] >= boundary && windows[0][1] < boundary + 200, "fires just after the boundary and covers it");
});
