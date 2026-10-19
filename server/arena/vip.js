// The VIP room at the top of the pyramid (owner, 2026-10-18): a paid room where featured callers lead the
// trading, backed by featured bots and chart scripts. It works like the Grand Hall's trading floor, but only
// members with access get in, and they see the featured callers' calls the moment they're made (everyone
// else sees them sealed until the calls close, as before).
//
// Payment is handled outside the site for now (Venmo, Cash App or PayPal business profiles): an admin grants
// a member access for a number of days, extends it, or ends it. Access ends by itself when its time runs
// out. Admins always have access. Who's featured is an admin's choice and public; the room itself isn't.
//
// Capstone sessions (owner, 2026-10-19): scheduled trading sessions in the room, whenever the team chooses, an
// hour or longer, led by the featured callers with bots and scripts backing them. Admins add and cancel them; the
// schedule is public so the front page can count down to the next one.
//
// Ledger lines: { t: "vip_access", uid, until, note }   until = now when access is ended by hand
//               { t: "vip_featured", entrantIds }
//               { t: "vip_session", title, startsAt, minutes, leads }   its ledger id is the session's id
//               { t: "vip_session_cancel", session }
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { MARKET } from "./calls.js";
import { ROUND_MS } from "./registry.js";

const DAY = 86400000;
const MAX_FEATURED = 20;
const GRANT = {
  username: { type: "string", required: true, min: 3, max: 24 },
  days: { type: "integer", required: true, min: 1, max: 366 },
  note: { type: "string", max: 200 },
};
const SESSION = {
  title: { type: "string", required: true, min: 3, max: 80 },
  startsAt: { type: "integer", required: true, min: Date.UTC(2024, 0, 1), max: Date.UTC(2100, 0, 1) },
  minutes: { type: "integer", min: 15, max: 720, default: 60 },
  leads: { type: "string", max: 200 }, // who leads it, in the admins' words ("Freya Calls with Valhalla and Halo-7")
};
const FEATURED = { entrantIds: { type: "array", of: { type: "string", pattern: /^[A-Za-z0-9]{8,40}$/, max: 40 }, max: MAX_FEATURED, unique: true, required: true } };

export class Vip {
  constructor({ ledger, registry, calls, feed, accounts, now = () => Date.now() }) {
    Object.assign(this, { ledger, registry, calls, feed, accounts, now });
    this.access = new Map(); // uid -> vip_access lines, in write order
    this.featured = []; // entrant ids, from the latest vip_featured line
    this.sessions = new Map(); // ledger id -> vip_session line (cancelled ones removed)
    const index = lines => {
      for (const l of lines) {
        if (l.t === "vip_access") { if (!this.access.has(l.uid)) this.access.set(l.uid, []); this.access.get(l.uid).push(l); }
        if (l.t === "vip_featured") this.featured = l.entrantIds;
        if (l.t === "vip_session") this.sessions.set(l.id, l);
        if (l.t === "vip_session_cancel") this.sessions.delete(l.session);
      }
    };
    index(ledger.lines);
    ledger.on("append", index);
  }

