// The calendar and notifications (owner, 2026-10-21, grouped build 1 of the culture plan).
//
// The calendar is one list of what's coming: Battle of the Bots nights (from the registry), Capstone sessions (from
// the VIP room) and events admins add by hand (a live trading-floor session, a Lab night, anything else). Members
// press "Remind me" on any of them and get a notification 15 minutes before it starts and another when it goes live.
// Admins can also send an announcement to every member. Notifications show in the bell in the menu bar.
//
// Event keys: "battle:<id>", "capstone:<ledger id>", "event:<ledger id>".
// Ledger lines: { t: "cal_event", title, kind, startsAt, minutes, link, note }   its ledger id is the event's id
//               { t: "cal_event_cancel", event }
// Store (server-only, arena_*): arena_reminders/<uid>  { keys: [eventKey, ...] }
//                               arena_notes/<uid>      { notes: [{ id, at, text, link, read }] }  newest last, at most 100
import crypto from "node:crypto";
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { battleState } from "./registry.js";

export const SOON_MS = 15 * 60000; // the "starts soon" reminder
const MAX_NOTES = 100, MAX_REMINDERS = 200, MAX_DAYS = 120;
export const KINDS = { live: "Live trading floor", lab: "Lab", community: "Community", other: "Event" };
const EVENT = {
  title: { type: "string", required: true, min: 3, max: 80 },
  kind: { type: "enum", values: Object.keys(KINDS), default: "live" },
  startsAt: { type: "integer", required: true, min: Date.UTC(2024, 0, 1), max: Date.UTC(2100, 0, 1) },
  minutes: { type: "integer", min: 15, max: 720, default: 60 },
  link: { type: "string", max: 200 }, // a page on the site ("live", "battle") or an https:// address
  note: { type: "string", max: 300 },
};
const ANNOUNCE = { text: { type: "string", required: true, min: 3, max: 280 }, link: { type: "string", max: 200 } };
const KEY = /^(battle|capstone|event):[A-Za-z0-9_-]{1,40}$/;

