// Runs public/js/runtime.js the way a browser would (as a classic script with window, fetch and
// EventSource) against a real server, and drives it with code taken verbatim from public/js/d3mon.js.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import { startServer, Client, eventSourceFor } from "./helpers.js";
import { ROOT } from "../server/config.js";

const RUNTIME = fs.readFileSync(path.join(ROOT, "public/js/runtime.js"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "public/js/d3mon.js"), "utf8");
// The page's own write helper, unchanged: update, or take a lease and create the document.
const MERGE_WRITE = APP.match(/async function mergeWrite\(ref, patch\)\{[\s\S]*?\n\}/)[0];

// A browser-like global for one signed-in (or guest) visitor.
function browser(base, client) {
  const EventSource = eventSourceFor(base, client);
  const g = {
    console, setTimeout, clearTimeout, TextDecoder, AbortController, URL, Promise, JSON, EventSource,
    fetch: (url, opts = {}) => fetch(new URL(url, base), { ...opts, headers: client.cookie ? { ...opts.headers, cookie: client.cookie } : opts.headers }),
    MutationObserver: class { observe() {} },
    document: { readyState: "complete", getElementById: () => null, addEventListener() {} },
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(RUNTIME, g, { filename: "runtime.js" });
  g.close = () => EventSource.closeAll();
  return g;
}

// Objects made inside the page's context have that context's prototypes; compare plain copies.
const plain = v => JSON.parse(JSON.stringify(v));

const waitFor = async (check, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = check();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise(r => setTimeout(r, 20));
  }
};

