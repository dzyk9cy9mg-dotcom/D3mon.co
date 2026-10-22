// D3MON's own voice and video rooms (owner, 2026-10-19 and 2026-10-21: "like Discord's", small rooms first, the
// Capstone first). The browsers talk to each other directly (WebRTC, peer to peer, every pair connected); this
// server only introduces them: who is in the room, and passing each browser's connection details (its offer, answer
// and network candidates) to the one it's meant for over the live feed. No sound or picture ever passes through
// D3MON, and nothing about a call is written to the ledger or the store.
//
//   GET  /voice/:room             who's in (names), the limit, whether you may join (counts only for others)
//   POST /voice/:room/join        { video? } → your peer id, who's already there, the ICE servers to use
//   POST /voice/:room/beat        { peer, muted?, video? } every 10 s; a peer silent for 30 s is dropped
//   POST /voice/:room/signal      { peer, to, description? | candidate? } → passed to that peer only
//   POST /voice/:room/leave       { peer }
//   POST /voice/:room/kick        { peer } admins
// Feed topic voice:<room> (members with access): voice.peers (the room changed), voice.signal (for one peer),
// voice.kicked.
//
// A person is in a room once: joining again (another tab) replaces the earlier one. Rooms hold 6 people, the most a
// mesh of direct connections carries well. ICE servers: STUN from D3MON_STUN_URLS; TURN (for strict networks) from
// D3MON_TURN_URLS with D3MON_TURN_SECRET, coturn's shared secret, turned into a 12-hour login per person here
// (coturn's "REST API" credentials), so the secret itself never leaves the server.
import crypto from "node:crypto";
import { ApiError } from "./validate.js";
import { isAdmin } from "../rules.js";

const BEAT_MS = 10000, GONE_MS = 30000;
const SIGNALS_PER_10S = 150;

