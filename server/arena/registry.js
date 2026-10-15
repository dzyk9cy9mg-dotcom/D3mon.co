// Battle of the Bots registration: battles, the application log, and approved entrants.
//
//   arena_battles/<id>    a battle: title, start, rounds, which kinds may enter, status, approved lineup
//   arena_apps/<id>       one application to one battle. Never deleted; every change is added to history
//   arena_entrants/<id>   an approved bot, caller or script, saved so its owner can re-select it later
//
// These collections are server-only (rules.js keeps /api/db out of them); every change comes through
// here, so each field is checked and every decision is logged. ARCHITECTURE.md §5 has the shapes.
import { ApiError, check, slugify } from "./validate.js";
import { isAdmin } from "../rules.js";

export const BATTLES = "arena_battles", APPS = "arena_apps", ENTRANTS = "arena_entrants";
export const KINDS = ["bot", "caller", "script"];
export const ROUND_MS = 15 * 60000; // Kalshi BTC 15-minute rounds
const BATTLE_STATUS = ["draft", "open", "closed", "live", "final"];
const LIVE_APP = new Set(["pending", "approved"]);
const ID = { type: "string", pattern: /^[A-Za-z0-9]{8,40}$/, max: 40 };
const MAX_PENDING_PER_BATTLE = 10; // one person may enter several bots, within reason

const BATTLE_FIELDS = {
  title: { type: "string", required: true, min: 3, max: 80 },
  startsAt: { type: "integer", required: true, min: Date.UTC(2024, 0, 1), max: Date.UTC(2100, 0, 1) },
  rounds: { type: "integer", min: 1, max: 96, default: 8 },
  kinds: { type: "array", of: { type: "enum", values: KINDS }, min: 1, max: 3, unique: true, default: KINDS },
  status: { type: "enum", values: BATTLE_STATUS, default: "draft" },
};

const APP_FIELDS = {
  kind: { type: "enum", values: KINDS },
  name: { type: "string", min: 2, max: 40 },
  creatorName: { type: "string", required: true, min: 1, max: 40 },
  altAccount: { type: "string", max: 60 },
  discordServer: { type: "string", max: 80 },
  notes: { type: "string", max: 1000, multiline: true },
  entrantId: ID,
};

const REVIEW_FIELDS = {
  decision: { type: "enum", values: ["approve", "reject", "reopen"], required: true },
  note: { type: "string", max: 500, multiline: true },
};

export class Registry {
  // store: the shared Store. feed: the live feed. userName(uid): an account's display name.
  constructor({ store, feed, userName = () => null }) {
    this.store = store;
    this.feed = feed;
    this.userName = userName;
  }

