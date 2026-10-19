// The hall chat and one D3MON Discord channel as one conversation, against a stand-in Discord: messages from the
// channel join the hall's log, hall and Cortex messages go to the channel through the webhook, and nothing loops.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer, Client } from "./helpers.js";
import { plainText } from "../server/arena/discord.js";

const CH = "111222333444555666", HOOK = "999888777666555444", TOKEN = "stand-in-bot-key";

describe("discord link", () => {
  test("turns Discord's mentions and emoji into plain text", () => {
    assert.equal(plainText({ content: "gm <@42> look at <#7> <:pepe:123> <@&9>", mentions: [{ id: "42", username: "odin", global_name: "Odin" }] }), "gm @Odin look at #channel :pepe: @role");
    assert.equal(plainText({ content: "", attachments: [{}] }), "📎");
  });

  // The stand-in: a channel of messages, a webhook that posts into it (as Discord's does), and the bot's key checked.
  let dc, msgs = [], posted = [], nextId = 1000n, srv, odin, loki, guest, hs;
  const discord = () => srv.app.arena.discord;
  const add = (m) => { const id = String(nextId++); msgs.push({ id, type: 0, timestamp: new Date().toISOString(), mentions: [], attachments: [], ...m }); return id; };
  before(async () => {
    add({ content: "old message from before the link", author: { id: "1", username: "early" } });
    dc = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      if (req.method === "GET" && u.pathname === `/channels/${CH}/messages`) {
        if (req.headers.authorization !== `Bot ${TOKEN}`) { res.writeHead(401); return res.end(); }
        const afterId = BigInt(u.searchParams.get("after") || "0"), lim = +u.searchParams.get("limit");
        let out = u.searchParams.has("after") ? msgs.filter(m => BigInt(m.id) > afterId) : msgs.slice(-lim);
        res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(out.slice(-lim).reverse())); // newest first, like Discord
      }
      if (req.method === "POST" && u.pathname === `/webhooks/${HOOK}/hook-secret`) {
        let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
          const j = JSON.parse(b); posted.push(j);
          const id = add({ content: j.content, author: { id: HOOK, username: j.username, bot: true }, webhook_id: HOOK });
          res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id }));
        });
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise(r => dc.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${dc.address().port}`;
    srv = await startServer({ discordToken: TOKEN, discordChannel: CH, discordWebhook: `${base}/webhooks/${HOOK}/hook-secret`, discordApi: base, discordPoll: false });
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
  });
  after(async () => { await srv.stop(); dc.close(); });
  const settle = () => new Promise(r => setTimeout(r, 600));
  const hallTexts = async () => (await guest.get("/api/v1/hall/chat")).json.messages.map(m => `${m.from || "site"}:${m.name}:${m.text}`);

  test("the first read only marks where to start: the channel's history isn't poured into the hall", async () => {
    await discord().poll();
    assert.deepEqual(await hallTexts(), []);
    assert.equal((await guest.get("/api/v1/hall/chat")).json.discord, true);
  });

  test("new channel messages join the hall, once, with the sender's Discord name", async () => {
    add({ content: "gm from discord <@5>", author: { id: "2", username: "freya_x", global_name: "Freya" }, mentions: [{ id: "5", username: "odin" }] });
    add({ content: "", type: 7, author: { id: "3", username: "newbie" } }); // a join notice
    await discord().poll(); await discord().poll();
    assert.deepEqual(await hallTexts(), ["discord:Freya:gm from discord @odin"]);
  });

  test("hall and Cortex messages go to the channel under the member's name, and their echoes don't come back", async () => {
    await odin.post("/api/v1/hall/chat", { text: "hello Discord @everyone" });
    // a message written by the main page's Cortex chat straight into the log
    const h = new Date().toISOString().slice(0, 13).replace(/[-T]/g, ""), doc = srv.app.store.get(`lounge/${h}`).data;
    srv.app.store.set(`lounge/${h}`, { ...doc, msgs: { ...doc.msgs, cx1: { a: loki.user.id, t: Date.now(), b: "from the Cortex", tab: "main" }, cx2: { a: loki.user.id, t: Date.now(), b: "vortex only", tab: "vortex" } } });
    await settle(); await settle();
    assert.deepEqual(posted.map(p => [p.username, p.content]), [["Odin · D3MON", "hello Discord @everyone"], ["Loki · D3MON", "from the Cortex"]]);
    assert.ok(posted.every(p => Array.isArray(p.allowed_mentions?.parse) && p.allowed_mentions.parse.length === 0), "nobody gets pinged from the site");
    await discord().poll();
    const texts = await hallTexts();
    assert.equal(texts.filter(t => t.includes("hello Discord")).length, 1, "the webhook's echo isn't added again");
    assert.equal(texts.filter(t => t.startsWith("discord:")).length, 1);
  });

  test("muted members aren't sent, masked words stay masked, and admins can see the link's health without its secrets", async () => {
    srv.app.store.set("config/mod", { words: "scam", muted: { [loki.user.id]: { until: 0 } } });
    const before = posted.length;
    const h = new Date().toISOString().slice(0, 13).replace(/[-T]/g, ""), doc = srv.app.store.get(`lounge/${h}`).data;
    srv.app.store.set(`lounge/${h}`, { ...doc, msgs: { ...doc.msgs, cx3: { a: loki.user.id, t: Date.now(), b: "muted words", tab: "main" } } });
    await new Promise(r => setTimeout(r, 2100));
    await odin.post("/api/v1/hall/chat", { text: "that scam again" });
    await settle(); await settle();
    assert.deepEqual(posted.slice(before).map(p => p.content), ["that s*** again"]);
    const admin = (await hs.get("/api/v1/hall/chat")).json;
    assert.equal(admin.link.on, true);
    assert.equal(admin.link.error, null);
    assert.ok(!JSON.stringify(admin).includes(TOKEN) && !JSON.stringify(admin).includes("hook-secret"));
    assert.equal((await guest.get("/api/v1/hall/chat")).json.link, undefined);
  });
});
