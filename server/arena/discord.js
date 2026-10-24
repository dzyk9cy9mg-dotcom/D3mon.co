// The site's chat and the D3MON Discord as one conversation (owner, 2026-10-19).
//
// Links: D3MON_DISCORD_IDS is a list of ids in any order; each is a channel or a whole category, and Discord says
// which. The main channel (D3MON_DISCORD_CHANNEL_ID, or else the first channel in the list) is the hall's chat and
// the Cortex main floor; categories add every text channel in them, and the text chat of their voice channels, each as
// a channel of its own on the site. A Discord channel named like one of the Cortex's own channels (btc, eth, sol,
// xrp, kalshi, polymarket, off-topic) joins that one; any other becomes a Cortex channel of its own (config/cortex
// chx["dc<id>"]), so it shows in the main page's Cortex too. Categories are looked at again every 5 minutes, so a
// channel added in Discord joins by itself, and one removed is unlinked (its messages stay).
//
// In: every few seconds the server reads each channel's new messages with the bot's key (REST, no gateway, so no
// dependencies) and adds them to the chat log (lounge/<hour>, that channel's tab) with the sender's Discord name.
// Out: every new message in a linked tab, sent from the hall or the main page's Cortex, goes to its channel through
// a webhook under the member's name. Messages that came from Discord carry `dc` (their Discord id) and are never
// sent back; our webhooks' own messages are skipped when read, so nothing loops.
//
// The bot needs View Channels and Read Message History, the Message Content intent, and for categories Manage
// Webhooks (it makes a "D3MON" webhook in each channel). The main channel can use a webhook given in .env instead.
// Secrets (the bot's key, webhook links) stay on the server and are never logged or shown.
import { maskWords } from "./hallchat.js";

