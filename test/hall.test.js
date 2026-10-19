// The Grand Hall's video: an admin pastes a YouTube link, only its video id is kept, and anyone can read it.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
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

  // A stand-in for YouTube's thumbnail host: a tiny JPEG for the Short, nothing for anything else.
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
  let yt, ytHits = 0, srv, hs, loki, guest;
  before(async () => {
    yt = http.createServer((req, res) => {
      ytHits++;
      if (req.url === "/vi/UukZOLdzhZE/hqdefault.jpg") { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(JPEG); }
      else if (req.url === "/vi/dQw4w9WgXcQ/hqdefault.jpg") { res.writeHead(200, { "content-type": "text/html" }); res.end("<p>not an image</p>"); }
      else { res.writeHead(404); res.end(); }
    });
    await new Promise(r => yt.listen(0, "127.0.0.1", r));
    srv = await startServer({ ytThumbUrl: `http://127.0.0.1:${yt.address().port}` });
    [hs, loki, guest] = Array.from({ length: 3 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await loki.register("loki", "loki-pass-12", "Loki");
  });
  after(async () => { await srv.stop(); yt.close(); });

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

  test("the thumbnail comes from D3MON itself, fetched once, and only real images are passed on", async () => {
    const { video } = (await guest.get("/api/v1/hall/video")).json;
    assert.equal(video.thumb, "/api/v1/hall/video/thumb?v=UukZOLdzhZE");
    const get = () => fetch(srv.base + video.thumb);
    const r = await get();
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), JPEG);
    const hits = ytHits;
    assert.equal((await get()).status, 200);
    assert.equal(ytHits, hits, "the second request is served from memory");
    // A video whose "thumbnail" isn't an image gets none, and YouTube isn't asked again straight away.
    await hs.req("PUT", "/api/v1/hall/video", { url: "https://youtu.be/dQw4w9WgXcQ" });
    assert.equal((await get()).status, 404);
    const after = ytHits;
    assert.equal((await get()).status, 404);
    assert.equal(ytHits, after);
    await hs.req("PUT", "/api/v1/hall/video", { url: "https://youtube.com/shorts/UukZOLdzhZE", title: "HardSmoke on D3MON" });
  });

  test("it's in the ledger, so it survives a restart, and admins can take it down", async () => {
    const lines = srv.app.arena.ledger.lines.filter(l => l.t === "hall_video");
    assert.equal(lines.length, 3);
    assert.equal(lines.at(-1).video.id, "UukZOLdzhZE");
    assert.equal((await loki.req("DELETE", "/api/v1/hall/video")).status, 403);
    assert.equal((await hs.req("DELETE", "/api/v1/hall/video")).status, 200);
    assert.deepEqual((await guest.get("/api/v1/hall/video")).json, { video: null });
    assert.equal((await fetch(srv.base + "/api/v1/hall/video/thumb")).status, 404);
    assert.equal((await hs.req("DELETE", "/api/v1/hall/video")).json.unchanged, true);
  });
});
