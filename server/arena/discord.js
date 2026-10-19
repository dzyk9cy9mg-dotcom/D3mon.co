// The hall chat and one D3MON Discord channel as one conversation (owner, 2026-10-19).
//
// In: every few seconds the server reads the channel's new messages with the bot's key (REST, no gateway, so no
// dependencies) and adds them to the hall chat's log (lounge/<hour>, main floor) with the sender's Discord name.
// Out: every new main-floor message in that log, sent from the hall or the main page's Cortex, goes to the channel
// through a webhook under the member's name. Messages that came from Discord carry `dc` (their Discord id) and are
// never sent back; the webhook's own messages are skipped when read, so nothing loops.
//
// The bot needs View Channel and Read Message History in that channel, and the Message Content intent turned on.
// Secrets (the bot's key, the webhook link) come from .env and are never logged or shown.
import { maskWords } from "./hallchat.js";

const POLL_MS = 3000, MAX_TEXT = 400, STATE = "arena_discord/state";
const big = id => { try { return BigInt(id); } catch { return 0n; } };

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
  constructor({ store, hallChat, userName, token, channel, webhook, api, fetch = globalThis.fetch, now = () => Date.now() }) {
    Object.assign(this, { store, hallChat, userName, token, channel, webhook, api, fetch, now });
    this.webhookId = (String(webhook).match(/\/webhooks\/(\d+)\//) || [])[1] || null;
    this.queue = []; this.sending = false; this.timer = null;
    this.status_ = { on: true, lastReadAt: null, lastSentAt: null, error: null };
    // Out: new main-floor messages in the log, wherever they were written.
    store.on("change", c => {
      if (c.collection !== "lounge" || !c.after?.msgs) return;
      for (const [id, m] of Object.entries(c.after.msgs)) {
        if (c.before?.msgs?.[id] || !m || !m.b || m.deleted || m.dc || (m.tab || "main") !== "main") continue;
        if (m.a && this.hallChat.isMuted(m.a)) continue;
        this.queue.push({ name: m.as?.n || this.userName(m.a) || "Member", text: m.b });
      }
      if (this.queue.length) this.#drain();
    });
  }

  static configured(cfg) { return !!(cfg.discordToken && cfg.discordChannel && /^https:\/\/|^http:\/\/127\./.test(cfg.discordWebhook)); }
  status() { return { ...this.status_ }; }
  start() { const tick = async () => { await this.poll(); this.timer = setTimeout(tick, this.wait || POLL_MS); this.timer.unref?.(); }; tick(); }
  stop() { clearTimeout(this.timer); this.timer = null; }

  // In: reads the channel's messages newer than the last one seen. The first read only sets the starting point,
  // so the channel's history isn't poured into the hall.
  async poll() {
    const state = this.store.get(STATE).data || {};
    try {
      const q = state.after ? `after=${state.after}&limit=50` : "limit=1";
      const res = await this.fetch(`${this.api}/channels/${this.channel}/messages?${q}`, { headers: { authorization: `Bot ${this.token}` }, signal: AbortSignal.timeout(8000) });
      if (res.status === 429) { const j = await res.json().catch(() => ({})); this.wait = Math.ceil((j.retry_after || 5) * 1000); return; }
      if (!res.ok) throw new Error(`Discord said ${res.status} when reading the channel`);
      this.wait = 0;
      const msgs = (await res.json()).sort((a, b) => (big(a.id) < big(b.id) ? -1 : 1));
      if (!msgs.length) { if (!state.after) this.store.set(STATE, { after: "0" }); this.status_.lastReadAt = this.now(); this.status_.error = null; return; } // an empty channel: start from its beginning
      if (state.after) for (const m of msgs) {
        if ((m.webhook_id && m.webhook_id === this.webhookId) || (m.type !== 0 && m.type !== 19)) continue; // our own echoes, joins and pins
        const text = plainText(m);
        if (!text) continue;
        this.hallChat.addExternal({ dc: m.id, name: m.author?.global_name || m.author?.username || "Discord", text, t: Date.parse(m.timestamp) || this.now() });
      }
      this.store.set(STATE, { after: msgs.at(-1).id });
      this.status_.lastReadAt = this.now(); this.status_.error = null;
    } catch (e) {
      this.status_.error = String(e.message || e).replace(this.token, "…"); // never the key
      this.wait = 15000;
    }
  }

  // Out: one message at a time, waiting when Discord asks.
  async #drain() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length) {
        const { name, text } = this.queue[0];
        const res = await this.fetch(`${this.webhook}?wait=true`, {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ content: maskWords(text, this.hallChat.words()).slice(0, 2000), username: `${name} · D3MON`.replace(/discord|clyde/gi, "").replace(/\s+/g, " ").trim().slice(0, 80), allowed_mentions: { parse: [] } }),
        }).catch(e => ({ ok: false, status: 0, e }));
        if (res.status === 429) { const j = await res.json().catch(() => ({})); await new Promise(r => setTimeout(r, Math.ceil((j.retry_after || 2) * 1000))); continue; }
        this.queue.shift();
        if (res.ok) { this.status_.lastSentAt = this.now(); this.status_.error = null; }
        else this.status_.error = `Discord said ${res.status} when posting a message`;
        await new Promise(r => setTimeout(r, 400)); // well inside the webhook's 5 per 2 seconds
      }
    } finally { this.sending = false; }
  }
}

