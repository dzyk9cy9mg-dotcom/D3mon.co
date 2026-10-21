// Member votes (owner, 2026-10-20; plan in docs/VOTES.md): every signed-in member can vote Up or Down on the
// Kalshi BTC 15-minute round during the live trade floor, a Battle of the Bots event or a Capstone session.
// A vote is a paper trade: Up buys YES, Down buys NO, at Kalshi's own price the moment it arrives. A member can
// cash out before the round ends (priced at Kalshi's bid for their side then) and enter again, any number of
// times; each entry and its exit is one trade. A trade still open at the end settles at Kalshi's result.
// Profit is per $1 contract only: the site never knows how much anyone bet, and D3MON never trades.
//
// Everything is an append-only ledger line stamped with the server's clock. Nothing is overwritten:
//   { t: "vote", uid, session, round, dir, paid, source, switched? }      an entry (switched: after a switch)
//   { t: "vote_exit", uid, session, round, vote, got, source, switch? }    a cash out (switch: part of a switch)
//   { t: "vote_session", session, mode, off, guests }                      admins' settings; the latest counts
//   { t: "vote_badge", uid, on }                                           an admin gives or takes a badge
//   { t: "vote_privacy", uid, public }                                     a member shows or hides their record
//
// Sessions: "live" (every round), "battle:<id>" (that battle's rounds) and "capstone:<id>" (that session's time,
// members with Capstone access only). Admins set per session: locked (one direction per entry) or changeable
// (switch Up ↔ Down, counted as a cash out and a new entry at that moment's prices, as on Kalshi), and voting
// off for whole categories: members, callers, bots, scripts. A member counts as callers, bots or scripts when they
// own an active entrant of that kind, otherwise as members; they're refused only when all their categories are off.
//
// Badges: owners of callers, bots and scripts have one automatically; admins give it to anyone else (and can
// take back only what they gave). A Capstone session's guest callers count as badge holders there. Whenever a
// badge holder enters, re-entries included, everyone following votes gets a "votes.badge" notification.
import { ApiError } from "./validate.js";
import { isAdmin } from "../rules.js";
import { ROUND_MS } from "./registry.js";
import { MARKET, currentRound } from "./calls.js";
import { paidFor, paper } from "./prices.js";

const DIRS = ["up", "down"];
const CATS = ["members", "callers", "bots", "scripts"];
const KIND_CAT = { caller: "callers", bot: "bots", script: "scripts" };
const QUOTE_MAX_AGE_MS = 60000;
const r4 = x => Math.round(x * 10000) / 10000;
const DEFAULT_CFG = { mode: "locked", off: [], guests: [] };

// What cashing out pays: Kalshi's bid for the side held (NO's bid is 1 − YES's ask when it isn't given).
export function gotFor(dir, b) {
  if (!b) return null;
  if (dir === "up") return b.yesBid ?? (b.noAsk != null ? r4(1 - b.noAsk) : null);
  return b.noBid ?? (b.yesAsk != null ? r4(1 - b.yesAsk) : null);
}

