// The shared document store behind the page's `db` capability. It behaves like the claude.ai artifact
// database the page was written for: Firestore-style paths ("posts/abc", "data/users/<uid>/prefs"),
// `set` replaces a document, `update` deep-merges into an existing one and fails with invalid_argument
// when it doesn't exist, and short leases let two writers agree on who creates a document.
// Everything lives in memory and is saved to one JSON file shortly after each change.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

export class DbError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DEPTH = 64;
export const MAX_QUERY_LIMIT = 10000;
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const isPlainObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = v => (v === undefined ? undefined : structuredClone(v));

export function splitPath(p) {
  if (typeof p !== "string" || !p || p.length > 1500) throw new DbError("invalid_argument", "Bad path");
  const segs = p.split("/");
  for (const s of segs) {
    if (!s || s.length > 200 || s === "." || s === ".." || s.startsWith("__") || /[\u0000-\u001f\u007f]/.test(s))
      throw new DbError("invalid_argument", "Bad path segment");
  }
  return segs;
}

export function parseDocPath(p) {
  const segs = splitPath(p);
  if (segs.length % 2) throw new DbError("invalid_argument", "A document path has an even number of segments");
  return { path: segs.join("/"), segs, collection: segs.slice(0, -1).join("/"), id: segs.at(-1) };
}

export function parseCollectionPath(p) {
  const segs = splitPath(p);
  if (!(segs.length % 2)) throw new DbError("invalid_argument", "A collection path has an odd number of segments");
  return segs.join("/");
}

// Rejects field names that could reach Object.prototype, and absurdly deep values.
function checkValue(v, depth = 0) {
  if (depth > MAX_DEPTH) throw new DbError("invalid_argument", "Value nests too deeply");
  if (Array.isArray(v)) {
    for (const x of v) checkValue(x, depth + 1);
  } else if (isPlainObject(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (RESERVED_KEYS.has(k)) throw new DbError("invalid_argument", `Field name "${k}" isn't allowed`);
      checkValue(x, depth + 1);
    }
  }
}

