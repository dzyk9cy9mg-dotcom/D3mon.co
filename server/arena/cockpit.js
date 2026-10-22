// The Battle of the Bots cockpit (/battle, owner 2026-10-20): HardSmoke's live event page, a looping cockpit video
// with the battle's displays fitted onto its screens. The owner and admins choose what every screen shows
// ("make it so I can control what goes in all spaces"): each of the seven screens gets one module, an optional
// heading, and for a message or promo screen its text or video. The page also shows the battle running now, the
// next one, or one battle an admin picked.
//
// Ledger line: { t: "cockpit", layout: { battleId, featured, screens: { <slot>: { show, title, text, video } } } }
// The latest line wins; GET /cockpit is public, PUT /cockpit is for admins, feed topic "cockpit".
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { parseVideoUrl } from "./hall.js";

// The nine displays on the curved cockpit (2026-10-21): on the big curved screen, the ticker over the centre, the
// centre (main), and the left and right columns in two halves each; on the lower curved screen, left, centre (still
// called console) and right.
export const SLOTS = ["ticker", "main", "leftTop", "leftBottom", "rightTop", "rightBottom", "lowerLeft", "console", "lowerRight"];
// What a screen can show. Every module fits every screen; the page lays it out for the screen's size.
export const MODULES = {
  odds: "Round clock and Kalshi's odds",
  bots: "Bots",
  callers: "Callers",
  scripts: "Chart scripts",
  lineup: "Everyone in the battle",
  standings: "Battle standings",
  stream: "Stream (opens the Stream Wall)",
  crowd: "The crowd's votes",
  desk: "Vote and chat",
  vote: "Vote",
  chat: "Chat",
  lastRound: "Last round",
  message: "A message",
  promo: "Promo video",
  off: "Nothing (screen off)",
};
export const DEFAULT_SCREENS = {
  ticker: { show: "odds" }, main: { show: "bots" }, leftTop: { show: "callers" }, leftBottom: { show: "scripts" },
  rightTop: { show: "stream" }, rightBottom: { show: "crowd" }, lowerLeft: { show: "vote" }, console: { show: "chat" }, lowerRight: { show: "lastRound" },
};
const SCREEN = {
  show: { type: "enum", values: Object.keys(MODULES), required: true },
  title: { type: "string", max: 40 },
  text: { type: "string", max: 280 },
  video: { type: "string", max: 300 },
};

export class Cockpit {
  constructor({ ledger, feed, registry, now = () => Date.now() }) {
    Object.assign(this, { ledger, feed, registry, now });
    this.layout = null; this.at = null; this.by = null;
    const index = lines => { for (const l of lines) if (l.t === "cockpit") { this.layout = l.layout; this.at = l.at; this.by = l.by; } };
    index(ledger.lines);
    ledger.on("append", index);
  }

  // GET /cockpit: every screen's module (defaults filled in), the modules to choose from, and the battle to show.
  view(ctx) {
    const saved = this.layout?.screens || {};
    const screens = {};
    for (const s of SLOTS) screens[s] = { ...DEFAULT_SCREENS[s], ...(saved[s] || {}) };
    for (const s of SLOTS) {
      const v = screens[s].video && parseVideoUrl(screens[s].video);
      screens[s].promo = v ? { ...v, embed: `https://www.youtube-nocookie.com/embed/${v.id}`, watch: v.kind === "short" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}` } : null;
    }
    const out = { battleId: this.layout?.battleId || null, featured: this.layout?.featured ?? 0, battle: this.pick(ctx), screens, slots: SLOTS, modules: MODULES, updatedAt: this.at };
    return out;
  }

  // The battle the page shows: the admin's pick, else the one running now, else the next, else the latest.
  pick(ctx) {
    const all = this.registry.listBattles(ctx).filter(b => b.status !== "draft");
    const chosen = this.layout?.battleId && all.find(b => b.id === this.layout.battleId);
    if (chosen) return chosen;
    const now = this.now();
    return all.find(b => now >= b.startsAt && now < b.endsAt)
      || all.filter(b => b.startsAt > now).sort((x, y) => x.startsAt - y.startsAt)[0]
      || all.sort((x, y) => y.startsAt - x.startsAt)[0] || null;
  }

  // PUT /cockpit { battleId?, featured?, screens?: { <slot>: { show, title?, text?, video? } } }: admins only. Screens left out
  // keep what they had; battleId null goes back to choosing by itself.
  set(ctx, body) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!isAdmin(ctx) || !ctx.canWrite) throw new ApiError(403, "not_granted", "Only admins can do that.");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_argument", "Send a JSON object.");
    for (const k of Object.keys(body)) if (!["battleId", "screens", "featured"].includes(k)) throw new ApiError(400, "invalid_argument", `Unknown field "${k}".`, k);
    const layout = { battleId: this.layout?.battleId || null, featured: this.layout?.featured ?? 0, screens: { ...(this.layout?.screens || {}) } };
    // the stream HardSmoke puts on the stream screen for everyone: its place in the battle's list of streams
    if ("featured" in body) {
      if (!Number.isSafeInteger(body.featured) || body.featured < 0 || body.featured > 11) throw new ApiError(400, "invalid_argument", "\"featured\" must be a stream's number, 0 to 11.", "featured");
      layout.featured = body.featured;
    }
    if ("battleId" in body) {
      if (body.battleId === null || body.battleId === "") layout.battleId = null;
      else if (typeof body.battleId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(body.battleId)) throw new ApiError(400, "invalid_argument", "\"battleId\" isn't a battle.", "battleId");
      else { this.registry.battleFor(ctx, body.battleId); layout.battleId = body.battleId; }
    }
    if (body.screens !== undefined) {
      if (!body.screens || typeof body.screens !== "object" || Array.isArray(body.screens)) throw new ApiError(400, "invalid_argument", "\"screens\" must be an object.", "screens");
      for (const [slot, raw] of Object.entries(body.screens)) {
        if (!SLOTS.includes(slot)) throw new ApiError(400, "invalid_argument", `There's no screen called "${slot}".`, `screens.${slot}`);
        if (raw === null) { delete layout.screens[slot]; continue; } // back to the default
        const f = check(raw, SCREEN);
        if (f.show === "promo" && !(f.video && parseVideoUrl(f.video))) throw new ApiError(400, "invalid_argument", "A promo screen needs a YouTube link.", `screens.${slot}.video`);
        if (f.show === "message" && !f.text) throw new ApiError(400, "invalid_argument", "A message screen needs its text.", `screens.${slot}.text`);
        // keep only what the module uses; a promo keeps just the video's id, never the link's tracking
        const v = f.show === "promo" ? parseVideoUrl(f.video) : null;
        layout.screens[slot] = { show: f.show, ...(f.title ? { title: f.title } : {}), ...(f.show === "message" ? { text: f.text } : {}), ...(v ? { video: v.kind === "short" ? `https://youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}` } : {}) };
      }
    }
    this.ledger.append([{ t: "cockpit", layout }], ctx.uid, this.now());
    this.feed.publish("cockpit", "cockpit.updated", c => this.view(c));
    return this.view(ctx);
  }
}