export class Votes {
  constructor({ ledger, metrics, prices, registry, vip, feed, accounts, userName, now = () => Date.now() }) {
    Object.assign(this, { ledger, metrics, prices, registry, vip, feed, accounts, userName, now });
    this.trades = new Map(); // `${session}|${round}` -> [{ entry, exit }] in order
    this.byUser = new Map(); // uid -> [{ entry, exit }]
    this.cfg = new Map(); // session -> settings
    this.badges = new Map(); // uid -> true/false (admin-given)
    this.privacy = new Map(); // uid -> true when public
    this.recent = []; // the latest actions, for GET /votes/round
    for (const l of ledger.lines) this.#index(l);
    ledger.on("append", lines => { for (const l of lines) this.#index(l); });
  }

  #index(l) {
    if (l.t === "vote") {
      const t = { entry: l, exit: null }, k = `${l.session}|${l.round}`;
      if (!this.trades.has(k)) this.trades.set(k, []);
      this.trades.get(k).push(t);
      if (!this.byUser.has(l.uid)) this.byUser.set(l.uid, []);
      this.byUser.get(l.uid).push(t);
      this.#remember(l);
    } else if (l.t === "vote_exit") {
      const t = (this.trades.get(`${l.session}|${l.round}`) || []).find(x => x.entry.id === l.vote);
      if (t && !t.exit) t.exit = l;
      if (!l.switch) this.#remember(l);
    } else if (l.t === "vote_session") this.cfg.set(l.session, { mode: l.mode, off: l.off || [], guests: l.guests || [] });
    else if (l.t === "vote_badge") this.badges.set(l.uid, !!l.on);
    else if (l.t === "vote_privacy") this.privacy.set(l.uid, !!l.public);
  }

  #remember(l) {
    this.recent.push(l);
    if (this.recent.length > 400) this.recent.splice(0, 100);
  }

  // ---------- who and where
  settings(session) { return { ...DEFAULT_CFG, ...(this.cfg.get(session) || {}) }; }

  categories(uid) {
    const kinds = new Set(this.registry.allEntrants().filter(e => e.ownerId === uid && e.status === "active").map(e => KIND_CAT[e.kind]).filter(Boolean));
    return kinds.size ? [...kinds] : ["members"];
  }

  // Badge: automatic for callers, bots and scripts; admin-given for anyone else; a Capstone guest caller in that session.
  badge(uid, session = "live") {
    if (!uid) return null;
    if (this.settings(session).guests.includes(uid)) return "guest";
    if (this.categories(uid).some(c => c !== "members")) return "auto";
    return this.badges.get(uid) ? "admin" : null;
  }

