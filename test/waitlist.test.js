// The founder waitlist (owner, 2026-10-22): closed until an admin opens it, anyone can join with an email,
// the public sees only open and the count, admins see and remove entries, and /api/db can't reach it.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

describe("founder waitlist", () => {
  let srv, owner, member, guest;
  before(async () => {
    srv = await startServer();
    [owner, member, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await owner.register("boss", "boss-pass-12", "Boss");
    await member.register("loki", "loki-pass-12", "Loki");
  });
  after(() => srv.stop());

  test("closed and empty to start; nobody can join", async () => {
    assert.deepEqual((await guest.get("/api/v1/waitlist")).json, { open: false, count: 0 });
    const r = await guest.req("POST", "/api/v1/waitlist", { email: "a@example.com" });
    assert.equal(r.status, 409);
    assert.equal(r.json.error?.code ?? r.json.code, "waitlist_closed");
  });

  test("only admins open it or read it", async () => {
    assert.equal((await guest.req("PUT", "/api/v1/waitlist", { open: true })).status, 401);
    assert.equal((await member.req("PUT", "/api/v1/waitlist", { open: true })).status, 403);
    assert.equal((await member.get("/api/v1/waitlist/entries")).status, 403);
    assert.equal((await owner.req("PUT", "/api/v1/waitlist", { open: "yes" })).status, 400);
    assert.deepEqual((await owner.req("PUT", "/api/v1/waitlist", { open: true })).json, { open: true, count: 0 });
  });

  test("guests and members join; a repeat counts once; bad input is refused", async () => {
    assert.equal((await guest.req("POST", "/api/v1/waitlist", { email: "  Smoke@Example.com " })).json.count, 1);
    assert.equal((await guest.req("POST", "/api/v1/waitlist", { email: "smoke@example.com" })).json.count, 1);
    assert.equal((await member.req("POST", "/api/v1/waitlist", { email: "loki@example.org" })).json.count, 2);
    for (const bad of [{ email: "nope" }, { email: "a@b" }, { email: 5 }, { email: "x@example.com", name: "x" }, []])
      assert.equal((await member.req("POST", "/api/v1/waitlist", bad)).status, 400, JSON.stringify(bad));
    assert.deepEqual((await guest.get("/api/v1/waitlist")).json, { open: true, count: 2 });
  });

  test("admins see entries newest first and can remove one", async () => {
    const l = (await owner.get("/api/v1/waitlist/entries")).json;
    assert.deepEqual(l.entries.map(e => e.email), ["loki@example.org", "smoke@example.com"]);
    assert.ok(l.entries[0].uid && l.entries[1].uid === null);
    assert.equal((await member.req("DELETE", `/api/v1/waitlist/entries/${l.entries[1].id}`)).status, 403);
    assert.equal((await owner.req("DELETE", `/api/v1/waitlist/entries/${l.entries[1].id}`)).json.count, 1);
    assert.equal((await owner.req("DELETE", `/api/v1/waitlist/entries/${l.entries[1].id}`)).status, 404);
  });

  test("emails can't be read through /api/db", async () => {
    const r = await owner.req("POST", "/api/db", { op: "query", collection: "arena_waitlist" });
    assert.notEqual(r.status, 200);
  });

  test("closing it stops new joins but keeps the list", async () => {
    await owner.req("PUT", "/api/v1/waitlist", { open: false });
    assert.equal((await guest.req("POST", "/api/v1/waitlist", { email: "late@example.com" })).status, 409);
    assert.deepEqual((await guest.get("/api/v1/waitlist")).json, { open: false, count: 1 });
  });

  test("20 new emails an hour per address; repeats and typos don't count", async () => {
    await owner.req("PUT", "/api/v1/waitlist", { open: true });
    const codes = [];
    for (let i = 0; i < 6; i++) assert.equal((await guest.req("POST", "/api/v1/waitlist", { email: "bad" })).status, 400);
    for (let i = 0; i < 25; i++) codes.push((await guest.req("POST", "/api/v1/waitlist", { email: `r${i}@example.com` })).status);
    assert.ok(codes.includes(429), codes.join());
  });
});
