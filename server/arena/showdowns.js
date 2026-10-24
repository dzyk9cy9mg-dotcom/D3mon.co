// Showdowns (owner, 2026-10-23: "a call out button for all users to call out other users to a battle; if they
// agree a battle can be set"). Any member calls out another member, or Kain or Abel, to a 1-on-1 on Bitcoin's
// 15-minute rounds. Paper only, for fun: nothing is ever bet, and D3MON never trades.
//
//   1. The call out: 1, 3 or 5 rounds and an optional line of trash talk. The other player has an hour to accept or
//      decline (Kain and Abel always accept, at once). The challenger can take it back until then.
//   2. The match starts with the next round. Each player makes one call per round, Up or Down, priced at Kalshi's price
//      when it's made (like the floor's votes). The challenger sets the time rule (owner, 2026-10-23: "call whenever
//      you want during the round", "allow users to set time rules"): any time in the round (the default) or only in
//      its first 10, 5 or 2 minutes (CALL_RULES), shown to the other player before they accept. A call stays sealed to
//      the other side until the calls close (the round's end when it's any time), and every call shows when it was
//      made (minutes and seconds into the round).
//   3. Score: most right calls wins (a missed call counts as wrong); a tie goes to the better paper result per $1
//      contract (a missed call costs 50¢); still level is a draw. Results are the rounds' results (Kalshi's, or
//      HardSmoke's by hand where Kalshi has none).
//   4. The record: wins, losses and draws per member, and head to head per rivalry, worked out from the ledger.
//
// Kain and Abel (smack.js): they make their own read in each round's first minute (Kain backs the side the market
// favours, Abel the underdog; a coin toss when there's no price), and talk smack through the match. They never use
// a bot's call here, so no bot owner's call is ever exposed by a Showdown.
//
// Spectator picks (owner, 2026-10-24): any signed-in member who isn't playing picks who'll win, once and final, from
// when it's accepted until round 1 ends (the players' calls are still sealed then). Everyone sees how the picks split;
// at the end each picker gets a note saying whether they were right.
//
// Players can talk in the match: a short line, or a quick reply that the brother answers. Limits: CHALLENGES_PER_DAY
// new call outs per member, OPEN_MAX open Showdowns each, one open Showdown per pair, and a member can block
// someone from calling them out.
//
// Ledger lines (append-only, nothing rewritten):
//   { t: "showdown", sid, from, to, rounds, message, callMin }   to = a member's uid, or "kain" / "abel"; callMin 2|5|10|15
//                                                                (Showdowns from before the rule have none: 5)
//   { t: "showdown_reply", sid, accept, start? }                  start = the first round, when accepted
//   { t: "showdown_cancel", sid }
//   { t: "showdown_call", sid, who, round, dir, paid, source }    who = a uid, or "kain" / "abel"
//   { t: "showdown_say", sid, who, text, quick?, key? }           key: a brother's line for a moment, said once
//   { t: "showdown_pick", sid, uid, side }                       a spectator's pick: side = "from" or "to"
//   { t: "showdown_end", sid, winner }                            winner = "from", "to" or null (a draw)
//   { t: "showdown_block", uid, target, on }
import crypto from "node:crypto";
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { ROUND_MS } from "./registry.js";
import { MARKET, currentRound } from "./calls.js";
import { paidFor, paper } from "./prices.js";
import { smack, QUICK } from "./smack.js";

export const BROTHER_KEYS = ["kain", "abel"];
const BROTHER_NAMES = { kain: "Kain", abel: "Abel" };
export const ROUND_CHOICES = [1, 3, 5];
export const CALL_RULES = [15, 10, 5, 2];      // minutes into the round calls stay open; 15 = any time in the round
const DEFAULT_RULE = 15;
const OLD_RULE = 5;                             // Showdowns made before the rule existed
const ACCEPT_MS = 60 * 60 * 1000;             // an hour to answer
export const CHALLENGES_PER_DAY = 5;
export const OPEN_MAX = 3;
const BROTHER_CALL_AFTER_MS = 30 * 1000;      // the brothers make their read 30 s into the round
const SAY_GAP_MS = 2000;
const NOTICE = "Showdowns are paper calls for fun. Not financial advice. D3MON never trades.";
const r4 = x => Math.round(x * 10000) / 10000;

