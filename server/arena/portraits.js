// Moving profile pictures (owner, 2026-10-20): the owner of a caller, bot or chart script uploads 1 to 3 stills,
// and the profile's hero plays them as one slightly moving picture (the frames blend into one another with a slow
// drift). An admin approves every upload before anyone else sees it (owner: "uploaded profile pictures need admin
// approval"). Callers, bots and scripts first; since 2026-10-21 members' own profiles too (the same review, the
// same files; a member's set carries `uid` instead of `entrantId`).
//
// Files are kept in <data>/portraits/, checked to be real PNG, JPEG or WebP images by their first bytes (the name
// and the stated type are never trusted), 1.5 MB each at most. Ledger lines (never rewritten):
//   { t: "portrait_submit", entrantId, set, frames: [{ file, type, bytes }] }   a new upload waits for review; a newer
//                                                                                upload replaces a waiting one
//   { t: "portrait_submit", uid, set, frames }                                  the same for a member's own profile
//   { t: "portrait_review", set, entrantId | uid, decision: "approved" | "rejected", note }
// The approved set shows on the profile until a newer one is approved. Waiting and rejected files are served only to
// the entrant's owner and admins.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ApiError } from "./validate.js";
import { isAdmin } from "../rules.js";

const MAX_BYTES = 1.5 * 1024 * 1024, MAX_FRAMES = 3;
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const FILE = /^[A-Za-z0-9_-]{12,40}\.(png|jpg|webp)$/;

