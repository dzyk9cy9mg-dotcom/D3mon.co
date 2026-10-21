// The Battle of the Bots cockpit (/battle): admins choose what each of the seven screens shows and which battle
// the page follows; everyone reads it. Also the video files the page plays, served in byte ranges.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

const Q = 15 * 60000;

describe("battle cockpit", () => {
  let srv, hs, loki, guest, live, later;
  const cur = Math.floor(Date.now() / Q) * Q;
  before(async () => {
    srv = await startServer();
    [hs, loki, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await loki.register("loki", "loki-pass-12", "Loki");
    live = (await hs.post("/api/v1/battles", { title: "Running now", startsAt: cur - Q, rounds: 4, status: "open" })).json.battle;
    later = (await hs.post("/api/v1/battles", { title: "Saturday", startsAt: cur + 20 * Q, rounds: 4, status: "open" })).json.battle;
  });
  after(() => srv.stop());

  test("every screen has a default, and the page follows the battle running now", async () => {
    const r = (await guest.get("/api/v1/cockpit")).json;
    assert.deepEqual(r.slots, ["ticker", "main", "leftTop", "leftBottom", "rightTop", "rightBottom", "console"]);
    assert.equal(r.screens.main.show, "bots");
    assert.equal(r.screens.console.show, "desk");
    assert.equal(r.battle.id, live.id);
    assert.equal(r.battleId, null);
    assert.ok(r.modules.promo);
  });

  test("only admins change it; a message needs text and a promo a YouTube link, kept without tracking", async () => {
    const body = { screens: { main: { show: "lineup", title: "The fighters" } } };
    assert.equal((await guest.req("PUT", "/api/v1/cockpit", body)).status, 401);
    assert.equal((await loki.req("PUT", "/api/v1/cockpit", body)).status, 403);
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { screens: { roof: { show: "bots" } } })).status, 400);
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { screens: { main: { show: "fireworks" } } })).status, 400);
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { screens: { leftTop: { show: "message" } } })).json.error.field, "screens.leftTop.text");
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { screens: { rightBottom: { show: "promo", video: "https://example.com/v" } } })).json.error.field, "screens.rightBottom.video");
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { extra: 1 })).status, 400);

    const ok = await hs.req("PUT", "/api/v1/cockpit", { screens: {
      main: { show: "lineup", title: "The fighters" },
      leftTop: { show: "message", text: "Battle of the Bots, live every Saturday", video: "ignored" },
      rightBottom: { show: "promo", video: "https://youtube.com/shorts/UukZOLdzhZE?is=OHpa_WXaRqnH4bcu" },
    } });
    assert.equal(ok.status, 200);
    const r = (await guest.get("/api/v1/cockpit")).json;
    assert.deepEqual(r.screens.main, { show: "lineup", title: "The fighters", promo: null });
    assert.equal(r.screens.leftTop.text, "Battle of the Bots, live every Saturday");
    assert.equal(r.screens.leftTop.video, undefined, "a message keeps no video");
    assert.equal(r.screens.rightBottom.promo.embed, "https://www.youtube-nocookie.com/embed/UukZOLdzhZE");
    assert.ok(!JSON.stringify(r).includes("OHpa"), "the share link's tracking is never kept");
    assert.equal(r.screens.console.show, "desk", "screens left out keep what they had");

    // null puts a screen back to its default
    await hs.req("PUT", "/api/v1/cockpit", { screens: { main: null } });
    assert.equal((await guest.get("/api/v1/cockpit")).json.screens.main.show, "bots");
  });

  test("an admin can pin a battle, and unpin it", async () => {
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { battleId: "nope" })).status, 404);
    await hs.req("PUT", "/api/v1/cockpit", { battleId: later.id });
    assert.equal((await guest.get("/api/v1/cockpit")).json.battle.id, later.id);
    await hs.req("PUT", "/api/v1/cockpit", { battleId: null });
    assert.equal((await guest.get("/api/v1/cockpit")).json.battle.id, live.id);
  });

  test("HardSmoke picks the stream everyone sees", async () => {
    assert.equal((await guest.get("/api/v1/cockpit")).json.featured, 0);
    assert.equal((await loki.req("PUT", "/api/v1/cockpit", { featured: 2 })).status, 403);
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { featured: 12 })).status, 400);
    assert.equal((await hs.req("PUT", "/api/v1/cockpit", { featured: "1" })).status, 400);
    await hs.req("PUT", "/api/v1/cockpit", { featured: 2 });
    assert.equal((await guest.get("/api/v1/cockpit")).json.featured, 2);
  });

  test("the layout survives a restart (it's in the ledger)", async () => {
    await hs.req("PUT", "/api/v1/cockpit", { screens: { ticker: { show: "lastRound" } } });
    const again = new (srv.app.arena.cockpit.constructor)({ ledger: srv.app.arena.ledger, feed: srv.app.arena.feed, registry: srv.app.arena.registry });
    assert.equal(again.view({}).screens.ticker.show, "lastRound");
  });

  test("the cockpit page and its video are served, the video in byte ranges", async () => {
    assert.equal((await fetch(srv.base + "/battle")).status, 200);
    const full = await fetch(srv.base + "/media/cockpit.mp4");
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), "video/mp4");
    assert.equal(full.headers.get("accept-ranges"), "bytes");
    const size = (await full.arrayBuffer()).byteLength;
    const part = await fetch(srv.base + "/media/cockpit.mp4", { headers: { range: "bytes=0-99" } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), `bytes 0-99/${size}`);
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    const tail = await fetch(srv.base + "/media/cockpit.mp4", { headers: { range: "bytes=-10" } });
    assert.equal(tail.headers.get("content-range"), `bytes ${size - 10}-${size - 1}/${size}`);
    assert.equal((await fetch(srv.base + "/media/cockpit.mp4", { headers: { range: `bytes=${size}-` } })).status, 416);
  });
});
