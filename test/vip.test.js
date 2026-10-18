// The VIP room at the top of the pyramid: admins grant access by username for a number of days, access
// ends by itself, and members with access see the featured callers' calls before the calls close.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000, MIN = 60000, DAY = 86400000;

describe("vip room", () => {
  let srv, hs, odin, freya, loki, guest, bot, caller;
  const cur = Math.floor(Date.now() / Q) * Q;
  const vip = () => srv.app.arena.vip;
  before(async () => {
    srv = await startServer();
    [hs, odin, freya, loki, guest] = Array.from({ length: 5 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await freya.register("freya", "freya-pass-1", "Freya");
    await loki.register("loki", "loki-pass-12", "Loki");
    const approve = async (c, body) => (await hs.post(`/api/v1/applications/${(await c.post("/api/v1/applications", body)).json.application.id}/review`, { decision: "approve" })).json.application.entrantId;
    bot = await approve(odin, { kind: "bot", name: "Valhalla", creatorName: "Odin" });
    caller = await approve(freya, { kind: "caller", name: "Freya Calls", creatorName: "Freya" });
    srv.app.arena.calls.now = () => cur + MIN;
    await freya.post(`/api/v1/entrants/${caller}/call`, { direction: "down", round: new Date(cur).toISOString() });
    const key = (await odin.post(`/api/v1/entrants/${bot}/keys`, {})).json.token;
    await fetch(srv.base + "/api/v1/bot/calls", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ schema: "d3mon.call/v1", market: "KXBTC15M", direction: "up" }) });
  });
  after(() => srv.stop());

  test("only admins choose who's featured; the list is public", async () => {
    assert.equal((await loki.req("PUT", "/api/v1/vip/featured", { entrantIds: [caller] })).status, 403);
    assert.equal((await hs.req("PUT", "/api/v1/vip/featured", { entrantIds: ["nosuchentrant1"] })).status, 400);
    const r = await hs.req("PUT", "/api/v1/vip/featured", { entrantIds: [caller, bot] });
    assert.equal(r.status, 200);
    const pub = (await guest.get("/api/v1/vip")).json;
    assert.deepEqual(pub.featured.map(e => e.name), ["Freya Calls", "Valhalla"]);
    assert.equal(pub.access, false);
  });

  test("without access there's no room", async () => {
    assert.equal((await guest.get("/api/v1/vip/room")).status, 401);
    assert.equal((await loki.get("/api/v1/vip/room")).status, 403);
    assert.equal((await loki.get("/api/v1/vip/access")).status, 403);
    assert.equal((await loki.post("/api/v1/vip/access", { username: "loki", days: 30 })).status, 403, "members can't give themselves access");
  });

  test("admins grant access by username; it extends from when it runs out", async () => {
    assert.equal((await hs.post("/api/v1/vip/access", { username: "nobody", days: 30 })).status, 404);
    assert.equal((await hs.post("/api/v1/vip/access", { username: "loki", days: 0 })).status, 400);
    vip().now = () => cur + MIN;
    let r = await hs.post("/api/v1/vip/access", { username: "Loki", days: 30, note: "paid by Venmo" });
    assert.equal(r.status, 200);
    assert.equal(r.json.access.until, cur + MIN + 30 * DAY);
    assert.equal(r.json.access.active, true);
    vip().now = () => cur + 2 * MIN;
    r = await hs.post("/api/v1/vip/access", { username: "loki", days: 7 });
    assert.equal(r.json.access.until, cur + MIN + 37 * DAY, "added to the time left, not from today");
    const me = (await loki.get("/api/v1/vip")).json;
    assert.equal(me.access, true);
    assert.equal(me.until, cur + MIN + 37 * DAY);
  });

  test("members with access see the featured caller's call before it's revealed", async () => {
    srv.app.arena.calls.now = () => cur + 2 * MIN;
    const room = (await loki.get("/api/v1/vip/room")).json;
    const by = Object.fromEntries(room.calls.map(c => [c.name, c]));
    assert.equal(by["Freya Calls"].direction, "down");
    assert.equal(by["Freya Calls"].early, true);
    assert.equal(by.Valhalla.direction, "up");
    // Everywhere else it's still sealed.
    assert.equal((await loki.get(`/api/v1/rounds/${cur}/calls`)).json.calls.find(c => c.name === "Freya Calls").sealed, true);
    assert.equal((await hs.get("/api/v1/vip/room")).status, 200, "admins always have access");
  });

  test("access ends by itself, and an admin can end it early", async () => {
    vip().now = () => cur + 40 * DAY;
    assert.equal((await loki.get("/api/v1/vip/room")).status, 403);
    assert.equal((await loki.get("/api/v1/vip")).json.until, null);
    vip().now = () => cur + 3 * MIN;
    const list = (await hs.get("/api/v1/vip/access")).json.access;
    const l = list.find(x => x.username === "loki");
    assert.equal(l.history.length, 2);
    assert.equal(l.note, "");
    const r = await hs.req("DELETE", `/api/v1/vip/access/${l.uid}`);
    assert.equal(r.json.access.active, false);
    assert.equal((await loki.get("/api/v1/vip/room")).status, 403);
    assert.equal((await hs.req("DELETE", `/api/v1/vip/access/${l.uid}`)).json.access.unchanged, true);
    assert.equal(srv.app.arena.ledger.filter(x => x.t === "vip_access").length, 3, "every change is recorded");
  });

  test("the page is served", async () => {
    assert.equal((await guest.get("/vip")).status, 200);
  });
});
