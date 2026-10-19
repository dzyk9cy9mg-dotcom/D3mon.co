// The Grand Hall's video: an admin pastes a YouTube link, only its video id is kept, and anyone can read it.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";
import { parseVideoUrl } from "../server/arena/hall.js";

describe("hall video", () => {
  test("reads the video out of every kind of YouTube link, and nothing else", () => {
    assert.deepEqual(parseVideoUrl("https://youtube.com/shorts/UukZOLdzhZE?is=OHpa_WXaRqnH4bcu"), { provider: "youtube", id: "UukZOLdzhZE", kind: "short" });
    assert.deepEqual(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42"), { provider: "youtube", id: "dQw4w9WgXcQ", kind: "video" });
    assert.deepEqual(parseVideoUrl("youtu.be/dQw4w9WgXcQ?si=abc"), { provider: "youtube", id: "dQw4w9WgXcQ", kind: "video" });
    assert.deepEqual(parseVideoUrl("https://m.youtube.com/live/dQw4w9WgXcQ"), { provider: "youtube", id: "dQw4w9WgXcQ", kind: "live" });
    for (const bad of ["https://example.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "https://youtube.com/@hardsmoke", "not a link", "https://youtube.com.evil.io/shorts/UukZOLdzhZE"])
      assert.equal(parseVideoUrl(bad), null, bad);
  });

  let srv, hs, loki, guest;
  before(async () => {
    srv = await startServer();
    [hs, loki, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await loki.register("loki", "loki-pass-12", "Loki");
  });
  after(() => srv.stop());

  test("only admins set it; everyone reads it, without the link's tracking", async () => {
    assert.deepEqual((await guest.get("/api/v1/hall/video")).json, { video: null });
    const link = { url: "https://youtube.com/shorts/UukZOLdzhZE?is=OHpa_WXaRqnH4bcu", title: "HardSmoke on D3MON" };
    assert.equal((await guest.req("PUT", "/api/v1/hall/video", link)).status, 401);
    assert.equal((await loki.req("PUT", "/api/v1/hall/video", link)).status, 403);
    assert.equal((await hs.req("PUT", "/api/v1/hall/video", { url: "https://example.com/x" })).status, 400);
    assert.equal((await hs.req("PUT", "/api/v1/hall/video", { ...link, extra: 1 })).status, 400);
    assert.equal((await hs.req("PUT", "/api/v1/hall/video", link)).status, 200);
    const { video } = (await guest.get("/api/v1/hall/video")).json;
    assert.equal(video.id, "UukZOLdzhZE");
    assert.equal(video.kind, "short");
    assert.equal(video.title, "HardSmoke on D3MON");
    assert.equal(video.embed, "https://www.youtube-nocookie.com/embed/UukZOLdzhZE");
    assert.equal(video.watch, "https://www.youtube.com/shorts/UukZOLdzhZE");
    assert.ok(!JSON.stringify(video).includes("OHpa"), "the share link's tracking is never kept");
  });

  test("it's in the ledger, so it survives a restart, and admins can take it down", async () => {
    const lines = srv.app.arena.ledger.lines.filter(l => l.t === "hall_video");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].video.id, "UukZOLdzhZE");
    assert.equal((await loki.req("DELETE", "/api/v1/hall/video")).status, 403);
    assert.equal((await hs.req("DELETE", "/api/v1/hall/video")).status, 200);
    assert.deepEqual((await guest.get("/api/v1/hall/video")).json, { video: null });
    assert.equal((await hs.req("DELETE", "/api/v1/hall/video")).json.unchanged, true);
  });
});
