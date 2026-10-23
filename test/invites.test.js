// One-time invite links (owner, 2026-10-22): with sign-ups closed, an admin makes a link that lets exactly one
// person sign up. Only its hash is kept; it can be revoked, expires, and works once.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startServer, Client } from "./helpers.js";

describe("invite links", () => {
  let srv, owner, member, guest, link, code;
  const reg = (c, username, extra = {}) => c.req("POST", "/api/auth/register", { username, password: `${username}-pass-1`, ...extra });

  before(async () => {
    srv = await startServer({ signups: "closed" });
    [owner, member, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await owner.register("owner", "owner-pass-12", "Owner"); // the first account is always allowed
  });
  after(() => srv.stop());

  test("sign-ups are closed without an invite", async () => {
    const r = await reg(guest, "nobody");
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, "signups_closed");
  });

  test("only admins make, list and revoke invites", async () => {
    assert.equal((await guest.req("POST", "/api/auth/invites", {})).status, 401);
    assert.equal((await guest.get("/api/auth/invites")).status, 401);
    const r = await owner.req("POST", "/api/auth/invites", { label: "Ketonk", days: 3 });
    assert.equal(r.status, 201);
    ({ code } = r.json);
    link = r.json.url;
    assert.match(link, /\/login\?invite=[A-Za-z0-9_-]{24}#new$/);
    assert.equal(r.json.invite.state, "open");
    assert.equal(r.json.invite.hash, undefined);
    const list = (await owner.get("/api/auth/invites")).json.invites;
    assert.equal(list.length, 1);
    assert.ok(!JSON.stringify(list).includes(code), "the code is never shown again");
    const saved = fs.readFileSync(path.join(srv.dataDir, "invites.json"), "utf8");
    assert.ok(!saved.includes(code), "only its hash is stored");
  });

  test("the invite checks out, signs up exactly one person, and is then used", async () => {
    assert.deepEqual((await guest.get(`/api/auth/invite?code=${code}`)).json, { valid: true });
    assert.deepEqual((await guest.get("/api/auth/invite?code=nope")).json, { valid: false });
    assert.equal((await reg(guest, "faker", { invite: "nope" })).json.error.code, "bad_invite");
    const r = await reg(member, "ketonk", { invite: code });
    assert.equal(r.status, 200);
    assert.equal((await member.get("/api/session")).json.user.username, "ketonk");
    assert.equal((await reg(guest, "second", { invite: code })).json.error.code, "bad_invite", "works once");
    const [i] = (await owner.get("/api/auth/invites")).json.invites;
    assert.deepEqual([i.state, i.usedByName, i.label], ["used", "ketonk", "Ketonk"]);
    assert.equal((await member.req("POST", "/api/auth/invites", {})).status, 403, "members can't make invites");
  });

  test("a revoked invite stops working", async () => {
    const r = await owner.req("POST", "/api/auth/invites", {});
    const id = r.json.invite.id;
    assert.equal((await owner.req("DELETE", `/api/auth/invites/${id}`)).json.invite.state, "revoked");
    assert.equal((await reg(guest, "late", { invite: r.json.code })).json.error.code, "bad_invite");
  });

  test("an expired invite stops working", async () => {
    const r = await owner.req("POST", "/api/auth/invites", { days: 1 });
    const inv = srv.app.accounts.invites.find(i => i.id === r.json.invite.id);
    inv.expiresAt = Date.now() - 1;
    assert.equal((await reg(guest, "toolate", { invite: r.json.code })).json.error.code, "bad_invite");
    assert.equal((await owner.get("/api/auth/invites")).json.invites[0].state, "expired");
  });
});
