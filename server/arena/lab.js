// The D3MON Lab (owner, 2026-10-22: built before launch "so users see D3MON is about education"). Where builders and
// traders learn the reasoning behind every call. Four sections:
//   showcase     creators show what they've built and how it works
//   help         questions about bots, scripts and reading a round; the asker or an admin marks one solved
//   library      lessons and guides (admins post; later the AI teacher's lessons are archived here)
//   experiments  ideas tested in the open, wins and losses included
//   daily        the AI teacher's daily shorts: the market, a lesson, a laugh (admins post; owner, 2026-10-22: "some are
//                lessons archived in the Lab, the rest daily relevant content"). An admin moves a lesson to the Library.
// Any post can carry one YouTube video (a Short, a video or a live), kept as its id only and played in the page.
//
// Store (server-only, arena_*): arena_lab/<id> { id, section, title, body, link, by, at, editedAt, pinned, solved,
//   removed, removedBy, replies: [{ id, by, at, body, removed }] }
// Posts aren't in the ledger: authors edit and remove their own, and a removed post is hidden, not erased, so admins
// can still see what happened. Everything is checked for secrets (keys, seed phrases) like every Arena write.
import crypto from "node:crypto";
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { parseVideoUrl } from "./hall.js";

export const LAB = "arena_lab";
export const SECTIONS = {
  showcase: { name: "Showcase", blurb: "What people have built, and how it works." },
  help: { name: "Help Desk", blurb: "Stuck on a bot, a script or a round? Ask." },
  library: { name: "Library", blurb: "Lessons and guides." },
  experiments: { name: "Experiments", blurb: "Ideas tested in the open, wins and losses included." },
  daily: { name: "Daily", blurb: "Today's short from D3MON's AI teacher: the market, a lesson, a laugh." },
};
const ADMIN_ONLY = new Set(["library", "daily"]);
const MAX_REPLIES = 200;
const POST = {
  section: { type: "enum", values: Object.keys(SECTIONS), required: true },
  title: { type: "string", required: true, min: 4, max: 120 },
  body: { type: "string", required: true, min: 10, max: 8000, code: true },
  link: { type: "string", max: 300 },
  video: { type: "string", max: 300 },
};
const EDIT = { section: { type: "enum", values: Object.keys(SECTIONS) }, title: POST.title, body: POST.body, link: POST.link, video: POST.video };
const REPLY = { body: { type: "string", required: true, min: 2, max: 4000, code: true } };

const cleanLink = (v, field = "link") => {
  if (!v) return "";
  let u;
  try { u = new URL(v.trim()); } catch (e) { throw new ApiError(400, "invalid_argument", "A link must be an https:// address.", field); }
  if (u.protocol !== "https:" || u.username || u.password) throw new ApiError(400, "invalid_argument", "A link must be an https:// address.", field);
  return u.href;
};

// A YouTube link, kept as its id and kind only (never the link's tracking). "" clears it.
const cleanVideo = v => {
  if (!v) return null;
  const x = parseVideoUrl(v.trim());
  if (!x) throw new ApiError(400, "invalid_argument", "The video must be a YouTube link (a video, a Short or a live).", "video");
  return { id: x.id, kind: x.kind };
};
export const videoView = v => v ? { ...v, embed: `https://www.youtube-nocookie.com/embed/${v.id}`, watch: v.kind === "short" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`, thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` } : null;

export class Lab {
  constructor({ store, feed, userName, now = () => Date.now() }) {
    Object.assign(this, { store, feed, userName, now });
  }

