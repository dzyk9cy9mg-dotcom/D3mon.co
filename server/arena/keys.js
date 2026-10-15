// Bot API keys (step 4). An approved bot or script gets keys its owner makes; each key belongs to one
// entrant and can only send that entrant's calls (and, from step 4c, its custom stats). Keys can't reach
// any human endpoint, and they carry no trading access: bots share read-only results, nothing else.
//
//   token        d3b_<keyId>_<secret>, shown once when made, never stored
//   arena_keys   { id, entrantId, ownerId, label, hash: sha256(secret), last4, createdAt, createdBy,
//                  lastUsedAt, revokedAt, revokedBy }
import crypto from "node:crypto";
import { ApiError, check } from "./validate.js";
import { isAdmin } from "../rules.js";

export const KEYS = "arena_keys";
const TOKEN_RE = /^d3b_([A-Za-z0-9]{20})_([A-Za-z0-9_-]{43})$/;
const MAX_ACTIVE = 3; // room to rotate: make a new key, switch the bot over, revoke the old one
const KEY_KINDS = new Set(["bot", "script"]); // callers are people; they use the Up/Down buttons
const LAST_USED_EVERY_MS = 60000;
const sha256 = s => crypto.createHash("sha256").update(s).digest();

export class Keys {
  constructor({ store, registry }) {
    this.store = store;
    this.registry = registry;
  }

  #entrantFor(ctx, entrantId, { owner }) {
    if (!ctx.uid) throw new ApiError(401, "not_granted", "Sign in first.");
    const e = this.registry.entrantById(entrantId);
    const mine = e && e.ownerId === ctx.uid;
    if (!e || !(mine || (!owner && isAdmin(ctx)))) throw new ApiError(404, "not_found", "That isn't one of your entrants.");
    return e;
  }

  #list(entrantId) {
    return this.store.query({ collection: KEYS, where: [["entrantId", "==", entrantId]] }).map(r => r.data);
  }

  view(k) {
    const { hash, ...rest } = k;
    return { ...rest, active: !k.revokedAt, preview: `d3b_${k.id}_…${k.last4}` };
  }

  list(ctx, entrantId) {
    this.#entrantFor(ctx, entrantId, { owner: false });
    return this.#list(entrantId).sort((a, b) => b.createdAt - a.createdAt).map(k => this.view(k));
  }

  // Only the owner makes keys: whoever makes one sees its secret.
  create(ctx, entrantId, body) {
    const e = this.#entrantFor(ctx, entrantId, { owner: true });
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    if (!KEY_KINDS.has(e.kind)) throw new ApiError(409, "no_keys_for_callers", "Callers make their calls with the Up/Down buttons, so they don't get API keys.");
    if (e.status !== "active") throw new ApiError(409, "entrant_suspended", `${e.name} is suspended, so it can't get new keys.`);
    const f = check(body ?? {}, { label: { type: "string", max: 40 } });
    if (this.#list(e.id).filter(k => !k.revokedAt).length >= MAX_ACTIVE)
      throw new ApiError(409, "too_many_keys", `${e.name} already has ${MAX_ACTIVE} active keys. Revoke one first.`);
    const id = this.store.newId(KEYS);
    const secret = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    const k = { id, entrantId: e.id, ownerId: e.ownerId, label: f.label || "", hash: sha256(secret).toString("base64url"), last4: secret.slice(-4),
      createdAt: now, createdBy: ctx.uid, lastUsedAt: null, revokedAt: null, revokedBy: null };
    this.store.set(`${KEYS}/${id}`, k, ctx.uid);
    return { key: this.view(k), token: `d3b_${id}_${secret}` };
  }

  // The owner or an admin can revoke. Revoked keys stay listed, so it's clear which key was used when.
  revoke(ctx, entrantId, keyId) {
    this.#entrantFor(ctx, entrantId, { owner: false });
    if (!ctx.canWrite) throw new ApiError(403, "not_granted", "Your account can't do that right now.");
    const k = this.#list(entrantId).find(x => x.id === keyId);
    if (!k) throw new ApiError(404, "not_found", "No such key.");
    if (k.revokedAt) return this.view(k);
    const next = { ...k, revokedAt: Date.now(), revokedBy: ctx.uid };
    this.store.set(`${KEYS}/${k.id}`, next, ctx.uid);
    return this.view(next);
  }

  // Checks an Authorization header. Returns { key, entrant } or throws 401/403. Every failure says the
  // same thing, so a wrong key reveals nothing about which keys exist.
  authenticate(header) {
    const m = /^Bearer (\S+)$/.exec(String(header || ""));
    const t = m && TOKEN_RE.exec(m[1]);
    const bad = () => new ApiError(401, "bad_key", "Send a valid bot key: Authorization: Bearer d3b_…");
    if (!t) throw bad();
    const k = this.store.get(`${KEYS}/${t[1]}`).data;
    const want = k ? Buffer.from(k.hash, "base64url") : sha256("no such key");
    const ok = crypto.timingSafeEqual(want, sha256(t[2]));
    if (!k || !ok || k.revokedAt) throw bad();
    const e = this.registry.entrantById(k.entrantId);
    if (!e || e.status !== "active") throw new ApiError(403, "entrant_suspended", "This bot is suspended. Ask HardSmoke about it.");
    const now = Date.now();
    if (!k.lastUsedAt || now - k.lastUsedAt > LAST_USED_EVERY_MS) this.store.set(`${KEYS}/${k.id}`, { ...k, lastUsedAt: now }, k.ownerId);
    return { key: k, entrant: e };
  }
}