// Objects merge key by key; anything else (arrays, null, numbers…) replaces what was there.
export function deepMerge(base, patch) {
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

export function getField(data, field) {
  let v = data;
  for (const part of String(field).split(".")) {
    if (!isPlainObject(v) || !Object.hasOwn(v, part)) return undefined;
    v = v[part];
  }
  return v;
}

// Firestore's cross-type order: null < booleans < numbers < strings < arrays < maps.
const rank = v => (v === null ? 0 : typeof v === "boolean" ? 1 : typeof v === "number" ? 2 : typeof v === "string" ? 3 : Array.isArray(v) ? 4 : 5);

export function compareValues(a, b) {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (ra <= 3) return a < b ? -1 : a > b ? 1 : 0;
  if (ra === 4) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = compareValues(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  return ja < jb ? -1 : ja > jb ? 1 : 0;
}

const same = (a, b) => rank(a) === rank(b) && compareValues(a, b) === 0;
const OPERATORS = new Set(["==", "!=", "<", "<=", ">", ">=", "array-contains", "array-contains-any", "in", "not-in"]);

function matches(data, [field, op, value]) {
  const v = getField(data, field);
  if (v === undefined) return false;
  switch (op) {
    case "==": return same(v, value);
    case "!=": return !same(v, value);
    case "<": return rank(v) === rank(value) && compareValues(v, value) < 0;
    case "<=": return rank(v) === rank(value) && compareValues(v, value) <= 0;
    case ">": return rank(v) === rank(value) && compareValues(v, value) > 0;
    case ">=": return rank(v) === rank(value) && compareValues(v, value) >= 0;
    case "array-contains": return Array.isArray(v) && v.some(x => same(x, value));
    case "array-contains-any": return Array.isArray(v) && Array.isArray(value) && v.some(x => value.some(y => same(x, y)));
    case "in": return Array.isArray(value) && value.some(y => same(v, y));
    case "not-in": return Array.isArray(value) && !value.some(y => same(v, y));
    default: throw new DbError("invalid_argument", `Unsupported operator "${op}"`);
  }
}

export function normalizeQuery(q) {
  if (!isPlainObject(q)) throw new DbError("invalid_argument", "Bad query");
  const collection = parseCollectionPath(q.collection);
  const where = q.where == null ? [] : q.where;
  const orderBy = q.orderBy == null ? [] : q.orderBy;
  if (!Array.isArray(where) || where.length > 10 || !Array.isArray(orderBy) || orderBy.length > 4)
    throw new DbError("invalid_argument", "Bad query");
  for (const w of where) {
    if (!Array.isArray(w) || w.length !== 3 || typeof w[0] !== "string" || !OPERATORS.has(w[1]))
      throw new DbError("invalid_argument", "Bad filter");
  }
  for (const o of orderBy) {
    if (!Array.isArray(o) || typeof o[0] !== "string" || (o[1] !== undefined && o[1] !== "asc" && o[1] !== "desc"))
      throw new DbError("invalid_argument", "Bad orderBy");
  }
  let limit = q.limit == null ? MAX_QUERY_LIMIT : Number(q.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new DbError("invalid_argument", "Bad limit");
  limit = Math.min(limit, MAX_QUERY_LIMIT);
  return { collection, where, orderBy: orderBy.map(([f, d]) => [f, d === "desc" ? "desc" : "asc"]), limit };
}

function newDocId() {
  let s = "";
  for (const b of crypto.randomBytes(20)) s += ID_CHARS[b % ID_CHARS.length];
  return s;
}

export class Store extends EventEmitter {
  constructor({ file = null, maxDocBytes = 1024 * 1024, maxStoreBytes = 512 * 1024 * 1024, saveDelayMs = 1000 } = {}) {
    super();
    this.setMaxListeners(0);
    this.file = file;
    this.maxDocBytes = maxDocBytes;
    this.maxStoreBytes = maxStoreBytes;
    this.saveDelayMs = saveDelayMs;
    this.cols = new Map(); // collection path -> Map(doc id -> entry)
    this.bytes = 0;
    this.count = 0;
    this.leases = new Map(); // doc path -> { holder, expires }
    this.saveTimer = null;
    this.dirty = false;
  }

  load() {
    if (!this.file) return;
    let raw;
    try {
      raw = fs.readFileSync(this.file, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    const saved = JSON.parse(raw);
    for (const [p, e] of Object.entries(saved.docs || {})) {
      const d = parseDocPath(p);
      const size = Buffer.byteLength(JSON.stringify(e.d));
      if (!this.cols.has(d.collection)) this.cols.set(d.collection, new Map());
      this.cols.get(d.collection).set(d.id, { data: e.d, size, created: e.c, updated: e.u, createdBy: e.by ?? null });
      this.bytes += size;
      this.count++;
    }
  }

  get(p) {
    const d = parseDocPath(p);
    const e = this.cols.get(d.collection)?.get(d.id);
    return { id: d.id, path: d.path, segs: d.segs, exists: !!e, data: e ? e.data : undefined };
  }

  // Works out what a write would do without doing it, so the access rules can see before and after.
  plan(op, p, data) {
    const d = parseDocPath(p);
    const prev = this.cols.get(d.collection)?.get(d.id);
    const before = prev ? prev.data : undefined;
    let after;
    if (op === "set" || op === "merge" || op === "update") {
      if (!isPlainObject(data)) throw new DbError("invalid_argument", "Document data must be an object");
      checkValue(data);
      if (op === "update" && !before) throw new DbError("invalid_argument", "There is no document to update");
      after = op === "set" || !before ? clone(data) : deepMerge(before, data);
    } else if (op !== "delete") {
      throw new DbError("invalid_argument", `Unknown operation "${op}"`);
    }
    return { op, d, before, after, patch: op === "update" || op === "merge" ? data : undefined };
  }

  commit(plan, actor = null) {
    const { d, after } = plan;
    const col = this.cols.get(d.collection);
    const prev = col?.get(d.id);
    if (after === undefined) {
      if (!prev) return;
      col.delete(d.id);
      if (!col.size) this.cols.delete(d.collection);
      this.bytes -= prev.size;
      this.count--;
      this.leases.delete(d.path);
      this.#changed(d, prev.data, undefined);
      return;
    }
    const size = Buffer.byteLength(JSON.stringify(after));
    if (size > this.maxDocBytes) throw new DbError("quota_exceeded", "That document is too large");
    const delta = size - (prev ? prev.size : 0);
    if (delta > 0 && this.bytes + delta > this.maxStoreBytes) throw new DbError("quota_exceeded", "Storage is full");
    const now = Date.now();
    const entry = { data: after, size, created: prev ? prev.created : now, updated: now, createdBy: prev ? prev.createdBy : actor };
    if (col) col.set(d.id, entry);
    else this.cols.set(d.collection, new Map([[d.id, entry]]));
    this.bytes += delta;
    if (!prev) this.count++;
    this.#changed(d, prev ? prev.data : undefined, after);
  }

  // Convenience wrappers used by tests and the CLI.
  set(p, data, actor) { this.commit(this.plan("set", p, data), actor); }
  update(p, data, actor) { this.commit(this.plan("update", p, data), actor); }
  delete(p) { this.commit(this.plan("delete", p)); }

  newId(collection) {
    const c = parseCollectionPath(collection);
    let id;
    do id = newDocId(); while (this.cols.get(c)?.has(id));
    return id;
  }

  // visible(id, data) lets the caller hide documents this reader may not see before the limit applies.
  query(spec, visible = null) {
    const q = normalizeQuery(spec);
    const col = this.cols.get(q.collection);
    if (!col) return [];
    let rows = [];
    for (const [id, e] of col) {
      if (q.where.every(w => matches(e.data, w)) && (!visible || visible(id, e.data))) rows.push({ id, data: e.data });
    }
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (q.orderBy.length) {
      // Like Firestore, a query ordered by a field skips documents that don't have that field.
      rows = rows.filter(r => q.orderBy.every(([f]) => getField(r.data, f) !== undefined));
      rows.sort((a, b) => {
        for (const [f, dir] of q.orderBy) {
          const c = compareValues(getField(a.data, f), getField(b.data, f));
          if (c) return dir === "desc" ? -c : c;
        }
        return byId(a, b);
      });
    } else {
      rows.sort(byId);
    }
    return rows.slice(0, q.limit);
  }

  acquire(p, holder, ttlMs) {
    const d = parseDocPath(p);
    const now = Date.now();
    const cur = this.leases.get(d.path);
    if (cur && cur.expires > now && cur.holder !== holder) return { acquired: false, expiresAt: cur.expires };
    const ttl = Math.min(Math.max(Number(ttlMs) || 4000, 100), 10000);
    this.leases.set(d.path, { holder, expires: now + ttl });
    if (this.leases.size > 1000) for (const [k, v] of this.leases) if (v.expires <= now) this.leases.delete(k);
    return { acquired: true, expiresAt: now + ttl };
  }

  release(p, holder) {
    const d = parseDocPath(p);
    const cur = this.leases.get(d.path);
    if (!cur || cur.holder !== holder) return { released: false };
    this.leases.delete(d.path);
    return { released: true };
  }

  #changed(d, before, after) {
    this.dirty = true;
    if (this.file && !this.saveTimer) {
      this.saveTimer = setTimeout(() => this.saveNow(), this.saveDelayMs);
      this.saveTimer.unref();
    }
    this.emit("change", { path: d.path, collection: d.collection, id: d.id, before, after });
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.file || !this.dirty) return;
    const docs = {};
    for (const [c, col] of this.cols) {
      for (const [id, e] of col) docs[`${c}/${id}`] = { d: e.data, c: e.created, u: e.updated, by: e.createdBy };
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, savedAt: Date.now(), docs }));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
}