  // ---------- reading ----------
  #get(col, id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9]{8,40}$/.test(id)) return null;
    return this.store.get(`${col}/${id}`).data || null;
  }
  #all(col, where = []) {
    return this.store.query({ collection: col, where }).map(r => r.data);
  }
  #save(col, doc, uid) {
    this.store.set(`${col}/${doc.id}`, doc, uid);
    return doc;
  }

  battleFor(ctx, id) {
    const b = this.#get(BATTLES, id);
    if (!b || (b.status === "draft" && !isAdmin(ctx))) throw new ApiError(404, "not_found", "No such battle.");
    return b;
  }

  // The battles an entrant is in (lineup, not a draft) that include this round.
  battlesFor(entrantId, round) {
    return this.#all(BATTLES).filter(b => b.status !== "draft" && (b.entrants || []).includes(entrantId) && round >= b.startsAt && round < b.startsAt + b.rounds * b.roundMs);
  }

  entrantById(id) {
    return this.#get(ENTRANTS, id);
  }

  entrantBySlug(slug) {
    return this.#all(ENTRANTS, [["slug", "==", slug]])[0] || null;
  }

  // ---------- views: what each reader is allowed to see ----------
  battleView(b, ctx) {
    const entrants = (b.entrants || []).map(id => this.#get(ENTRANTS, id)).filter(Boolean).map(e => this.entrantView(e, ctx));
    const out = { id: b.id, title: b.title, market: b.market, startsAt: b.startsAt, rounds: b.rounds, roundMs: b.roundMs,
      endsAt: b.startsAt + b.rounds * b.roundMs, kinds: b.kinds, status: b.status, entrants, createdAt: b.createdAt, updatedAt: b.updatedAt };
    if (isAdmin(ctx)) {
      out.applications = {};
      for (const a of this.#all(APPS, [["battleId", "==", b.id]])) out.applications[a.status] = (out.applications[a.status] || 0) + 1;
    }
    return out;
  }

  // The alternative account and notes are for HardSmoke and the owner; the rest is the public profile.
  entrantView(e, ctx) {
    const out = { id: e.id, kind: e.kind, name: e.name, slug: e.slug, creatorName: e.creatorName, discordServer: e.discordServer, status: e.status, approvedAt: e.approvedAt, battles: e.battles };
    if (isAdmin(ctx) || (ctx.uid && ctx.uid === e.ownerId)) Object.assign(out, { altAccount: e.altAccount, notes: e.notes, ownerId: e.ownerId, mine: ctx.uid === e.ownerId });
    return out;
  }

  appView(a, ctx) {
    const out = { ...a };
    if (isAdmin(ctx)) out.applicantName = this.userName(a.applicantId);
    return out;
  }

  // ---------- battles ----------
  listBattles(ctx) {
    return this.#all(BATTLES).filter(b => b.status !== "draft" || isAdmin(ctx)).sort((x, y) => y.startsAt - x.startsAt).map(b => this.battleView(b, ctx));
  }

  createBattle(ctx, body) {
    this.#requireAdmin(ctx);
    const f = check(body, BATTLE_FIELDS);
    checkStart(f.startsAt);
    const now = Date.now();
    const b = { id: this.store.newId(BATTLES), ...f, market: "KXBTC15M", roundMs: ROUND_MS, entrants: [], createdBy: ctx.uid, createdAt: now, updatedAt: now };
    this.#save(BATTLES, b, ctx.uid);
    this.#battleChanged(b);
    return b;
  }

  updateBattle(ctx, id, body) {
    this.#requireAdmin(ctx);
    const b = this.battleFor(ctx, id);
    const f = check(body, BATTLE_FIELDS, { partial: true });
    if (f.startsAt !== undefined) checkStart(f.startsAt);
    if (b.status === "final" && f.status === undefined) throw new ApiError(409, "battle_final", "This battle is final. Reopen it (change its status) before editing.");
    const next = { ...b, ...f, updatedAt: Date.now() };
    this.#save(BATTLES, next, ctx.uid);
    this.#battleChanged(next);
    return next;
  }

  // ---------- applications ----------
  apply(ctx, battleId, body) {
    this.#requireMember(ctx);
    const b = this.battleFor(ctx, battleId);
    if (b.status !== "open") throw new ApiError(409, "applications_closed", "This battle isn't taking applications.");
    const f = check(body, APP_FIELDS);
    let kind = f.kind, name = f.name, entrantId = null;
    if (f.entrantId) {
      // Re-selecting a saved entrant: its name and kind come from the saved record.
      const e = this.#get(ENTRANTS, f.entrantId);
      if (!e || e.ownerId !== ctx.uid) throw new ApiError(404, "not_found", "That isn't one of your saved entrants.", "entrantId");
      if (e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended. Ask HardSmoke about it.`, "entrantId");
      ({ kind, name } = e);
      entrantId = e.id;
    } else {
      if (!kind) throw new ApiError(400, "invalid_argument", `"kind" is required.`, "kind");
      if (!name) throw new ApiError(400, "invalid_argument", `"name" is required.`, "name");
      const taken = this.entrantBySlug(slugify(name));
      if (taken && taken.ownerId !== ctx.uid) throw new ApiError(409, "name_taken", `"${taken.name}" is already a saved entrant. Pick a different name.`, "name");
      if (taken) {
        if (taken.kind !== kind) throw new ApiError(409, "name_taken", `You already have a ${taken.kind} called "${taken.name}".`, "name");
        ({ name } = taken);
        entrantId = taken.id;
      }
    }
    const slug = slugify(name);
    if (!slug) throw new ApiError(400, "invalid_argument", "The name needs at least one letter or number.", "name");
    if (!b.kinds.includes(kind)) throw new ApiError(409, "kind_not_allowed", `This battle is for ${b.kinds.join(", ")} entrants.`, "kind");
    const inBattle = this.#all(APPS, [["battleId", "==", b.id]]);
    if (inBattle.some(a => a.slug === slug && LIVE_APP.has(a.status)))
      throw new ApiError(409, "already_applied", `${name} already has an application for this battle.`, "name");
    if (inBattle.filter(a => a.applicantId === ctx.uid && a.status === "pending").length >= MAX_PENDING_PER_BATTLE)
      throw new ApiError(429, "resource_exhausted", "You have too many pending applications for this battle.");
    const now = Date.now();
    const a = {
      id: this.store.newId(APPS), battleId: b.id, kind, name, slug,
      creatorName: f.creatorName, altAccount: f.altAccount ?? "", discordServer: f.discordServer ?? "", notes: f.notes ?? "",
      entrantId, applicantId: ctx.uid, status: "pending", submittedAt: now, reviewedAt: null, reviewedBy: null, reviewNote: "",
      history: [{ at: now, by: ctx.uid, action: "submitted", note: "" }],
    };
    this.#save(APPS, a, ctx.uid);
    this.#appChanged(a, "application.created");
    return a;
  }

  listApps(ctx, { battleId, status } = {}) {
    this.#requireMember(ctx);
    const where = [];
    if (battleId) where.push(["battleId", "==", String(battleId)]);
    if (status) where.push(["status", "==", String(status)]);
    if (!isAdmin(ctx)) where.push(["applicantId", "==", ctx.uid]);
    return this.#all(APPS, where).sort((x, y) => y.submittedAt - x.submittedAt).slice(0, 1000).map(a => this.appView(a, ctx));
  }

  getApp(ctx, id) {
    this.#requireMember(ctx);
    const a = this.#get(APPS, id);
    if (!a || (!isAdmin(ctx) && a.applicantId !== ctx.uid)) throw new ApiError(404, "not_found", "No such application.");
    return this.appView(a, ctx);
  }

  withdraw(ctx, id) {
    this.#requireMember(ctx);
    const a = this.#get(APPS, id);
    if (!a || a.applicantId !== ctx.uid) throw new ApiError(404, "not_found", "No such application.");
    if (!LIVE_APP.has(a.status)) throw new ApiError(409, "bad_state", `This application is already ${a.status}.`);
    const b = this.#get(BATTLES, a.battleId);
    if (b && (b.status === "live" || b.status === "final")) throw new ApiError(409, "battle_started", "The battle has started, so the lineup is locked. Ask HardSmoke.");
    if (a.status === "approved") this.#leaveBattle(a, ctx.uid);
    return this.#transition(a, ctx.uid, "withdrawn", "withdrawn", "");
  }

  review(ctx, id, body) {
    this.#requireAdmin(ctx);
    const f = check(body, REVIEW_FIELDS);
    const a = this.#get(APPS, id);
    if (!a) throw new ApiError(404, "not_found", "No such application.");
    const b = this.#get(BATTLES, a.battleId);
    if (!b) throw new ApiError(404, "not_found", "That application's battle no longer exists.");
    if (b.status === "final") throw new ApiError(409, "battle_final", "This battle is final.");
    const note = f.note ?? "";
    if (f.decision === "reject") {
      if (a.status !== "pending") throw new ApiError(409, "bad_state", `Only pending applications can be rejected (this one is ${a.status}).`);
      return this.#transition(a, ctx.uid, "rejected", "rejected", note);
    }
    if (f.decision === "reopen") {
      if (a.status !== "rejected" && a.status !== "approved") throw new ApiError(409, "bad_state", `Only approved or rejected applications can be reopened (this one is ${a.status}).`);
      if (a.status === "approved") this.#leaveBattle(a, ctx.uid);
      return this.#transition(a, ctx.uid, "pending", "reopened", note);
    }
    // approve
    if (a.status !== "pending") throw new ApiError(409, "bad_state", `Only pending applications can be approved (this one is ${a.status}).`);
    if (!b.kinds.includes(a.kind)) throw new ApiError(409, "kind_not_allowed", `This battle is for ${b.kinds.join(", ")} entrants.`);
    let e = a.entrantId ? this.#get(ENTRANTS, a.entrantId) : this.entrantBySlug(a.slug);
    if (e && e.ownerId !== a.applicantId) throw new ApiError(409, "name_taken", `"${e.name}" belongs to another member's saved entrant. Reject this one or ask them to rename.`);
    if (e && e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended.`);
    if (e && (b.entrants || []).includes(e.id)) throw new ApiError(409, "already_entered", `${e.name} is already in this battle.`);
    const now = Date.now();
    const details = { creatorName: a.creatorName, altAccount: a.altAccount, discordServer: a.discordServer, notes: a.notes };
    e = e
      ? { ...e, ...details, battles: [...new Set([...(e.battles || []), b.id])], updatedAt: now }
      : { id: this.store.newId(ENTRANTS), kind: a.kind, name: a.name, slug: a.slug, ...details, ownerId: a.applicantId, status: "active",
          approvedAt: now, approvedBy: ctx.uid, fromApplication: a.id, battles: [b.id], createdAt: now, updatedAt: now };
    this.#save(ENTRANTS, e, ctx.uid);
    const nb = { ...b, entrants: [...(b.entrants || []), e.id], updatedAt: now };
    this.#save(BATTLES, nb, ctx.uid);
    const done = this.#transition({ ...a, entrantId: e.id }, ctx.uid, "approved", "approved", note);
    this.#entrantChanged(e);
    this.#battleChanged(nb);
    return done;
  }

  // ---------- entrants ----------
  listEntrants(ctx, { mine = false } = {}) {
    if (mine) this.#requireMember(ctx);
    const list = mine ? this.#all(ENTRANTS, [["ownerId", "==", ctx.uid]]) : this.#all(ENTRANTS).filter(e => e.status === "active" || isAdmin(ctx));
    return list.sort((x, y) => x.name.localeCompare(y.name)).map(e => this.entrantView(e, ctx));
  }

  getEntrant(ctx, id) {
    const e = this.#get(ENTRANTS, id) || (typeof id === "string" ? this.entrantBySlug(id) : null);
    if (!e || (e.status !== "active" && !isAdmin(ctx) && e.ownerId !== ctx.uid)) throw new ApiError(404, "not_found", "No such entrant.");
    return this.entrantView(e, ctx);
  }

  // ---------- internals ----------
  #transition(a, uid, status, action, note) {
    const now = Date.now();
    const next = { ...a, status, history: [...a.history, { at: now, by: uid, action, note }] };
    if (action !== "withdrawn" && action !== "submitted") Object.assign(next, { reviewedAt: now, reviewedBy: uid, reviewNote: note });
    this.#save(APPS, next, uid);
    this.#appChanged(next, "application.updated");
    return next;
  }

  // Takes an approved application's entrant out of the battle lineup. The entrant itself stays saved.
  #leaveBattle(a, uid) {
    const b = this.#get(BATTLES, a.battleId);
    if (b && a.entrantId && (b.entrants || []).includes(a.entrantId)) {
      const nb = { ...b, entrants: b.entrants.filter(x => x !== a.entrantId), updatedAt: Date.now() };
      this.#save(BATTLES, nb, uid);
      this.#battleChanged(nb);
    }
    const e = a.entrantId && this.#get(ENTRANTS, a.entrantId);
    if (e) {
      const ne = { ...e, battles: (e.battles || []).filter(x => x !== a.battleId), updatedAt: Date.now() };
      this.#save(ENTRANTS, ne, uid);
      this.#entrantChanged(ne);
    }
  }

  #requireMember(ctx) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
  }
  #requireAdmin(ctx) {
    this.#requireMember(ctx);
    if (!isAdmin(ctx)) throw new ApiError(403, "not_granted", "Only HardSmoke and the site admins can do that.");
  }

  #battleChanged(b) {
    const draft = b.status === "draft";
    for (const topic of ["battles", `battle:${b.id}`]) this.feed.publish(topic, "battle.updated", ctx => this.battleView(b, ctx), ctx => !draft || isAdmin(ctx));
  }
  #appChanged(a, type) {
    this.feed.publish("admin:applications", type, ctx => this.appView(a, ctx));
    this.feed.publish("me:applications", type, ctx => this.appView(a, ctx), ctx => ctx.uid === a.applicantId);
  }
  #entrantChanged(e) {
    this.feed.publish(`entrant:${e.id}`, "entrant.updated", ctx => this.entrantView(e, ctx));
  }
}

// Battles run on Kalshi's 15-minute rounds, so they start on a quarter hour.
function checkStart(ms) {
  if (ms % ROUND_MS) throw new ApiError(400, "invalid_argument", "A battle starts on a quarter hour (:00, :15, :30 or :45), when a Kalshi round opens.", "startsAt");
}
