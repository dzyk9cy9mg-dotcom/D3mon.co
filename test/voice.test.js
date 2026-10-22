// D3MON's own voice and video rooms: the server only introduces browsers. Capstone access only, six at a time, one
// place per person, each connection message delivered to its one peer, quiet peers dropped, TURN logins made from
// the shared secret without ever sending it.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { startServer, Client, readEvents } from "./helpers.js";

async function feed(client, topics) {
  const ac = new AbortController();
  const res = await fetch(`${client.base}/api/v1/feed?topics=${encodeURIComponent(topics)}`, { headers: client.cookie ? { cookie: client.cookie } : {}, signal: ac.signal });
  if (res.status !== 200) { ac.abort(); return { status: res.status }; }
  const queue = [];
  let wake = null;
  (async () => { try { for await (const e of readEvents(res.body)) { queue.push({ event: e.event, ...JSON.parse(e.data) }); if (wake) wake(); } } catch {} })();
  async function next(match, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = queue.findIndex(match);
      if (i >= 0) return queue.splice(i, 1)[0];
      const left = deadline - Date.now();
      if (left <= 0) return null;
      await new Promise(r => { const t = setTimeout(r, left); wake = () => { clearTimeout(t); wake = null; r(); }; });
    }
  }
  await next(e => e.event === "hello");
  return { status: 200, next, queue, close: () => ac.abort() };
}

