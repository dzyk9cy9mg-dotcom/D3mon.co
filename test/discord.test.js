// The site's chat and the D3MON Discord as one conversation, against a stand-in Discord: the main channel and
// whole categories (text channels and voice channels' text chat) are linked, messages go both ways, and nothing
// loops.
import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer, Client } from "./helpers.js";
import { plainText } from "../server/arena/discord.js";

const TOKEN = "stand-in-bot-key", GUILD = "500", CAT = "600", MAIN = "601", BTC = "602", ALPHA = "603", VOICE = "604", OTHER = "605";

describe("discord link", () => {
  test("turns Discord's mentions and emoji into plain text", () => {
    assert.equal(plainText({ content: "gm <@42> look at <#7> <:pepe:123> <@&9>", mentions: [{ id: "42", username: "odin", global_name: "Odin" }] }), "gm @Odin look at #channel :pepe: @role");
    assert.equal(plainText({ content: "", attachments: [{}] }), "📎");
  });

  // The stand-in: a server with one category of channels, webhooks the bot can make (not in the voice channel),
  // each webhook posting into its channel as Discord's do, and the bot's key checked on every call.
  const chans = {
    [CAT]: { id: CAT, type: 4, name: "Trading", guild_id: GUILD },
    [MAIN]: { id: MAIN, type: 0, name: "trading-floor", parent_id: CAT, guild_id: GUILD },
    [BTC]: { id: BTC, type: 0, name: "BTC", parent_id: CAT, guild_id: GUILD },
    [ALPHA]: { id: ALPHA, type: 0, name: "alpha-calls", parent_id: CAT, guild_id: GUILD },
    [VOICE]: { id: VOICE, type: 2, name: "Voice Lounge", parent_id: CAT, guild_id: GUILD },
    [OTHER]: { id: OTHER, type: 0, name: "mods-only", parent_id: "999", guild_id: GUILD },
  };
  const msgs = {}, hooks = {}, posted = [];
  let nextId = 1000n, dc, srv, odin, loki, guest, hs;
  const add = (ch, m) => { const id = String(nextId++); (msgs[ch] ||= []).push({ id, type: 0, timestamp: new Date().toISOString(), mentions: [], attachments: [], ...m }); return id; };
  const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  before(async () => {
    add(MAIN, { content: "old message from before the link", author: { id: "1", username: "early" } });
    dc = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x"), p = u.pathname.split("/").filter(Boolean);
      let b = ""; req.on("data", c => (b += c)); req.on("end", () => {
        if (p[0] === "webhooks") { // posting through a webhook needs no bot key
          const w = Object.values(hooks).flat().find(x => x.id === p[1] && x.token === p[2]);
          if (!w) return json(res, 404, {});
          const j = JSON.parse(b); posted.push({ channel: w.channel, ...j });
          return json(res, 200, { id: add(w.channel, { content: j.content, author: { id: w.id, username: j.username, bot: true }, webhook_id: w.id }) });
        }
        if (req.headers.authorization !== `Bot ${TOKEN}`) return json(res, 401, {});
        if (p[0] === "guilds" && p[2] === "channels") return json(res, 200, Object.values(chans).filter(c => c.type !== 4 || true));
        if (p[0] !== "channels" || !chans[p[1]]) return json(res, 404, {});
        const ch = p[1];
        if (p.length === 2) return json(res, 200, chans[ch]);
        if (p[2] === "webhooks" && req.method === "GET") return json(res, 200, (hooks[ch] || []).map(w => ({ id: w.id, name: w.name, token: w.token })));
        if (p[2] === "webhooks" && req.method === "POST") {
          if (chans[ch].type === 2) return json(res, 403, { message: "Missing Permissions" }); // say Discord won't here
          const w = { id: String(nextId++), token: `tok${ch}`, name: JSON.parse(b).name, channel: ch };
          (hooks[ch] ||= []).push(w); return json(res, 200, w);
        }
        if (p[2] === "messages") {
          const list = msgs[ch] || [], lim = +u.searchParams.get("limit");
          const out = u.searchParams.has("after") ? list.filter(m => BigInt(m.id) > BigInt(u.searchParams.get("after"))) : list.slice(-lim);
          return json(res, 200, out.slice(-lim).reverse()); // newest first, like Discord
        }
        json(res, 404, {});
      });
    });
    await new Promise(r => dc.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${dc.address().port}`;
    // The ids come mixed, in any order, as the owner pasted them: the category and the main channel, with no line saying
    // which is which. Discord tells the server; the first plain channel is the main one.
    srv = await startServer({ discordToken: TOKEN, discordCategories: [CAT, MAIN], discordApi: base, discordPoll: false });
    [hs, odin, loki, guest] = Array.from({ length: 4 }, () => new Client(srv.base));
    await hs.register("hardsmoke", "smoke-pass-1", "HardSmoke");
    await odin.register("odin", "odin-pass-12", "Odin");
    await loki.register("loki", "loki-pass-12", "Loki");
  });
  after(async () => { await srv.stop(); dc.close(); });
  const discord = () => srv.app.arena.discord;
  const settle = () => new Promise(r => setTimeout(r, 600));
  const chat = async (channel = "main") => (await guest.get(`/api/v1/hall/chat?channel=${channel}`)).json;
  const texts = async channel => (await chat(channel)).messages.map(m => `${m.from || "site"}:${m.name}:${m.text}`);

  test("a category links every text channel in it and its voice channel's chat; nothing outside it", async () => {
    await discord().find(); await discord().poll();
    const { channels } = await chat();
    assert.deepEqual(channels.map(c => c.id), ["main", `dc${ALPHA}`, "btc", `dc${VOICE}`], "the main floor first, then by name");
    assert.ok(channels.every(c => c.discord));
    assert.deepEqual(channels.map(c => c.name), ["main-floor", "alpha-calls", "btc", "voice-lounge"]);
    // the new ones are Cortex channels too, so the main page shows them
    const chx = srv.app.store.get("config/cortex").data.chx;
    assert.deepEqual(Object.keys(chx).sort(), [`dc${ALPHA}`, `dc${VOICE}`]);
    assert.equal(chx[`dc${ALPHA}`].name, "alpha-calls");
    assert.equal(chx[`dc${ALPHA}`].cat, "text");
    assert.deepEqual(await texts("main"), [], "history isn't poured in");
  });

  test("messages from each channel land in its own channel, once", async () => {
    add(MAIN, { content: "gm from discord <@5>", author: { id: "2", username: "freya_x", global_name: "Freya" }, mentions: [{ id: "5", username: "odin" }] });
    add(BTC, { content: "btc looks heavy", author: { id: "3", username: "thor" } });
    add(VOICE, { content: "in the voice chat", author: { id: "4", username: "tyr" } });
    add(MAIN, { content: "", type: 7, author: { id: "9", username: "newbie" } }); // a join notice
    await discord().poll(); await discord().poll();
    assert.deepEqual(await texts("main"), ["discord:Freya:gm from discord @odin"]);
    assert.deepEqual(await texts("btc"), ["discord:thor:btc looks heavy"]);
    assert.deepEqual(await texts(`dc${VOICE}`), ["discord:tyr:in the voice chat"]);
    assert.equal((await guest.get("/api/v1/hall/chat?channel=nope")).status, 404);
  });

  test("site messages go to their own channel's webhook, the bot makes them itself, and echoes don't come back", async () => {
    await odin.post("/api/v1/hall/chat", { text: "hello Discord @everyone" });
    await new Promise(r => setTimeout(r, 2100));
    await odin.post("/api/v1/hall/chat", { text: "to the btc room", channel: "btc" });
    // a message written by the main page's Cortex straight into a linked channel
    const h = new Date().toISOString().slice(0, 13).replace(/[-T]/g, ""), doc = srv.app.store.get(`lounge/${h}`).data;
    srv.app.store.set(`lounge/${h}`, { ...doc, msgs: { ...doc.msgs, cx1: { a: loki.user.id, t: Date.now(), b: "from the Cortex", tab: `dc${ALPHA}` }, cx2: { a: loki.user.id, t: Date.now(), b: "unlinked tab", tab: "eth" } } });
    await settle(); await settle(); await settle();
    assert.deepEqual(posted.map(p => [p.channel, p.username, p.content]), [[MAIN, "Odin · D3MON", "hello Discord @everyone"], [BTC, "Odin · D3MON", "to the btc room"], [ALPHA, "Loki · D3MON", "from the Cortex"]]);
    assert.ok(posted.every(p => Array.isArray(p.allowed_mentions?.parse) && p.allowed_mentions.parse.length === 0), "nobody gets pinged from the site");
    await discord().poll();
    assert.equal((await texts("main")).filter(t => t.includes("hello Discord")).length, 1, "the webhook's echo isn't added again");
    assert.equal((await texts("btc")).filter(t => t.includes("btc room")).length, 1);
    assert.deepEqual(hooks[MAIN].map(w => w.name), ["D3MON"], "made once, then reused");
  });

  test("a voice channel Discord won't give a webhook only reads, and admins see why", async () => {
    const admin = (await hs.get("/api/v1/hall/chat")).json;
    const voice = admin.link.channels.find(c => c.tab === `dc${VOICE}`);
    assert.equal(voice.canPost, false);
    assert.match(voice.postError, /403/);
    assert.equal(voice.error, null, "it still reads fine");
    assert.ok(!JSON.stringify(admin).includes(TOKEN) && !JSON.stringify(admin).includes("tok60"), "no secrets in the health");
    assert.equal((await guest.get("/api/v1/hall/chat")).json.link, undefined);
  });

  test("a channel moved out of the category is unlinked, and its messages stay", async () => {
    chans[ALPHA].parent_id = "999";
    await discord().find();
    assert.deepEqual((await chat()).channels.map(c => c.id), ["main", "btc", `dc${VOICE}`]);
    assert.equal(srv.app.store.get("config/cortex").data.chx[`dc${ALPHA}`].del, true);
    const h = new Date().toISOString().slice(0, 13).replace(/[-T]/g, "");
    assert.ok(Object.values(srv.app.store.get(`lounge/${h}`).data.msgs).some(m => m.b === "from the Cortex"));
  });

  test("muted members aren't sent and masked words stay masked", async () => {
    srv.app.store.set("config/mod", { words: "scam", muted: { [loki.user.id]: { until: 0 } } });
    const before = posted.length;
    const h = new Date().toISOString().slice(0, 13).replace(/[-T]/g, ""), doc = srv.app.store.get(`lounge/${h}`).data;
    srv.app.store.set(`lounge/${h}`, { ...doc, msgs: { ...doc.msgs, cx3: { a: loki.user.id, t: Date.now(), b: "muted words", tab: "main" } } });
    await new Promise(r => setTimeout(r, 2100));
    await odin.post("/api/v1/hall/chat", { text: "that scam again" });
    await settle(); await settle();
    assert.deepEqual(posted.slice(before).map(p => p.content), ["that s*** again"]);
  });
});
