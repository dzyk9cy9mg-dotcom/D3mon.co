// The founder waitlist (owner, 2026-10-22): guests leave an email on Battle of the Bots night (Oct 31) to hear
// first when founding memberships open (Black Friday, with a 24-hour head start for the waitlist).
// Closed and hidden until an admin opens it, so nothing is announced early.
//
//   arena_waitlist/<id>     { id, email, createdAt, uid }   id = first 20 of sha256(email), so a repeat is the same doc
//   arena_waitlistcfg/main  { open, updatedAt, updatedBy }
//
// Emails are never in the ledger (it's permanent) so an admin can delete one when someone asks.
// The public sees only whether it's open and how many have joined.
import crypto from "node:crypto";
import { ApiError } from "./validate.js";
import { isAdmin } from "../rules.js";

export const WAITLIST = "arena_waitlist";
const CFG = "arena_waitlistcfg/main";
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MAX = 50000;

export class Waitlist {
  constructor({ store, feed, now = () => Date.now() }) {
    Object.assign(this, { store, feed, now });
  }

  #all() { return this.store.query({ collection: WAITLIST }).map(r => r.data); }
  #admin(ctx) { if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins can do that."); }
  #changed() { this.feed.publish("waitlist", "waitlist.changed", this.info()); }

  get open() { return !!this.store.get(CFG).data?.open; }

  // GET /waitlist: public.
  info() { return { open: this.open, count: this.#all().length }; }

  // POST /waitlist { email }: anyone, while it's open. Joining twice is fine and says the same thing.
  // `limit` runs only before a new email is saved, so typos and repeats never use up an address's allowance.
  join(ctx, body = {}, limit = () => {}) {
    if (!this.open) throw new ApiError(409, "waitlist_closed", "The founder waitlist isn't open yet.");
    const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : null;
    if (!keys || keys.some(k => k !== "email")) throw new ApiError(400, "invalid_argument", "Send { email }.");
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !EMAIL_RE.test(email)) throw new ApiError(400, "invalid_argument", "That doesn't look like an email address.", "email");
    const id = crypto.createHash("sha256").update(email).digest("hex").slice(0, 20);
    if (!this.store.get(`${WAITLIST}/${id}`).data) {
      limit();
      if (this.#all().length >= MAX) throw new ApiError(503, "unavailable", "The waitlist is full. Try again later.");
      this.store.set(`${WAITLIST}/${id}`, { id, email, createdAt: this.now(), uid: ctx.uid || null }, ctx.uid || "guest");
      this.#changed();
    }
    return { joined: true, ...this.info() };
  }

  // PUT /waitlist { open }: admins open or close it.
  setOpen(ctx, body = {}) {
    this.#admin(ctx);
    if (typeof body?.open !== "boolean") throw new ApiError(400, "invalid_argument", "open is true or false.", "open");
    this.store.set(CFG, { open: body.open, updatedAt: this.now(), updatedBy: ctx.uid }, ctx.uid);
    this.#changed();
    return this.info();
  }

  // GET /waitlist/entries: admins, newest first.
  list(ctx) {
    this.#admin(ctx);
    return { ...this.info(), entries: this.#all().sort((a, b) => b.createdAt - a.createdAt) };
  }

  // DELETE /waitlist/entries/:id: admins, when someone asks to be taken off.
  remove(ctx, id) {
    this.#admin(ctx);
    if (!this.store.get(`${WAITLIST}/${id}`).data) throw new ApiError(404, "not_found", "No such entry.");
    this.store.delete(`${WAITLIST}/${id}`);
    this.#changed();
    return this.info();
  }
}