describe("runtime.js against the server", () => {
  let srv, ownerC, aliceC, bobC, owner, alice, bob, guest;

  before(async () => {
    srv = await startServer();
    [ownerC, aliceC, bobC] = [new Client(srv.base), new Client(srv.base), new Client(srv.base)];
    await ownerC.register("owner", "owner-pass-1", "The Owner");
    await aliceC.register("alice", "alice-pass-1", "Alice");
    await bobC.register("bob", "bob-pass-12", "Bob");
    owner = browser(srv.base, ownerC);
    alice = browser(srv.base, aliceC);
    bob = browser(srv.base, bobC);
    guest = browser(srv.base, new Client(srv.base));
  });
  after(async () => {
    for (const b of [owner, alice, bob, guest]) b.close();
    await srv.stop();
  });

  test("window.claude.use gives the page db, user and room; sample only with a key", async () => {
    for (const name of ["db", "user", "room"]) assert.ok(await alice.claude.use(name), name);
    assert.equal(await alice.claude.use("sample"), null);
    assert.equal(await alice.claude.use("something-else"), null);
  });

  test("user: who am I, admin rights, write access, names and search", async () => {
    const u = await alice.claude.use("user");
    const me = await u.me();
    assert.equal(me.name, "Alice");
    assert.equal(me.isOwner, false);
    assert.equal(me.guest, false);
    assert.equal(await u.canEdit(), false);
    assert.equal(await u.can("data.write"), true);
    assert.equal(await (await owner.claude.use("user")).canEdit(), true);
    assert.equal((await (await owner.claude.use("user")).me()).isOwner, true);

    const g = await guest.claude.use("user");
    assert.deepEqual(plain(await g.me()), { id: null, name: "", avatarUrl: "", isOwner: false, guest: true });
    assert.equal(await g.can("data.write"), false);

    const ps = await u.profiles([me.id, bobC.user.id, me.id, "nobody"]);
    assert.equal(ps[me.id].isMe, true);
    assert.equal(ps[bobC.user.id].name, "Bob");
    assert.equal(ps.nobody, undefined);
    assert.deepEqual(plain((await u.search("bo")).map(h => h.name)), ["Bob"]);
  });

  test("db: the page's mergeWrite creates and merges, even when two people race", async () => {
    const run = (b, uid) => {
      vm.runInContext(`var meId = ${JSON.stringify(uid)};\n${MERGE_WRITE}\nwindow.mergeWrite = mergeWrite;`, b);
      return b.mergeWrite;
    };
    const [dbA, dbB] = [await alice.claude.use("db"), await bob.claude.use("db")];
    const mwA = run(alice, aliceC.user.id), mwB = run(bob, bobC.user.id);
    const h = "2026100820";
    await Promise.all([
      mwA(dbA.doc("lounge/" + h), { hour: h, msgs: { m1: { a: aliceC.user.id, t: 1, b: "first" } } }),
      mwB(dbB.doc("lounge/" + h), { hour: h, msgs: { m2: { a: bobC.user.id, t: 2, b: "second" } } }),
    ]);
    const snap = await dbA.doc("lounge/" + h).get();
    assert.equal(snap.exists, true);
    assert.deepEqual(Object.keys(snap.data().msgs).sort(), ["m1", "m2"]);
    await mwB(dbB.doc("lounge/" + h), { msgs: { m1: { rx: { fire: { [bobC.user.id]: true } } } } });
    assert.deepEqual((await dbA.doc("lounge/" + h).get()).data().msgs.m1, { a: aliceC.user.id, t: 1, b: "first", rx: { fire: { [bobC.user.id]: true } } });
  });

  test("db: errors carry the codes the page checks for", async () => {
    const db = await alice.claude.use("db");
    await assert.rejects(db.doc("lounge/missing").update({ x: 1 }), e => e.code === "invalid_argument");
    await assert.rejects(db.doc("config/site").set({ x: 1 }), e => e.code === "not_granted");
    const g = await guest.claude.use("db");
    await assert.rejects(g.doc("lounge/x").set({ x: 1 }), e => e.code === "not_granted");
  });

  test("db: queries, add and live snapshots with unsubscribe", async () => {
    const dbA = await alice.claude.use("db"), dbB = await bob.claude.use("db");
    const seen = [];
    const unsub = dbB.collection("posts").where("threadId", "==", "live1").orderBy("createdAt", "asc").limit(500)
      .onSnapshot(s => seen.push(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    await waitFor(() => seen.length >= 1);
    assert.deepEqual(seen[0], []);
    const ref = await dbA.collection("posts").add({ threadId: "live1", body: "gm", authorId: aliceC.user.id, createdAt: 2 });
    await dbA.collection("posts").add({ threadId: "live1", body: "first", authorId: aliceC.user.id, createdAt: 1 });
    await waitFor(() => seen.at(-1).length === 2);
    assert.deepEqual(seen.at(-1).map(p => p.body), ["first", "gm"]);
    assert.ok(seen.at(-1).some(p => p.id === ref.id));

    const got = await dbB.collection("posts").where("threadId", "==", "live1").get();
    assert.equal(got.size, 2);
    assert.equal(got.empty, false);

    unsub();
    const count = seen.length;
    await dbA.collection("posts").add({ threadId: "live1", body: "after", authorId: aliceC.user.id, createdAt: 3 });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(seen.length, count);

    const docSeen = [];
    const stop = dbB.doc("config/battle").onSnapshot(s => docSeen.push(s.exists ? s.data() : null));
    await waitFor(() => docSeen.length === 1);
    assert.equal(docSeen[0], null);
    await (await owner.claude.use("db")).doc("config/battle").set({ kind: "bots" });
    await waitFor(() => docSeen.length === 2);
    assert.deepEqual(docSeen[1], { kind: "bots" });
    stop();
  });

  test("db: snapshot data is a copy the page can change freely", async () => {
    const db = await alice.claude.use("db");
    await db.doc("boards/copy").set({ k: "copy", msgs: { a: { b: "x" } } });
    const s = await db.doc("boards/copy").get();
    s.data().msgs.a.b = "changed";
    assert.equal(s.data().msgs.a.b, "x");
  });

  test("room: site-wide presence and stream rooms", async () => {
    const rA = await alice.claude.use("room"), rB = await bob.claude.use("room");
    let peers = [];
    rB.onPeers(ch => (peers = ch.peers));
    await rA.presence({ uid: aliceC.user.id, sec: "bots", voice: null });
    await waitFor(() => peers.some(p => p.presence && p.presence.uid === aliceC.user.id && p.presence.sec === "bots"));
    assert.ok(peers.some(p => p.by === aliceC.user.id));

    const streamA = await rA.join("stream-xyz"), streamB = await rB.join("stream-xyz");
    let watching = 0;
    streamB.onPeers(ch => (watching = ch.peers.length));
    await streamA.presence({ watching: true });
    await streamB.presence({ watching: true });
    await waitFor(() => watching === 2);
    await streamA.leave();
    await waitFor(() => watching === 1);
  });
});

describe("runtime.js with the Cosmic assistant on", () => {
  let mock, srv, page, holdOpen;
  before(async () => {
    mock = http.createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const delta = t => res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } })}\n\n`);
        delta("BTC ");
        delta("looks ");
        if (holdOpen) return; // leave the answer hanging so the page can stop it
        delta("calm.");
        res.end(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } })}\n\n`);
      });
    });
    await new Promise(r => mock.listen(0, "127.0.0.1", r));
    srv = await startServer({ anthropicKey: "test-key", anthropicUrl: `http://127.0.0.1:${mock.address().port}` });
    const c = new Client(srv.base);
    await c.register("asker", "asker-password");
    page = browser(srv.base, c);
  });
  after(async () => {
    page.close();
    await srv.stop();
    mock.closeAllConnections();
    mock.close();
  });

  test("sample streams text through onText and returns it", async () => {
    holdOpen = false;
    const sample = await page.claude.use("sample");
    assert.equal(typeof sample, "function");
    const partial = [];
    const out = await sample([{ role: "user", content: "How's BTC?" }], { modelTier: "quick", cache: false, onText: ({ text }) => partial.push(text) });
    assert.deepEqual(plain(out), { text: "BTC looks calm.", truncated: false });
    assert.deepEqual(partial, ["BTC ", "BTC looks ", "BTC looks calm."]);
  });

  test("stopping an answer rejects with code cancelled and the text so far", async () => {
    holdOpen = true;
    const sample = await page.claude.use("sample");
    const ctl = new AbortController();
    const err = await sample([{ role: "user", content: "Go" }], { signal: ctl.signal, onText: ({ text }) => text === "BTC looks " && ctl.abort() }).catch(e => e);
    assert.equal(err.code, "cancelled");
    assert.equal(err.text, "BTC looks ");
  });
});

describe("runtime.js when the server is down", () => {
  test("use() returns null so the page shows its offline view", async () => {
    const page = browser("http://127.0.0.1:9", new Client("http://127.0.0.1:9"));
    assert.equal(await page.claude.use("db"), null);
    assert.equal(await page.claude.use("user"), null);
  });
});
