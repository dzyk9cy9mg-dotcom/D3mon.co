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

// Tournaments step 2: joining D3MON without a battle. An admin approves each new entrant.
describe("tournaments: joining without a battle", () => {
  let srv, hs, odin, freya, guest;
  const join = (c, body) => c.post("/api/v1/applications", body);
  const review = (c, id, decision, note) => c.post(`/api/v1/applications/${id}/review`, { decision, ...(note ? { note } : {}) });

  before(async () => {
    srv = await startServer();
    [hs, odin, freya, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
  });
  after(() => srv.stop());

  test("a member applies to join with a new bot", async () => {
    assert.equal((await join(guest, { kind: "bot", name: "Sleipnir", creatorName: "Odin" })).status, 401);
    assert.equal((await join(odin, { name: "Sleipnir", creatorName: "Odin" })).json.error.field, "kind");
    assert.equal((await join(odin, { kind: "bot", creatorName: "Odin" })).json.error.field, "name");
    assert.equal((await join(odin, { kind: "bot", name: "Sleipnir", creatorName: "Odin", entrantId: "abcdefgh12" })).status, 400, "joining is for new entrants only");
    assert.equal((await join(odin, { kind: "bot", name: "Sleipnir", creatorName: "Odin", notes: "my key is sk-ant-abcdefghijklmnopqrstuvwxyz0123" })).status, 400, "credentials are refused");
    const r = await join(odin, { kind: "bot", name: "Sleipnir", creatorName: "Odin", discordServer: "Asgard" });
    assert.equal(r.status, 201);
    assert.equal(r.json.application.battleId, null);
    assert.equal(r.json.application.status, "pending");
    assert.equal((await join(odin, { kind: "bot", name: "sleipnir!", creatorName: "Odin" })).json.error.code, "already_applied");
    assert.equal((await join(freya, { kind: "bot", name: "Sleipnir", creatorName: "Freya" })).json.error.code, "already_applied");
  });

  test("only admins see every application and decide", async () => {
    const mine = (await odin.get("/api/v1/applications")).json.applications;
    assert.equal(mine.length, 1);
    assert.equal((await freya.get("/api/v1/applications")).json.applications.length, 0);
    const all = (await hs.get("/api/v1/applications")).json.applications;
    assert.equal(all.length, 1);
    assert.equal((await review(odin, mine[0].id, "approve")).status, 403, "you can't approve your own");
  });

  test("approval saves the entrant, ready for keys and tournaments", async () => {
    const app = (await hs.get("/api/v1/applications")).json.applications[0];
    const r = await review(hs, app.id, "approve", "Welcome");
    assert.equal(r.status, 200);
    assert.equal(r.json.application.status, "approved");
    const id = r.json.application.entrantId;
    assert.ok(id);
    const e = (await odin.get("/api/v1/entrants?mine=1")).json.entrants.find(x => x.id === id);
    assert.equal(e.name, "Sleipnir");
    assert.deepEqual(e.battles, []);
    assert.equal(e.discordServer, "Asgard");
    assert.equal((await odin.post(`/api/v1/entrants/${id}/keys`, { label: "server" })).status, 201);
    assert.equal((await odin.req("PUT", `/api/v1/entrants/${id}/tournaments`, { on: true })).status, 200);
    assert.equal((await review(hs, app.id, "approve")).json.error.code, "bad_state", "approved once");
  });

  test("a name already joined can't be used again", async () => {
    assert.equal((await join(odin, { kind: "bot", name: "Sleipnir", creatorName: "Odin" })).json.error.code, "already_joined");
    assert.equal((await join(freya, { kind: "script", name: "Sleipnir", creatorName: "Freya" })).json.error.code, "name_taken");
  });

  test("rejecting, reopening and withdrawing work as for battles", async () => {
    const a = (await join(freya, { kind: "script", name: "Brisingamen", creatorName: "Freya" })).json.application;
    const rj = await review(hs, a.id, "reject", "Tell us more");
    assert.equal(rj.json.application.status, "rejected");
    assert.equal(rj.json.application.reviewNote, "Tell us more");
    assert.equal((await review(hs, a.id, "reopen")).json.application.status, "pending");
    const w = await freya.post(`/api/v1/applications/${a.id}/withdraw`, {});
    assert.equal(w.json.application.status, "withdrawn");
    assert.deepEqual(w.json.application.history.map(h => h.action), ["submitted", "rejected", "reopened", "withdrawn"]);
    assert.equal((await freya.get("/api/v1/entrants?mine=1")).json.entrants.length, 0, "no entrant without approval");
    assert.equal((await join(freya, { kind: "script", name: "Brisingamen", creatorName: "Freya" })).status, 201, "a withdrawn name can apply again");
  });

  test("a battle that's over takes no applications", async () => {
    const Q = 15 * 60000;
    const past = (await hs.post("/api/v1/battles", { title: "Last week", startsAt: Math.floor(Date.now() / Q) * Q - 3 * Q, rounds: 2, status: "open" })).json.battle;
    const r = await odin.post(`/api/v1/battles/${past.id}/applications`, { kind: "bot", name: "Late Bot", creatorName: "Odin" });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.message, "This battle is over.");
  });

  test("a battle shows as over once its last round ends, without changing its status", async () => {
    const Q = 15 * 60000, now = Math.floor(Date.now() / Q) * Q;
    const mk = body => hs.post("/api/v1/battles", { title: "State test", ...body }).then(r => r.json.battle);
    const ended = await mk({ startsAt: now - 4 * Q, rounds: 2, status: "live" });
    const running = await mk({ startsAt: now - Q, rounds: 4, status: "live" });
    const soon = await mk({ startsAt: now + Q, status: "open" });
    const oldDraft = await mk({ startsAt: now - 9 * Q, rounds: 1 });
    const view = async id => (await hs.get(`/api/v1/battles/${id}`)).json.battle;
    const e = await view(ended.id);
    assert.equal(e.state, "over");
    assert.equal(e.status, "live", "the stored status is untouched");
    assert.equal(e.over, true);
    assert.equal((await view(running.id)).state, "live");
    assert.equal((await view(soon.id)).state, "open");
    assert.equal((await view(oldDraft.id)).state, "draft", "a draft stays a draft");
    await hs.req("PATCH", `/api/v1/battles/${ended.id}`, { status: "final" });
    assert.equal((await view(ended.id)).state, "final");
  });

  test("an application to a battle that's over can't be withdrawn", async () => {
    const Q = 15 * 60000, start = Math.floor(Date.now() / Q) * Q + Q;
    const b = (await hs.post("/api/v1/battles", { title: "Short one", startsAt: start, rounds: 1, status: "open" })).json.battle;
    const a = (await freya.post(`/api/v1/battles/${b.id}/applications`, { kind: "caller", name: "Freya Reads", creatorName: "Freya" })).json.application;
    const real = Date.now;
    Date.now = () => start + 2 * Q; // the battle has ended
    try {
      const r = await freya.post(`/api/v1/applications/${a.id}/withdraw`, {});
      assert.equal(r.json.error.code, "battle_started");
    } finally { Date.now = real; }
  });

  test("a joined entrant can still be entered in a battle", async () => {
    const Q = 15 * 60000;
    const battle = (await hs.post("/api/v1/battles", { title: "Special event", startsAt: Math.floor(Date.now() / Q) * Q + Q, status: "open" })).json.battle;
    const id = (await odin.get("/api/v1/entrants?mine=1")).json.entrants[0].id;
    const a = (await odin.post(`/api/v1/battles/${battle.id}/applications`, { entrantId: id, creatorName: "Odin" })).json.application;
    const r = await review(hs, a.id, "approve");
    assert.equal(r.json.application.entrantId, id);
    assert.deepEqual((await odin.get(`/api/v1/entrants/${id}`)).json.entrant.battles, [battle.id]);
  });
});