export class Voice {
  constructor({ feed, vip, accounts, stun = [], turn = [], turnSecret = "", now = () => Date.now() }) {
    Object.assign(this, { feed, vip, accounts, stun, turn, turnSecret, now });
    // the rooms: who may join, and how many at once. More rooms are one line each.
    this.rooms = {
      capstone: { name: "Capstone voice room", cap: 6, may: ctx => this.vip.hasAccess(ctx) },
    };
    this.peers = new Map(); // room -> Map(peerId -> { id, uid, name, joinedAt, seen, muted, video })
    for (const r of Object.keys(this.rooms)) this.peers.set(r, new Map());
    this.rate = new Map(); // uid -> { n, t }
    this.timer = setInterval(() => this.sweep(), 5000);
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer); }

  // May this reader follow the room's feed topic?
  allows(ctx, room) { const r = this.rooms[room]; return !!r && !!ctx.uid && !ctx.banned && r.may(ctx); }

  #room(ctx, room, { join = false } = {}) {
    const r = this.rooms[room];
    if (!r) throw new ApiError(404, "not_found", "No such room.");
    if (!ctx.uid) throw new ApiError(401, "unauthenticated", "Sign in first.");
    if (!r.may(ctx)) throw new ApiError(403, "no_access", "This room is for members with Capstone access.");
    if (join && !ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't join rooms.");
    return r;
  }

  #mine(ctx, room, peerId) {
    const p = this.peers.get(room).get(String(peerId || ""));
    if (!p || p.uid !== ctx.uid) throw new ApiError(404, "not_in_room", "You're not in this room. Join again.");
    return p;
  }

  #list(room) { return [...this.peers.get(room).values()].sort((a, b) => a.joinedAt - b.joinedAt).map(p => ({ peer: p.id, uid: p.uid, name: p.name, muted: p.muted, video: p.video, joinedAt: p.joinedAt })); }

  #changed(room) {
    const r = this.rooms[room];
    this.feed.publish(`voice:${room}`, "voice.peers", { room, peers: this.#list(room), cap: r.cap });
  }

  // GET /voice/:room: anyone sees how many are talking; members with access see who.
  view(ctx, room) {
    const r = this.rooms[room];
    if (!r) throw new ApiError(404, "not_found", "No such room.");
    const list = this.#list(room), may = !!ctx.uid && r.may(ctx);
    return { room, name: r.name, cap: r.cap, count: list.length, canJoin: may && list.length < r.cap, ...(may ? { peers: list } : {}) };
  }

  // The ICE servers this person's browser uses: STUN as set, and TURN with a 12-hour login made from the secret.
  iceServers(uid) {
    const out = [];
    if (this.stun.length) out.push({ urls: this.stun });
    if (this.turn.length && this.turnSecret) {
      const username = `${Math.floor(this.now() / 1000) + 12 * 3600}:${uid}`;
      out.push({ urls: this.turn, username, credential: crypto.createHmac("sha1", this.turnSecret).update(username).digest("base64") });
    }
    return out;
  }

  join(ctx, room, body = {}) {
    const r = this.#room(ctx, room, { join: true });
    const list = this.peers.get(room);
    for (const p of list.values()) if (p.uid === ctx.uid) list.delete(p.id); // one place per person: a new tab replaces the old
    if (list.size >= r.cap) throw new ApiError(409, "room_full", `The room is full (${r.cap} people). Try again soon.`);
    const u = this.accounts.users.get(ctx.uid);
    const p = { id: crypto.randomBytes(9).toString("base64url"), uid: ctx.uid, name: u?.name || u?.username || "Member", joinedAt: this.now(), seen: this.now(), muted: false, video: body.video === true };
    list.set(p.id, p);
    this.#changed(room);
    return { room, peer: p.id, peers: this.#list(room), cap: r.cap, iceServers: this.iceServers(ctx.uid), beatMs: BEAT_MS };
  }

  beat(ctx, room, body = {}) {
    this.#room(ctx, room);
    const p = this.#mine(ctx, room, body.peer);
    p.seen = this.now();
    let changed = false;
    if (typeof body.muted === "boolean" && body.muted !== p.muted) { p.muted = body.muted; changed = true; }
    if (typeof body.video === "boolean" && body.video !== p.video) { p.video = body.video; changed = true; }
    if (changed) this.#changed(room);
    return { ok: true };
  }

  leave(ctx, room, body = {}) {
    this.#room(ctx, room);
    const list = this.peers.get(room), p = list.get(String(body.peer || ""));
    if (p && p.uid === ctx.uid) { list.delete(p.id); this.#changed(room); }
    return { ok: true };
  }

  kick(ctx, room, body = {}) {
    if (!isAdmin(ctx)) throw new ApiError(ctx.uid ? 403 : 401, "not_granted", "Only admins can do that.");
    this.#room(ctx, room);
    const list = this.peers.get(room), p = list.get(String(body.peer || ""));
    if (!p) throw new ApiError(404, "not_found", "They've already left.");
    list.delete(p.id);
    this.feed.publish(`voice:${room}`, "voice.kicked", { peer: p.id }, c => c.uid === p.uid);
    this.#changed(room);
    return { ok: true };
  }

  // Passes one browser's connection details to the other. Checked for shape and size only, never stored. (They're
  // not run through the secret check: a connection offer carries random-looking codes by design.)
  signal(ctx, room, body = {}) {
    this.#room(ctx, room);
    const from = this.#mine(ctx, room, body.peer);
    const to = this.peers.get(room).get(String(body.to || ""));
    if (!to || to.id === from.id) throw new ApiError(404, "not_in_room", "They've left the room.");
    const r = this.rate.get(ctx.uid), t = this.now();
    if (!r || t - r.t > 10000) this.rate.set(ctx.uid, { n: 1, t }); else if (++r.n > SIGNALS_PER_10S) throw new ApiError(429, "resource_exhausted", "Too many messages. Slow down.");
    const out = { room, from: from.id, to: to.id };
    if (body.description !== undefined) {
      const d = body.description;
      if (!d || !["offer", "answer"].includes(d.type) || typeof d.sdp !== "string" || d.sdp.length > 30000) throw new ApiError(400, "invalid_argument", "That isn't a connection offer or answer.", "description");
      out.description = { type: d.type, sdp: d.sdp };
    } else if (body.candidate !== undefined) {
      const c = body.candidate;
      if (c === null) out.candidate = null; // the end of the candidates
      else {
        if (typeof c !== "object" || typeof c.candidate !== "string" || c.candidate.length > 1000) throw new ApiError(400, "invalid_argument", "That isn't a network candidate.", "candidate");
        out.candidate = { candidate: c.candidate, sdpMid: typeof c.sdpMid === "string" ? c.sdpMid.slice(0, 64) : null, sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null };
      }
    } else throw new ApiError(400, "invalid_argument", "Send a description or a candidate.");
    this.feed.publish(`voice:${room}`, "voice.signal", out, c => c.uid === to.uid);
    return { ok: true };
  }

  // Drops anyone who stopped saying they're here (closed the tab, lost the connection), and anyone who lost access.
  sweep() {
    const t = this.now();
    for (const [room, list] of this.peers) {
      let changed = false;
      for (const p of list.values()) {
        const role = this.accounts.role?.(p.uid);
        const still = this.accounts.users.has(p.uid) && this.rooms[room].may({ uid: p.uid, role });
        if (t - p.seen > GONE_MS || !still) { list.delete(p.id); changed = true; }
      }
      if (changed) this.#changed(room);
    }
  }
}
