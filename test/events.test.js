// HardSmoke's battles and the community (owner, 2026-10-19): stream links on a battle, battle results and
// winner badges, an owner's profile fields (tagline, shop, stream), "who's here now", and capstone sessions.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000, MIN = 60000;

describe("battles, profiles, presence and capstone sessions", () => {
  let srv, hs, odin, freya, loki, guest, battle, bot, caller, botKey;
  const cur = Math.floor(Date.now() / Q) * Q, R = n => cur - 2 * Q + n * Q; // the battle's rounds: R(0), R(1), R(2) = now
  const arena = () => srv.app.arena;
  const settle = (n, result, source = "kalshi") => arena().ledger.append([{ t: "score", market: "KXBTC15M", round: R(n), result, source }], null);
  const botCall = (direction, round) => fetch(srv.base + "/api/v1/bot/calls", { method: "POST", headers: { authorization: `Bearer ${botKey}`, "content-type": "application/json" },
    body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction, round: new Date(round).toISOString() }) });
  before(async () => {
    srv = await startServer();
    [hs, odin, freya, loki, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
    await loki.register("loki", "loki-pass-12", "Loki");
    battle = (await hs.post("/api/v1/battles", { title: "Saturday battle", startsAt: R(0), rounds: 3, status: "open" })).json.battle;
    const enter = async (c, body) => (await hs.post(`/api/v1/applications/${(await c.post(`/api/v1/battles/${battle.id}/applications`, body)).json.application.id}/review`, { decision: "approve" })).json.application.entrantId;
    bot = await enter(odin, { kind: "bot", name: "Valhalla", creatorName: "Odin" });
    caller = await enter(freya, { kind: "caller", name: "Freya Calls", creatorName: "Freya" });
    botKey = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
  });
  after(() => srv.stop());

  test("a battle carries stream links, on stream sites only", async () => {
    assert.equal((await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { streams: [{ label: "Elsewhere", url: "https://example.com/live" }] })).status, 400);
    assert.equal((await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { streams: [{ label: "Plain", url: "http://twitch.tv/hardsmoke" }] })).status, 400, "https only");
    assert.equal((await odin.req("PATCH", `/api/v1/battles/${battle.id}`, { streams: [] })).status, 403, "admins only");
    const r = await hs.req("PATCH", `/api/v1/battles/${battle.id}`, { streams: [{ label: "HardSmoke", url: "https://www.twitch.tv/hardsmoke" }, { label: "D3MON Discord", url: "https://discord.gg/d3mon" }] });
    assert.equal(r.status, 200);
    const pub = (await guest.get(`/api/v1/battles/${battle.id}`)).json.battle;
    assert.deepEqual(pub.streams.map(s => s.label), ["HardSmoke", "D3MON Discord"]);
  });

  test("results rank by correct calls in rounds Kalshi settled; the winner gets a badge once it's final", async () => {
    arena().calls.now = () => R(0) + MIN;
    assert.equal((await botCall("up", R(0))).status, 201);
    assert.equal((await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down", round: new Date(R(0)).toISOString() })).status, 201);
    arena().calls.now = () => R(1) + MIN;
    assert.equal((await botCall("down", R(1))).status, 201);
    assert.equal((await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down", round: new Date(R(1)).toISOString() })).status, 201);
    settle(0, "up"); settle(1, "down");
    settle(2, "down", "host"); // entered by hand only: doesn't count

    arena().results.now = () => R(2) + MIN; // still on
    let r = (await guest.get(`/api/v1/battles/${battle.id}/results`)).json;
    assert.equal(r.status, "live");
    assert.deepEqual(r.winners, [], "no winner until it's final");
    assert.deepEqual(r.standings.map(x => [x.entrant.name, x.correct, x.rank]), [["Valhalla", 2, 1], ["Freya Calls", 1, 2]]);
    assert.match(r.notice, /Not financial advice/);
    assert.equal((await guest.get(`/api/v1/entrants/${bot}`)).json.entrant.badges.length, 0);

    arena().results.now = () => R(3) + 10 * MIN; // over, R(2) not settled by Kalshi yet
    assert.equal((await guest.get(`/api/v1/battles/${battle.id}/results`)).json.status, "scoring");

    arena().results.now = () => R(3) + 31 * MIN; // 30 minutes after the end: final
    r = (await guest.get(`/api/v1/battles/${battle.id}/results`)).json;
    assert.equal(r.status, "final");
    assert.deepEqual(r.winners, [bot]);
    const badges = (await guest.get("/api/v1/entrants/valhalla")).json.entrant.badges;
    assert.deepEqual(badges.map(b => [b.kind, b.title]), [["battle_winner", "Saturday battle"]]);
    assert.equal((await guest.get(`/api/v1/entrants/${caller}`)).json.entrant.badges.length, 0);
  });

  test("owners write their profile's tagline, shop and stream; admins can only clear them", async () => {
    const put = (c, body) => c.req("PUT", `/api/v1/entrants/${bot}/profile`, body);
    assert.equal((await put(guest, { tagline: "x" })).status, 401);
    assert.equal((await put(freya, { tagline: "Not mine" })).status, 404);
    assert.equal((await put(odin, { shopUrl: "http://shop.example/valhalla" })).status, 400, "https only");
    assert.equal((await put(odin, { streamUrl: "https://example.com/live" })).status, 400, "streams on stream sites only");
    assert.equal((await put(odin, { colour: "blue" })).status, 400, "unknown fields are refused");
    const r = await put(odin, { tagline: "Trend first, then the crowd.", shopUrl: "https://shop.example/valhalla?ref=d3mon", streamUrl: "https://www.youtube.com/@valhalla" });
    assert.equal(r.status, 200);
    const pub = (await guest.get("/api/v1/entrants/valhalla")).json.entrant;
    assert.equal(pub.tagline, "Trend first, then the crowd.");
    assert.equal(pub.shopUrl, "https://shop.example/valhalla?ref=d3mon");
    assert.equal(pub.streamUrl, "https://www.youtube.com/@valhalla");
    assert.equal((await put(hs, { tagline: "Admin words" })).status, 403);
    assert.equal((await put(hs, { shopUrl: "" })).status, 200, "an admin can take a link down");
    const after = (await guest.get("/api/v1/entrants/valhalla")).json.entrant;
    assert.equal(after.shopUrl, "");
    assert.equal(after.tagline, "Trend first, then the crowd.", "the rest stays");
  });

  test("who's here now counts open pages, never who", async () => {
    const before = (await guest.get("/api/v1/presence")).json;
    assert.deepEqual(Object.keys(before).sort(), ["here", "members"]);
    const ac = new AbortController();
    const res = await fetch(srv.base + "/api/v1/feed?topics=tournaments", { headers: { cookie: freya.cookie || "" }, signal: ac.signal });
    assert.equal(res.status, 200);
    const now = (await guest.get("/api/v1/presence")).json;
    assert.equal(now.here, before.here + 1);
    ac.abort();
  });

  test("admins schedule capstone sessions; the schedule is public", async () => {
    const start = Math.floor(Date.now() / Q) * Q + 4 * Q;
    assert.equal((await loki.post("/api/v1/vip/sessions", { title: "Tuesday capstone", startsAt: start })).status, 403);
    assert.equal((await hs.post("/api/v1/vip/sessions", { title: "Long gone", startsAt: start - 30 * Q, minutes: 60 })).status, 400);
    assert.equal((await hs.post("/api/v1/vip/sessions", { title: "Too short", startsAt: start, minutes: 5 })).status, 400);
    const r = await hs.post("/api/v1/vip/sessions", { title: "Tuesday capstone", startsAt: start, minutes: 90, leads: "Freya Calls with Valhalla" });
    assert.equal(r.status, 201);
    let pub = (await guest.get("/api/v1/vip/sessions")).json;
    assert.deepEqual(pub.upcoming.map(s => [s.title, s.minutes, s.leads, s.endsAt - s.startsAt]), [["Tuesday capstone", 90, "Freya Calls with Valhalla", 90 * MIN]]);
    assert.equal((await loki.req("DELETE", `/api/v1/vip/sessions/${r.json.session.id}`)).status, 403);
    assert.equal((await hs.req("DELETE", `/api/v1/vip/sessions/${r.json.session.id}`)).status, 200);
    pub = (await guest.get("/api/v1/vip/sessions")).json;
    assert.equal(pub.upcoming.length, 0);
  });
});