// Tournaments step 3: standings, worked out from calls and Kalshi's results.
describe("tournaments: standings", () => {
  let srv, hs, owners, ids = {}, keys = {};
  const H0 = Date.UTC(2026, 9, 10, 16); // noon Eastern on Saturday 2026-10-10: hourly-2026-10-10T12
  const R = n => H0 + n * Q;
  const arena = () => srv.app.arena;
  const bot = (tok, body) => fetch(srv.base + "/api/v1/bot/calls", { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json() }));
  const call = async (name, n, direction, min = 2) => {
    arena().calls.now = () => R(n) + min * MIN;
    const r = await bot(keys[name], { schema: "d3mon.call/v1", market: "KXBTC15M", direction });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  };
  const settle = (n, result, source = "kalshi") => arena().ledger.append([{ t: "score", market: "KXBTC15M", round: R(n), result, source }], null);
  const get = (c, id) => c.get(`/api/v1/tournaments/${id}`);

  before(async () => {
    srv = await startServer();
    hs = new Client(srv.base);
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    owners = {};
    // A, B, G, H are bots; C is a script; E joins late; D is a caller (can't join).
    for (const [name, kind] of [["Alpha", "bot"], ["Bravo", "bot"], ["Charlie", "script"], ["Delta", "caller"], ["Echo", "bot"], ["Golf", "bot"], ["Hotel", "bot"]]) {
      const c = owners[name] = new Client(srv.base);
      await c.register(name.toLowerCase(), `${name.toLowerCase()}-pass-1`, name);
      const a = (await c.post("/api/v1/applications", { kind, name, creatorName: name })).json.application;
      ids[name] = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
      if (kind !== "caller") keys[name] = (await c.post(`/api/v1/entrants/${ids[name]}/keys`, {})).json.token;
    }
    arena().tournaments.now = () => H0 - 5 * MIN;
    for (const name of ["Alpha", "Bravo", "Charlie", "Golf", "Hotel"]) assert.equal((await owners[name].req("PUT", `/api/v1/entrants/${ids[name]}/tournaments`, { on: true })).status, 200);
    arena().tournaments.now = () => R(1) + 5 * MIN;
    await owners.Echo.req("PUT", `/api/v1/entrants/${ids.Echo}/tournaments`, { on: true }); // counts from R(2)

    for (const [n, d] of [[0, "up"], [1, "up"], [2, "down"], [3, "up"]]) await call("Alpha", n, d);
    for (const [n, d] of [[0, "up"], [2, "down"], [3, "down"]]) await call("Bravo", n, d); // misses R(1)
    for (const n of [0, 1, 2, 3]) await call("Charlie", n, "down");
    for (const [n, d] of [[2, "up"], [3, "up"]]) await call("Echo", n, d);
    for (const name of ["Golf", "Hotel"]) for (const [n, d] of [[0, "up"], [1, "down"], [2, "down"]]) await call(name, n, d, 1); // same calls at the same times, earlier than Bravo: only accuracy puts Bravo ahead
    await call("Echo", 1, "up"); // made before Echo's tournament entry counts: ignored
    // A caller's entry line can only come from outside the API; standings still leave callers out.
    arena().ledger.append([{ t: "tournament_entry", entrantId: ids.Delta, on: true, from: H0 }], null);
    settle(0, "up"); settle(1, "up"); settle(2, "down");
    settle(3, "down", "host"); // entered by hand only: doesn't count
    arena().calls.now = () => Date.now();
  });
  after(() => srv.stop());

  test("the four current tournaments", async () => {
    arena().tournaments.now = () => R(2) + 3 * MIN;
    const r = await hs.get("/api/v1/tournaments");
    assert.equal(r.status, 200);
    assert.equal(r.json.timeZone, "America/New_York");
    assert.match(r.json.notice, /Not financial advice/);
    assert.deepEqual(r.json.tournaments.map(t => t.id), ["hourly-2026-10-10T12", "daily-2026-10-10", "weekly-2026-10-05", "monthly-2026-10"]);
    const [hourly, daily, weekly, monthly] = r.json.tournaments;
    assert.equal(hourly.startsAt, H0);
    assert.equal(hourly.rounds, 4);
    assert.equal(daily.rounds, 96);
    assert.equal(weekly.rounds, 672);
    assert.equal(monthly.rounds, 31 * 96);
    assert.ok(r.json.tournaments.every(t => t.status === "live"));
  });

  test("standings: most correct, then accuracy, then the earlier call; Kalshi results only", async () => {
    arena().tournaments.now = () => H0 + 3600000 + MIN; // the hour is over
    const r = await new Client(srv.base).get("/api/v1/tournaments/hourly-2026-10-10T12"); // public
    assert.equal(r.status, 200);
    const t = r.json.tournament;
    assert.equal(t.status, "final");
    assert.equal(t.settledRounds, 3, "R(3) only has a result entered by hand");
    assert.match(t.notice, /D3MON never trades/);
    const rows = Object.fromEntries(t.standings.map(x => [x.entrant.name, x]));
    assert.deepEqual(t.standings.map(x => [x.entrant.name, x.rank]), [["Alpha", 1], ["Bravo", 2], ["Golf", 3], ["Hotel", 3], ["Charlie", 5], ["Echo", 6]]);
    assert.deepEqual({ ...rows.Alpha, entrant: undefined, avgLeadMs: undefined }, { entrant: undefined, played: 3, calls: 3, correct: 3, wrong: 0, missed: 0, accuracy: 1, avgLeadMs: undefined, rank: 1 });
    assert.equal(rows.Alpha.avgLeadMs, 13 * MIN, "called 2 minutes in, calls close at the round's end");
    assert.deepEqual([rows.Bravo.played, rows.Bravo.calls, rows.Bravo.missed, rows.Bravo.correct], [3, 2, 1, 2]);
    assert.equal(rows.Golf.accuracy, 2 / 3);
    assert.deepEqual([rows.Echo.played, rows.Echo.calls, rows.Echo.correct], [1, 1, 0], "only rounds after it joined");
    assert.equal(rows.Delta, undefined, "callers can't join");
    assert.deepEqual(Object.keys(rows.Alpha.entrant).sort(), ["creatorName", "id", "kind", "name", "slug"]);
  });

  test("the daily and longer tournaments add up the same rounds", async () => {
    for (const id of ["daily-2026-10-10", "weekly-2026-10-05", "monthly-2026-10"]) {
      const t = (await hs.get(`/api/v1/tournaments/${id}`)).json.tournament;
      assert.equal(t.standings[0].entrant.name, "Alpha", id);
      assert.equal(t.standings[0].correct, 3, id);
      assert.equal(t.status, "live", id);
    }
  });

  test("a Kalshi correction moves the standings; a suspended or departed bot keeps its rounds", async () => {
    settle(2, "up"); // Kalshi corrects R(2)
    let rows = (await get(hs, "hourly-2026-10-10T12")).json.tournament.standings;
    assert.equal(rows.find(x => x.entrant.name === "Alpha").correct, 2);
    assert.equal(rows.find(x => x.entrant.name === "Echo").correct, 1);
    settle(2, "down");
    arena().tournaments.now = () => R(3) + MIN;
    await owners.Bravo.req("PUT", `/api/v1/entrants/${ids.Bravo}/tournaments`, { on: false }); // leaves from R(4)
    arena().tournaments.now = () => H0 + 3600000 + MIN;
    rows = (await get(hs, "hourly-2026-10-10T12")).json.tournament.standings;
    assert.equal(rows.find(x => x.entrant.name === "Bravo").correct, 2, "leaving keeps the rounds played");
  });

  test("previous and next tournaments, and a live nudge when standings change", async () => {
    arena().tournaments.now = () => H0 + 3600000 + MIN;
    const t = (await get(hs, "hourly-2026-10-10T12")).json.tournament;
    assert.equal(t.previous, "hourly-2026-10-10T11");
    assert.equal(t.next, "hourly-2026-10-10T13");
    const d = (await get(hs, "daily-2026-10-10")).json.tournament;
    assert.equal(d.previous, "daily-2026-10-09");
    assert.equal(d.next, null, "a live tournament has no next yet");
    const ac = new AbortController();
    const res = await fetch(`${srv.base}/api/v1/feed?topics=tournaments`, { signal: ac.signal });
    const it = readEvents(res.body);
    assert.equal((await it.next()).value.event, "hello");
    settle(5, "up");
    let e;
    do e = (await it.next()).value; while (e.event !== "tournament.updated");
    ac.abort();
    assert.deepEqual(JSON.parse(e.data).data.reason, ["score"]);
  });

  test("unknown and future tournaments are 404", async () => {
    for (const id of ["hourly-2026-10-10", "daily-2026-13-01", "weekly-2026-10-06", "yearly-2026", "daily-2099-01-01"]) assert.equal((await get(hs, id)).status, 404, id);
  });
});
