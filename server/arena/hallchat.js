// The Grand Hall's chat (owner, 2026-10-19): the main floor of the site's own Live Trade Cortex chat, read and
// written through /api/v1 so the 3D world (and any front end) can use it. It's the same log the main page
// writes: lounge/<hour> documents of { hour, msgs: { [id]: { a, t, b, tab, as?, dir?, re? } } }, so a message
// sent in the hall shows in the Cortex and the other way round. The D3MON Discord can be mirrored into it later.
//
// Messages from the linked D3MON Discord channel are in the same log with the sender's Discord name and `dc`.
//
// The main page enforces the chat rules in the browser; here the server does: signed-in members only, banned
// and muted members can't post, the admins' slow mode and masked words (config/mod) apply, and one message at a
// time per member.
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";

const MAIN = "main"; // the Cortex's main floor tab
const SEND = { text: { type: "string", required: true, min: 1, max: 400 } };
const MAX_READ = 60, HOURS_BACK = 6;
export const hourKey = t => new Date(t).toISOString().slice(0, 13).replace(/[-T]/g, ""); // same as the page's

// The admins' masked words, as the main page masks them: the first letter stays, the rest are stars.
export function maskWords(text, words) {
  const list = String(words || "").split(",").map(x => x.trim()).filter(Boolean);
  return list.reduce((a, w) => a.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), m => m[0] + "*".repeat(Math.max(1, m.length - 1))), text);
}

export class HallChat {
  constructor({ store, feed, userName, now = () => Date.now() }) {
    Object.assign(this, { store, feed, userName, now });
    this.lastSent = new Map(); // uid -> when they last posted here
    // Any change to the log, from here or from the main page, tells open pages to read again.
    let t = null;
    store.on("change", c => {
      if (c.collection !== "lounge" || t) return;
      t = setTimeout(() => { t = null; this.feed.publish("hall", "hall.chat", () => ({})); }, 250);
      t.unref?.();
    });
  }

  #mod() { return this.store.get("config/mod").data || {}; }
  isMuted(uid) { const m = this.#mod().muted?.[uid]; return !!m && (!m.until || m.until > this.now()); }
  words() { return this.#mod().words; }

  // GET /hall/chat: the main floor's latest messages, oldest first, with the masked words masked.
  read(limit = 30) {
    const n = Math.min(MAX_READ, Math.max(1, limit | 0 || 30)), words = this.#mod().words, now = this.now(), out = [];
    for (let h = 0; h < HOURS_BACK && out.length < n; h++) {
      const doc = this.store.get(`lounge/${hourKey(now - h * 3600000)}`).data;
      const msgs = Object.entries(doc?.msgs || {}).filter(([, m]) => m && m.b && !m.deleted && (m.tab || MAIN) === MAIN).sort((a, b) => b[1].t - a[1].t);
      for (const [id, m] of msgs) {
        if (out.length >= n) break;
        const v = { id, at: m.t, name: m.name || m.as?.n || this.userName(m.a) || "Member", text: maskWords(m.b, words) };
        if (m.dc) v.from = "discord";
        if (m.as) v.as = m.as.k === "bot" || m.as.k === "script" ? m.as.k : "member";
        if (m.dir === "up" || m.dir === "down") v.direction = m.dir;
        out.push(v);
      }
    }
    return { channel: MAIN, messages: out.reverse() };
  }

  // A message from the D3MON Discord channel (server/arena/discord.js). Its id comes from Discord's, so reading
  // the same message twice adds it once.
  addExternal({ dc, name, text, t }) {
    const h = hourKey(t), id = `dc${dc}`;
    if (this.store.get(`lounge/${h}`).data?.msgs?.[id]) return;
    this.store.commit(this.store.plan("merge", `lounge/${h}`, { hour: h, msgs: { [id]: { name: String(name).slice(0, 40), t, b: text, tab: MAIN, dc } } }), null);
  }

  // POST /hall/chat { text }: posts to the main floor as the signed-in member.
  send(ctx, body) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in to chat.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't post.");
    const f = check(body, SEND);
    if (this.isMuted(ctx.uid)) throw new ApiError(403, "muted", "You're muted in the chat for now.");
    const now = this.now(), slow = Math.max(2, +(this.#mod().slow || 0)) * 1000, last = this.lastSent.get(ctx.uid) || 0;
    if (!isAdmin(ctx) && now - last < slow) throw new ApiError(429, "slow_down", `Slow mode: wait ${Math.ceil((slow - (now - last)) / 1000)} s between messages.`);
    const h = hourKey(now), id = now.toString(36) + Math.random().toString(36).slice(2, 8); // the page's id format
    try {
      this.store.commit(this.store.plan("merge", `lounge/${h}`, { hour: h, msgs: { [id]: { a: ctx.uid, t: now, b: f.text, tab: MAIN } } }), ctx.uid);
    } catch (e) {
      throw new ApiError(503, "unavailable", "The chat is full for this hour. Try again in a moment.");
    }
    this.lastSent.set(ctx.uid, now);
    return { message: this.read(MAX_READ).messages.find(m => m.id === id) };
  }
}
