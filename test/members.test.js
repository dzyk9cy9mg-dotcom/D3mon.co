// Members' own profiles (owner, 2026-10-21; HardSmoke's is the showcase): a tagline and clean links written by the
// member, the Host title given only by admins, and a moving picture an admin approves before anyone else sees it.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";
import { memberLink } from "../server/arena/members.js";

const PNG = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]).toString("base64");

describe("member links", () => {
  test("only the page is kept, never a share link's tracking", () => {
    assert.deepEqual(memberLink("https://youtube.com/@hardsmokez?si=RzZNekoPH7Jk1qyi"), { site: "youtube", label: "YouTube", url: "https://www.youtube.com/@hardsmokez" });
    assert.equal(memberLink("https://www.instagram.com/hardsmokez?psln=MXE5MXZnNG55dTdwdw==").url, "https://www.instagram.com/hardsmokez");
    assert.equal(memberLink("https://www.twitch.tv/hardsmokez?sr=a").url, "https://www.twitch.tv/hardsmokez");
    assert.equal(memberLink("https://twitter.com/someone/").url, "https://x.com/someone");
    assert.equal(memberLink("https://youtube.com/watch?v=UukZOLdzhZE&t=3").url, "https://www.youtube.com/watch?v=UukZOLdzhZE");
    for (const bad of ["http://evil.example/x", "https://example.com/hardsmoke", "https://twitch.tv/", "javascript:alert(1)", "https://user:pw@twitch.tv/x"])
      assert.throws(() => memberLink(bad), /links|link/i, bad);
  });
});

describe("members' profiles", () => {
  let srv, owner, hs, loki, guest;
  before(async () => {
    srv = await startServer();
    [owner, hs, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await owner.register("boss", "boss-pass-12", "Boss");
    await hs.register("HardSmoke", "smoke-pass-1", "HardSmoke");
    await loki.register("loki", "loki-pass-12", "Loki");
  });
  after(() => srv.stop());

  test("a member writes their own tagline and links; the tracking goes", async () => {
    assert.equal((await guest.req("PUT", "/api/v1/members/me/profile", { tagline: "x" })).status, 401);
    assert.equal((await hs.req("PUT", "/api/v1/members/me/profile", { links: ["https://example.com/me"] })).status, 400);
    assert.equal((await hs.req("PUT", "/api/v1/members/me/profile", { colour: "red" })).status, 400);
    const r = await hs.req("PUT", "/api/v1/members/me/profile", { tagline: "Watch your odds!", links: [
      "https://youtube.com/@hardsmokez?si=RzZNekoPH7Jk1qyi", "https://www.instagram.com/hardsmokez?psln=MXE5MXZnNG55dTdwdw==", "https://www.twitch.tv/hardsmokez?sr=a"] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const p = (await guest.get("/api/v1/members/hardsmoke")).json;
    assert.equal(p.tagline, "Watch your odds!");
    assert.deepEqual(p.links.map(l => l.label), ["YouTube", "Instagram", "Twitch"]);
    assert.ok(!JSON.stringify(p).includes("RzZNek") && !JSON.stringify(p).includes("psln"));
    assert.equal(p.host, false);
    // a field left out keeps what it had
    await hs.req("PUT", "/api/v1/members/me/profile", { tagline: "Watch your odds, always." });
    assert.equal((await guest.get("/api/v1/members/hardsmoke")).json.links.length, 3);
  });

  test("only admins give the Host title", async () => {
    assert.equal((await loki.req("PUT", "/api/v1/members/hardsmoke/host", { on: true })).status, 403);
    assert.equal((await owner.req("PUT", "/api/v1/members/hardsmoke/host", { on: "yes" })).status, 400);
    assert.equal((await owner.req("PUT", "/api/v1/members/hardsmoke/host", { on: true })).status, 200);
    assert.equal((await guest.get("/api/v1/members/hardsmoke")).json.host, true);
  });

  test("a member's picture waits for an admin, then shows on their profile", async () => {
    const up = await hs.req("POST", "/api/v1/members/me/portrait", { frames: [PNG, PNG, PNG] });
    assert.equal(up.status, 201);
    const url = "/" + up.json.pending.frames[0];
    assert.equal((await hs.get(url)).status, 200);
    assert.equal((await guest.get(url)).status, 404);
    assert.equal((await loki.get(url)).status, 404);
    assert.equal((await guest.get("/api/v1/members/hardsmoke")).json.portrait, null);
    const q = (await owner.get("/api/v1/portraits/queue")).json.queue;
    assert.equal(q.length, 1);
    assert.equal(q[0].member.username, "HardSmoke");
    assert.equal((await owner.post(`/api/v1/portraits/${q[0].set}/review`, { decision: "approve" })).status, 200);
    const p = (await guest.get("/api/v1/members/hardsmoke")).json;
    assert.equal(p.portrait.frames.length, 3);
    assert.equal((await guest.get(url)).status, 200);
    assert.equal((await hs.get("/api/v1/members/me/portrait")).json.approved.frames.length, 3);
  });

  test("deleting the account deletes the picture and the profile fields", async () => {
    const url = "/" + (await guest.get("/api/v1/members/hardsmoke")).json.portrait.frames[0];
    assert.equal((await owner.req("DELETE", "/api/v1/members/hardsmoke")).status, 200);
    assert.equal((await guest.get(url)).status, 404);
    assert.equal(srv.app.arena.members.view([...srv.app.arena.members.hosts.keys()][0] || "x").host, false);
  });
});
