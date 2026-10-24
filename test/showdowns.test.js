// Showdowns (owner, 2026-10-23): members call each other, or Kain and Abel, out to 1-on-1s on the 15-minute rounds.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000, MIN = 60000;

describe("Showdowns", () => {
  let srv, boss, freya, loki, odin, guest, duel, bro;
  const cur = Math.floor(Date.now() / Q) * Q;
  const sd = () => srv.app.arena.showdowns;
  const at = ms => { sd().now = () => ms; };
  const score = (round, result) => srv.app.arena.ledger.append([{ t: "score", market: "KXBTC15M", round, result, source: "kalshi" }], null);
  const view = async (c, id) => (await c.get(`/api/v1/showdowns/${id}`)).json.showdown;

  before(async () => {
    srv = await startServer();
    [boss, freya, loki, odin, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await boss.register("boss", "boss-pass-12", "Boss");
    await freya.register("freya", "freya-pass-1", "Freya");
    await loki.register("loki", "loki-pass-12", "Loki");
    await odin.register("odin", "odin-pass-12", "Odin");
  });
  after(() => srv.stop());

  test("the page is served", async () => {
    assert.equal((await fetch(`${srv.base}/showdown`)).status, 200);
  });

  test("a call out: guests can't, not yourself, not nobody, 1/3/5 rounds; the other player is told", async () => {
    at(cur + MIN);
    assert.equal((await guest.post("/api/v1/showdowns", { to: "loki", rounds: 3 })).status, 401);
    assert.equal((await freya.post("/api/v1/showdowns", { to: "freya", rounds: 3 })).status, 400);
    assert.equal((await freya.post("/api/v1/showdowns", { to: "nobody", rounds: 3 })).status, 404);
    assert.equal((await freya.post("/api/v1/showdowns", { to: "loki", rounds: 2 })).status, 400);
    assert.equal((await freya.post("/api/v1/showdowns", { to: "loki", rounds: 3, callMin: 7 })).status, 400, "the time rule is any time, 10, 5 or 2 minutes");
    const r = await freya.post("/api/v1/showdowns", { to: "loki", rounds: 3, message: "Your read is cooked", callMin: 5 });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    duel = r.json.showdown;
    assert.deepEqual([duel.state, duel.from.username, duel.to.username, duel.message], ["pending", "freya", "loki", "Your read is cooked"]);
    assert.equal((await freya.post("/api/v1/showdowns", { to: "loki", rounds: 1 })).status, 409, "one open Showdown per pair");
    const notes = (await loki.get("/api/v1/notifications")).json.notes;
    assert.match(notes[0].text, /Freya called you out to a 3-round Showdown \(calls close 5 minutes into each round\)/);
    assert.equal(duel.callMin, 5);
    assert.equal(notes[0].link, `showdown?id=${duel.sid}`);
    assert.equal((await loki.get("/api/v1/showdowns")).json.incoming[0].sid, duel.sid);
  });

  test("only the one called out answers; accepting starts it with the next round", async () => {
    assert.equal((await odin.post(`/api/v1/showdowns/${duel.sid}/answer`, { accept: true })).status, 403);
    assert.equal((await freya.post(`/api/v1/showdowns/${duel.sid}/answer`, { accept: true })).status, 403);
    const r = (await loki.post(`/api/v1/showdowns/${duel.sid}/answer`, { accept: true })).json.showdown;
    assert.deepEqual([r.state, r.startsAt, r.detail.length], ["starting", cur + Q, 3]);
    assert.match((await freya.get("/api/v1/notifications")).json.notes[0].text, /Loki accepted/);
  });

  test("calls: one per round in its first 5 minutes, sealed from the other side until then", async () => {
    const R = cur + Q;
    at(R + MIN);
    assert.equal((await odin.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "up" })).status, 403, "only the players");
    assert.equal((await freya.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "up" })).status, 200);
    assert.equal((await freya.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "up" })).json.unchanged, true);
    assert.equal((await freya.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "down" })).status, 409, "final when made");
    assert.equal((await view(loki, duel.sid)).detail[0].from.sealed, true, "Loki can't see it yet");
    assert.equal((await view(freya, duel.sid)).detail[0].from.dir, "up", "Freya sees her own");
    await loki.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "down" });
    at(R + 5 * MIN);
    assert.equal((await loki.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "up" })).status, 409, "calls close 5 minutes in");
    const v = await view(guest, duel.sid);
    assert.deepEqual([v.detail[0].from.dir, v.detail[0].to.dir], ["up", "down"], "everyone sees both once calls close");
    assert.equal(v.detail[0].from.intoMs, MIN, "when each call was made shows");
  });

  test("score: most right calls wins (a missed call counts as wrong), then it's closed once with a note", async () => {
    const R = cur + Q;
    at(R + Q + MIN); await freya.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "up" }); await loki.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "down" });
    at(R + 2 * Q + MIN); await loki.post(`/api/v1/showdowns/${duel.sid}/call`, { dir: "down" }); // Freya misses round 3
    score(R, "up"); score(R + Q, "up");
    at(R + 3 * Q + MIN);
    assert.equal((await view(guest, duel.sid)).state, "scoring", "waiting for the last result");
    score(R + 2 * Q, "down");
    await sd().tick(R + 3 * Q + MIN);
    const v = await view(guest, duel.sid);
    assert.deepEqual([v.state, v.score.from.right, v.score.to.right, v.winner], ["final", 2, 1, "from"], "Freya 2, Loki 1 (her missed call counts as wrong)");
    assert.equal(v.detail[2].from.missed, true);
    assert.match((await loki.get("/api/v1/notifications")).json.notes[0].text, /Freya beat Loki, 2–1/);
    await sd().tick(R + 3 * Q + 2 * MIN);
    assert.equal(srv.app.arena.ledger.lines.filter(l => l.t === "showdown_end" && l.sid === duel.sid).length, 1, "closed once");
    const rec = (await guest.get("/api/v1/showdowns?user=freya")).json;
    assert.deepEqual(rec.record, { wins: 1, losses: 0, draws: 0 });
    assert.deepEqual([rec.rivals[0].opponent.username, rec.rivals[0].wins], ["loki", 1]);
  });

  test("decline and block: a blocked member can't call you out again", async () => {
    at(cur + 5 * Q);
    const s = (await odin.post("/api/v1/showdowns", { to: "loki", rounds: 1 })).json.showdown;
    assert.equal((await loki.post(`/api/v1/showdowns/${s.sid}/answer`, { accept: false, block: true })).json.showdown.state, "declined");
    assert.equal((await odin.post("/api/v1/showdowns", { to: "loki", rounds: 1 })).status, 403);
    await loki.req("PUT", "/api/v1/showdowns/block", { username: "odin", on: false });
    const again = (await odin.post("/api/v1/showdowns", { to: "loki", rounds: 1 })).json.showdown;
    assert.equal((await loki.post(`/api/v1/showdowns/${again.sid}/cancel`)).status, 403, "only the challenger takes it back");
    assert.equal((await odin.post(`/api/v1/showdowns/${again.sid}/cancel`)).json.showdown.state, "cancelled");
    at(cur + 5 * Q + 2 * 3600000);
    const late = (await odin.post("/api/v1/showdowns", { to: "loki", rounds: 1 })).json.showdown;
    at(cur + 5 * Q + 4 * 3600000);
    assert.equal((await view(guest, late.sid)).state, "expired", "an hour to answer");
  });

  test("Kain accepts at once and talks smack; he makes his read early in each round and answers quick replies", async () => {
    const start = cur + 30 * Q;
    at(start - 3 * MIN);
    sd().rand = () => 0.1; // no price in tests: the coin says up
    const r = await freya.post("/api/v1/showdowns", { to: "kain", rounds: 1 });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    bro = r.json.showdown;
    assert.deepEqual([bro.state, bro.to.name, bro.to.ai, bro.startsAt], ["starting", "Kain", true, start]);
    assert.equal(bro.chat[0].who, "kain", "his opening line");
    await sd().tick(start + 10000);
    assert.equal((await view(guest, bro.sid)).detail[0].to, null, "not before 30 seconds in");
    await sd().tick(start + 40000);
    at(start + MIN);
    let v = await view(freya, bro.sid);
    assert.equal(v.detail[0].to.sealed, true, "his call is sealed from her until calls close");
    assert.ok(v.chat.some(x => x.who === "kain" && v.chat.indexOf(x) > 0), "he says he's locked in");
    await sd().tick(start + MIN);
    assert.match((await freya.get("/api/v1/notifications")).json.notes[0].text, /Round 1 of 1 is open: make your call vs Kain/, "a nudge on the bell");
    await freya.post(`/api/v1/showdowns/${bro.sid}/call`, { dir: "down" });
    await freya.post(`/api/v1/showdowns/${bro.sid}/say`, { quick: "lucky" });
    v = await view(freya, bro.sid);
    assert.deepEqual([v.chat.at(-2).text, v.chat.at(-2).ai, v.chat.at(-1).who], ["Lucky", false, "kain"], "he fires back");
    assert.equal((await freya.post(`/api/v1/showdowns/${bro.sid}/say`, { text: "again" })).status, 429, "a line every couple of seconds");
    assert.equal((await odin.post(`/api/v1/showdowns/${bro.sid}/say`, { text: "hi" })).status, 403, "only the players talk");
    score(start, "up");
    at(start + Q + MIN);
    await sd().tick(start + Q + MIN);
    v = await view(guest, bro.sid);
    assert.deepEqual([v.state, v.detail[0].to.dir, v.winner], ["final", "up", "to"], "Kain rode up and won");
    assert.ok(v.chat.filter(x => x.who === "kain").length >= 4, "he talked through it: start, call, the round, the end");
  });

  test("by default calls are open the whole round (owner, 2026-10-23), sealed until the round ends", async () => {
    at(cur + 80 * Q);
    const s0 = (await odin.post("/api/v1/showdowns", { to: "freya", rounds: 1 })).json.showdown;
    assert.deepEqual([s0.callMin, s0.anyTime], [15, true]);
    await freya.post(`/api/v1/showdowns/${s0.sid}/answer`, { accept: true });
    const R = cur + 81 * Q;
    at(R + 14 * MIN);
    assert.equal((await odin.post(`/api/v1/showdowns/${s0.sid}/call`, { dir: "up" })).status, 200, "14 minutes in is fine");
    const v = await view(freya, s0.sid);
    assert.deepEqual([v.detail[0].from.sealed, v.detail[0].from.intoMs], [true, 14 * MIN], "sealed, but when it came in shows");
    at(R + Q);
    assert.equal((await view(freya, s0.sid)).detail[0].from.dir, "up", "shown once the round is over");
  });

  test("limits: 3 open at a time", async () => {
    at(cur + 60 * Q);
    await boss.post("/api/v1/showdowns", { to: "kain", rounds: 5 });
    await boss.post("/api/v1/showdowns", { to: "abel", rounds: 5 });
    await boss.post("/api/v1/showdowns", { to: "odin", rounds: 5 });
    assert.equal((await boss.post("/api/v1/showdowns", { to: "loki", rounds: 5 })).status, 409);
  });

  test("Showdowns can't be read or written through /api/db", async () => {
    assert.notEqual((await boss.req("POST", "/api/db", { op: "query", collection: "arena_showdowns" })).status, 200);
  });
});
