// The D3MON Lab (owner, 2026-10-22/23): members post in Showcase, Help Desk and Experiments; admins post Library
// lessons and the AI teacher's Daily shorts (with a YouTube video); replies, solved, pins, edits and hidden removals.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";

describe("the Lab", () => {
  let srv, boss, odin, loki, guest, help, daily;
  before(async () => {
    srv = await startServer();
    [boss, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await boss.register("boss", "boss-pass-12", "Boss");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
  });
  after(() => srv.stop());

  test("the page is served and the sections are listed for everyone", async () => {
    assert.equal((await fetch(srv.base + "/lab")).status, 200);
    const r = (await guest.get("/api/v1/lab")).json;
    assert.deepEqual(r.sections.map(s => s.key), ["showcase", "help", "library", "experiments", "daily"]);
    assert.deepEqual(r.sections.filter(s => s.adminOnly).map(s => s.key), ["library", "daily"]);
    assert.deepEqual(r.posts, []);
  });

  test("members post; guests can't; the Library and Daily are for admins; bad input is refused", async () => {
    const q = { section: "help", title: "Why does my bot call late?", body: "It sends at minute 14 and gets round_locked." };
    assert.equal((await guest.req("POST", "/api/v1/lab", q)).status, 401);
    const r = await odin.req("POST", "/api/v1/lab", q);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    help = r.json.post;
    assert.equal(help.by.name, "Odin");
    assert.equal((await odin.req("POST", "/api/v1/lab", { ...q, section: "library" })).status, 403);
    assert.equal((await odin.req("POST", "/api/v1/lab", { ...q, section: "daily" })).status, 403);
    for (const bad of [{ ...q, section: "news" }, { ...q, title: "Hi" }, { ...q, body: "short" }, { ...q, link: "http://x.example" }, { ...q, video: "https://vimeo.com/123" }, { ...q, extra: 1 }])
      assert.equal((await odin.req("POST", "/api/v1/lab", bad)).status, 400, JSON.stringify(bad));
    assert.equal((await odin.req("POST", "/api/v1/lab", { ...q, body: "my key is sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" })).status, 400, "secrets refused");
  });

  test("the AI teacher's Daily short carries a YouTube video, kept as its id only", async () => {
    const r = await boss.req("POST", "/api/v1/lab", { section: "daily", title: "Why the 3 PM round moves", body: "Today: what news does to a 15-minute round.", video: "https://youtube.com/shorts/UukZOLdzhZE?si=tracking123" });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    daily = r.json.post;
    assert.equal(daily.video.id, "UukZOLdzhZE");
    assert.equal(daily.video.kind, "short");
    assert.match(daily.video.embed, /youtube-nocookie\.com\/embed\/UukZOLdzhZE$/);
    assert.equal((await guest.get(`/api/v1/lab?section=daily`)).json.posts.length, 1);
  });

  test("an admin moves a Daily short into the Library; members can't move sections", async () => {
    assert.equal((await odin.req("PATCH", `/api/v1/lab/${help.id}`, { section: "showcase" })).status, 403);
    const r = await boss.req("PATCH", `/api/v1/lab/${daily.id}`, { section: "library" });
    assert.equal(r.json.post.section, "library");
    assert.equal(r.json.post.video.id, "UukZOLdzhZE");
  });

  test("replies, solved by the asker only, pins by admins only", async () => {
    assert.equal((await guest.req("POST", `/api/v1/lab/${help.id}/replies`, { body: "Try minute 10" })).status, 401);
    const r = await loki.req("POST", `/api/v1/lab/${help.id}/replies`, { body: "Calls close at the battle's close minute. Check callsCloseAt on bot/me." });
    assert.equal(r.status, 201);
    assert.equal(r.json.post.replies.length, 1);
    assert.equal((await loki.req("PUT", `/api/v1/lab/${help.id}/solved`, { on: true })).status, 403);
    assert.equal((await odin.req("PUT", `/api/v1/lab/${help.id}/solved`, { on: true })).json.post.solved, true);
    assert.equal((await odin.req("PUT", `/api/v1/lab/${daily.id}/solved`, { on: true })).status, 409, "only Help Desk questions");
    assert.equal((await odin.req("PUT", `/api/v1/lab/${help.id}/pin`, { on: true })).status, 403);
    assert.equal((await boss.req("PUT", `/api/v1/lab/${help.id}/pin`, { on: true })).json.post.pinned, true);
    assert.equal((await guest.get("/api/v1/lab")).json.posts[0].id, help.id, "pinned first");
  });

  test("six new posts an hour per member; mistakes don't count", async () => {
    const q = { section: "experiments", title: "Fading the open", body: "Testing whether the first minute overreacts." };
    for (let i = 0; i < 4; i++) assert.equal((await loki.req("POST", "/api/v1/lab", { ...q, title: "x" })).status, 400);
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await loki.req("POST", "/api/v1/lab", { ...q, title: `${q.title} ${i}` })).status);
    assert.deepEqual(codes, [201, 201, 201, 201, 201, 201, 429, 429]);
  });

  test("code in a post keeps its lines and indentation", async () => {
    const body = "My loop:\n\n```python\nwhile True:\n    call()   \n    sleep(840)\n```\n";
    const r = await odin.req("POST", "/api/v1/lab", { section: "experiments", title: "Indent check", body });
    assert.equal(r.json.post.body, "My loop:\n\n```python\nwhile True:\n    call()\n    sleep(840)\n```");
  });

  test("search finds posts by their words", async () => {
    assert.deepEqual((await guest.get("/api/v1/lab?q=late%20bot")).json.posts.map(p => p.id), [help.id]);
    assert.equal((await guest.get("/api/v1/lab?section=experiments&q=fading%200")).json.posts.length, 1);
    assert.deepEqual((await guest.get("/api/v1/lab?q=nothing-like-this")).json.posts, []);
  });

  test("authors edit and remove their own; removed posts and replies are hidden but admins still see them", async () => {
    assert.equal((await loki.req("PATCH", `/api/v1/lab/${help.id}`, { title: "Hijacked title" })).status, 403);
    assert.equal((await odin.req("PATCH", `/api/v1/lab/${help.id}`, { title: "Why does my bot call so late?" })).json.post.title, "Why does my bot call so late?");
    const rid = (await guest.get(`/api/v1/lab/${help.id}`)).json.post.replies[0].id;
    assert.equal((await odin.req("DELETE", `/api/v1/lab/${help.id}/replies/${rid}`)).status, 403);
    assert.equal((await loki.req("DELETE", `/api/v1/lab/${help.id}/replies/${rid}`)).json.post.replies.length, 0);
    assert.equal((await boss.get(`/api/v1/lab/${help.id}`)).json.post.replies.length, 1, "admins see it, marked removed");
    assert.equal((await loki.req("DELETE", `/api/v1/lab/${help.id}`)).status, 403);
    assert.equal((await odin.req("DELETE", `/api/v1/lab/${help.id}`)).json.removed, true);
    assert.equal((await guest.get(`/api/v1/lab/${help.id}`)).status, 404);
    assert.equal((await boss.get(`/api/v1/lab/${help.id}`)).json.post.removed, true);
    assert.ok(!(await guest.get("/api/v1/lab")).json.posts.some(p => p.id === help.id));
  });

  test("posts can't be read or written through /api/db", async () => {
    assert.notEqual((await boss.req("POST", "/api/db", { op: "query", collection: "arena_lab" })).status, 200);
  });
});