describe("voice rooms", () => {
  let srv, boss, freya, odin, loki, guest;
  before(async () => {
    srv = await startServer();
    [boss, freya, odin, loki, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await boss.register("boss", "boss-pass-12", "Boss");
    await freya.register("freya", "freya-pass-12", "Freya");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    for (const u of ["freya", "odin"]) assert.equal((await boss.post("/api/v1/vip/access", { username: u, days: 30 })).status, 200);
    srv.app.arena.voice.turn = ["turn:turn.example:3478"]; srv.app.arena.voice.turnSecret = "test-turn-secret";
  });
  after(() => srv.stop());

  test("only Capstone members join; everyone else sees a count", async () => {
    assert.equal((await guest.post("/api/v1/voice/capstone/join", {})).status, 401);
    assert.equal((await loki.post("/api/v1/voice/capstone/join", {})).status, 403);
    assert.equal((await freya.post("/api/v1/voice/nowhere/join", {})).status, 404);
    assert.equal((await loki.get("/api/v1/voice/capstone")).json.peers, undefined);
    assert.equal((await feed(loki, "voice:capstone")).status, 403);
    const v = (await freya.get("/api/v1/voice/capstone")).json;
    assert.equal(v.cap, 6); assert.equal(v.canJoin, true); assert.deepEqual(v.peers, []);
  });

  test("joining announces the room, and a TURN login is made from the secret", async () => {
    const f = await feed(odin, "voice:capstone");
    const j = (await freya.post("/api/v1/voice/capstone/join", {})).json;
    assert.ok(j.peer);
    assert.equal(j.peers.length, 1);
    const turn = j.iceServers.find(s => s.username);
    assert.deepEqual(turn.urls, ["turn:turn.example:3478"]);
    assert.equal(turn.credential, crypto.createHmac("sha1", "test-turn-secret").update(turn.username).digest("base64"));
    assert.ok(!JSON.stringify(j).includes("test-turn-secret"), "the secret never leaves the server");
    const e = await f.next(x => x.event === "voice.peers");
    assert.equal(e.data.peers[0].name, "Freya");
    assert.equal((await loki.get("/api/v1/voice/capstone")).json.count, 1);
    f.close();
  });

  test("a connection message reaches only the peer it's for", async () => {
    const fOdin = await feed(odin, "voice:capstone"), fFreya = await feed(freya, "voice:capstone"), fBoss = await feed(boss, "voice:capstone");
    const me = (await freya.get("/api/v1/voice/capstone")).json.peers[0].peer;
    const o = (await odin.post("/api/v1/voice/capstone/join", {})).json;
    const sdp = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=ice-pwd:asd88fgpdd777uzjYhagZg\r\n";
    assert.equal((await odin.post("/api/v1/voice/capstone/signal", { peer: o.peer, to: me, description: { type: "offer", sdp } })).status, 200, "offers aren't refused as secrets");
    const got = await fFreya.next(x => x.event === "voice.signal");
    assert.equal(got.data.description.sdp, sdp);
    assert.equal(got.data.from, o.peer);
    assert.equal(await fBoss.next(x => x.event === "voice.signal", 300), null, "nobody else gets it");
    assert.equal(await fOdin.next(x => x.event === "voice.signal", 300), null);
    // you can only send as yourself, and only to someone in the room
    assert.equal((await freya.post("/api/v1/voice/capstone/signal", { peer: o.peer, to: me, candidate: null })).status, 404);
    assert.equal((await odin.post("/api/v1/voice/capstone/signal", { peer: o.peer, to: "nobody", candidate: null })).status, 404);
    assert.equal((await odin.post("/api/v1/voice/capstone/signal", { peer: o.peer, to: me, description: { type: "bogus", sdp } })).status, 400);
    assert.equal((await odin.post("/api/v1/voice/capstone/signal", { peer: o.peer, to: me, candidate: { candidate: "candidate:1 1 udp 1 127.0.0.1 5000 typ host", sdpMid: "0", sdpMLineIndex: 0 } })).status, 200);
    assert.equal((await fFreya.next(x => x.event === "voice.signal")).data.candidate.sdpMid, "0");
    for (const f of [fOdin, fFreya, fBoss]) f.close();
  });

  test("one place per person, mute shows, admins can remove someone, leaving frees the place", async () => {
    const again = (await odin.post("/api/v1/voice/capstone/join", {})).json;
    assert.equal(again.peers.filter(p => p.name === "Odin").length, 1, "a second tab replaces the first");
    await odin.post("/api/v1/voice/capstone/beat", { peer: again.peer, muted: true });
    assert.equal((await freya.get("/api/v1/voice/capstone")).json.peers.find(p => p.name === "Odin").muted, true);
    const fOdin = await feed(odin, "voice:capstone");
    assert.equal((await freya.post("/api/v1/voice/capstone/kick", { peer: again.peer })).status, 403);
    assert.equal((await boss.post("/api/v1/voice/capstone/kick", { peer: again.peer })).status, 200);
    assert.ok(await fOdin.next(x => x.event === "voice.kicked"));
    fOdin.close();
    const me = (await freya.get("/api/v1/voice/capstone")).json.peers[0].peer;
    await freya.post("/api/v1/voice/capstone/leave", { peer: me });
    assert.equal((await freya.get("/api/v1/voice/capstone")).json.count, 0);
  });

  test("the room holds six, and quiet or locked-out peers are dropped", async () => {
    const v = srv.app.arena.voice, list = v.peers.get("capstone");
    for (let i = 0; i < 6; i++) list.set(`fake${i}`, { id: `fake${i}`, uid: `nobody${i}`, name: "x", joinedAt: i, seen: Date.now(), muted: false, video: false });
    assert.equal((await freya.post("/api/v1/voice/capstone/join", {})).status, 409);
    v.sweep(); // the fake ones have no account
    assert.equal(list.size, 0);
    const j = (await freya.post("/api/v1/voice/capstone/join", {})).json;
    const real = Date.now; v.now = () => real() + 31000;
    v.sweep();
    v.now = real;
    assert.equal(list.has(j.peer), false, "silent for 30 s");
    // losing Capstone access drops you at the next sweep
    const k = (await freya.post("/api/v1/voice/capstone/join", {})).json;
    const uid = srv.app.arena.voice.peers.get("capstone").get(k.peer).uid;
    await boss.req("DELETE", `/api/v1/vip/access/${uid}`);
    v.sweep();
    assert.equal(list.has(k.peer), false);
  });
});
