// The Grand Hall's video (owner, 2026-10-19): an admin pastes a YouTube link (a video, a Short or a live
// stream) and the hall's live event screen offers it; clicking the screen plays it in a panel over the hall.
// Only the video's id is kept, never the rest of the link (share links carry tracking). YouTube only for now;
// Twitch and Kick can be added the same way.
//
// The thumbnail is fetched by the server from YouTube and served from D3MON itself (GET /hall/video/thumb), so
// the 3D screen can draw it (a browser won't let WebGL use another site's image) and visitors' browsers never
// call YouTube until they press play. One image is kept in memory; a failed fetch is retried after 5 minutes.
//
// Ledger line: { t: "hall_video", video: { provider: "youtube", id, kind: "video"|"short"|"live", title } | null }
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";

const SET = { url: { type: "string", required: true, max: 300 }, title: { type: "string", max: 80 } };
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const THUMB_MAX = 1024 * 1024, THUMB_RETRY = 5 * 60000, THUMB_TYPES = /^image\/(jpeg|png|webp)$/;

// The video in a YouTube link, or null: watch?v=, youtu.be/, /shorts/, /live/ and /embed/ links.
export function parseVideoUrl(text) {
  let u;
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id = null, kind = "video";
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = u.pathname.split("/");
    if (first === "watch") id = u.searchParams.get("v");
    else if (first === "shorts") { id = second; kind = "short"; }
    else if (first === "live") { id = second; kind = "live"; }
    else if (first === "embed") id = second;
  }
  return id && YT_ID.test(id) ? { provider: "youtube", id, kind } : null;
}

export class Hall {
  constructor({ ledger, feed, thumbBase = "https://i.ytimg.com", fetch = globalThis.fetch, now = () => Date.now() }) {
    Object.assign(this, { ledger, feed, thumbBase, fetch, now });
    this.thumbCache = null; // { id, bytes, type } or { id, failedAt }
    this.video = null; this.videoAt = null;
    const index = lines => { for (const l of lines) if (l.t === "hall_video") { this.video = l.video; this.videoAt = l.at; } };
    index(ledger.lines);
    ledger.on("append", index);
  }

  #requireAdmin(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!isAdmin(ctx) || !ctx.canWrite) throw new ApiError(403, "not_granted", "Only admins can do that.");
  }

  // GET /hall/video: what the hall is showing, with the links a page needs to play it.
  view() {
    const v = this.video;
    if (!v) return { video: null };
    const watch = v.kind === "short" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
    return { video: { ...v, watch, embed: `https://www.youtube-nocookie.com/embed/${v.id}`, thumb: `/api/v1/hall/video/thumb?v=${v.id}`, setAt: this.videoAt } };
  }

  // GET /hall/video/thumb: the video's thumbnail image, or null when there's no video or YouTube has none.
  async thumb() {
    const v = this.video;
    if (!v) return null;
    const c = this.thumbCache;
    if (c?.id === v.id && (c.bytes || this.now() - c.failedAt < THUMB_RETRY)) return c.bytes ? c : null;
    try {
      const res = await this.fetch(`${this.thumbBase}/vi/${v.id}/hqdefault.jpg`, { signal: AbortSignal.timeout(5000) });
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      if (!res.ok || !THUMB_TYPES.test(type)) throw new Error(`thumbnail: ${res.status} ${type}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > THUMB_MAX) throw new Error("thumbnail too big");
      this.thumbCache = { id: v.id, bytes, type };
    } catch (e) {
      this.thumbCache = { id: v.id, failedAt: this.now() };
    }
    return this.thumbCache.bytes ? this.thumbCache : null;
  }

  // PUT /hall/video { url, title }: shows that video in the hall. DELETE /hall/video takes it down.
  set(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, SET);
    const v = parseVideoUrl(f.url);
    if (!v) throw new ApiError(400, "invalid_argument", "That isn't a YouTube video link. Paste a link like youtube.com/watch?v=…, youtu.be/…, or youtube.com/shorts/….", "url");
    this.#write(ctx, { ...v, title: f.title || "" });
    return this.view();
  }
  clear(ctx) {
    this.#requireAdmin(ctx);
    if (!this.video) return { ...this.view(), unchanged: true };
    this.#write(ctx, null);
    return this.view();
  }
  #write(ctx, video) {
    this.ledger.append([{ t: "hall_video", video }], ctx.uid, this.now());
    this.feed.publish("hall", "hall.video", () => this.view());
  }
}