// What the bytes really are, whatever the upload claimed.
export function sniff(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export class Portraits {
  constructor({ ledger, registry, accounts, dir, feed, now = () => Date.now() }) {
    Object.assign(this, { ledger, registry, accounts, dir, feed, now });
    this.sets = new Map(); // set -> { entrantId, frames, at, status, note }
    this.files = new Map(); // file -> set
    for (const l of ledger.lines) this.#index(l);
    ledger.on("append", lines => { for (const l of lines) this.#index(l); });
  }

  #index(l) {
    if (l.t === "portrait_submit") {
      // a newer upload replaces one still waiting for the same entrant
      const who = l.entrantId ? `e:${l.entrantId}` : `u:${l.uid}`;
      for (const s of this.sets.values()) if (s.who === who && s.status === "pending") s.status = "replaced";
      this.sets.set(l.set, { set: l.set, who, entrantId: l.entrantId || null, uid: l.uid || null, frames: l.frames, at: l.at, status: "pending", note: "" });
      for (const f of l.frames) this.files.set(f.file, l.set);
    } else if (l.t === "portrait_review") {
      const s = this.sets.get(l.set);
      if (s && s.status === "pending") Object.assign(s, { status: l.decision, note: l.note || "", reviewedAt: l.at });
    }
  }

  #latest(who, status) {
    let best = null;
    for (const s of this.sets.values()) if (s.who === who && s.status === status && (!best || (s.reviewedAt || s.at) > (best.reviewedAt || best.at))) best = s;
    return best;
  }

  #mine(ctx, e) { return !!ctx.uid && (ctx.uid === e.ownerId || isAdmin(ctx)); }
  // may this reader see a set that isn't approved: its owner (the entrant's owner, or the member) and admins
  #mayPeek(ctx, s) {
    if (!ctx.uid) return false;
    if (s.uid) return ctx.uid === s.uid || isAdmin(ctx);
    const e = this.registry.entrantById(s.entrantId);
    return !!e && this.#mine(ctx, e);
  }
  #url = f => `api/v1/portraits/${f.file}`;
  #view(s) { return s ? { set: s.set, frames: s.frames.map(this.#url), at: s.at, status: s.status, ...(s.note ? { note: s.note } : {}) } : null; }

  // POST /entrants/:id/portrait { frames: ["data:image/png;base64,…", …] }: the owner only.
  submit(ctx, entrantId, body = {}) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    const e = this.registry.entrantById(entrantId);
    if (!e || e.ownerId !== ctx.uid) throw new ApiError(404, "not_found", "That isn't one of your saved entrants.");
    if (e.status !== "active") throw new ApiError(409, "not_active", "Only active entrants can have a profile picture.");
    return this.#store(ctx, { entrantId: e.id }, body, () => this.status(ctx, e.id));
  }

  // POST /members/me/portrait { frames }: a member's own profile picture, reviewed the same way.
  submitMember(ctx, body = {}) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    return this.#store(ctx, { uid: ctx.uid }, body, () => this.memberStatus(ctx));
  }

  #store(ctx, owner, body, done) {
    const list = body.frames;
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_FRAMES) throw new ApiError(400, "invalid_argument", "Send 1 to 3 pictures.", "frames");
    const set = crypto.randomBytes(9).toString("base64url"), frames = [];
    const bufs = list.map((d, i) => {
      const m = typeof d === "string" && /^data:image\/[a-z+.-]{2,20};base64,([A-Za-z0-9+/=]+)$/.exec(d);
      if (!m) throw new ApiError(400, "invalid_argument", `Picture ${i + 1} isn't an image.`, "frames");
      const b = Buffer.from(m[1], "base64");
      if (b.length > MAX_BYTES) throw new ApiError(400, "invalid_argument", `Picture ${i + 1} is too big. Keep each under 1.5 MB.`, "frames");
      const ext = sniff(b);
      if (!ext) throw new ApiError(400, "invalid_argument", `Picture ${i + 1} must be a PNG, JPEG or WebP.`, "frames");
      return { b, ext };
    });
    fs.mkdirSync(this.dir, { recursive: true });
    bufs.forEach(({ b, ext }, i) => {
      const file = `${set}-${i + 1}.${ext}`;
      fs.writeFileSync(path.join(this.dir, file), b);
      frames.push({ file, type: TYPES[ext], bytes: b.length });
    });
    this.ledger.append([{ t: "portrait_submit", ...owner, set, frames }], ctx.uid, this.now());
    this.feed.publish("admin:applications", "application.updated", { portrait: set }, c => isAdmin(c));
    return done();
  }

  #state(who) {
    const pending = this.#latest(who, "pending"), rejected = this.#latest(who, "rejected"), approved = this.#latest(who, "approved");
    return { approved: this.#view(approved), pending: this.#view(pending), rejected: rejected && (!pending || rejected.reviewedAt > pending.at) ? this.#view(rejected) : null };
  }

  // GET /members/me/portrait: the member's own picture, waiting or turned down.
  memberStatus(ctx) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    return this.#state(`u:${ctx.uid}`);
  }

  // A member's approved picture (public), or null.
  approvedForMember(uid) { return this.#view(this.#latest(`u:${uid}`, "approved")); }

  // GET /entrants/:id/portrait: what's shown, and what's waiting or was turned down (owner and admins).
  status(ctx, entrantId) {
    const e = this.registry.entrantById(entrantId);
    if (!e || !this.#mine(ctx, e)) throw new ApiError(404, "not_found", "That isn't one of your saved entrants.");
    return this.#state(`e:${e.id}`);
  }

  // The approved picture for a profile (public), or null.
  approvedFor(entrantId) { return this.#view(this.#latest(`e:${entrantId}`, "approved")); }

  // GET /portraits/queue: uploads waiting for review (admins).
  queue(ctx) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins review profile pictures.");
    const out = [];
    for (const s of this.sets.values()) if (s.status === "pending") {
      if (s.uid) { const u = this.accounts?.users.get(s.uid); out.push({ ...this.#view(s), entrant: null, member: u ? { username: u.username, name: u.name || u.username } : null }); continue; }
      const e = this.registry.entrantById(s.entrantId);
      out.push({ ...this.#view(s), entrant: e ? { id: e.id, name: e.name, kind: e.kind, slug: e.slug } : null });
    }
    return { queue: out.sort((a, b) => a.at - b.at) };
  }

  // POST /portraits/:set/review { decision: "approve" | "reject", note }
  review(ctx, set, body = {}) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins review profile pictures.");
    const s = this.sets.get(set);
    if (!s) throw new ApiError(404, "not_found", "No such upload.");
    if (s.status !== "pending") throw new ApiError(409, "already_reviewed", `That upload is already ${s.status}.`);
    const decision = { approve: "approved", reject: "rejected" }[body.decision];
    if (!decision) throw new ApiError(400, "invalid_argument", "decision is approve or reject.", "decision");
    const note = typeof body.note === "string" ? body.note.slice(0, 200) : "";
    this.ledger.append([{ t: "portrait_review", set, ...(s.uid ? { uid: s.uid } : { entrantId: s.entrantId }), decision, note }], ctx.uid, this.now());
    const e = this.registry.entrantById(s.entrantId);
    if (e && decision === "approved") this.feed.publish(`entrant:${e.id}`, "entrant.updated", { portrait: true });
    return { set, status: decision };
  }

  // A deleted member's pictures: the files are removed from disk (their ledger lines stay, and now serve nothing).
  removeFor(entrantIds, uid = null) {
    const ids = new Set(entrantIds);
    for (const s of this.sets.values()) if ((s.entrantId && ids.has(s.entrantId)) || (uid && s.uid === uid)) {
      for (const f of s.frames) { try { fs.unlinkSync(path.join(this.dir, f.file)); } catch { /* already gone */ } }
      s.status = "removed";
    }
  }

  // GET /portraits/:file: approved pictures for everyone; waiting or rejected ones for the owner and admins.
  file(ctx, name) {
    if (!FILE.test(name)) throw new ApiError(404, "not_found", "No such picture.");
    const s = this.sets.get(this.files.get(name));
    if (!s) throw new ApiError(404, "not_found", "No such picture.");
    if (s.status !== "approved" && !this.#mayPeek(ctx, s)) throw new ApiError(404, "not_found", "No such picture.");
    let bytes;
    try { bytes = fs.readFileSync(path.join(this.dir, name)); } catch { throw new ApiError(404, "not_found", "No such picture."); }
    return { bytes, type: TYPES[name.split(".").pop()], public: s.status === "approved" };
  }
}