const POLL_MS = 3000, FIND_MS = 5 * 60000, MAX_TEXT = 400, MAX_LINKS = 25, STATE = "arena_discord/state";
const TEXT_TYPES = new Set([0, 5, 2]); // text, announcement, and voice channels' text chat
const BUILT_IN = { btc: "btc", eth: "eth", sol: "sol", xrp: "xrp", kalshi: "kalshi", polymarket: "poly", poly: "poly", "off-topic": "ot", offtopic: "ot" };
const big = id => { try { return BigInt(id); } catch { return 0n; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

// Discord's markup for mentions and custom emoji, as readable text.
export function plainText(m) {
  const users = new Map((m.mentions || []).map(u => [u.id, u.global_name || u.username]));
  let t = String(m.content || "")
    .replace(/<@!?(\d+)>/g, (x, id) => `@${users.get(id) || "someone"}`)
    .replace(/<@&\d+>/g, "@role").replace(/<#\d+>/g, "#channel")
    .replace(/<a?:(\w+):\d+>/g, ":$1:");
  if ((m.attachments || []).length) t = `${t} 📎`.trim();
  if ((m.sticker_items || []).length && !t) t = "(sticker)";
  return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT - 1) + "…" : t;
}

export class DiscordBridge {
  constructor({ store, hallChat, userName, token, channel = "", webhook = "", categories = [], api, fetch = globalThis.fetch, now = () => Date.now() }) {
    if (!/^https:\/\/|^http:\/\/127\./.test(webhook)) webhook = ""; // only a real webhook link (or a test's stand-in)
    Object.assign(this, { store, hallChat, userName, token, mainChannel: channel, mainWebhook: webhook, categories, api, fetch, now });
    this.mainId = channel || Object.entries(this.#links()).find(([, l]) => l.tab === "main")?.[0] || null; // settled by find()
    this.queue = []; this.sending = false; this.timer = null; this.foundAt = 0; this.health = {}; this.lastError = null;
    // Out: new messages in a linked tab, wherever they were written.
    store.on("change", c => {
      if (c.collection !== "lounge" || !c.after?.msgs) return;
      for (const [id, m] of Object.entries(c.after.msgs)) {
        if (c.before?.msgs?.[id] || !m || !m.b || m.deleted || m.dc) continue;
        const link = this.#linkForTab(m.tab || "main");
        if (!link?.webhook || (m.a && this.hallChat.isMuted(m.a))) continue;
        this.queue.push({ link: link.id, name: m.name || m.as?.n || this.userName(m.a) || "Member", text: m.b });
      }
      if (this.queue.length) this.#drain();
    });
  }

  static configured(cfg) { return !!(cfg.discordToken && (cfg.discordChannel || cfg.discordCategories?.length)); }

  #state() { return this.store.get(STATE).data || {}; }
  #links() {
    const s = this.#state(), links = { ...(s.links || {}) };
    if (s.after && this.mainId && !links[this.mainId]) links[this.mainId] = { tab: "main", after: s.after, name: "main" }; // from the one-channel version
    return links;
  }
  #save(links) { this.store.set(STATE, { links }); }
  #linkForTab(tab) { const links = this.#links(); for (const [id, l] of Object.entries(links)) if (l.tab === tab) return { id, ...l, webhook: id === this.mainId && this.mainWebhook ? this.mainWebhook : l.webhook }; return null; }
  #get(path) { return this.fetch(`${this.api}${path}`, { headers: { authorization: `Bot ${this.token}` }, signal: AbortSignal.timeout(8000) }); }
  #fail(e) { this.lastError = String(e?.message || e).replaceAll(this.token, "…"); } // never the key

  // The site's channels linked with Discord, for the hall's channel picker (the main floor comes first).
  channels() {
    return Object.entries(this.#links()).map(([id, l]) => ({ id: l.tab, name: l.name, discord: true, canPost: !!(id === this.mainId && this.mainWebhook) || !!l.webhook }))
      .sort((a, b) => (a.id === "main" ? -1 : b.id === "main" ? 1 : a.name.localeCompare(b.name)));
  }
  status() {
    const links = this.#links();
    return { on: true, error: this.lastError, channels: Object.entries(links).map(([id, l]) => ({ name: l.name, tab: l.tab, canPost: !!(id === this.mainId && this.mainWebhook) || !!l.webhook, ...(this.health[id] || {}) })) };
  }

  start() {
    const tick = async () => {
      if (this.now() - this.foundAt > FIND_MS) await this.find();
      await this.poll();
      this.timer = setTimeout(tick, Math.max(this.wait || 0, POLL_MS));
      this.timer.unref?.();
    };
    tick();
  }
  stop() { clearTimeout(this.timer); this.timer = null; }

  // Works out which channels are linked: the main one, and every text channel (and voice channel's text chat) in
  // the categories. New ones get a tab and a webhook; ones that left a category are unlinked.
  async find() {
    this.foundAt = this.now();
    const links = this.#links(), want = new Map(); // id -> { name, type }
    // Each id given may be a category or a channel: Discord says which (owner, 2026-10-19: the ids are easy to mix
    // up, so any order works). The main channel is the one named as main, or else the first channel given.
    let main = this.mainChannel;
    try {
      for (const id of [...new Set([this.mainChannel, ...this.categories].filter(Boolean))]) {
        const r = await this.#get(`/channels/${id}`);
        if (!r.ok) throw new Error(`Discord said ${r.status} when looking up ${id}`);
        const c = await r.json();
        if (c.type === 4) { // a category: every text channel and voice channel's chat in it
          const gr = await this.#get(`/guilds/${c.guild_id}/channels`);
          if (!gr.ok) throw new Error(`Discord said ${gr.status} when listing the server's channels`);
          for (const ch of (await gr.json()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
            if (ch.parent_id === c.id && TEXT_TYPES.has(ch.type) && want.size < MAX_LINKS) want.set(ch.id, { name: ch.name });
        } else if (TEXT_TYPES.has(c.type)) {
          if (!main) main = c.id;
          if (want.size < MAX_LINKS || c.id === main) want.set(c.id, { name: c.name });
        }
      }
    } catch (e) { this.#fail(e); return; } // a failed look leaves the links as they were
    if (main && this.mainId !== main) { // the main floor moves to this channel
      for (const l of Object.values(links)) if (l.tab === "main") l.tab = null;
      if (links[main]) links[main].tab = "main";
    }
    this.mainId = main || null;
    const cortex = this.store.get("config/cortex").data || {}, chx = { ...(cortex.chx || {}) }, used = new Set();
    for (const [id, l] of Object.entries(links)) if (want.has(id)) used.add(l.tab);
    for (const [id, l] of Object.entries(links)) if (!want.has(id)) { delete links[id]; if (chx[l.tab]?.dc) chx[l.tab] = { ...chx[l.tab], del: true }; }
    for (const [id, { name }] of want) {
      const l = links[id] || { after: null };
      l.name = slug(name) || "channel";
      if (!l.tab) {
        const b = BUILT_IN[l.name];
        l.tab = id === this.mainId ? "main" : b && !used.has(b) ? b : `dc${id}`;
        used.add(l.tab);
      }
      if (l.tab.startsWith("dc")) chx[l.tab] = { ...(chx[l.tab] || { t: this.now() }), cat: "text", name: l.name, topic: "Linked with the D3MON Discord", dc: id, del: false };
      if (!(id === this.mainId && this.mainWebhook) && !l.webhook) l.webhook = await this.#webhookFor(id);
      links[id] = l;
    }
    this.#save(links);
    if (JSON.stringify(chx) !== JSON.stringify(cortex.chx || {})) this.store.set("config/cortex", { ...cortex, chx }); // the Cortex shows them too
    this.lastError = null;
  }

  // The channel's "D3MON" webhook, made if it isn't there. Null when the bot may not (no Manage Webhooks, or a
  // channel type Discord won't give webhooks): the link then only reads.
  async #webhookFor(id) {
    try {
      const r = await this.#get(`/channels/${id}/webhooks`);
      if (r.ok) { const w = (await r.json()).find(x => x.name === "D3MON" && x.token); if (w) return `${this.api}/webhooks/${w.id}/${w.token}`; }
      const c = await this.fetch(`${this.api}/channels/${id}/webhooks`, { method: "POST", headers: { authorization: `Bot ${this.token}`, "content-type": "application/json" }, body: JSON.stringify({ name: "D3MON" }), signal: AbortSignal.timeout(8000) });
      if (!c.ok) throw new Error(`Discord said ${c.status} when making a webhook`);
      const w = await c.json();
      return `${this.api}/webhooks/${w.id}/${w.token}`;
    } catch (e) { (this.health[id] ||= {}).postError = String(e.message || e); return null; } // kept apart from read errors
  }

  // In: each channel's messages newer than the last one seen. A channel's first read only sets its starting point,
  // so its history isn't poured into the site.
  async poll() {
    const links = this.#links();
    const ours = new Set(Object.values(links).map(l => (String(l.webhook || "").match(/\/webhooks\/(\d+)\//) || [])[1]).concat((this.mainWebhook.match(/\/webhooks\/(\d+)\//) || [])[1]).filter(Boolean));
    let changed = false;
    for (const [id, l] of Object.entries(links)) {
      const h = (this.health[id] ||= {});
      try {
        const res = await this.#get(`/channels/${id}/messages?${l.after ? `after=${l.after}&limit=50` : "limit=1"}`);
        if (res.status === 429) { const j = await res.json().catch(() => ({})); this.wait = Math.ceil((j.retry_after || 5) * 1000); break; }
        if (!res.ok) throw new Error(`Discord said ${res.status} when reading the channel`);
        this.wait = 0;
        const msgs = (await res.json()).sort((a, b) => (big(a.id) < big(b.id) ? -1 : 1));
        h.lastReadAt = this.now(); h.error = null;
        if (!msgs.length) { if (!l.after) { l.after = "0"; changed = true; } continue; } // an empty channel: start from its beginning
        if (l.after) for (const m of msgs) {
          if ((m.webhook_id && ours.has(m.webhook_id)) || (m.type !== 0 && m.type !== 19)) continue; // our own echoes, joins and pins
          const text = plainText(m);
          if (text) this.hallChat.addExternal({ dc: m.id, name: m.author?.global_name || m.author?.username || "Discord", text, t: Date.parse(m.timestamp) || this.now(), tab: l.tab });
        }
        l.after = msgs.at(-1).id; changed = true;
      } catch (e) { h.error = String(e.message || e).replaceAll(this.token, "…"); this.wait = 15000; }
    }
    if (changed) {
      const now = this.#links(); // keep what find() may have changed meanwhile; only the read positions move
      for (const [id, l] of Object.entries(links)) if (now[id]) now[id].after = l.after;
      this.#save(now);
    }
  }

  // Out: one message at a time, waiting when Discord asks.
  async #drain() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const { link, name, text } = this.queue[0], l = this.#links()[link];
        const url = link === this.mainId && this.mainWebhook ? this.mainWebhook : l?.webhook;
        if (!url) { this.queue.shift(); continue; }
        const res = await this.fetch(`${url}?wait=true`, {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ content: maskWords(text, this.hallChat.words()).slice(0, 2000), username: `${name} · D3MON`.replace(/discord|clyde/gi, "").replace(/\s+/g, " ").trim().slice(0, 80), allowed_mentions: { parse: [] } }),
        }).catch(e => ({ ok: false, status: 0, e }));
        if (res.status === 429) { const j = await res.json().catch(() => ({})); await sleep(Math.ceil((j.retry_after || 2) * 1000)); continue; }
        this.queue.shift();
        const h = (this.health[link] ||= {});
        if (res.ok) { h.lastSentAt = this.now(); h.error = null; }
        else h.error = `Discord said ${res.status} when posting a message`;
        await sleep(400); // well inside a webhook's 5 per 2 seconds
      }
    } finally { this.sending = false; }
  }
}
