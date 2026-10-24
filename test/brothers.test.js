// Kain and Abel (owner, 2026-10-24): once a round ends, each brother takes a different random bot's call from that
// round (bot API calls only), shown as his own; which bot is for admins only. Members play against them with the
// floor's votes and see the standings side by side.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";
import { periodAt } from "../server/arena/tournaments.js";

const Q = 15 * 60000, MIN = 60000;
const CALL = dir => ({ schema: "d3mon.call/v1", market: "KXBTC15M", direction: dir });

describe("the brothers", () => {
  let srv, hs, owners, freya, guest, bots = [], tokens = [], caller;
  const cur = Math.floor(Date.now() / Q) * Q;
  const R = n => cur - n * Q; // n rounds ago
  const arena = () => srv.app.arena;
  const callsAt = ms => { arena().calls.now = () => ms; };
  const brosAt = ms => { arena().brothers.now = () => ms; };
  const asBot = (i, body) => fetch(`${srv.base}/api/v1/bot/calls`, {
    method: "POST", headers: { authorization: `Bearer ${tokens[i]}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(r => r.json());
  const score = (round, result) => arena().ledger.append([{ t: "score", market: "KXBTC15M", round, result, source: "kalshi" }], null);
  const price = (callId, paid) => arena().ledger.append([{ t: "call_price", callId, paid, side: "yes", source: "live" }], null);

  before(async () => {
    srv = await startServer();
    hs = new Client(srv.base); freya = new Client(srv.base); guest = new Client(srv.base);
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await freya.register("freya", "freya-pass-1", "Freya");
    owners = [];
    for (const [i, name] of ["Lion Bot", "Ketonk Bot", "Wok Bot"].entries()) {
      const c = new Client(srv.base);
      await c.register(`owner${i}`, `owner-pass-${i}1`, `Owner ${i}`);
      const a = (await c.post("/api/v1/applications", { kind: "bot", name, creatorName: `Owner ${i}` })).json.application;
      bots.push((await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId);
      tokens.push((await c.post(`/api/v1/entrants/${bots[i]}/keys`, {})).json.token);
      owners.push(c);
    }
    const a = (await freya.post("/api/v1/applications", { kind: "caller", name: "Freya Calls", creatorName: "Freya" })).json.application;
    caller = (await hs.post(`/api/v1/applications/${a.id}/review`, { decision: "approve" })).json.application.entrantId;
  });
  after(() => srv.stop());

  test("the Brothers' Desk page is served", async () => {
    const r = await fetch(`${srv.base}/brothers`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /js\/brothers\.js/);
  });

  test("no bot calls, no brothers' calls; one bot, only Abel plays", async () => {
    brosAt(R(8) + Q + 2000);
    assert.deepEqual(arena().brothers.pick(R(8)), []);
    callsAt(R(7) + MIN);
    await asBot(0, { ...CALL("up"), round: new Date(R(7)).toISOString() });
    brosAt(R(7) + Q + 2000);
    const lines = arena().brothers.pick(R(7));
    assert.deepEqual(lines.map(l => [l.brother, l.dir]), [["abel", "up"]]);
  });

  test("after the round ends, each brother still without a call takes a different bot's, only once", async () => {
    callsAt(R(6) + MIN);
    const sent = [];
    for (const [i, d] of ["up", "down", "down"].entries()) sent.push((await asBot(i, { ...CALL(d), round: new Date(R(6)).toISOString() })).call);
    brosAt(R(6) + Q - 1000);
    assert.deepEqual(arena().brothers.pick(R(6)), [], "not while the round is open");
    brosAt(R(6) + Q + 2000);
    const lines = arena().brothers.pick(R(6));
    assert.equal(lines.length, 2);
    const [abel, kain] = lines;
    assert.notEqual(abel.callId, kain.callId, "never the same bot");
    for (const l of lines) assert.equal(l.dir, sent.find(c => c.id === l.callId).direction, "his call is that bot's call");
    assert.deepEqual(arena().brothers.pick(R(6)), [], "picked once");
  });

  test("callers' calls and excluded bots are never picked; settings are for admins", async () => {
    assert.equal((await guest.get("/api/v1/brothers/settings")).status, 401);
    assert.equal((await freya.req("PUT", "/api/v1/brothers/settings", { exclude: [] })).status, 403);
    const s = await hs.req("PUT", "/api/v1/brothers/settings", { exclude: [bots[1], bots[2]] });
    assert.deepEqual(s.json.bots.filter(b => b.excluded).map(b => b.id).sort(), [bots[1], bots[2]].sort());
    assert.ok(!s.json.bots.some(b => b.kind === "caller"), "callers aren't listed");
    assert.equal((await hs.req("PUT", "/api/v1/brothers/settings", { exclude: ["nope"] })).status, 400);
    callsAt(R(5) + MIN);
    for (const i of [0, 1, 2]) await asBot(i, { ...CALL("down"), round: new Date(R(5)).toISOString() });
    await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "up", round: new Date(R(5)).toISOString() });
    brosAt(R(5) + Q + 2000);
    const lines = arena().brothers.pick(R(5));
    assert.deepEqual(lines.map(l => [l.brother, l.entrantId]), [["abel", bots[0]]], "only the one bot left in");
    await hs.req("PUT", "/api/v1/brothers/settings", { exclude: [] });
  });

  test("switched off, they sit out", async () => {
    await hs.req("PUT", "/api/v1/brothers/settings", { on: false });
    callsAt(R(4) + MIN);
    await asBot(0, { ...CALL("up"), round: new Date(R(4)).toISOString() });
    brosAt(R(4) + Q + 2000);
    assert.deepEqual(arena().brothers.pick(R(4)), []);
    await hs.req("PUT", "/api/v1/brothers/settings", { on: true });
  });

  test("everyone sees the brothers' calls, prices and results, never which bot; members see their own beside them", async () => {
    // Round 3: two bots call; Freya votes Up on the floor at 40¢.
    callsAt(R(3) + MIN);
    const a = (await asBot(0, { ...CALL("up"), round: new Date(R(3)).toISOString() })).call;
    const b = (await asBot(1, { ...CALL("down"), round: new Date(R(3)).toISOString() })).call;
    price(a.id, 0.4); price(b.id, 0.55);
    arena().votes.quote = async round => (round === R(3) ? { round, yesAsk: 0.4, yesBid: 0.38, noAsk: 0.62, noBid: 0.6, source: "live" } : null);
    arena().votes.now = () => R(3) + 2 * MIN;
    assert.equal((await freya.post("/api/v1/votes", { dir: "up" })).status, 201);
    arena().votes.now = () => Date.now();
    brosAt(R(3) + Q + 2000);
    const picked = arena().brothers.pick(R(3));
    score(R(3), "up");
    brosAt(Date.now());

    const g = (await guest.get("/api/v1/brothers")).json;
    assert.match(g.notice, /AI characters.*come from bots on D3MON/);
    assert.deepEqual(g.brothers.map(x => [x.key, x.ai]), [["abel", true], ["kain", true]]);
    const r3 = g.rounds.find(r => r.round === R(3));
    assert.equal(r3.result, "up");
    for (const l of picked) {
      const v = r3.calls[l.brother], paid = l.callId === a.id ? 0.4 : 0.55;
      assert.deepEqual([v.dir, v.paid, v.correct, v.profit], [l.dir, paid, l.dir === "up", l.dir === "up" ? 0.6 : -0.55]);
      assert.equal(v.from, undefined, "which bot stays hidden");
    }
    assert.equal(r3.you, undefined, "guests have no 'you'");
    assert.equal(g.standings.daily.you, undefined);

    const adminView = (await hs.get("/api/v1/brothers")).json.rounds.find(r => r.round === R(3));
    assert.ok(adminView.calls.abel.from.slug, "admins see which bot");

    const f = (await freya.get("/api/v1/brothers")).json;
    assert.deepEqual(f.rounds.find(r => r.round === R(3)).you, { trades: 1, dirs: ["up"], decided: true, won: true, profit: 0.6 });
    const month = periodAt("monthly", Date.now());
    if (R(3) >= month.startsAt) assert.deepEqual(f.standings.monthly.you, { played: 1, decided: 1, wins: 1, winRate: 100, profit: 0.6 });
    const abelRounds = [R(7), R(6), R(5), R(3)].filter(r => r >= month.startsAt).length;
    assert.equal(f.standings.monthly.abel.played, abelRounds, "every round Abel played this month");
  });

  test("the timer picks the round that just ended", async () => {
    callsAt(R(1) + MIN);
    await asBot(2, { ...CALL("down"), round: new Date(R(1)).toISOString() });
    brosAt(cur + 2000);
    arena().brothers.pickDue();
    assert.equal(arena().brothers.byRound.get(R(1)).abel.dir, "down");
    brosAt(Date.now());
    callsAt(Date.now());
  });

  test("intro videos: admins upload a real video file for each brother, everyone can play it, admins take it down", async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypisom"), Buffer.alloc(4000, 7)]);
    const put = (who, key, bytes) => fetch(`${srv.base}/api/v1/brothers/video/${key}`, { method: "PUT", headers: { "content-type": "video/mp4", ...(who.cookie ? { cookie: who.cookie } : {}) }, body: bytes });
    assert.equal((await put(guest, "kain", mp4)).status, 401);
    assert.equal((await put(freya, "kain", mp4)).status, 403, "members can't");
    assert.equal((await put(hs, "seth", mp4)).status, 404, "only the three spots");
    assert.equal((await put(hs, "both", mp4)).status, 200, "the middle video of both brothers");
    assert.equal((await guest.get("/api/v1/brothers")).json.videos.both.type, "video/mp4");
    assert.equal((await hs.req("DELETE", "/api/v1/brothers/video/both")).status, 200);
    assert.equal((await put(hs, "kain", Buffer.alloc(4000, 1))).status, 400, "not a video");
    const r = await put(hs, "kain", mp4);
    assert.equal(r.status, 200);
    const v = (await guest.get("/api/v1/brothers")).json.brothers;
    const kain = v.find(b => b.key === "kain");
    assert.equal(kain.video.type, "video/mp4");
    assert.equal(v.find(b => b.key === "abel").video, null);
    const got = await fetch(`${srv.base}/${kain.video.url}`, { headers: { range: "bytes=0-11" } });
    assert.equal(got.status, 206, "served in pieces, so phones can play it");
    assert.equal(Buffer.from(await got.arrayBuffer()).subarray(4, 8).toString(), "ftyp");
    assert.equal((await fetch(`${srv.base}/api/v1/brothers/video/abel`)).status, 404);
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(3000, 2)]);
    assert.equal((await put(hs, "kain", webm)).status, 200, "replacing it");
    assert.equal((await guest.get("/api/v1/brothers")).json.brothers.find(b => b.key === "kain").video.type, "video/webm");
    assert.equal((await freya.req("DELETE", "/api/v1/brothers/video/kain")).status, 403);
    assert.equal((await hs.req("DELETE", "/api/v1/brothers/video/kain")).status, 200);
    assert.equal((await guest.get("/api/v1/brothers")).json.brothers.find(b => b.key === "kain").video, null);
    assert.equal((await fetch(`${srv.base}/api/v1/brothers/video/kain`)).status, 404);
  });

  test("live (owner, 2026-10-23): a brother takes a bot's call the moment it comes in, never saying which bot; bots stay sealed", async () => {
    const r = R(40), latest = i => arena().calls.latest(bots[i], "KXBTC15M", r);
    callsAt(r + MIN); brosAt(r + 2 * MIN);
    assert.equal((await asBot(0, CALL("up"))).ok, true);
    const first = arena().brothers.takeLive(latest(0));
    assert.equal(first.length, 1, "the first bot's call goes to one brother at once");
    assert.deepEqual(arena().brothers.takeLive(latest(0)), [], "the same bot can't give both brothers a call");
    let v = (await guest.get("/api/v1/brothers")).json.now.calls;
    const took = first[0].brother, other = took === "kain" ? "abel" : "kain";
    assert.deepEqual([v[took].dir, v[took].from, v[other]], ["up", undefined, null], "everyone sees it live, without the bot");
    assert.ok((await hs.get("/api/v1/brothers")).json.now.calls[took].from, "admins see which bot");
    await asBot(1, CALL("down"));
    assert.equal(arena().brothers.takeLive(latest(1))[0].brother, other, "the next bot's call goes to the other brother");
    await asBot(2, CALL("down"));
    assert.deepEqual(arena().brothers.takeLive(latest(2)), [], "both have called");
    callsAt(r + 3 * MIN);
    const floor = (await guest.get(`/api/v1/rounds/${r}/calls`)).json;
    assert.ok(floor.calls.filter(c => bots.includes(c.entrantId)).every(c => c.sealed && !c.direction), "the bots themselves stay sealed");
    assert.deepEqual(floor.crowd, { called: 3, up: 1, down: 2, min: 3 }, "three bots: the totals show");
    brosAt(r + Q + MIN);
    assert.deepEqual(arena().brothers.pick(r), [], "nothing left to pick after the round");
    brosAt(r + 2 * MIN); callsAt(r + 2 * MIN);
    arena().brothers.cfg = { ...arena().brothers.cfg, on: false };
    assert.deepEqual(arena().brothers.takeLive(latest(2)), [], "switched off: no live calls");
    arena().brothers.cfg = { ...arena().brothers.cfg, on: true };
    // on a running server the ledger hands each bot call over by itself
    const r2 = R(42); callsAt(r2 + MIN); brosAt(r2 + MIN); arena().brothers.live = true;
    await asBot(0, CALL("down"));
    await new Promise(res => setImmediate(res));
    arena().brothers.live = false;
    assert.equal(Object.values((await guest.get("/api/v1/brothers")).json.now.calls).filter(Boolean)[0]?.dir, "down", "taken automatically");
  });

  test("the Capstone room shows a featured bot's call the moment it comes in; everyone else waits", async () => {
    const r = R(41);
    callsAt(r + MIN); arena().vip.now = () => r + 2 * MIN;
    await asBot(2, CALL("up"));
    callsAt(r + 2 * MIN);
    assert.equal((await hs.req("PUT", "/api/v1/vip/featured", { entrantIds: [bots[2]] })).status, 200);
    assert.equal((await hs.post("/api/v1/vip/access", { username: "freya", days: 1 })).status < 300, true);
    const room = (await freya.get("/api/v1/vip/room")).json;
    assert.deepEqual(room.calls.map(c => [c.entrantId, c.direction, c.early]), [[bots[2], "up", true]]);
    assert.equal((await guest.get(`/api/v1/rounds/${r}/calls`)).json.calls.find(c => c.entrantId === bots[2]).sealed, true);
  });
});