const CHALLENGE = {
  to: { type: "string", required: true, max: 40 },
  rounds: { type: "integer", required: true, min: 1, max: 5 },
  callMin: { type: "integer", min: 1, max: 15 },
  message: { type: "string", max: 140 },
};
const SAY = { text: { type: "string", max: 140 }, quick: { type: "enum", values: Object.keys(QUICK) } };

export class Showdowns {
  constructor({ ledger, metrics, votes, accounts, feed, notify = () => {}, now = () => Date.now() }) {
    Object.assign(this, { ledger, metrics, votes, accounts, feed, notify, now });
    this.byId = new Map();
    this.blocks = new Map(); // uid -> Set of uids they've blocked
    this.lastSay = new Map();
    this.rand = () => Math.random();
    for (const l of ledger.lines) this.#index(l);
    ledger.on("append", lines => { for (const l of lines) this.#index(l); });
    this.timer = null;
  }

  // ---------- the index
  #index(l) {
    if (l.t === "showdown") {
      this.byId.set(l.sid, { sid: l.sid, from: l.from, to: l.to, rounds: l.rounds, message: l.message || "", callMin: l.callMin || OLD_RULE, at: l.at, reply: null, cancel: null, calls: [], says: [], picks: new Map(), end: null });
      return;
    }
    if (l.t === "showdown_block") {
      if (!this.blocks.has(l.uid)) this.blocks.set(l.uid, new Set());
      this.blocks.get(l.uid)[l.on ? "add" : "delete"](l.target);
      return;
    }
    const s = l.sid && this.byId.get(l.sid);
    if (!s) return;
    if (l.t === "showdown_reply") s.reply = l;
    else if (l.t === "showdown_cancel") s.cancel = l;
    else if (l.t === "showdown_call") s.calls.push(l);
    else if (l.t === "showdown_say") s.says.push(l);
    else if (l.t === "showdown_pick") { if (!s.picks.has(l.uid)) s.picks.set(l.uid, l.side); }
    else if (l.t === "showdown_end") s.end = l;
  }
  #changed(s) { this.feed.publish("showdowns", "showdown.updated", { sid: s.sid }); }

  // ---------- people
  #user(uid) { return this.accounts.users.get(uid) || null; }
  #person(who) {
    if (BROTHER_KEYS.includes(who)) return { key: who, name: BROTHER_NAMES[who], ai: true };
    const u = this.#user(who);
    return { uid: who, username: u?.username || null, name: u?.name || u?.username || "A member" };
  }
  #nameOf(who) { return this.#person(who).name; }
  #byUsername(name) {
    const n = String(name || "").trim().toLowerCase().replace(/^@/, "");
    if (BROTHER_KEYS.includes(n)) return n;
    for (const u of this.accounts.users.values()) if (u.username?.toLowerCase() === n) return u.id;
    throw new ApiError(404, "not_found", "No member by that name.", "to");
  }
  #member(ctx) {
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in to call someone out.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
  }

  // ---------- where a Showdown stands
  #endsAt(s) { return s.reply?.start ? s.reply.start + s.rounds * ROUND_MS : null; }
  #roundsOf(s) { return s.reply?.start ? Array.from({ length: s.rounds }, (_, i) => s.reply.start + i * ROUND_MS) : []; }
  state(s, now = this.now()) {
    if (s.cancel) return "cancelled";
    if (!s.reply) return now < s.at + ACCEPT_MS ? "pending" : "expired";
    if (!s.reply.accept) return "declined";
    if (now < s.reply.start) return "starting";
    if (now < this.#endsAt(s)) return "live";
    return this.#roundsOf(s).every(r => this.#result(r)) ? "final" : "scoring";
  }
  #open(s, now) { return ["pending", "starting", "live", "scoring"].includes(this.state(s, now)); }
  #result(round) { const r = this.metrics.result(MARKET, round); return r ? r.result : null; }
  #closes(s, round) { return round + Math.min(s.callMin, 15) * 60000; }
  #ruleText(s) { return s.callMin >= 15 ? "Call any time in the round" : `Calls close ${s.callMin} minutes into each round`; }
  #callOf(s, who, round) { return s.calls.find(c => c.who === who && c.round === round) || null; }

  // The score so far for both sides: right calls and paper per $1, over the rounds with a result.
  #score(s) {
    const out = { from: { right: 0, paper: 0 }, to: { right: 0, paper: 0 } };
    for (const r of this.#roundsOf(s)) {
      const res = this.#result(r);
      if (!res) continue;
      for (const side of ["from", "to"]) {
        const c = this.#callOf(s, s[side], r), right = !!c && c.dir === res;
        if (right) out[side].right++;
        out[side].paper = r4(out[side].paper + (c ? paper(c.paid ?? 0.5, right) : -0.5));
      }
    }
    return out;
  }
  #winner(sc) {
    if (sc.from.right !== sc.to.right) return sc.from.right > sc.to.right ? "from" : "to";
    if (sc.from.paper !== sc.to.paper) return sc.from.paper > sc.to.paper ? "from" : "to";
    return null;
  }

  // ---------- views
  #mine(s, ctx) { return ctx.uid === s.from ? "from" : ctx.uid === s.to ? "to" : null; }
  view(s, ctx = {}, now = this.now()) {
    const state = this.state(s, now), me = this.#mine(s, ctx), sc = this.#score(s);
    const rounds = this.#roundsOf(s).map(r => {
      const closesAt = this.#closes(s, r), open = now < closesAt, res = this.#result(r);
      const side = key => {
        const c = this.#callOf(s, s[key], r);
        if (!c) return now >= closesAt ? { missed: true } : null;
        if (open && me !== key) return { sealed: true, at: c.at, intoMs: c.at - r };
        return { dir: c.dir, paid: c.paid, at: c.at, intoMs: c.at - r, ...(res ? { right: c.dir === res } : {}) };
      };
      return { round: r, closesAt, endsAt: r + ROUND_MS, callsOpen: now >= r && open, result: res, from: side("from"), to: side("to") };
    });
    const done = state === "final", winner = done ? this.#winner(sc) : null;
    const picks = { from: 0, to: 0 };
    for (const side of s.picks.values()) picks[side]++;
    const myPick = ctx.uid && s.picks.has(ctx.uid) ? s.picks.get(ctx.uid) : null;
    const picksCloseAt = s.reply?.start ? s.reply.start + ROUND_MS : null;
    return {
      sid: s.sid, state, from: this.#person(s.from), to: this.#person(s.to), rounds: s.rounds, message: s.message,
      createdAt: s.at, answerBy: s.at + ACCEPT_MS, startsAt: s.reply?.start ?? null, endsAt: this.#endsAt(s), callMin: s.callMin, anyTime: s.callMin >= 15,
      detail: rounds, score: sc, winner,
      picks, picksCloseAt, myPick: myPick ? { side: myPick, ...(done ? { right: winner === myPick } : {}) } : null,
      canPick: !!ctx.uid && !me && !myPick && this.#picksOpen(s, now),
      chat: s.says.slice(-60).map(x => ({ who: x.who, name: this.#nameOf(x.who), ai: BROTHER_KEYS.includes(x.who), text: x.text, quick: x.quick || null, at: x.at })),
      me, canAnswer: me === "to" && state === "pending", canCancel: me === "from" && state === "pending",
      canTalk: !!me && ["starting", "live", "scoring", "final", "pending"].includes(state), notice: NOTICE,
    };
  }

  #picksOpen(s, now) { return ["starting", "live"].includes(this.state(s, now)) && now < s.reply.start + ROUND_MS; }

  // POST /showdowns/:sid/pick { side }: a spectator picks who'll win. Once, final, until round 1 ends.
  pick(ctx, id, body = {}) {
    this.#member(ctx);
    const s = this.#find(id), now = this.now();
    if (this.#mine(s, ctx)) throw new ApiError(403, "not_granted", "You're playing in this one. Make your calls instead.");
    if (!["from", "to"].includes(body.side)) throw new ApiError(400, "invalid_argument", "side is from or to.", "side");
    const had = s.picks.get(ctx.uid);
    if (had) {
      if (had === body.side) return { unchanged: true, ...this.get(ctx, id) };
      throw new ApiError(409, "already_picked", "Your pick is in, and it's final.");
    }
    if (!this.#picksOpen(s, now)) throw new ApiError(409, "picks_closed", "Picks close when round 1 ends.");
    this.ledger.append([{ t: "showdown_pick", sid: s.sid, uid: ctx.uid, side: body.side }], ctx.uid, now);
    this.#changed(s);
    return this.get(ctx, id);
  }

  #find(id) {
    const s = typeof id === "string" && /^[a-f0-9]{12}$/.test(id) ? this.byId.get(id) : null;
    if (!s) throw new ApiError(404, "not_found", "No such Showdown.");
    return s;
  }
  get(ctx, id) { return { showdown: this.view(this.#find(id), ctx) }; }

  // GET /showdowns: yours (to answer, waiting, live, recent) and every live one; ?user= a member's record.
  list(ctx, { user } = {}) {
    const now = this.now(), all = [...this.byId.values()].sort((a, b) => b.at - a.at);
    if (user) return this.record(user);
    const live = all.filter(s => ["starting", "live"].includes(this.state(s, now))).slice(0, 30).map(s => this.view(s, ctx, now));
    if (!ctx.uid) return { live, notice: NOTICE };
    const mine = all.filter(s => s.from === ctx.uid || s.to === ctx.uid);
    const v = s => this.view(s, ctx, now);
    return {
      live,
      incoming: mine.filter(s => s.to === ctx.uid && this.state(s, now) === "pending").map(v),
      outgoing: mine.filter(s => s.from === ctx.uid && this.state(s, now) === "pending").map(v),
      active: mine.filter(s => ["starting", "live", "scoring"].includes(this.state(s, now))).map(v),
      recent: mine.filter(s => this.state(s, now) === "final").slice(0, 20).map(v),
      notice: NOTICE,
    };
  }

  // A member's record (public): wins, losses and draws, and head to head per opponent.
  record(username) {
    const uid = this.#byUsername(username);
    if (BROTHER_KEYS.includes(uid)) throw new ApiError(404, "not_found", "Kain and Abel's record is on their page.");
    const tally = { wins: 0, losses: 0, draws: 0 }, rivals = new Map(), recent = [];
    for (const s of [...this.byId.values()].sort((a, b) => b.at - a.at)) {
      const side = s.from === uid ? "from" : s.to === uid ? "to" : null;
      if (!side || this.state(s) !== "final") continue;
      const w = this.#winner(this.#score(s)), other = side === "from" ? s.to : s.from;
      const k = w === null ? "draws" : w === side ? "wins" : "losses";
      tally[k]++;
      if (!rivals.has(other)) rivals.set(other, { opponent: this.#person(other), wins: 0, losses: 0, draws: 0 });
      rivals.get(other)[k]++;
      if (recent.length < 10) recent.push(this.view(s, {}));
    }
    return { member: this.#person(uid), record: tally, rivals: [...rivals.values()].sort((a, b) => (b.wins + b.losses + b.draws) - (a.wins + a.losses + a.draws)), recent, notice: NOTICE };
  }

  // ---------- the call out
  challenge(ctx, body = {}) {
    this.#member(ctx);
    const f = check(body, CHALLENGE);
    if (!ROUND_CHOICES.includes(f.rounds)) throw new ApiError(400, "invalid_argument", "A Showdown is 1, 3 or 5 rounds.", "rounds");
    const callMin = f.callMin ?? DEFAULT_RULE;
    if (!CALL_RULES.includes(callMin)) throw new ApiError(400, "invalid_argument", "The time rule is any time (15), or the first 10, 5 or 2 minutes.", "callMin");
    const to = this.#byUsername(f.to), now = this.now();
    if (to === ctx.uid) throw new ApiError(400, "invalid_argument", "You can't call yourself out.", "to");
    if (!BROTHER_KEYS.includes(to)) {
      if (!this.#user(to) || this.accounts.banned?.(to)) throw new ApiError(404, "not_found", "No member by that name.", "to");
      if (this.blocks.get(to)?.has(ctx.uid)) throw new ApiError(403, "blocked", "That member isn't taking call outs from you.", "to");
    }
    const all = [...this.byId.values()];
    if (all.some(s => this.#open(s, now) && ((s.from === ctx.uid && s.to === to) || (s.from === to && s.to === ctx.uid))))
      throw new ApiError(409, "already_open", "You two already have a Showdown going. Finish that one first.", "to");
    if (all.filter(s => (s.from === ctx.uid || s.to === ctx.uid) && this.#open(s, now)).length >= OPEN_MAX)
      throw new ApiError(409, "too_many", `You have ${OPEN_MAX} Showdowns open. Finish one first.`);
    if (all.filter(s => s.from === ctx.uid && s.at > now - 86400000).length >= CHALLENGES_PER_DAY)
      throw new ApiError(429, "resource_exhausted", `That's ${CHALLENGES_PER_DAY} call outs today. Try again tomorrow.`);
    const sid = crypto.randomBytes(6).toString("hex");
    this.ledger.append([{ t: "showdown", sid, from: ctx.uid, to, rounds: f.rounds, message: f.message || "", callMin }], ctx.uid, now);
    const s = this.byId.get(sid);
    if (BROTHER_KEYS.includes(to)) {
      // the brothers never back down: accepted at once, from the next round, with an opening line
      this.ledger.append([{ t: "showdown_reply", sid, accept: true, start: currentRound(now) + ROUND_MS }], null, now);
      this.#brotherSay(s, "start", now);
    } else {
      const who = this.#nameOf(ctx.uid);
      this.notify([to], { id: `sd:${sid}:in`, text: `${who} called you out to a ${f.rounds}-round Showdown (${this.#ruleText(s).toLowerCase()})${f.message ? `: “${f.message}”` : "."}`, link: `showdown?id=${sid}` });
    }
    this.#changed(s);
    return this.get(ctx, sid);
  }

  answer(ctx, id, body = {}) {
    this.#member(ctx);
    const s = this.#find(id), now = this.now();
    if (s.to !== ctx.uid) throw new ApiError(403, "not_granted", "Only the member called out can answer.");
    if (this.state(s, now) !== "pending") throw new ApiError(409, "not_pending", "This call out can't be answered any more.");
    if (typeof body.accept !== "boolean") throw new ApiError(400, "invalid_argument", "accept is true or false.", "accept");
    if (body.accept && [...this.byId.values()].filter(x => x !== s && (x.from === ctx.uid || x.to === ctx.uid) && ["starting", "live", "scoring"].includes(this.state(x, now))).length >= OPEN_MAX)
      throw new ApiError(409, "too_many", `You have ${OPEN_MAX} Showdowns going. Finish one first.`);
    this.ledger.append([{ t: "showdown_reply", sid: s.sid, accept: body.accept, ...(body.accept ? { start: currentRound(now) + ROUND_MS } : {}) }], ctx.uid, now);
    if (body.block === true) this.block(ctx, { username: this.#user(s.from)?.username, on: true });
    const who = this.#nameOf(ctx.uid);
    this.notify([s.from], { id: `sd:${s.sid}:reply`, text: body.accept ? `${who} accepted your Showdown. It starts with the next round.` : `${who} passed on your Showdown.`, link: `showdown?id=${s.sid}` });
    this.#changed(s);
    return this.get(ctx, id);
  }

  cancel(ctx, id) {
    this.#member(ctx);
    const s = this.#find(id);
    if (s.from !== ctx.uid && !isAdmin(ctx)) throw new ApiError(403, "not_granted", "Only the challenger can take it back.");
    if (this.state(s) !== "pending") throw new ApiError(409, "not_pending", "Only a call out that hasn't been answered can be taken back.");
    this.ledger.append([{ t: "showdown_cancel", sid: s.sid }], ctx.uid, this.now());
    this.#changed(s);
    return this.get(ctx, id);
  }

  block(ctx, body = {}) {
    this.#member(ctx);
    if (typeof body.on !== "boolean") throw new ApiError(400, "invalid_argument", "on is true or false.", "on");
    const target = this.#byUsername(body.username);
    if (BROTHER_KEYS.includes(target) || target === ctx.uid) throw new ApiError(400, "invalid_argument", "You can't block that one.", "username");
    if (!!this.blocks.get(ctx.uid)?.has(target) !== body.on) this.ledger.append([{ t: "showdown_block", uid: ctx.uid, target, on: body.on }], ctx.uid, this.now());
    return { blocked: [...(this.blocks.get(ctx.uid) || [])].map(u => this.#person(u)) };
  }

  // ---------- the match
  async call(ctx, id, body = {}) {
    this.#member(ctx);
    const s = this.#find(id), side = this.#mine(s, ctx);
    if (!side) throw new ApiError(403, "not_granted", "Only the two players make calls.");
    const dir = body.dir ?? body.direction;
    if (!["up", "down"].includes(dir)) throw new ApiError(400, "invalid_argument", "dir is up or down.", "dir");
    let now = this.now();
    const round = currentRound(now);
    if (this.state(s, now) !== "live" || !this.#roundsOf(s).includes(round)) throw new ApiError(409, "not_live", "This Showdown isn't on right now.");
    if (now >= this.#closes(s, round)) throw new ApiError(409, "round_locked", `Calls close ${s.callMin} minutes into each round in this Showdown. Get the next one.`);
    const had = this.#callOf(s, ctx.uid, round);
    if (had) {
      if (had.dir === dir) return { unchanged: true, ...this.get(ctx, id) };
      throw new ApiError(409, "already_called", "Your call for this round is in, and it's final.");
    }
    const q = this.votes ? await this.votes.quote(round) : null;
    now = this.now();
    if (now >= this.#closes(s, round) || this.#callOf(s, ctx.uid, round)) throw new ApiError(409, "round_locked", "Too late for this round.");
    this.ledger.append([{ t: "showdown_call", sid: s.sid, who: ctx.uid, round, dir, paid: q ? paidFor(dir, q) : null, source: q ? q.source : null }], ctx.uid, now);
    this.#changed(s);
    return this.get(ctx, id);
  }

  say(ctx, id, body = {}) {
    this.#member(ctx);
    const s = this.#find(id), side = this.#mine(s, ctx), now = this.now();
    if (!side) throw new ApiError(403, "not_granted", "Only the two players talk here.");
    const f = check(body, SAY);
    if (!f.text === !f.quick) throw new ApiError(400, "invalid_argument", "Send text or a quick reply.");
    if (now - (this.lastSay.get(ctx.uid) || 0) < SAY_GAP_MS) throw new ApiError(429, "resource_exhausted", "Easy. One line every couple of seconds.");
    this.lastSay.set(ctx.uid, now);
    this.ledger.append([{ t: "showdown_say", sid: s.sid, who: ctx.uid, text: f.text || QUICK[f.quick], ...(f.quick ? { quick: f.quick } : {}) }], ctx.uid, now);
    const bro = BROTHER_KEYS.includes(s.to) ? s.to : null;
    if (bro && f.quick) this.#brotherSay(s, `quick:${f.quick}`, now, null);
    this.#changed(s);
    return this.get(ctx, id);
  }

  // ---------- the brothers' side
  #brotherSay(s, moment, at, key = moment) {
    const bro = s.to;
    if (key && s.says.some(x => x.who === bro && x.key === key)) return;
    const recent = s.says.filter(x => x.who === bro).slice(-6).map(x => x.text);
    const text = smack(bro, moment, this.#nameOf(s.from), recent, n => Math.floor(this.rand() * n));
    if (text) this.ledger.append([{ t: "showdown_say", sid: s.sid, who: bro, text, ...(key ? { key } : {}) }], null, at);
  }

  // Every few seconds: the brothers make their reads, react to results, and finished Showdowns are closed once.
  async tick(now = this.now()) {
    for (const s of this.byId.values()) {
      const state = this.state(s, now), bro = BROTHER_KEYS.includes(s.to) ? s.to : null;
      if (bro && state === "live") {
        const round = currentRound(now);
        if (this.#roundsOf(s).includes(round) && now >= round + BROTHER_CALL_AFTER_MS && now < this.#closes(s, round) && !this.#callOf(s, bro, round)) {
          const q = this.votes ? await this.votes.quote(round).catch(() => null) : null;
          const fav = q && q.yesAsk != null ? (q.yesAsk >= 0.5 ? "up" : "down") : (this.rand() < 0.5 ? "up" : "down");
          const dir = bro === "kain" ? fav : fav === "up" ? "down" : "up"; // Kain rides the favourite, Abel the underdog
          if (!this.#callOf(s, bro, round)) {
            this.ledger.append([{ t: "showdown_call", sid: s.sid, who: bro, round, dir, paid: q ? paidFor(dir, q) : null, source: q ? q.source : null }], null, now);
            this.#brotherSay(s, "call", now, `call:${round}`);
            this.#changed(s);
          }
        }
      }
      // a nudge on the bell when each round opens, for any player who hasn't called yet
      if (state === "live") {
        const round = currentRound(now), i = this.#roundsOf(s).indexOf(round);
        if (i >= 0 && now < this.#closes(s, round)) for (const side of ["from", "to"]) {
          const uid = s[side];
          if (BROTHER_KEYS.includes(uid) || this.#callOf(s, uid, round)) continue;
          this.notify([uid], { id: `sd:${s.sid}:r:${round}`, text: `Round ${i + 1} of ${s.rounds} is open: make your call vs ${this.#nameOf(side === "from" ? s.to : s.from)}. ${this.#ruleText(s)}.`, link: `showdown?id=${s.sid}` });
        }
      }
      if (bro && ["live", "scoring", "final"].includes(state)) {
        const rounds = this.#roundsOf(s);
        rounds.forEach((r, i) => {
          const res = this.#result(r);
          if (!res || s.says.some(x => x.key === `round:${r}`)) return;
          const mine = this.#callOf(s, bro, r)?.dir === res, theirs = this.#callOf(s, s.from, r)?.dir === res;
          this.#brotherSay(s, mine === theirs ? "push" : mine ? "win" : "lose", now, `round:${r}`);
          const sc = this.#score(s);
          if (i < rounds.length - 1 && sc.to.right !== sc.from.right && this.rand() < 0.5) this.#brotherSay(s, sc.to.right > sc.from.right ? "lead" : "behind", now, `score:${r}`);
          this.#changed(s);
        });
      }
      if (state === "final" && !s.end) {
        const w = this.#winner(this.#score(s));
        this.ledger.append([{ t: "showdown_end", sid: s.sid, winner: w }], null, now);
        if (bro) this.#brotherSay(s, w === null ? "final_draw" : w === "to" ? "final_win" : "final_lose", now, "final");
        const sc = this.#score(s), a = this.#nameOf(s.from), b = this.#nameOf(s.to);
        const text = w === null ? `Showdown: ${a} and ${b} drew, ${sc.from.right}–${sc.to.right}.`
          : `Showdown: ${w === "from" ? a : b} beat ${w === "from" ? b : a}, ${Math.max(sc.from.right, sc.to.right)}–${Math.min(sc.from.right, sc.to.right)}.`;
        this.notify([s.from, s.to].filter(u => !BROTHER_KEYS.includes(u)), { id: `sd:${s.sid}:end`, text, link: `showdown?id=${s.sid}` });
        for (const [uid, side] of s.picks) {
          const picked = this.#nameOf(s[side]);
          this.notify([uid], { id: `sd:${s.sid}:pick`, text: w === null ? `Your pick: ${a} and ${b} drew, so nobody called it.` : w === side ? `You called it: ${picked} won the Showdown vs ${this.#nameOf(s[side === "from" ? "to" : "from"])}.` : `Your pick, ${picked}, lost the Showdown vs ${this.#nameOf(s[side === "from" ? "to" : "from"])}.`, link: `showdown?id=${s.sid}` });
        }
        this.#changed(s);
      }
    }
  }

  start() {
    const run = () => this.tick().catch(e => console.error(e));
    this.timer = setInterval(run, 10000);
    this.timer.unref?.();
    run();
  }
  stop() { clearInterval(this.timer); }
}