  #until(uid) { const l = (this.access.get(uid) || []).at(-1); return l ? l.until : 0; }
  hasAccess(ctx) { return !!ctx.uid && (isAdmin(ctx) || this.#until(ctx.uid) > this.now()); }
  #requireAdmin(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!isAdmin(ctx) || !ctx.canWrite) throw new ApiError(403, "not_granted", "Only admins can do that.");
  }
  #entrantView(e) { return { id: e.id, name: e.name, slug: e.slug, kind: e.kind, creatorName: e.creatorName }; }
  #featuredEntrants() { return this.featured.map(id => this.registry.entrantById(id)).filter(e => e && e.status === "active"); }

  // GET /vip: who's featured (a public teaser) and whether this reader may enter.
  info(ctx) {
    const until = ctx.uid ? this.#until(ctx.uid) : 0;
    return { featured: this.#featuredEntrants().map(e => this.#entrantView(e)), access: this.hasAccess(ctx), admin: isAdmin(ctx),
      until: until > this.now() ? until : null };
  }

  // GET /vip/room: the room itself, for members with access. The featured entrants' calls this round, with
  // the callers' directions shown at once (that's what the room is for).
  room(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in to enter the VIP room.");
    if (!this.hasAccess(ctx)) throw new ApiError(403, "no_access", "The VIP room needs access. Ask an admin.");
    const now = this.now(), round = Math.floor(now / ROUND_MS) * ROUND_MS;
    const featured = this.#featuredEntrants();
    const calls = [];
    for (const e of featured) {
      const l = this.calls.latest(e.id, MARKET, round);
      if (!l) continue;
      const v = this.calls.view(l, ctx);
      if (v.sealed) { delete v.sealed; v.direction = l.dir; v.early = true; } // sealed for everyone else
      calls.push({ ...v, kind: e.kind, slug: e.slug });
    }
    calls.sort((a, b) => b.receivedAt - a.receivedAt);
    return { round, endsAt: round + ROUND_MS, featured: featured.map(e => this.#entrantView(e)), calls };
  }

  // ---------- admin ----------
  // GET /vip/access: every member who has had access, newest first.
  list(ctx) {
    this.#requireAdmin(ctx);
    const now = this.now(), out = [];
    for (const [uid, lines] of this.access) {
      const u = this.accounts.users.get(uid), last = lines.at(-1);
      out.push({ uid, username: u ? u.username : null, name: u ? u.name : null, until: last.until, active: last.until > now, note: last.note || "",
        history: lines.map(l => ({ until: l.until, note: l.note || "", at: l.at, by: l.by })) });
    }
    return out.sort((a, b) => b.history.at(-1).at - a.history.at(-1).at);
  }

  // POST /vip/access { username, days, note }: grants access, or extends it from when it runs out.
  grant(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, GRANT);
    const uid = this.accounts.byName.get(f.username.trim().toLowerCase());
    if (!uid) throw new ApiError(404, "not_found", `No member is called "${f.username}".`, "username");
    const now = this.now(), until = Math.max(now, this.#until(uid)) + f.days * DAY;
    this.ledger.append([{ t: "vip_access", uid, until, note: f.note || "" }], ctx.uid, now);
    this.feed.publish("vip", "vip.updated", () => ({}));
    return this.list(ctx).find(x => x.uid === uid);
  }

  // DELETE /vip/access/:uid: ends access now.
  revoke(ctx, uid) {
    this.#requireAdmin(ctx);
    if (!this.access.has(uid)) throw new ApiError(404, "not_found", "That member never had access.");
    const now = this.now();
    if (this.#until(uid) <= now) return { ...this.list(ctx).find(x => x.uid === uid), unchanged: true };
    this.ledger.append([{ t: "vip_access", uid, until: now, note: "ended by an admin" }], ctx.uid, now);
    this.feed.publish("vip", "vip.updated", () => ({}));
    return this.list(ctx).find(x => x.uid === uid);
  }

  // GET /vip/sessions: the schedule, public: sessions not yet over, soonest first, and the last few that ended.
  sessionList() {
    const now = this.now(), all = [...this.sessions.values()].map(l => ({ id: l.id, title: l.title, startsAt: l.startsAt, minutes: l.minutes, endsAt: l.startsAt + l.minutes * 60000, leads: l.leads || "" }));
    return { upcoming: all.filter(s => s.endsAt > now).sort((a, b) => a.startsAt - b.startsAt), past: all.filter(s => s.endsAt <= now).sort((a, b) => b.startsAt - a.startsAt).slice(0, 5), now };
  }

  // POST /vip/sessions { title, startsAt, minutes, leads }
  addSession(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, SESSION);
    if (f.startsAt + f.minutes * 60000 <= this.now()) throw new ApiError(400, "invalid_argument", "That session would already be over.", "startsAt");
    const [l] = this.ledger.append([{ t: "vip_session", ...f, leads: f.leads || "" }], ctx.uid, this.now());
    this.feed.publish("vip", "vip.updated", () => ({}));
    return this.sessionList().upcoming.find(s => s.id === l.id);
  }

  // DELETE /vip/sessions/:id: cancels a session (its line stays in the ledger).
  cancelSession(ctx, id) {
    this.#requireAdmin(ctx);
    if (!this.sessions.has(id)) throw new ApiError(404, "not_found", "No such session.");
    this.ledger.append([{ t: "vip_session_cancel", session: id }], ctx.uid, this.now());
    this.feed.publish("vip", "vip.updated", () => ({}));
    return this.sessionList();
  }

  // PUT /vip/featured { entrantIds }: who's featured, in this order.
  setFeatured(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, FEATURED);
    for (const id of f.entrantIds) {
      const e = this.registry.entrantById(id);
      if (!e || e.status !== "active") throw new ApiError(400, "invalid_argument", "Only active bots, scripts and callers can be featured.", "entrantIds");
    }
    this.ledger.append([{ t: "vip_featured", entrantIds: f.entrantIds }], ctx.uid, this.now());
    this.feed.publish("vip", "vip.updated", () => ({}));
    return this.info(ctx);
  }
}
