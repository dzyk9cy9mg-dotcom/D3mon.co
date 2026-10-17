// Tournaments step 1: the owner's "Join tournaments" switch. It counts from the next round, leaving
// keeps the rounds already played, and every switch is a ledger line.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client, readEvents } from "./helpers.js";
import { Tournaments } from "../server/arena/tournaments.js";
import { Ledger } from "../server/arena/ledger.js";

const Q = 15 * 60000, MIN = 60000;

describe("tournaments: the join switch", () => {
  let srv, hs, odin, freya, guest, bot, caller;
  const T0 = Math.floor(Date.now() / Q) * Q + 10 * Q; // a round start in the future, so the clock is ours
  const at = ms => { srv.app.arena.tournaments.now = () => ms; };
  const path = id => `/api/v1/entrants/${id}/tournaments`;
  const put = (c, id, body) => c.req("PUT", path(id), body);
  const lines = id => srv.app.arena.ledger.filter(l => l.t === "tournament_entry" && l.entrantId === id);

  before(async () => {
    srv = await startServer();
    [hs, odin, freya, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
    const battle = (await hs.post("/api/v1/battles", { title: "Entry", startsAt: Math.floor(Date.now() / Q) * Q + Q, status: "open" })).json.battle;
    const approve = async (c, body) => {
      const a = (await c.post(`/api/v1/battles/${battle.id}/applications`, body)).json.application;
      return (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
    };
    bot = await approve(odin, { kind: "bot", name: "Valhalla", creatorName: "Odin" });
    caller = await approve(freya, { kind: "caller", name: "Freya Calls", creatorName: "Freya" });
  });
  after(() => srv.stop());

  test("an entrant starts out of the tournaments", async () => {
    const r = await guest.get(path(bot));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.tournaments, { entrantId: bot, eligible: true, on: false, from: null, playingNow: false });
  });

  test("only the owner can flip the switch", async () => {
    assert.equal((await put(guest, bot, { on: true })).status, 401);
    assert.equal((await put(freya, bot, { on: true })).status, 403);
    assert.equal((await put(hs, bot, { on: true })).status, 403, "admins can't join a bot for its owner");
    assert.equal((await put(odin, bot, { on: "yes" })).status, 400);
    assert.equal((await put(odin, bot, { on: true, extra: 1 })).status, 400, "unknown fields are refused");
    assert.equal((await put(odin, "nosuchentrant1", { on: true })).status, 404);
    assert.equal(lines(bot).length, 0);
  });

  test("callers can't join yet", async () => {
    const r = await put(freya, caller, { on: true });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "kind_not_allowed");
    assert.equal((await guest.get(path(caller))).json.tournaments.eligible, false);
  });

  test("joining counts from the next round, not the one already open", async () => {
    at(T0 + 7 * MIN);
    const r = await put(odin, bot, { on: true });
    assert.equal(r.status, 200);
    assert.equal(r.json.tournaments.on, true);
    assert.equal(r.json.tournaments.from, T0 + Q);
    assert.equal(r.json.tournaments.playingNow, false);
    const t = srv.app.arena.tournaments;
    assert.equal(t.inAt(bot, T0), false, "the round it joined in doesn't count");
    assert.equal(t.inAt(bot, T0 + Q), true);
    assert.equal(t.inAt(bot, T0 + 50 * Q), true);
    assert.equal(lines(bot).length, 1);
    assert.equal(lines(bot)[0].by, odin.user.id, "recorded as the owner");
  });

  test("a repeat changes nothing and writes nothing", async () => {
    const r = await put(odin, bot, { on: true });
    assert.equal(r.status, 200);
    assert.equal(r.json.tournaments.unchanged, true);
    assert.equal(lines(bot).length, 1);
  });

  test("history is for the owner and admins only", async () => {
    assert.equal((await guest.get(path(bot))).json.tournaments.history, undefined);
    assert.equal((await freya.get(path(bot))).json.tournaments.history, undefined);
    assert.equal((await odin.get(path(bot))).json.tournaments.history.length, 1);
    assert.equal((await hs.get(path(bot))).json.tournaments.history.length, 1);
  });

  test("leaving keeps the rounds already played", async () => {
    at(T0 + 3 * Q + 2 * MIN);
    assert.equal((await odin.get(path(bot))).json.tournaments.playingNow, true);
    const r = await put(odin, bot, { on: false });
    assert.equal(r.json.tournaments.on, false);
    assert.equal(r.json.tournaments.from, T0 + 4 * Q);
    assert.equal(r.json.tournaments.playingNow, true, "it plays out the open round");
    const t = srv.app.arena.tournaments;
    for (const n of [1, 2, 3]) assert.equal(t.inAt(bot, T0 + n * Q), true, `round ${n} still counts`);
    assert.equal(t.inAt(bot, T0 + 4 * Q), false);
    assert.equal(t.inAt(bot, T0), false);
  });

  test("changing your mind within a round: the last switch wins", async () => {
    at(T0 + 6 * Q + MIN);
    await put(odin, bot, { on: true });
    at(T0 + 6 * Q + 2 * MIN);
    await put(odin, bot, { on: false });
    const t = srv.app.arena.tournaments;
    assert.equal(t.inAt(bot, T0 + 7 * Q), false);
    assert.equal(t.inAt(bot, T0 + 2 * Q), true, "older rounds are untouched");
  });

  test("the switch is announced on the entrant's live topic", async () => {
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=entrant:${bot}`, { signal: ac.signal });
    const it = readEvents(res.body);
    assert.equal((await it.next()).value.event, "hello");
    at(T0 + 8 * Q + MIN);
    await put(odin, bot, { on: true });
    let got = null;
    for (;;) { const e = (await it.next()).value; if (e.event === "entrant.tournaments") { got = JSON.parse(e.data); break; } }
    ac.abort();
    assert.equal(got.data.on, true);
    assert.equal(got.data.entrantId, bot);
    assert.equal(JSON.stringify(got).includes("history"), false, "a guest's event carries no history");
  });

  test("the switches come back from the ledger after a restart", () => {
    const ledger = new Ledger({ dir: srv.app.arena.ledger.dir });
    ledger.load(); // read back from disk
    const fresh = new Tournaments({ ledger, registry: srv.app.arena.registry, feed: srv.app.arena.feed });
    const t = srv.app.arena.tournaments;
    for (let n = 0; n < 12; n++) assert.equal(fresh.inAt(bot, T0 + n * Q), t.inAt(bot, T0 + n * Q), `round ${n}`);
  });
});