// A link is a page on this site (letters, digits, - _ / # ? = &) or an https:// address.
function cleanLink(v, field) {
  if (!v) return "";
  if (/^https:\/\/[^\s"<>]+$/.test(v) || /^[A-Za-z0-9][A-Za-z0-9_\-/#?=&.]*$/.test(v)) return v;
  throw new ApiError(400, "invalid_argument", "A link is a page on the site (like live) or an https:// address.", field);
}

export class Calendar {
  constructor({ ledger, store, registry, vip, accounts, now = () => Date.now() }) {
    Object.assign(this, { ledger, store, registry, vip, accounts, now });
    this.events = new Map(); // ledger id -> cal_event line (cancelled ones removed)
    const index = lines => {
      for (const l of lines) {
        if (l.t === "cal_event") this.events.set(l.id, l);
        if (l.t === "cal_event_cancel") this.events.delete(l.event);
      }
    };
    index(ledger.lines);
    ledger.on("append", index);
    this.timer = null;
  }

  #requireAdmin(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!isAdmin(ctx) || !ctx.canWrite) throw new ApiError(403, "not_granted", "Only admins can do that.");
  }
  #requireMember(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in to get reminders.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
  }

  // ---------- the calendar ----------
  // Everything not over yet (and what ended in the last day), soonest first.
  all(now = this.now()) {
    const out = [];
    for (const b of this.registry.allBattles()) {
      if (b.status === "draft") continue;
      const endsAt = b.startsAt + b.rounds * b.roundMs;
      out.push({ key: `battle:${b.id}`, type: "battle", kind: "battle", label: "Battle of the Bots", title: b.title, startsAt: b.startsAt, endsAt, link: "battle", note: `${b.rounds} rounds · ${battleState(b, now)}` });
    }
    for (const s of this.vip.sessionList().upcoming.concat(this.vip.sessionList().past))
      out.push({ key: `capstone:${s.id}`, type: "capstone", kind: "capstone", label: "Capstone", title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, link: "vip", note: s.leads ? `Led by ${s.leads}` : "" });
    for (const e of this.events.values())
      out.push({ key: `event:${e.id}`, type: "event", kind: e.kind, label: KINDS[e.kind] || "Event", title: e.title, startsAt: e.startsAt, endsAt: e.startsAt + e.minutes * 60000, link: e.link || "", note: e.note || "" });
    const seen = new Set();
    return out.filter(e => (seen.has(e.key) ? false : seen.add(e.key))).sort((a, b) => a.startsAt - b.startsAt);
  }

  // GET /calendar?days=N: what's coming in the next N days (default 60), with this reader's reminders marked.
  list(ctx, { days } = {}) {
    const now = this.now(), d = Math.min(MAX_DAYS, Math.max(1, Number(days) || 60)), until = now + d * 86400000;
    const mine = new Set(ctx.uid ? this.#reminders(ctx.uid) : []);
    const events = this.all(now).filter(e => e.endsAt > now - 86400000 && e.startsAt <= until)
      .map(e => ({ ...e, live: e.startsAt <= now && now < e.endsAt, over: now >= e.endsAt, remind: mine.has(e.key) }));
    return { now, events, admin: isAdmin(ctx), kinds: KINDS };
  }

  // POST /calendar/events: an admin adds an event.
  addEvent(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, EVENT);
    f.link = cleanLink(f.link, "link");
    if (f.startsAt + f.minutes * 60000 <= this.now()) throw new ApiError(400, "invalid_argument", "That event would already be over.", "startsAt");
    const [l] = this.ledger.append([{ t: "cal_event", ...f, note: f.note || "" }], ctx.uid, this.now());
    return this.all().find(e => e.key === `event:${l.id}`);
  }

  // DELETE /calendar/events/:id: cancels an admin-added event (battles and Capstone are cancelled where they live).
  cancelEvent(ctx, id) {
    this.#requireAdmin(ctx);
    if (!this.events.has(id)) throw new ApiError(404, "not_found", "No such event.");
    this.ledger.append([{ t: "cal_event_cancel", event: id }], ctx.uid, this.now());
    return { ok: true };
  }

  // ---------- reminders ----------
  #reminders(uid) { return this.store.get(`arena_reminders/${uid}`).data?.keys || []; }
  // PUT /calendar/remind { key, on }
  setReminder(ctx, body = {}) {
    this.#requireMember(ctx);
    const key = typeof body.key === "string" ? body.key : "";
    if (!KEY.test(key)) throw new ApiError(400, "invalid_argument", "Name the event's key.", "key");
    if (typeof body.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", "on");
    const now = this.now(), events = this.all(now), live = new Set(events.filter(e => e.endsAt > now).map(e => e.key));
    if (body.on && !live.has(key)) throw new ApiError(404, "not_found", "That event isn't coming up.", "key");
    // forget reminders for events that are over or gone, so the list stays small
    const keys = new Set(this.#reminders(ctx.uid).filter(k => live.has(k)));
    if (body.on) keys.add(key); else keys.delete(key);
    if (keys.size > MAX_REMINDERS) throw new ApiError(409, "too_many", "That's a lot of reminders. Turn some off first.");
    this.store.set(`arena_reminders/${ctx.uid}`, { keys: [...keys] }, ctx.uid);
    return { key, remind: keys.has(key) };
  }

  // ---------- notifications ----------
  #notes(uid) { return this.store.get(`arena_notes/${uid}`).data?.notes || []; }
  // Adds a note for each uid. `id` makes it idempotent: the same id is never added twice to one member.
  notify(uids, { id, text, link = "" }) {
    const at = this.now();
    for (const uid of new Set(uids)) {
      const notes = this.#notes(uid);
      if (id && notes.some(n => n.id === id)) continue;
      notes.push({ id: id || crypto.randomBytes(6).toString("hex"), at, text, link, read: false });
      this.store.set(`arena_notes/${uid}`, { notes: notes.slice(-MAX_NOTES) }, "calendar");
    }
  }

  // GET /notifications: mine, newest first, with the unread count.
  myNotes(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    const notes = this.#notes(ctx.uid).slice().reverse();
    return { unread: notes.filter(n => !n.read).length, notes };
  }

  // POST /notifications/read: marks all mine read.
  markRead(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    const notes = this.#notes(ctx.uid);
    if (notes.some(n => !n.read)) this.store.set(`arena_notes/${ctx.uid}`, { notes: notes.map(n => ({ ...n, read: true })) }, ctx.uid);
    return { unread: 0 };
  }

  // POST /notifications/announce { text, link }: an admin tells every member.
  announce(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, ANNOUNCE);
    const link = cleanLink(f.link, "link");
    const uids = [...this.accounts.users.keys()].filter(uid => !this.accounts.banned(uid));
    this.notify(uids, { id: `announce:${this.now()}`, text: f.text, link });
    return { sent: uids.length };
  }

  // ---------- the clock: reminders go out 15 minutes before, and at the start ----------
  // Sends what became due in (from, to]. Each reminder has a fixed id, so a restart never sends one twice.
  remindDue(from, to) {
    const due = [];
    for (const e of this.all(to)) {
      if (e.startsAt - SOON_MS > from && e.startsAt - SOON_MS <= to && e.startsAt > to) due.push([e, "soon", `${e.title} starts in 15 minutes.`]);
      if (e.startsAt > from && e.startsAt <= to && e.endsAt > to) due.push([e, "live", `${e.title} is live now.`]);
    }
    if (!due.length) return 0;
    let sent = 0;
    for (const doc of this.store.query({ collection: "arena_reminders" })) {
      const uid = doc.id, keys = new Set(doc.data?.keys || []);
      for (const [e, step, text] of due) if (keys.has(e.key)) { this.notify([uid], { id: `${e.key}:${step}`, text, link: e.link }); sent++; }
    }
    return sent;
  }

  start(every = 30000) {
    let last = this.now();
    const tick = () => {
      const now = this.now();
      try { this.remindDue(last, now); } catch (e) { console.error(e); }
      last = now;
    };
    this.timer = setInterval(tick, every);
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer); }
}
