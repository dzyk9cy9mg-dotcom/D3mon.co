// Tournaments (owner, 2026-10-17): hourly, daily, weekly and monthly tournaments that run by themselves,
// for bots and chart scripts whose owner turns on "Join tournaments". Plan: docs/TOURNAMENTS.md.
//
// Step 1 is the switch. It counts from the next round, so a bot can't join halfway through a round it
// has already seen. Turning it off keeps the rounds already played. Every switch is a ledger line, and
// the latest line whose round has come decides whether an entrant is in for a given round.
//
// Ledger line: { t: "tournament_entry", entrantId, on, from: the round start it counts from }
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";
import { nextRound, currentRound } from "./calls.js";

export const TOURNAMENT_KINDS = ["bot", "script"]; // callers can be added later

const SWITCH = { on: { type: "boolean", required: true } };

export class Tournaments {
  constructor({ ledger, registry, feed, now = () => Date.now() }) {
    Object.assign(this, { ledger, registry, feed, now });
    this.byEntrant = new Map(); // entrantId -> tournament_entry lines, in write order
    const index = lines => {
      for (const l of lines) {
        if (l.t !== "tournament_entry") continue;
        if (!this.byEntrant.has(l.entrantId)) this.byEntrant.set(l.entrantId, []);
        this.byEntrant.get(l.entrantId).push(l);
      }
    };
    index(ledger.lines);
    ledger.on("append", index);
  }

  // Whether an entrant plays in the tournaments for the round starting at `round`.
  inAt(entrantId, round) {
    let on = false;
    for (const l of this.byEntrant.get(entrantId) || []) if (l.from <= round) on = l.on;
    return on;
  }

  // Anyone can see whether an entrant has joined (standings are public). Its owner and admins also see the history.
  view(ctx, id) {
    const e = this.#entrant(ctx, id);
    const lines = this.byEntrant.get(e.id) || [];
    const last = lines[lines.length - 1];
    const out = { entrantId: e.id, eligible: TOURNAMENT_KINDS.includes(e.kind), on: !!last?.on, from: last ? last.from : null, playingNow: this.inAt(e.id, currentRound(this.now())) };
    if (isAdmin(ctx) || ctx.uid === e.ownerId) out.history = lines.map(l => ({ on: l.on, from: l.from, at: l.at, by: l.by }));
    return out;
  }

  // The owner's on/off switch: PUT /entrants/:id/tournaments { on }.
  set(ctx, id, body) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const f = check(body, SWITCH);
    const e = this.#entrant(ctx, id);
    if (e.ownerId !== ctx.uid) throw new ApiError(403, "not_granted", "Only this entrant's owner can change that.");
    if (!TOURNAMENT_KINDS.includes(e.kind)) throw new ApiError(409, "kind_not_allowed", "Tournaments are for bots and chart scripts for now.", "on");
    if (e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended.`, "on");
    const now = this.now(), from = nextRound(now);
    const lines = this.byEntrant.get(e.id) || [];
    const last = lines[lines.length - 1];
    if (!!last?.on === f.on) return { ...this.view(ctx, id), unchanged: true };
    this.ledger.append([{ t: "tournament_entry", entrantId: e.id, on: f.on, from }], ctx.uid, now);
    const event = c => this.view(c, e.id);
    this.feed.publish(`entrant:${e.id}`, "entrant.tournaments", event);
    return this.view(ctx, id);
  }

  #entrant(ctx, id) {
    const e = this.registry.getEntrant(ctx, id); // 404s for unknown or hidden entrants
    return this.registry.entrantById(e.id);
  }
}
