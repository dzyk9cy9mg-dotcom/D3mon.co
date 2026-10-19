// The Grand Hall's chat: the main floor of the Cortex chat through /api/v1, sharing the main page's log, with
// the chat rules (bans, mutes, slow mode, masked words) enforced on the server.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, Client } from "./helpers.js";
import { hourKey, maskWords } from "../server/arena/hallchat.js";

describe("hall chat", () => {
  let srv, hs, odin, loki, guest, t = Date.UTC(2026, 9, 19, 14, 20);
  const chat = () => srv.app.arena.hallChat;
  before(async () => {
    srv = await startServer();
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
    chat().now = () => t;
  });
  after(() => srv.stop());

  test("masks words the way the main page does", () => {
    assert.equal(maskWords("what a Scam, scammer", "scam"), "what a S***, scammer");
    assert.equal(maskWords("fine", ""), "fine");
  });

  test("members post to the main floor, in the same log the main page reads; guests only read", async () => {
    assert.equal((await guest.req("POST", "/api/v1/hall/chat", { text: "hi" })).status, 401);
    const r = await odin.req("POST", "/api/v1/hall/chat", { text: "  BTC looks heavy  " });
    assert.equal(r.status, 201);
    assert.equal(r.json.message.name, "Odin");
    assert.equal(r.json.message.text, "BTC looks heavy");
    const doc = srv.app.store.get(`lounge/${hourKey(t)}`).data;
    const [m] = Object.values(doc.msgs);
    assert.equal(doc.hour, hourKey(t));
    assert.deepEqual({ a: m.a, b: m.b, tab: m.tab, t: m.t }, { a: odin.user.id, b: "BTC looks heavy", tab: "main", t });
    assert.deepEqual((await guest.get("/api/v1/hall/chat")).json.messages.map(x => x.text), ["BTC looks heavy"]);
  });

  test("messages from the main page show too, but only the main floor, and deleted ones don't", async () => {
    const h = hourKey(t), doc = srv.app.store.get(`lounge/${h}`).data;
    srv.app.store.set(`lounge/${h}`, { ...doc, msgs: { ...doc.msgs,
      a1: { a: loki.user.id, t: t + 1, b: "from the Cortex" },
      a2: { a: loki.user.id, t: t + 2, b: "in the vortex", tab: "vortex" },
      a3: { a: loki.user.id, t: t + 3, b: "", deleted: true },
      a4: { a: odin.user.id, t: t + 4, b: "my bot says up", as: { k: "bot", id: "x", n: "Valhalla" }, dir: "up" } } });
    const { messages } = (await guest.get("/api/v1/hall/chat")).json;
    assert.deepEqual(messages.map(x => x.text), ["BTC looks heavy", "from the Cortex", "my bot says up"]);
    assert.deepEqual({ name: messages[2].name, as: messages[2].as, direction: messages[2].direction }, { name: "Valhalla", as: "bot", direction: "up" });
  });

  test("slow mode, mutes, bans and secrets are enforced by the server", async () => {
    assert.equal((await odin.req("POST", "/api/v1/hall/chat", { text: "again" })).status, 429, "at least 2 s between messages");
    t += 3000;
    assert.equal((await odin.req("POST", "/api/v1/hall/chat", { text: "again" })).status, 201);
    srv.app.store.set("config/mod", { slow: 30, words: "scam", muted: { [loki.user.id]: { t, until: t + 3600000 } } });
    t += 3000;
    assert.equal((await odin.req("POST", "/api/v1/hall/chat", { text: "third" })).status, 429, "the admins' slow mode");
    assert.equal((await hs.req("POST", "/api/v1/hall/chat", { text: "admins aren't slowed" })).status, 201);
    assert.equal((await loki.req("POST", "/api/v1/hall/chat", { text: "let me talk" })).status, 403, "muted");
    t += 3600000 + 1;
    assert.equal((await loki.req("POST", "/api/v1/hall/chat", { text: "that scam is over" })).status, 201, "the mute ran out");
    assert.equal((await guest.get("/api/v1/hall/chat")).json.messages.at(-1).text, "that s*** is over");
    t += 31000;
    assert.equal((await loki.req("POST", "/api/v1/hall/chat", { text: "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789" })).status, 400, "secrets are refused");
    assert.equal((await loki.req("POST", "/api/v1/hall/chat", { text: "x".repeat(401) })).status, 400);
    srv.app.accounts.roles.banned.push(loki.user.id);
    assert.equal((await loki.req("POST", "/api/v1/hall/chat", { text: "banned now" })).status, 403);
  });
});
