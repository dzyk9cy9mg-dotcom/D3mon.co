import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { startServer, Client } from "./helpers.js";
import { writeRoles, readRoles } from "../server/accounts.js";

// A raw request, for paths and headers fetch() would normalize or refuse to send.
function raw(base, { method = "GET", path: p, headers = {}, body }) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, method, path: p, headers }, res => {
      let text = "";
      res.on("data", c => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

describe("D3MON.CO server", () => {
  let srv, owner, alice, bob, guest;

  before(async () => {
    srv = await startServer();
    owner = new Client(srv.base);
    alice = new Client(srv.base);
    bob = new Client(srv.base);
    guest = new Client(srv.base);
    await owner.register("owner", "owner-pass-1", "The Owner");
    await alice.register("alice", "alice-pass-1", "Alice");
    await bob.register("bob", "bob-pass-12", "Bob");
  });
  after(() => srv.stop());

  describe("pages", () => {
    test("serves the page, its files and the sign-in page", async () => {
      const home = await guest.get("/");
      assert.equal(home.status, 200);
      assert.match(home.text, /<title>D3MON\.CO<\/title>/);
      assert.match(home.text, /<script src="js\/runtime\.js"><\/script>\s*<script src="js\/d3mon\.js"><\/script>/);
      assert.match(home.headers.get("content-security-policy"), /frame-ancestors 'self'/);
      for (const f of ["/css/host.css", "/css/d3mon.css", "/css/standalone.css", "/js/runtime.js", "/js/d3mon.js", "/js/account.js"]) {
        assert.equal((await guest.get(f)).status, 200, f);
      }
      assert.match((await guest.get("/login")).text, /Create account/);
      assert.equal((await guest.get("/account")).status, 200);
    });

    test("gzips text files and answers revalidation with 304", async () => {
      const r = await raw(srv.base, { path: "/js/d3mon.js", headers: { "accept-encoding": "gzip" } });
      assert.equal(r.status, 200);
      const first = await fetch(`${srv.base}/css/d3mon.css`);
      const etag = first.headers.get("etag");
      await first.text();
      assert.equal((await raw(srv.base, { path: "/css/d3mon.css", headers: { "if-none-match": etag } })).status, 304);
    });

    test("never serves files outside public/", async () => {
      for (const p of ["/../package.json", "/%2e%2e/package.json", "/%2E%2E%2Fpackage.json", "/js/..%2F..%2Fserver%2Findex.js", "/.gitignore", "/nope.html"]) {
        assert.equal((await raw(srv.base, { path: p })).status, 404, p);
      }
    });
  });

  describe("accounts", () => {
    test("the first account owns the site; later ones are members", () => {
      assert.equal(owner.user.role, "owner");
      assert.equal(alice.user.role, "member");
      assert.equal(alice.user.name, "Alice");
      assert.match(alice.user.avatarUrl, /^api\/avatar\/[A-Za-z0-9_-]+\.svg/, "relative, so it works under any base path");
    });

    test("sign in, wrong passwords, taken names, sign out", async () => {
      const c = new Client(srv.base);
      assert.equal((await c.post("/api/auth/login", { username: "alice", password: "not-her-password" })).status, 401);
      assert.equal((await c.post("/api/auth/login", { username: "nobody", password: "whatever-123" })).status, 401);
      assert.equal((await c.post("/api/auth/login", { username: "ALICE", password: "alice-pass-1" })).status, 200);
      assert.equal((await c.get("/api/session")).json.user.username, "alice");
      assert.equal((await c.post("/api/auth/register", { username: "Alice", password: "whatever-123" })).status, 409);
      assert.equal((await c.post("/api/auth/register", { username: "x", password: "whatever-123" })).status, 400);
      assert.equal((await c.post("/api/auth/register", { username: "shortpw", password: "1234567" })).status, 400);
      await c.post("/api/auth/logout");
      assert.equal((await c.get("/api/session")).json.user, null);
    });

    test("display names and passwords can change", async () => {
      const c = new Client(srv.base);
      await c.register("carol", "carol-pass-1", "Carol");
      const r = await c.post("/api/auth/profile", { name: "  Carol ​ the  Caller " });
      assert.equal(r.json.user.name, "Carol the Caller");
      assert.equal((await c.post("/api/auth/password", { current: "wrong-one", next: "carol-pass-2" })).status, 401);
      assert.equal((await c.post("/api/auth/password", { current: "carol-pass-1", next: "carol-pass-2" })).status, 200);
      assert.equal((await new Client(srv.base).post("/api/auth/login", { username: "carol", password: "carol-pass-2" })).status, 200);
    });

    test("avatars are generated SVGs", async () => {
      const r = await guest.get(`/${alice.user.avatarUrl}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("content-type"), "image/svg+xml");
      assert.match(r.text, />A<\/text>/);
    });

    test("profiles are public, member search needs an account", async () => {
      const r = await guest.post("/api/user/profiles", { ids: [alice.user.id, "missing", 42] });
      assert.deepEqual(Object.keys(r.json.profiles), [alice.user.id]);
      assert.equal(r.json.profiles[alice.user.id].name, "Alice");
      assert.equal(r.json.profiles[alice.user.id].isMe, false);
      assert.deepEqual((await guest.get("/api/user/search?q=ali")).json.results, []);
      const hits = (await bob.get("/api/user/search?q=ali")).json.results;
      assert.deepEqual(hits.map(h => h.name), ["Alice"]);
    });
  });

  describe("db", () => {
    test("update deep-merges into the existing document", async () => {
      const [a, b] = [alice.user.id, bob.user.id];
      assert.equal((await alice.db("set", { path: "lounge/2026100815", data: { hour: "2026100815", msgs: { m1: { a, t: 1, b: "gm" } } } })).status, 200);
      assert.equal((await bob.db("update", { path: "lounge/2026100815", data: { msgs: { m2: { a: b, t: 2, b: "gm gm" } } } })).status, 200);
      assert.equal((await bob.db("update", { path: "lounge/2026100815", data: { msgs: { m1: { rx: { fire: { [b]: true } } } } } })).status, 200);
      const doc = (await guest.db("get", { path: "lounge/2026100815" })).json;
      assert.equal(doc.exists, true);
      assert.deepEqual(doc.data.msgs.m1, { a, t: 1, b: "gm", rx: { fire: { [b]: true } } });
      assert.equal(doc.data.msgs.m2.b, "gm gm");
    });

    test("update on a missing document fails with invalid_argument, like the artifact runtime", async () => {
      const r = await alice.db("update", { path: "lounge/nothing-here", data: { x: 1 } });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, "invalid_argument");
      assert.equal((await alice.db("get", { path: "lounge/nothing-here" })).json.exists, false);
    });

    test("set replaces, merge creates or merges, delete removes", async () => {
      await alice.db("set", { path: "calls/BTC-15m-2026-10-08", data: { asset: "BTC", rounds: { 1: { x: 1 } } } });
      await alice.db("set", { path: "calls/BTC-15m-2026-10-08", data: { asset: "BTC", tf: "15m" } });
      assert.deepEqual((await alice.db("get", { path: "calls/BTC-15m-2026-10-08" })).json.data, { asset: "BTC", tf: "15m" });
      await alice.db("merge", { path: "calls/BTC-15m-2026-10-08", data: { rounds: { 2: { y: 2 } } } });
      assert.deepEqual((await alice.db("get", { path: "calls/BTC-15m-2026-10-08" })).json.data, { asset: "BTC", tf: "15m", rounds: { 2: { y: 2 } } });
      await alice.db("delete", { path: "calls/BTC-15m-2026-10-08" });
      assert.equal((await alice.db("get", { path: "calls/BTC-15m-2026-10-08" })).json.exists, false);
    });

    test("queries filter, order and limit; ordering skips docs without the field", async () => {
      const a = alice.user.id;
      for (const [id, t] of [["p1", 30], ["p2", 10], ["p3", 20]]) await alice.db("set", { path: `posts/${id}`, data: { threadId: "t1", body: id, authorId: a, createdAt: t } });
      await alice.db("set", { path: "posts/p4", data: { threadId: "t1", body: "no time", authorId: a } });
      await alice.db("set", { path: "posts/p5", data: { threadId: "t2", body: "elsewhere", authorId: a, createdAt: 1 } });
      const q = query => guest.db("query", { query });
      assert.deepEqual((await q({ collection: "posts", where: [["threadId", "==", "t1"]], orderBy: [["createdAt", "asc"]], limit: 2 })).json.docs.map(d => d.id), ["p2", "p3"]);
      assert.deepEqual((await q({ collection: "posts", where: [["threadId", "==", "t1"]], orderBy: [["createdAt", "desc"]] })).json.docs.map(d => d.id), ["p1", "p3", "p2"]);
      assert.deepEqual((await q({ collection: "posts", where: [["threadId", "==", "t1"]] })).json.docs.map(d => d.id), ["p1", "p2", "p3", "p4"]);
      assert.equal((await q({ collection: "posts", where: [["threadId", "~=", "t1"]] })).json.error.code, "invalid_argument");
      assert.deepEqual((await q({ collection: "nothing" })).json.docs, []);
    });

    test("add makes a 20-character id", async () => {
      const r = await alice.db("add", { collection: "chat", data: { streamId: "s0", body: "hi", authorId: alice.user.id, createdAt: 1 } });
      assert.match(r.json.id, /^[A-Za-z0-9]{20}$/);
      assert.equal(r.json.path, `chat/${r.json.id}`);
    });

    test("leases: one holder at a time until it expires", async () => {
      const p = "lounge/lease-test";
      assert.equal((await alice.db("acquire", { path: p, holder: alice.user.id, ttlMs: 300 })).json.acquired, true);
      assert.equal((await bob.db("acquire", { path: p, holder: bob.user.id, ttlMs: 300 })).json.acquired, false);
      assert.equal((await alice.db("acquire", { path: p, holder: alice.user.id, ttlMs: 300 })).json.acquired, true);
      await new Promise(r => setTimeout(r, 350));
      assert.equal((await bob.db("acquire", { path: p, holder: bob.user.id, ttlMs: 300 })).json.acquired, true);
      assert.equal((await alice.db("acquire", { path: "config/site", holder: "x" })).json.error.code, "not_granted");
    });

    test("rejects bad paths and prototype keys", async () => {
      for (const p of ["posts", "a/b/c", "posts/../config", "posts/__x", ""]) {
        assert.equal((await alice.db("get", { path: p })).status, 400, p);
      }
      const r = await alice.post("/api/db", JSON.parse('{"op":"set","path":"lounge/proto","data":{"msgs":{"__proto__":{"admin":true}}}}'));
      assert.equal(r.json.error.code, "invalid_argument");
    });

    test("documents over the size limit are refused", async () => {
      const big = "x".repeat(1024 * 1024);
      const r = await alice.db("set", { path: "lounge/huge", data: { b: big } });
      assert.equal(r.json.error.code, "quota_exceeded");
    });
  });

  describe("access rules", () => {
    test("guests can read but not write", async () => {
      assert.equal((await guest.db("get", { path: "lounge/2026100815" })).status, 200);
      const r = await guest.db("set", { path: "lounge/guest", data: { hour: "x" } });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, "not_granted");
      assert.equal((await guest.db("acquire", { path: "lounge/guest", holder: "anon" })).json.error.code, "not_granted");
    });

    test("site settings, verified callers, streamers and results are admin-only", async () => {
      for (const p of ["config/site", "config/members", "verified/" + bob.user.id, "streamers/" + bob.user.id, "results/BTC-15m-2026-10-08"]) {
        assert.equal((await alice.db("set", { path: p, data: { x: 1 } })).status, 403, p);
        assert.equal((await owner.db("set", { path: p, data: { x: 1 } })).status, 200, p);
      }
      assert.equal((await alice.db("update", { path: "config/members", data: { cats: { [alice.user.id]: { caller: true } } } })).status, 403);
      assert.equal((await alice.db("delete", { path: "config/site" })).status, 403);
    });

    test("member documents keyed by user id belong to that member (and admins)", async () => {
      const [a, b] = [alice.user.id, bob.user.id];
      for (const col of ["bots", "scripts", "requests", "rolereq", "dcreq", "reviewreq"]) {
        assert.equal((await alice.db("set", { path: `${col}/${a}`, data: { a, t: 1 } })).status, 200, col);
        assert.equal((await alice.db("set", { path: `${col}/${b}`, data: { a, t: 1 } })).status, 403, col);
        assert.equal((await owner.db("update", { path: `${col}/${a}`, data: { status: "approved" } })).status, 200, col);
      }
      assert.equal((await bob.db("delete", { path: `requests/${a}` })).status, 403);
      assert.equal((await owner.db("delete", { path: `requests/${a}` })).status, 200);
    });

    test("only admins can mark a coin transfer done or approved", async () => {
      const a = alice.user.id, path = `bots/${a}`, get = async () => (await alice.db("get", { path })).json.data;
      // Alice can ask for a transfer, but can't send it in already approved
      assert.equal((await alice.db("set", { path, data: { a, list: [], xfer: { x1: { to: "bob", amt: 5, at: 1 } } } })).status, 200);
      assert.equal((await alice.db("merge", { path, data: { xfer: { x2: { to: "bob", amt: 9, at: 2, done: true, ok: true } } } })).status, 403);
      // nor approve or decline her pending one, with any write op
      for (const [op, data] of [
        ["merge", { xfer: { x1: { done: true, ok: true } } }],
        ["update", { xfer: { x1: { done: true } } }],
        ["update", { xfer: { x1: { ok: false } } }],
        ["set", { a, list: [], xfer: { x1: { to: "bob", amt: 5, at: 1, done: true, ok: true } } }],
      ]) assert.equal((await alice.db(op, { path, data })).status, 403, `${op} ${JSON.stringify(data)}`);
      assert.deepEqual((await get()).xfer, { x1: { to: "bob", amt: 5, at: 1 } });
      // an admin confirms it
      assert.equal((await owner.db("merge", { path, data: { xfer: { x1: { done: true, ok: true } } } })).status, 200);
      // after that Alice can't reopen it or flip it to declined, and the page's own saves still work
      assert.equal((await alice.db("merge", { path, data: { xfer: { x1: { done: false } } } })).status, 403);
      assert.equal((await alice.db("merge", { path, data: { xfer: { x1: { ok: false } } } })).status, 403);
      const cur = await get();
      assert.equal((await alice.db("set", { path, data: { a, list: [{ n: "bot" }], pub: {}, votes: {}, proposals: {}, xfer: cur.xfer } })).status, 200);
      assert.equal((await alice.db("merge", { path, data: { a, xfer: { x3: { to: "bob", amt: 1, at: 3 } } } })).status, 200);
      // and deleting the document doesn't let her bring it back approved
      assert.equal((await alice.db("delete", { path })).status, 200);
      assert.equal((await alice.db("set", { path, data: { a, xfer: { x1: { to: "bob", amt: 5, at: 1, done: true, ok: true } } } })).status, 403);
    });

    test("each member's private area is theirs alone, even for admins", async () => {
      const a = alice.user.id;
      assert.equal((await alice.db("set", { path: `data/users/${a}/dmkey`, data: { priv: { d: "secret" } } })).status, 200);
      assert.equal((await alice.db("get", { path: `data/users/${a}/dmkey` })).json.data.priv.d, "secret");
      assert.equal((await bob.db("get", { path: `data/users/${a}/dmkey` })).status, 403);
      assert.equal((await owner.db("get", { path: `data/users/${a}/dmkey` })).status, 403);
      assert.equal((await bob.db("set", { path: `data/users/${a}/prefs`, data: { x: 1 } })).status, 403);
      assert.equal((await owner.db("set", { path: `data/users/${a}/dmkey`, data: { priv: { d: "swapped" } } })).status, 403, "admins can't swap someone's DM key");
      assert.equal((await owner.db("acquire", { path: `data/users/${a}/dmkey`, holder: "x" })).status, 403);
      assert.equal((await guest.db("get", { path: `data/users/${a}/prefs` })).status, 403);
      assert.equal((await bob.db("get", { path: `data/users/${bob.user.id}/prefs` })).json.exists, false);
    });

    test("direct messages are visible to the two people in them only", async () => {
      const [a, b] = [alice.user.id, bob.user.id];
      const id = `${[a, b].sort().join("__")}__2026-10`;
      assert.equal((await alice.db("set", { path: `dmx/${id}`, data: { p: [a, b].sort(), m: "2026-10", msgs: { x: { f: a, t: 1, c: "ciphertext" } } } })).status, 200);
      assert.equal((await bob.db("update", { path: `dmx/${id}`, data: { msgs: { y: { f: b, t: 2, c: "ciphertext" } } } })).status, 200);
      assert.equal((await owner.db("get", { path: `dmx/${id}` })).status, 403);
      assert.equal((await owner.db("update", { path: `dmx/${id}`, data: { msgs: { z: { f: "x" } } } })).status, 403);
      assert.equal((await owner.db("set", { path: "dmx/fake", data: { p: [a, b], msgs: {} } })).status, 403);
      const mine = await bob.db("query", { query: { collection: "dmx", where: [["p", "array-contains", b]], limit: 500 } });
      assert.deepEqual(mine.json.docs.map(d => d.id), [id]);
      const snoop = await owner.db("query", { query: { collection: "dmx", where: [["p", "array-contains", b]], limit: 500 } });
      assert.deepEqual(snoop.json.docs, []);
    });

    test("threads and replies: authors edit their own; anyone posting bumps the thread", async () => {
      const [a, b] = [alice.user.id, bob.user.id];
      assert.equal((await alice.db("set", { path: "threads/th1", data: { section: "callers", subId: "s", title: "BTC 15m", body: "?", authorId: a, createdAt: 1, lastActivity: 1, lastAuthorId: a } })).status, 200);
      assert.equal((await bob.db("set", { path: "threads/th2", data: { title: "spoof", authorId: a } })).status, 403);
      assert.equal((await bob.db("add", { collection: "posts", data: { threadId: "th1", body: "long", authorId: b, createdAt: 2 } })).status, 200);
      assert.equal((await bob.db("add", { collection: "posts", data: { threadId: "th1", body: "as alice", authorId: a, createdAt: 2 } })).status, 403);
      assert.equal((await bob.db("update", { path: "threads/th1", data: { lastActivity: 2, lastAuthorId: b } })).status, 200);
      assert.equal((await bob.db("update", { path: "threads/th1", data: { lastActivity: 3, lastAuthorId: a } })).status, 403);
      assert.equal((await bob.db("update", { path: "threads/th1", data: { title: "mine now", lastActivity: 3, lastAuthorId: b } })).status, 403);
      assert.equal((await bob.db("delete", { path: "threads/th1" })).status, 403);
    });

    test("deleting a thread takes its replies with it, as the page does", async () => {
      const [a, b] = [alice.user.id, bob.user.id];
      await alice.db("set", { path: "threads/th3", data: { title: "t", authorId: a, lastActivity: 1 } });
      const bobsReply = (await bob.db("add", { collection: "posts", data: { threadId: "th3", body: "reply", authorId: b, createdAt: 2 } })).json.id;
      await bob.db("set", { path: "threads/th4", data: { title: "bob's", authorId: b, lastActivity: 1 } });
      const alicesReply = (await alice.db("add", { collection: "posts", data: { threadId: "th4", body: "reply", authorId: a, createdAt: 2 } })).json.id;
      assert.equal((await owner.db("delete", { path: `posts/${alicesReply}` })).status, 200, "the owner moderates");
      assert.equal((await bob.db("delete", { path: `posts/${bobsReply}` })).status, 200, "authors delete their own replies");
      const again = (await bob.db("add", { collection: "posts", data: { threadId: "th3", body: "reply 2", authorId: b, createdAt: 3 } })).json.id;
      assert.equal((await alice.db("delete", { path: `posts/${again}` })).status, 200, "a thread's author clears its replies");
      assert.equal((await alice.db("delete", { path: "threads/th3" })).status, 200);
      const other = (await alice.db("add", { collection: "posts", data: { threadId: "th4", body: "x", authorId: a, createdAt: 4 } })).json.id;
      assert.equal((await new Client(srv.base).db("delete", { path: `posts/${other}` })).status, 403);
    });

    test("streams belong to their host, who can clear their chat", async () => {
      const [a, b] = [alice.user.id, bob.user.id];
      assert.equal((await bob.db("set", { path: "streams/st1", data: { title: "live", url: "https://www.twitch.tv/x", hostId: b, authorId: b, status: "live", createdAt: 1 } })).status, 200);
      assert.equal((await alice.db("set", { path: "streams/st2", data: { title: "fake", hostId: b, authorId: b } })).status, 403);
      assert.equal((await alice.db("update", { path: "streams/st1", data: { status: "ended" } })).status, 403);
      assert.equal((await bob.db("update", { path: "streams/st1", data: { status: "ended", endedAt: 5 } })).status, 200);
      assert.equal((await bob.db("update", { path: "streams/st1", data: { hostId: a } })).status, 403);
      const msg = (await alice.db("add", { collection: "chat", data: { streamId: "st1", body: "nice", authorId: a, createdAt: 2 } })).json.id;
      assert.equal((await bob.db("delete", { path: `chat/${msg}` })).status, 200);
      assert.equal((await bob.db("delete", { path: "streams/st1" })).status, 200);
    });

    test("reviews belong to the reviewer", async () => {
      const [a, b] = [alice.user.id, bob.user.id];
      assert.equal((await alice.db("set", { path: `reviews/bot-x~${a}`, data: { t: "bot-x", k: "bot", a, r: 5, b: "great", at: 1 } })).status, 200);
      assert.equal((await bob.db("set", { path: `reviews/bot-x~${a}`, data: { t: "bot-x", k: "bot", a: b, r: 1 } })).status, 403);
      assert.equal((await bob.db("delete", { path: `reviews/bot-x~${a}` })).status, 403);
      assert.equal((await alice.db("delete", { path: `reviews/bot-x~${a}` })).status, 200);
    });

    test("unknown collections are admin-only to write", async () => {
      assert.equal((await alice.db("set", { path: "spam/1", data: { x: 1 } })).status, 403);
      assert.equal((await owner.db("set", { path: "spam/1", data: { x: 1 } })).status, 200);
    });

    test("cross-site posts are refused", async () => {
      const body = JSON.stringify({ op: "set", path: "lounge/csrf", data: { hour: "x" } });
      const headers = { cookie: alice.cookie, "content-type": "application/json" };
      assert.equal((await raw(srv.base, { method: "POST", path: "/api/db", headers: { ...headers, origin: "https://evil.example" }, body })).status, 403);
      assert.equal((await raw(srv.base, { method: "POST", path: "/api/db", headers: { ...headers, "sec-fetch-site": "cross-site" }, body })).status, 403);
      assert.equal((await raw(srv.base, { method: "POST", path: "/api/db", headers: { ...headers, "content-type": "text/plain" }, body })).status, 415);
      assert.equal((await raw(srv.base, { method: "POST", path: "/api/db", headers: { ...headers, origin: srv.base }, body })).status, 200);
    });

    test("banned members turn read-only, and admins named in roles.json get admin rights", async () => {
      const file = path.join(srv.dataDir, "roles.json");
      const roles = readRoles(file);
      writeRoles(file, { ...roles, admins: [alice.user.id], banned: [bob.user.id] });
      await new Promise(r => setTimeout(r, 2100)); // the server re-reads roles.json every 2 seconds
      assert.equal((await bob.db("set", { path: "lounge/banned", data: { hour: "x" } })).status, 403);
      assert.equal((await bob.get("/api/session")).json.user.banned, true);
      assert.equal((await new Client(srv.base).post("/api/auth/login", { username: "bob", password: "bob-pass-12" })).status, 403);
      assert.equal((await alice.get("/api/session")).json.user.role, "admin");
      assert.equal((await alice.db("set", { path: "config/voice", data: { vortex: "https://meet.google.com/x" } })).status, 200);
      writeRoles(file, roles);
      await new Promise(r => setTimeout(r, 2100));
      assert.equal((await bob.db("set", { path: "lounge/unbanned", data: { hour: "x" } })).status, 200);
    });
  });

  describe("live updates", () => {
    test("query and document views update as data changes, filtered per reader", async () => {
      const ev = await bob.events();
      const snap = sid => e => e.event === "snap" && e.data.sid === sid;
      assert.equal((await bob.post("/api/sub", { cid: ev.cid, sid: 1, kind: "query", query: { collection: "lounge", orderBy: [["hour", "desc"]], limit: 3 } })).status, 200);
      await ev.next(snap(1));
      await alice.db("set", { path: "lounge/2099010100", data: { hour: "2099010100", msgs: {} } });
      const later = await ev.next(e => snap(1)(e) && e.data.docs.some(d => d.id === "2099010100"));
      const hours = later.data.docs.map(d => d.data.hour);
      assert.deepEqual(hours, [...hours].sort().reverse(), "newest hour first");

      await bob.post("/api/sub", { cid: ev.cid, sid: 2, kind: "doc", path: "config/faceoff" });
      assert.equal((await ev.next(snap(2))).data.exists, false);
      await owner.db("set", { path: "config/faceoff", data: { a: "Nova", b: "Redline" } });
      assert.deepEqual((await ev.next(snap(2))).data.data, { a: "Nova", b: "Redline" });

      await bob.post("/api/sub", { cid: ev.cid, sid: 3, kind: "doc", path: `data/users/${alice.user.id}/dmkey` });
      assert.equal((await ev.next(snap(3))).data.error, "not_granted");

      await bob.post("/api/unsub", { cid: ev.cid, sid: 2 });
      await owner.db("set", { path: "config/faceoff", data: { a: "Kai" } });
      await new Promise(r => setTimeout(r, 100));
      assert.equal(ev.queue.filter(snap(2)).length, 0);

      assert.equal((await alice.post("/api/sub", { cid: ev.cid, sid: 9, kind: "doc", path: "config/site" })).status, 404, "someone else's page");
      ev.close();
    });

    test("a burst of writes sends one update", async () => {
      const ev = await alice.events();
      await alice.post("/api/sub", { cid: ev.cid, sid: 1, kind: "query", query: { collection: "boards", limit: 100 } });
      await ev.next(e => e.event === "snap" && e.data.sid === 1);
      await Promise.all(Array.from({ length: 10 }, (_, i) => alice.db("set", { path: `boards/b${i}`, data: { k: `b${i}`, msgs: {} } })));
      await new Promise(r => setTimeout(r, 150));
      const updates = ev.queue.filter(e => e.event === "snap" && e.data.sid === 1);
      assert.ok(updates.length < 10, `${updates.length} updates`);
      assert.equal(updates.at(-1).data.docs.length, 10);
      ev.close();
    });

    test("presence: everyone on the page, and per-stream rooms", async () => {
      const a = await alice.events(), b = await bob.events(), g = await guest.events();
      await alice.post("/api/room", { cid: a.cid, op: "presence", room: "", presence: { uid: alice.user.id, sec: "callers" } });
      const site = await b.next(e => e.event === "peers" && e.data.room === "" && e.data.peers.some(p => p.by === alice.user.id && p.presence?.sec === "callers"));
      assert.ok(site.data.peers.some(p => p.by === null), "guests count as peers without an id");
      assert.ok(site.data.peers.every(p => typeof p.id === "string" && p.id !== a.cid), "page ids stay private");

      await bob.post("/api/room", { cid: b.cid, op: "join", room: "stream-abc" });
      await alice.post("/api/room", { cid: a.cid, op: "join", room: "stream-abc" });
      await alice.post("/api/room", { cid: a.cid, op: "presence", room: "stream-abc", presence: { watching: true } });
      await b.next(e => e.event === "peers" && e.data.room === "stream-abc" && e.data.peers.length === 2 && e.data.peers.some(p => p.presence?.watching));
      a.close();
      await b.next(e => e.event === "peers" && e.data.room === "stream-abc" && e.data.peers.length === 1);
      assert.equal((await bob.post("/api/room", { cid: b.cid, op: "join", room: "bad room!" })).status, 400);
      b.close();
      g.close();
    });

    test("signing out closes that session's live streams", async () => {
      const c = new Client(srv.base);
      await c.post("/api/auth/login", { username: "alice", password: "alice-pass-1" });
      const ev = await c.events();
      await c.post("/api/auth/logout");
      await new Promise(r => setTimeout(r, 100));
      assert.equal((await c.post("/api/sub", { cid: ev.cid, sid: 1, kind: "doc", path: "config/site" })).status, 404);
      ev.close();
    });
  });
});

describe("a site mounted under a path (D3MON_BASE_PATH)", () => {
  let srv;
  before(async () => { srv = await startServer({ basePath: "/d3mon" }); });
  after(() => srv.stop());

  test("serves the site under the path, and also when a proxy strips it", async () => {
    const bare = await raw(srv.base, { path: "/d3mon?x=1" });
    assert.equal(bare.status, 301);
    const redirect = await fetch(`${srv.base}/d3mon`, { redirect: "manual" });
    assert.equal(redirect.headers.get("location"), "/d3mon/");
    const c = new Client(srv.base);
    assert.match((await c.get("/d3mon/")).text, /<title>D3MON\.CO<\/title>/);
    assert.equal((await c.get("/d3mon/js/runtime.js")).status, 200);
    assert.match((await c.get("/d3mon/login")).text, /Create account/);
    assert.equal((await c.get("/d3mon/api/session")).json.user, null);
    assert.equal((await c.get("/api/session")).json.user, null, "a proxy may strip the prefix");
    const r = await c.post("/d3mon/api/auth/register", { username: "mounted", password: "mounted-pass-1" });
    assert.match(r.headers.get("set-cookie"), /; Path=\/d3mon\/;/);
    assert.equal((await c.get("/d3mon/api/session")).json.user.username, "mounted");
  });
});

describe("data on disk", () => {
  test("documents, accounts and sessions survive a restart", async () => {
    const first = await startServer();
    const c = new Client(first.base);
    await c.register("pat", "pat-password-1", "Pat");
    await c.db("set", { path: "lounge/keep", data: { hour: "keep", msgs: { m: { b: "still here" } } } });
    await first.stop({ keepData: true });
    const second = await startServer({ dataDir: first.dataDir });
    try {
      c.base = second.base;
      assert.equal((await c.db("get", { path: "lounge/keep" })).json.data.msgs.m.b, "still here");
      assert.equal((await c.get("/api/session")).json.user.username, "pat", "the session cookie still works");
      assert.equal((await new Client(second.base).post("/api/auth/login", { username: "pat", password: "pat-password-1" })).status, 200);
    } finally {
      await second.stop();
    }
  });
});

describe("Cosmic assistant", () => {
  let mock, mockBase, seen, reply;
  before(async () => {
    mock = http.createServer((req, res) => {
      let body = "";
      req.on("data", c => (body += c));
      req.on("end", () => {
        seen = { headers: req.headers, body: JSON.parse(body) };
        reply(res);
      });
    });
    await new Promise(r => mock.listen(0, "127.0.0.1", r));
    mockBase = `http://127.0.0.1:${mock.address().port}`;
  });
  after(() => mock.close());

  const sse = (res, events) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const [type, data] of events) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    res.end();
  };
  const text = t => ["content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }];
  const lines = r => r.text.trim().split("\n").map(l => JSON.parse(l));

  test("is off without an API key", async () => {
    const s = await startServer();
    try {
      assert.equal((await new Client(s.base).get("/api/session")).json.sampling, false);
      const c = new Client(s.base);
      await c.register("noai", "noai-password");
      assert.equal((await c.post("/api/sample", { messages: [{ role: "user", content: "hi" }] })).json.error.code, "sampling_disabled");
    } finally {
      await s.stop();
    }
  });

  test("streams answers from the Anthropic API for members", async () => {
    const s = await startServer({ anthropicKey: "test-key", anthropicUrl: mockBase });
    try {
      const c = new Client(s.base);
      await c.register("trader", "trader-password");
      assert.equal((await c.get("/api/session")).json.sampling, true);
      reply = res => sse(res, [["message_start", { message: {} }], text("Hello "), text("trader."), ["message_delta", { delta: { stop_reason: "end_turn" } }], ["message_stop", {}]]);
      const r = await c.post("/api/sample", { messages: [{ role: "user", content: "RULES" }, { role: "assistant", content: "Got it." }, { role: "user", content: "hi" }, { role: "user", content: "anyone?" }], modelTier: "quick" });
      const out = lines(r);
      assert.equal(out.filter(l => l.t === "d").map(l => l.d).join(""), "Hello trader.");
      assert.deepEqual(out.at(-1), { t: "done", text: "Hello trader.", truncated: false });
      assert.equal(seen.headers["x-api-key"], "test-key");
      assert.equal(seen.headers["anthropic-version"], "2023-06-01");
      assert.equal(seen.body.model, "claude-haiku-5-5");
      assert.equal(seen.body.stream, true);
      assert.deepEqual(seen.body.messages.map(m => m.role), ["user", "assistant", "user"], "back-to-back user turns are joined");

      reply = res => sse(res, [text("cut"), ["message_delta", { delta: { stop_reason: "max_tokens" } }]]);
      assert.equal(lines(await c.post("/api/sample", { messages: [{ role: "user", content: "long" }] })).at(-1).truncated, true);

      reply = res => sse(res, [["message_delta", { delta: { stop_reason: "refusal" } }]]);
      assert.equal(lines(await c.post("/api/sample", { messages: [{ role: "user", content: "x" }] })).at(-1).code, "refused");

      reply = res => { res.writeHead(429, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { type: "rate_limit_error", message: "slow down" } })); };
      assert.equal(lines(await c.post("/api/sample", { messages: [{ role: "user", content: "x" }] })).at(-1).code, "rate_limited");

      assert.equal((await new Client(s.base).post("/api/sample", { messages: [{ role: "user", content: "hi" }] })).status, 403, "guests can't use the site's key");
      assert.equal((await c.post("/api/sample", { messages: [{ role: "assistant", content: "hi" }] })).status, 400);
    } finally {
      await s.stop();
    }
  });
});
