// Member votes (docs/VOTES.md): paper trades at Kalshi's prices, cash out and re-enter, switches where allowed,
// live to everyone, badges, private records, and the admins' session controls.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000, MIN = 60000;

describe("member votes", () => {
  let srv, hs, odin, freya, loki, guest;
  const cur = Math.floor(Date.now() / Q) * Q;
  const votes = () => srv.app.arena.votes;
  let book; // the stand-in Kalshi book for the round
  const setBook = (yesAsk, yesBid) => { book = { round: cur, yesAsk, yesBid, noAsk: Math.round((1 - yesBid) * 100) / 100, noBid: Math.round((1 - yesAsk) * 100) / 100, source: "live" }; };
  const at = ms => { votes().now = () => ms; };
  before(async () => {
    srv = await startServer();
    [hs, odin, freya, loki, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
    await loki.register("loki", "loki-pass-12", "Loki");
    const approve = async (c, body) => (await hs.post(`/api/v1/applications/${(await c.post("/api/v1/applications", body)).json.application.id}/review`, { decision: "approve" })).json.application.entrantId;
    await approve(odin, { kind: "bot", name: "Valhalla", creatorName: "Odin" });
    votes().quote = async round => (book && book.round === round ? book : null);
    setBook(0.6, 0.58);
    at(cur + 2 * MIN);
  });
  after(() => srv.stop());

  test("guests can watch but must sign in to vote", async () => {
    assert.equal((await guest.req("POST", "/api/v1/votes", { dir: "up" })).status, 401);
    const r = await guest.get("/api/v1/votes/round");
    assert.equal(r.status, 200);
    assert.equal(r.json.split.entries, 0);
  });

  test("a vote is priced at Kalshi's ask, and one open vote per round", async () => {
    const r = await loki.post("/api/v1/votes", { dir: "up" });
    assert.equal(r.status, 201);
    assert.equal(r.json.vote.paid, 0.6);
    assert.equal(r.json.vote.status, "open");
    assert.equal((await loki.req("POST", "/api/v1/votes", { dir: "down" })).status, 409);
    assert.equal((await loki.req("POST", "/api/v1/votes", { dir: "sideways" })).status, 400);
  });

  test("cash out at Kalshi's bid, then re-enter: each is its own trade", async () => {
    setBook(0.7, 0.68); at(cur + 5 * MIN);
    const x = await loki.post("/api/v1/votes/exit", {});
    assert.equal(x.status, 200);
    assert.equal(x.json.vote.got, 0.68);
    assert.equal(x.json.vote.status, "cashed");
    assert.equal(x.json.vote.profit, 0.08);
    assert.equal((await loki.req("POST", "/api/v1/votes/exit", {})).status, 409);
    const again = await loki.post("/api/v1/votes", { dir: "down" });
    assert.equal(again.status, 201);
    assert.equal(again.json.vote.paid, 0.32); // NO's ask = 1 − YES's bid
    const round = (await loki.get("/api/v1/votes/round")).json;
    assert.equal(round.mine.length, 2);
    assert.equal(round.split.entries, 2);
    assert.deepEqual(round.actions.map(a => a.action), ["enter", "exit", "enter"]);
    assert.equal(round.actions[0].name, "Loki");
  });

  test("switching is refused while the session is locked", async () => {
    const r = await loki.req("POST", "/api/v1/votes/change", { dir: "up" });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, "locked");
  });

  test("only admins change a session; changeable sessions log a switch as a cash out and a new entry", async () => {
    assert.equal((await loki.req("PUT", "/api/v1/votes/sessions/live", { mode: "changeable" })).status, 403);
    assert.equal((await hs.req("PUT", "/api/v1/votes/sessions/live", { mode: "sometimes" })).status, 400);
    assert.equal((await hs.req("PUT", "/api/v1/votes/sessions/live", { mode: "changeable" })).status, 200);
    setBook(0.5, 0.48); at(cur + 7 * MIN);
    const r = await loki.post("/api/v1/votes/change", { dir: "up" });
    assert.equal(r.status, 200);
    assert.equal(r.json.vote.dir, "up");
    assert.equal(r.json.vote.paid, 0.5);
    const lines = srv.app.arena.ledger.lines.filter(l => l.t === "vote_exit" && l.switch);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].got, 0.5); // NO's bid = 1 − YES's ask
    const mine = (await loki.get("/api/v1/votes/round")).json.mine;
    assert.equal(mine.length, 3);
    assert.deepEqual(mine.map(t => t.status), ["cashed", "cashed", "open"]);
    await hs.req("PUT", "/api/v1/votes/sessions/live", { mode: "locked" });
  });

  test("badges: bot owners have one automatically, admins give one, and every badge entry is announced", async () => {
    const events = [];
    const orig = srv.app.arena.feed.publish.bind(srv.app.arena.feed);
    srv.app.arena.feed.publish = (topic, type, data, v) => { if (type === "votes.badge") events.push(data); return orig(topic, type, data, v); };
    try {
      await odin.post("/api/v1/votes", { dir: "down" });
      assert.equal(events.length, 1);
      assert.equal(events[0].name, "Odin");
      assert.equal(events[0].badge, "auto");
      await odin.post("/api/v1/votes/exit", {});
      await odin.post("/api/v1/votes", { dir: "up" }); // a re-entry is announced too
      assert.equal(events.length, 2);
      await freya.post("/api/v1/votes", { dir: "up" });
      assert.equal(events.length, 2); // no badge yet
      assert.equal((await loki.req("POST", "/api/v1/votes/badges", { username: "freya", on: true })).status, 403);
      assert.equal((await hs.req("POST", "/api/v1/votes/badges", { username: "freya", on: true })).json.badge, "admin");
      await freya.post("/api/v1/votes/exit", {});
      await freya.post("/api/v1/votes", { dir: "down" });
      assert.equal(events.length, 3);
    } finally { srv.app.arena.feed.publish = orig; }
  });

  test("voting can be turned off by category", async () => {
    await hs.req("PUT", "/api/v1/votes/sessions/live", { off: ["bots"] });
    await odin.post("/api/v1/votes/exit", {});
    const r = await odin.req("POST", "/api/v1/votes", { dir: "up" });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, "voting_off");
    assert.equal((await hs.req("PUT", "/api/v1/votes/sessions/live", { off: ["robots"] })).status, 400);
    await hs.req("PUT", "/api/v1/votes/sessions/live", { off: [] });
  });

  test("open trades settle at Kalshi's result; the record is private until its member shows it", async () => {
    srv.app.arena.ledger.append([{ t: "score", market: "KXBTC15M", round: cur, result: "up", source: "kalshi" }], null);
    at(cur + Q + MIN);
    const me = (await loki.get("/api/v1/votes/me")).json;
    // trades: up 0.60 -> cashed 0.68 (+0.08); down 0.32 -> switched out at 0.50 (+0.18); up 0.50 -> settled up (+0.50)
    assert.equal(me.record.calls, 3);
    assert.equal(me.record.wins, 3);
    assert.equal(me.record.successRate, 100);
    assert.equal(me.record.avgProfit, 0.2533);
    assert.equal(me.record.cashOuts, 1);
    assert.ok(me.record.avgCallMin > 2 && me.record.avgCallMin < 7);
    assert.equal((await guest.get("/api/v1/votes/members/loki")).json.private, true);
    assert.equal((await hs.get("/api/v1/votes/members/loki")).json.private, true); // admins read like members
    assert.equal((await loki.req("PUT", "/api/v1/votes/settings", { public: true })).status, 200);
    assert.equal((await guest.get("/api/v1/votes/members/loki")).json.record.calls, 3);
  });

  test("Capstone sessions: only on while they run, only with access, guest callers carry a badge", async () => {
    const start = cur + Q, sess = (await hs.post("/api/v1/vip/sessions", { title: "Friday Capstone", startsAt: start, minutes: 60 })).json.session;
    const S = `capstone:${sess.id}`;
    at(cur + Q - MIN);
    assert.equal((await hs.req("POST", "/api/v1/votes", { dir: "up", session: S })).json.error.code, "not_live");
    at(start + MIN); setBook(0.55, 0.53); book.round = start;
    assert.equal((await loki.req("POST", "/api/v1/votes", { dir: "up", session: S })).json.error.code, "no_access");
    assert.equal((await hs.req("PUT", `/api/v1/votes/sessions/${encodeURIComponent(S)}`, { guests: ["freya"] })).status, 200);
    assert.equal(votes().badge(votes().byUsername("freya"), S), "guest");
    const r = await hs.req("POST", "/api/v1/votes", { dir: "up", session: S });
    assert.equal(r.status, 201);
    assert.equal(r.json.round.session, S);
    assert.equal((await hs.req("PUT", "/api/v1/votes/sessions/live", { guests: ["freya"] })).status, 400);
  });

  test("member profiles: public basics and entrants; the record only when made public; never a password", async () => {
    const g = (await guest.get("/api/v1/members/odin")).json;
    assert.equal(g.name, "Odin");
    assert.equal(g.badge, "auto");
    assert.deepEqual(g.entrants.map(e => e.name), ["Valhalla"]);
    assert.equal(g.private, true);
    assert.equal(g.record, undefined);
    assert.ok(!JSON.stringify(g).includes("pass"));
    assert.equal((await odin.get("/api/v1/members/odin")).json.mine, true);
    assert.ok((await odin.get("/api/v1/members/odin")).json.record);
    assert.equal((await guest.get("/api/v1/members/loki")).json.record.calls, 3); // made public earlier
    assert.equal((await guest.req("GET", "/api/v1/members/nobody")).status, 404);
  });
});