  // Is this session open now, and may this member vote in it? Returns the session's own details.
  #session(session, ctx, now) {
    const round = currentRound(now);
    if (session === "live") return { session, round, kind: "live" };
    let m = /^battle:([A-Za-z0-9_-]{6,40})$/.exec(session);
    if (m) {
      const b = this.registry.allBattles().find(x => x.id === m[1] && x.status !== "draft");
      if (!b) throw new ApiError(404, "not_found", "No such battle.", "session");
      if (round < b.startsAt || round >= b.startsAt + b.rounds * b.roundMs) throw new ApiError(409, "not_live", "That battle isn't running this round.", "session");
      return { session, round, kind: "battle", title: b.title };
    }
    m = /^capstone:([A-Za-z0-9_-]{6,40})$/.exec(session);
    if (m) {
      const s = this.vip.sessions.get(m[1]);
      if (!s) throw new ApiError(404, "not_found", "No such Capstone session.", "session");
      if (now < s.startsAt || now >= s.startsAt + s.minutes * 60000) throw new ApiError(409, "not_live", "That Capstone session isn't on right now.", "session");
      if (ctx && !this.vip.hasAccess(ctx)) throw new ApiError(403, "no_access", "Voting in a Capstone session needs Capstone access.", "session");
      return { session, round, kind: "capstone", title: s.title };
    }
    throw new ApiError(400, "invalid_argument", "session is live, battle:<id> or capstone:<id>.", "session");
  }

  #mayVote(ctx, session) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in to vote.");
    if (ctx.banned || ctx.canWrite === false) throw new ApiError(403, "not_granted", "You can't vote right now.");
    const off = this.settings(session).off;
    if (this.categories(ctx.uid).every(c => off.includes(c))) throw new ApiError(403, "voting_off", "Voting is turned off for you in this session.");
  }

  #open(uid, session, round) {
    return (this.trades.get(`${session}|${round}`) || []).find(t => t.entry.uid === uid && !t.exit) || null;
  }

  // Kalshi's book for the open round: read now, or the last read up to a minute old. Tests replace this.
  async quote(round) {
    try {
      const q = this.prices && this.prices.live ? await this.prices.quote() : null;
      if (q && q.round === round) return { ...q, source: "live" };
    } catch { /* fall back to the last read */ }
    const s = this.prices?.snapshot;
    if (s && s.round === round && this.now() - s.at <= QUOTE_MAX_AGE_MS) return { ...s, source: "snapshot" };
    return null;
  }

  // ---------- the three actions
  async enter(ctx, body = {}) {
    const dir = body.dir ?? body.direction, session = body.session || "live";
    if (!DIRS.includes(dir)) throw new ApiError(400, "invalid_argument", "dir is up or down.", "dir");
    this.#mayVote(ctx, session);
    const s = this.#session(session, ctx, this.now());
    if (this.#open(ctx.uid, session, s.round)) throw new ApiError(409, "already_in", "You're already in this round. Cash out first, or switch where the session allows it.");
    const q = await this.quote(s.round), now = this.now();
    if (currentRound(now) !== s.round) throw new ApiError(409, "round_over", "That round just ended. Vote again in the new one.");
    const paid = q ? paidFor(dir, q) : null;
    const [line] = this.ledger.append([{ t: "vote", uid: ctx.uid, session, round: s.round, market: MARKET, dir, paid, source: q ? q.source : null }], ctx.uid, now);
    this.#announce(line);
    return { vote: this.#tradeView({ entry: line, exit: null }, ctx), round: this.roundView(ctx, session) };
  }

  async exit(ctx, body = {}) {
    const session = body.session || "live";
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in to vote.");
    const s = this.#session(session, null, this.now()), t = this.#open(ctx.uid, session, s.round);
    if (!t) throw new ApiError(409, "not_in", "You have no open vote this round.");
    const q = await this.quote(s.round), now = this.now();
    if (currentRound(now) !== s.round) throw new ApiError(409, "round_over", "That round just ended; your vote settles at Kalshi's result.");
    const got = q ? gotFor(t.entry.dir, q) : null;
    const [line] = this.ledger.append([{ t: "vote_exit", uid: ctx.uid, session, round: s.round, vote: t.entry.id, dir: t.entry.dir, got, source: q ? q.source : null }], ctx.uid, now);
    this.#announce(line);
    return { vote: this.#tradeView(t, ctx), round: this.roundView(ctx, session) };
  }

  // A switch where the session allows it: a cash out and a new entry the other way, in one write.
  async change(ctx, body = {}) {
    const dir = body.dir ?? body.direction, session = body.session || "live";
    if (!DIRS.includes(dir)) throw new ApiError(400, "invalid_argument", "dir is up or down.", "dir");
    this.#mayVote(ctx, session);
    if (this.settings(session).mode !== "changeable") throw new ApiError(409, "locked", "Votes are locked in this session: cash out, then vote again.");
    const s = this.#session(session, ctx, this.now()), t = this.#open(ctx.uid, session, s.round);
    if (!t) throw new ApiError(409, "not_in", "You have no open vote to switch.");
    if (t.entry.dir === dir) return { vote: this.#tradeView(t, ctx), round: this.roundView(ctx, session), unchanged: true };
    const q = await this.quote(s.round), now = this.now();
    if (currentRound(now) !== s.round) throw new ApiError(409, "round_over", "That round just ended.");
    const [, entry] = this.ledger.append([
      { t: "vote_exit", uid: ctx.uid, session, round: s.round, vote: t.entry.id, dir: t.entry.dir, got: q ? gotFor(t.entry.dir, q) : null, source: q ? q.source : null, switch: true },
      { t: "vote", uid: ctx.uid, session, round: s.round, market: MARKET, dir, paid: q ? paidFor(dir, q) : null, source: q ? q.source : null, switched: true },
    ], ctx.uid, now);
    this.#announce(entry);
    return { vote: this.#tradeView(this.#open(ctx.uid, session, s.round), ctx), round: this.roundView(ctx, session) };
  }

  #announce(l) {
    const view = this.#actionView(l);
    this.feed.publish("votes", "votes.action", view);
    if (l.t === "vote") {
      const b = this.badge(l.uid, l.session);
      if (b) this.feed.publish("votes", "votes.badge", { ...view, badge: b });
    }
  }

  // ---------- views
  #actionView(l) {
    const out = { id: l.id, session: l.session, round: l.round, at: l.at, name: this.userName(l.uid) || "Member", dir: l.dir, badge: this.badge(l.uid, l.session) };
    if (l.t === "vote") Object.assign(out, { action: l.switched ? "switch" : "enter", paid: l.paid });
    else Object.assign(out, { action: "exit", got: l.got });
    return out;
  }

  // One trade with its result so far: open, cashed out (profit = got − paid) or settled at Kalshi's result.
  outcome(t) {
    const e = t.entry;
    if (t.exit) {
      const profit = e.paid != null && t.exit.got != null ? r4(t.exit.got - e.paid) : null;
      return { status: "cashed", profit, success: profit === null ? null : profit > 0 };
    }
    const res = this.metrics.result(MARKET, e.round);
    if (!res) return { status: e.round + ROUND_MS <= this.now() ? "settling" : "open", profit: null, success: null };
    const correct = res.result === e.dir;
    return { status: "settled", result: res.result, correct, profit: e.paid != null ? paper(e.paid, correct) : null, success: correct };
  }

  #tradeView(t, ctx) {
    const e = t.entry, o = this.outcome(t);
    return { id: e.id, session: e.session, round: e.round, dir: e.dir, at: e.at, paid: e.paid, ...(t.exit ? { exitAt: t.exit.at, got: t.exit.got } : {}), ...o };
  }

  // GET /votes/round?session=: this round's votes in that session, live to everyone, and the reader's own.
  roundView(ctx, session = "live") {
    const now = this.now(), round = currentRound(now), list = this.trades.get(`${session}|${round}`) || [];
    const split = { up: 0, down: 0, openUp: 0, openDown: 0, entries: list.length, voters: new Set(list.map(t => t.entry.uid)).size };
    for (const t of list) { split[t.entry.dir]++; if (!t.exit) split[t.entry.dir === "up" ? "openUp" : "openDown"]++; }
    const mine = ctx.uid ? list.filter(t => t.entry.uid === ctx.uid).map(t => this.#tradeView(t, ctx)) : [];
    const cfg = this.settings(session);
    return {
      session, round, endsAt: round + ROUND_MS, market: MARKET, mode: cfg.mode, off: cfg.off, split,
      actions: this.recent.filter(l => l.session === session && l.round === round).slice(-60).map(l => this.#actionView(l)),
      mine, open: mine.find(t => t.status === "open") || null,
      ...(ctx.uid ? { badge: this.badge(ctx.uid, session), canVote: !this.categories(ctx.uid).every(c => cfg.off.includes(c)) } : {}),
      notice: "Paper votes at Kalshi's prices, for fun and bragging rights. Not financial advice. D3MON never trades.",
    };
  }

  // A member's record: calls made, success rate, average call time and average profit per contract.
  record(uid) {
    const all = this.byUser.get(uid) || [], outs = all.map(t => ({ t, o: this.outcome(t) }));
    const done = outs.filter(x => x.o.success !== null), priced = outs.filter(x => x.o.profit !== null);
    const avg = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const ms = avg(all.map(t => t.entry.at - t.entry.round));
    const ap = avg(priced.map(x => x.o.profit));
    return {
      calls: all.length, decided: done.length, wins: done.filter(x => x.o.success).length,
      successRate: done.length ? Math.round((done.filter(x => x.o.success).length / done.length) * 1000) / 10 : null,
      avgCallMin: ms === null ? null : Math.round((ms / 60000) * 10) / 10,
      avgProfit: ap === null ? null : r4(ap), cashOuts: all.filter(t => t.exit && !t.exit.switch).length,
    };
  }

  // GET /votes/me and /votes/members/:username: private by default; admins read like members.
  recordView(ctx, uid) {
    const u = this.accounts.users.get(uid);
    if (!u) throw new ApiError(404, "not_found", "No such member.");
    const own = ctx.uid === uid, pub = !!this.privacy.get(uid);
    const base = { name: u.name || u.username, username: u.username, public: pub, badge: this.badge(uid) };
    if (!own && !pub) return { ...base, private: true };
    const recent = (this.byUser.get(uid) || []).slice(-20).reverse().map(t => this.#tradeView(t, ctx));
    return { ...base, record: this.record(uid), recent, notice: "Paper votes at Kalshi's prices. Not financial advice." };
  }

  byUsername(name) {
    const n = String(name || "").toLowerCase();
    for (const u of this.accounts.users.values()) if (u.username?.toLowerCase() === n) return u.id;
    throw new ApiError(404, "not_found", "No such member.");
  }

  setPrivacy(ctx, body = {}) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    if (typeof body.public !== "boolean") throw new ApiError(400, "invalid_argument", "public is true or false.", "public");
    if (!!this.privacy.get(ctx.uid) !== body.public) this.ledger.append([{ t: "vote_privacy", uid: ctx.uid, public: body.public }], ctx.uid, this.now());
    return this.recordView(ctx, ctx.uid);
  }

  // ---------- admins
  #admin(ctx) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins can do that.");
  }

  // PUT /votes/sessions/:session { mode, off, guests (usernames) }
  setSession(ctx, session, body = {}) {
    this.#admin(ctx);
    if (!/^(live|battle:[A-Za-z0-9_-]{6,40}|capstone:[A-Za-z0-9_-]{6,40})$/.test(session)) throw new ApiError(400, "invalid_argument", "session is live, battle:<id> or capstone:<id>.", "session");
    const cur = this.settings(session), next = { ...cur };
    if (body.mode !== undefined) {
      if (!["locked", "changeable"].includes(body.mode)) throw new ApiError(400, "invalid_argument", "mode is locked or changeable.", "mode");
      next.mode = body.mode;
    }
    if (body.off !== undefined) {
      if (!Array.isArray(body.off) || body.off.some(c => !CATS.includes(c))) throw new ApiError(400, "invalid_argument", `off lists categories: ${CATS.join(", ")}.`, "off");
      next.off = [...new Set(body.off)];
    }
    if (body.guests !== undefined) {
      if (!session.startsWith("capstone:")) throw new ApiError(400, "invalid_argument", "Guest callers are for Capstone sessions.", "guests");
      if (!Array.isArray(body.guests) || body.guests.length > 10) throw new ApiError(400, "invalid_argument", "guests is a list of up to 10 usernames.", "guests");
      next.guests = body.guests.map(n => this.byUsername(n));
    }
    this.ledger.append([{ t: "vote_session", session, mode: next.mode, off: next.off, guests: next.guests }], ctx.uid, this.now());
    this.feed.publish("votes", "votes.session", { session, mode: next.mode, off: next.off });
    return this.sessionView(session);
  }

  sessionView(session) {
    const c = this.settings(session);
    return { session, mode: c.mode, off: c.off, guests: c.guests.map(uid => this.userName(uid)) };
  }

  // POST /votes/badges { username, on }: admins give or take a badge (automatic ones can't be taken).
  setBadge(ctx, body = {}) {
    this.#admin(ctx);
    const uid = this.byUsername(body.username);
    if (typeof body.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", "on");
    this.ledger.append([{ t: "vote_badge", uid, on: body.on }], ctx.uid, this.now());
    return { username: body.username, badge: this.badge(uid) };
  }

  badgeList(ctx) {
    this.#admin(ctx);
    const out = [];
    for (const u of this.accounts.users.values()) { const b = this.badge(u.id); if (b) out.push({ username: u.username, name: u.name, badge: b }); }
    return { badges: out };
  }
}