  #get(id) { return this.store.get(`${LAB}/${id}`).data || null; }
  #save(p, uid) { this.store.set(`${LAB}/${p.id}`, p, uid); }
  #member(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in to post in the Lab.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't post right now.");
  }
  #mine(ctx, p) { return ctx.uid && (p.by === ctx.uid || isAdmin(ctx)); }
  #find(ctx, id) {
    const p = typeof id === "string" && /^[a-f0-9]{16}$/.test(id) ? this.#get(id) : null;
    if (!p || (p.removed && !isAdmin(ctx))) throw new ApiError(404, "not_found", "No such post.");
    return p;
  }
  #changed(p) { this.feed.publish("lab", "lab.updated", { id: p.id, section: p.section }); }

  #summary(p, ctx) {
    const live = (p.replies || []).filter(r => !r.removed);
    return { id: p.id, section: p.section, title: p.title, link: p.link || "", video: videoView(p.video), by: { uid: p.by, name: this.userName(p.by) || "A member" },
      at: p.at, editedAt: p.editedAt || null, pinned: !!p.pinned, solved: !!p.solved, replies: live.length,
      lastAt: live.length ? live[live.length - 1].at : p.at, mine: !!ctx.uid && p.by === ctx.uid, ...(p.removed ? { removed: true } : {}) };
  }

  // GET /lab: the sections, and every post (or one section's, or a search), pinned first, then latest activity.
  list(ctx, { section, q } = {}) {
    if (section && !SECTIONS[section]) throw new ApiError(400, "invalid_argument", "No such section.", "section");
    const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    const posts = this.store.query({ collection: LAB }).map(r => r.data)
      .filter(p => !p.removed && (!section || p.section === section))
      .filter(p => !words.length || words.every(w => `${p.title}\n${p.body}`.toLowerCase().includes(w)))
      .map(p => this.#summary(p, ctx))
      .sort((a, b) => (b.pinned - a.pinned) || (b.lastAt - a.lastAt));
    const counts = Object.fromEntries(Object.keys(SECTIONS).map(k => [k, 0]));
    for (const p of this.store.query({ collection: LAB }).map(r => r.data)) if (!p.removed) counts[p.section]++;
    return { sections: Object.entries(SECTIONS).map(([key, s]) => ({ key, ...s, posts: counts[key], adminOnly: ADMIN_ONLY.has(key) })), posts: posts.slice(0, 200) };
  }

  // GET /lab/:id: the whole post with its replies.
  view(ctx, id) {
    const p = this.#find(ctx, id);
    return { ...this.#summary(p, ctx), body: p.body, canEdit: this.#mine(ctx, p),
      replies: (p.replies || []).filter(r => !r.removed || isAdmin(ctx)).map(r => ({ id: r.id, at: r.at, body: r.body,
        by: { uid: r.by, name: this.userName(r.by) || "A member" }, mine: !!ctx.uid && r.by === ctx.uid, canRemove: this.#mine(ctx, r), ...(r.removed ? { removed: true } : {}) })) };
  }

  // POST /lab { section, title, body, link?, video? }: members; the Library and Daily are for admins.
  // `limit` runs only once the post is valid, so a mistake never uses up the hourly allowance.
  create(ctx, body, limit = () => {}) {
    this.#member(ctx);
    const f = check(body, POST);
    if (ADMIN_ONLY.has(f.section) && !isAdmin(ctx)) throw new ApiError(403, "not_granted", "Lessons in the Library are posted by the D3MON team. Try Showcase or Experiments.", "section");
    const link = cleanLink(f.link), video = cleanVideo(f.video);
    if (!isAdmin(ctx)) limit();
    const p = { id: crypto.randomBytes(8).toString("hex"), section: f.section, title: f.title.trim(), body: f.body, link, video,
      by: ctx.uid, at: this.now(), pinned: false, solved: false, removed: false, replies: [] };
    this.#save(p, ctx.uid);
    this.#changed(p);
    return this.view(ctx, p.id);
  }

  // PATCH /lab/:id { title?, body?, link? }: the author or an admin.
  edit(ctx, id, body) {
    this.#member(ctx);
    const p = this.#find(ctx, id);
    if (!this.#mine(ctx, p)) throw new ApiError(403, "not_granted", "Only its author can edit this post.");
    const f = check(body, EDIT, { partial: true });
    // moving a post between sections is for admins (a Daily short becomes a Library lesson)
    if (f.section !== undefined && f.section !== p.section && !isAdmin(ctx)) throw new ApiError(403, "not_granted", "Only admins can move a post to another section.", "section");
    const next = { ...p, ...(f.section !== undefined ? { section: f.section } : {}), ...(f.video !== undefined ? { video: cleanVideo(f.video) } : {}), ...(f.title !== undefined ? { title: f.title.trim() } : {}), ...(f.body !== undefined ? { body: f.body } : {}),
      ...(f.link !== undefined ? { link: cleanLink(f.link) } : {}), editedAt: this.now() };
    this.#save(next, ctx.uid);
    this.#changed(next);
    return this.view(ctx, id);
  }

  // DELETE /lab/:id: the author or an admin hides it (kept for admins).
  remove(ctx, id) {
    this.#member(ctx);
    const p = this.#find(ctx, id);
    if (!this.#mine(ctx, p)) throw new ApiError(403, "not_granted", "Only its author can remove this post.");
    this.#save({ ...p, removed: true, removedBy: ctx.uid, removedAt: this.now() }, ctx.uid);
    this.#changed(p);
    return { removed: true };
  }

  // PUT /lab/:id/pin { on }: admins pin a post to the top of its section.
  pin(ctx, id, body = {}) {
    this.#member(ctx);
    if (!isAdmin(ctx)) throw new ApiError(403, "not_granted", "Only admins can pin.");
    if (typeof body.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", "on");
    const p = this.#find(ctx, id);
    this.#save({ ...p, pinned: body.on }, ctx.uid);
    this.#changed(p);
    return this.view(ctx, id);
  }

  // PUT /lab/:id/solved { on }: a Help Desk question's asker (or an admin) marks it solved.
  solved(ctx, id, body = {}) {
    this.#member(ctx);
    if (typeof body.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", "on");
    const p = this.#find(ctx, id);
    if (p.section !== "help") throw new ApiError(409, "not_a_question", "Only Help Desk questions can be marked solved.");
    if (!this.#mine(ctx, p)) throw new ApiError(403, "not_granted", "Only the person who asked can mark it solved.");
    this.#save({ ...p, solved: body.on }, ctx.uid);
    this.#changed(p);
    return this.view(ctx, id);
  }

  // POST /lab/:id/replies { body }: members.
  reply(ctx, id, body, limit = () => {}) {
    this.#member(ctx);
    const p = this.#find(ctx, id);
    if (p.removed) throw new ApiError(404, "not_found", "No such post.");
    const f = check(body, REPLY);
    if (!isAdmin(ctx)) limit();
    if ((p.replies || []).length >= MAX_REPLIES) throw new ApiError(409, "too_many_replies", "This post has reached its reply limit. Start a new post.");
    const r = { id: crypto.randomBytes(6).toString("hex"), by: ctx.uid, at: this.now(), body: f.body, removed: false };
    this.#save({ ...p, replies: [...(p.replies || []), r] }, ctx.uid);
    this.#changed(p);
    return this.view(ctx, id);
  }

  // DELETE /lab/:id/replies/:rid: the reply's author or an admin hides it.
  removeReply(ctx, id, rid) {
    this.#member(ctx);
    const p = this.#find(ctx, id);
    const r = (p.replies || []).find(x => x.id === rid && !x.removed);
    if (!r) throw new ApiError(404, "not_found", "No such reply.");
    if (!this.#mine(ctx, r)) throw new ApiError(403, "not_granted", "Only its author can remove this reply.");
    this.#save({ ...p, replies: p.replies.map(x => x.id === rid ? { ...x, removed: true, removedBy: ctx.uid } : x) }, ctx.uid);
    this.#changed(p);
    return this.view(ctx, id);
  }
}
