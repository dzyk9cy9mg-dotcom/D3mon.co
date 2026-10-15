// D3MON.CO web server. Serves the page from public/ and provides the four capabilities the page asks
// its host for through window.claude.use(): db, user, room and sample (see public/js/runtime.js).
//
//   GET  /api/session            who is signed in, and whether the AI assistant is on
//   GET  /api/events             live updates for one open page (Server-Sent Events)
//   POST /api/db                 get, query, set, merge, update, delete, add, acquire, release
//   POST /api/sub, /api/unsub    live document and query views for a page
//   POST /api/room               join, leave, presence
//   POST /api/user/profiles      names and avatars;  GET /api/user/search
//   POST /api/sample             streams an answer from the Anthropic API
//   POST /api/auth/*             register, login, logout, profile, password
//   /api/v1/*                    the Arena API and its live feed (server/arena/, ARCHITECTURE.md)
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { Store, DbError, isPlainObject, parseDocPath, parseCollectionPath, normalizeQuery } from "./store.js";
import { canRead, canWrite, canWritePath } from "./rules.js";
import { Accounts } from "./accounts.js";
import { Rooms, checkRoomName } from "./rooms.js";
import { normalizeMessages, streamMessage, SampleError } from "./sample.js";
import { createArena } from "./arena/api.js";
import { HttpError, sendJson, readJson, parseCookies, sessionCookie, serveFile, RateLimiter, clientIp, isHttps } from "./http.js";

const COOKIE = "d3mon_session";
const SITE_ROOM = "";
const MAX_SUBS_PER_PAGE = 500;
const MAX_PAGES_PER_IP = 40;
const MAX_CONCURRENT_SAMPLES = 4;
const PAGE_HEADERS = { "content-security-policy": "frame-ancestors 'self'", "x-frame-options": "SAMEORIGIN", "referrer-policy": "strict-origin-when-cross-origin" };
const STATUS = { not_granted: 403, invalid_argument: 400, not_found: 404, quota_exceeded: 413, resource_exhausted: 429, rate_limited: 429, unavailable: 503 };

const xmlEscape = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

export async function createApp(cfg = loadConfig()) {
  const store = new Store({ file: path.join(cfg.dataDir, "db.json"), maxDocBytes: cfg.maxDocBytes, maxStoreBytes: cfg.maxStoreBytes, saveDelayMs: cfg.saveDelayMs });
  store.load();
  const accounts = new Accounts({ dir: cfg.dataDir, owner: cfg.owner, signups: cfg.signups });
  await accounts.load();
  const arena = createArena({ store, accounts, cfg });

  const limits = {
    writes: new RateLimiter({ capacity: 300, refillPerSec: 5 }),
    deletes: new RateLimiter({ capacity: 2000, refillPerSec: 25 }),
    presence: new RateLimiter({ capacity: 60, refillPerSec: 5 }),
    logins: new RateLimiter({ capacity: 10, refillPerSec: 10 / 900 }),
    signups: new RateLimiter({ capacity: cfg.signupsPerHour, refillPerSec: cfg.signupsPerHour / 3600 }),
    samples: new RateLimiter({ capacity: 20, refillPerSec: 20 / 600 }),
  };
  let samplesRunning = 0;

  // ---------- who is asking ----------
  function context(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const user = token ? accounts.sessionUser(token) : null;
    if (!user) return { uid: null, role: "guest", canWrite: false, user: null, token: null, sessionKey: null };
    const banned = accounts.banned(user.id);
    return { uid: user.id, role: accounts.role(user.id), canWrite: !banned, banned, user, token, sessionKey: accounts.sessionKey(token) };
  }

  const secureFor = req => (cfg.secureCookies === "auto" ? isHttps(req, cfg.trustProxy) : cfg.secureCookies);

  function sessionInfo(ctx) {
    return {
      user: ctx.user ? { ...accounts.profile(ctx.user, ctx.uid), username: ctx.user.username, role: ctx.role, banned: !!ctx.banned } : null,
      sampling: !!cfg.anthropicKey,
      signups: cfg.signups === "open" || !accounts.hasOwner(),
    };
  }

  // ---------- live pages: one Server-Sent Events stream per open page ----------
  const pages = new Map(); // page id -> { id, peerId, ip, ctx, res, subs }
  const docSubs = new Map(); // doc path -> Set(sub)
  const querySubs = new Map(); // collection path -> Set(sub)
  const dirty = new Set();
  let flushTimer = null;

  const rooms = new Rooms({
    onChange(room, peers, pageIds) {
      const json = JSON.stringify({ room, peers });
      for (const id of pageIds) write(pages.get(id), "peers", json);
    },
  });

  function write(page, event, json) {
    if (!page) return;
    page.res.write(`event: ${event}\ndata: ${json}\n\n`);
    // A page that stopped reading would make the server buffer forever: drop it and let it reconnect.
    if (page.res.writableLength > 16 * 1024 * 1024) page.res.destroy();
  }

  function openPage(req, res, ctx) {
    const ip = clientIp(req, cfg.trustProxy);
    let fromIp = 0;
    for (const p of pages.values()) if (p.ip === ip) fromIp++;
    if (fromIp >= MAX_PAGES_PER_IP) throw new HttpError(429, "resource_exhausted", "Too many open pages.");
    const page = { id: crypto.randomBytes(16).toString("base64url"), peerId: crypto.randomBytes(8).toString("base64url"), ip, ctx, res, subs: new Map() };
    pages.set(page.id, page);
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write("retry: 2000\n\n");
    write(page, "hello", JSON.stringify({ cid: page.id }));
    rooms.join(page.id, page.peerId, SITE_ROOM, ctx.uid);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    res.on("close", () => {
      clearInterval(ping);
      pages.delete(page.id);
      for (const sub of page.subs.values()) unindex(sub);
      rooms.dropPage(page.id);
    });
  }

  function ownPage(ctx, body) {
    const page = isPlainObject(body) && typeof body.cid === "string" ? pages.get(body.cid) : null;
    if (!page || page.ctx.uid !== ctx.uid) throw new DbError("not_found", "That page isn't connected.");
    return page;
  }

  function subsFor(sub) {
    const [map, key] = sub.kind === "doc" ? [docSubs, sub.path] : [querySubs, sub.query.collection];
    if (!map.has(key)) map.set(key, new Set());
    return [map, key, map.get(key)];
  }
  const index = sub => subsFor(sub)[2].add(sub);
  function unindex(sub) {
    const [map, key, set] = subsFor(sub);
    set.delete(sub);
    if (!set.size) map.delete(key);
    dirty.delete(sub);
  }

  function pushSub(sub) {
    const ctx = sub.page.ctx;
    let msg;
    try {
      if (sub.kind === "doc") {
        const g = store.get(sub.path);
        msg = canRead(ctx, g.segs, g.data)
          ? { sid: sub.sid, id: g.id, exists: g.exists, data: g.exists ? g.data : null }
          : { sid: sub.sid, error: "not_granted", message: "You can't read that." };
      } else {
        msg = { sid: sub.sid, docs: store.query(sub.query, (id, data) => canRead(ctx, [...sub.colSegs, id], data)) };
      }
    } catch (e) {
      msg = { sid: sub.sid, error: e.code || "error", message: e.message };
    }
    const json = JSON.stringify(msg);
    if (json === sub.last) return;
    sub.last = json;
    write(sub.page, "snap", json);
  }

  // Changes are batched briefly so a burst of writes (deleting a thread and its replies) sends one update.
  store.on("change", ({ path: p, collection }) => {
    for (const sub of docSubs.get(p) || []) dirty.add(sub);
    for (const sub of querySubs.get(collection) || []) dirty.add(sub);
    if (dirty.size && !flushTimer) flushTimer = setTimeout(flush, 15);
  });
  function flush() {
    flushTimer = null;
    const subs = [...dirty];
    dirty.clear();
    for (const sub of subs) if (sub.page.subs.get(sub.sid) === sub) pushSub(sub);
  }

  function subscribe(ctx, body) {
    const page = ownPage(ctx, body);
    const sid = body.sid;
    if (!(Number.isSafeInteger(sid) && sid > 0)) throw new DbError("invalid_argument", "Bad subscription id");
    let sub;
    if (body.kind === "doc") {
      sub = { page, sid, kind: "doc", path: parseDocPath(body.path).path };
    } else if (body.kind === "query") {
      const query = normalizeQuery(body.query);
      sub = { page, sid, kind: "query", query, colSegs: query.collection.split("/") };
    } else {
      throw new DbError("invalid_argument", "Bad subscription");
    }
    const old = page.subs.get(sid);
    if (old) unindex(old);
    else if (page.subs.size >= MAX_SUBS_PER_PAGE) throw new DbError("resource_exhausted", "Too many live views on one page.");
    page.subs.set(sid, sub);
    index(sub);
    pushSub(sub);
    return { ok: true };
  }

  function unsubscribe(ctx, body) {
    const page = ownPage(ctx, body);
    const sub = page.subs.get(body.sid);
    if (sub) {
      page.subs.delete(body.sid);
      unindex(sub);
    }
    return { ok: true };
  }

  // ---------- db ----------
  function requireWriter(ctx) {
    if (!ctx.uid || !ctx.canWrite) throw new DbError("not_granted", ctx.uid ? "Your account can't post right now." : "Sign in to save changes.");
  }
  const lookup = p => {
    try { return store.get(p).data; } catch { return undefined; }
  };
  function commitChecked(ctx, plan) {
    const allowed = canWrite(ctx, { op: plan.op, segs: plan.d.segs, before: plan.before, after: plan.after, patch: plan.patch }, lookup);
    if (!allowed) throw new DbError("not_granted", "You can't change that.");
    if (!(plan.op === "delete" ? limits.deletes : limits.writes).take(ctx.uid)) throw new DbError("resource_exhausted", "Too many changes at once.");
    store.commit(plan, ctx.uid);
  }

  function dbOp(ctx, body) {
    if (!isPlainObject(body)) throw new DbError("invalid_argument", "Bad request");
    const holder = () => `${ctx.uid}:${String(body.holder ?? "").slice(0, 100)}`;
    switch (body.op) {
      case "get": {
        const g = store.get(body.path);
        if (!canRead(ctx, g.segs, g.data)) throw new DbError("not_granted", "You can't read that.");
        return { id: g.id, exists: g.exists, data: g.exists ? g.data : null };
      }
      case "query": {
        const q = normalizeQuery(body.query);
        const colSegs = q.collection.split("/");
        return { docs: store.query(q, (id, data) => canRead(ctx, [...colSegs, id], data)) };
      }
      case "set": case "merge": case "update": case "delete":
        requireWriter(ctx);
        commitChecked(ctx, store.plan(body.op, body.path, body.data));
        return { ok: true };
      case "add": {
        requireWriter(ctx);
        const collection = parseCollectionPath(body.collection);
        const plan = store.plan("set", `${collection}/${store.newId(collection)}`, body.data);
        commitChecked(ctx, plan);
        return { ok: true, id: plan.d.id, path: plan.d.path };
      }
      case "acquire": {
        requireWriter(ctx);
        const d = parseDocPath(body.path);
        if (!canWritePath(ctx, d.segs)) throw new DbError("not_granted", "You can't change that.");
        if (!limits.writes.take(ctx.uid)) throw new DbError("resource_exhausted", "Too many changes at once.");
        return store.acquire(d.path, holder(), body.ttlMs);
      }
      case "release":
        requireWriter(ctx);
        return store.release(body.path, holder());
      default:
        throw new DbError("invalid_argument", "Unknown operation");
    }
  }

  // ---------- room ----------
  function roomOp(ctx, body) {
    const page = ownPage(ctx, body);
    const room = checkRoomName(body.room ?? SITE_ROOM);
    if (body.op === "join") rooms.join(page.id, page.peerId, room, ctx.uid);
    else if (body.op === "leave") { if (room !== SITE_ROOM) rooms.leave(page.id, room); }
    else if (body.op === "presence") {
      if (!limits.presence.take(page.id)) throw new DbError("resource_exhausted", "Too many presence updates.");
      rooms.join(page.id, page.peerId, room, ctx.uid);
      rooms.setPresence(page.id, room, body.presence ?? null);
    } else throw new DbError("invalid_argument", "Unknown room operation");
    return { ok: true };
  }

  // ---------- user ----------
  function profiles(ctx, body) {
    const out = {};
    for (const id of Array.isArray(body?.ids) ? body.ids.slice(0, 200) : []) {
      const u = typeof id === "string" ? accounts.users.get(id) : null;
      if (u) out[id] = accounts.profile(u, ctx.uid);
    }
    return { profiles: out };
  }

  function search(ctx, q) {
    if (!ctx.uid) return { results: [] };
    return { results: accounts.search(q).map(u => { const p = accounts.profile(u, ctx.uid); return { id: p.id, name: p.name, avatarUrl: p.avatarUrl }; }) };
  }

  function avatar(res, id) {
    const u = accounts.users.get(id);
    const words = u ? u.name.match(/[\p{L}\p{N}]+/gu) || [] : [];
    const initials = words.slice(0, 2).map(w => [...w][0]).join("").toUpperCase() || "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${u ? u.color : "#587080"}"/><text x="32" y="41" text-anchor="middle" font-family="Share Tech Mono,ui-monospace,monospace" font-size="26" font-weight="700" fill="#05080C">${xmlEscape(initials)}</text></svg>`;
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=300", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff" });
    res.end(svg);
  }

  // ---------- accounts ----------
  function startSession(req, res, user) {
    const token = accounts.createSession(user.id);
    sendJson(res, 200, { ok: true }, { "set-cookie": sessionCookie(COOKIE, token, { maxAge: 30 * 86400, secure: secureFor(req), path: `${cfg.basePath}/` }) });
  }

  async function register(req, res) {
    if (!limits.signups.take(clientIp(req, cfg.trustProxy))) throw new HttpError(429, "resource_exhausted", "Too many new accounts from here. Try again later.");
    startSession(req, res, await accounts.register((await readJson(req, 8192)) || {}));
  }

  async function login(req, res) {
    const body = (await readJson(req, 8192)) || {};
    if (!limits.logins.take(`${clientIp(req, cfg.trustProxy)}|${String(body.username ?? "").toLowerCase()}`))
      throw new HttpError(429, "resource_exhausted", "Too many tries. Wait a few minutes and try again.");
    startSession(req, res, await accounts.login(body));
  }

  function logout(req, res, ctx) {
    const key = accounts.endSession(ctx.token);
    if (key) for (const page of pages.values()) if (page.ctx.sessionKey === key) page.res.end();
    arena.feed.endSession(key);
    sendJson(res, 200, { ok: true }, { "set-cookie": sessionCookie(COOKIE, "", { maxAge: 0, secure: secureFor(req), path: `${cfg.basePath}/` }) });
  }

  function requireUser(ctx) {
    if (!ctx.uid) throw new HttpError(401, "not_granted", "Sign in first.");
  }

  // ---------- sample (Cosmic) ----------
  async function sample(req, res, ctx) {
    if (!cfg.anthropicKey) throw new HttpError(503, "sampling_disabled", "The assistant isn't set up on this site.");
    if (!ctx.uid || !ctx.canWrite) throw new HttpError(403, "not_granted", "Sign in to chat with Cosmic.");
    const body = await readJson(req, 2 * 1024 * 1024);
    let messages;
    try { messages = normalizeMessages(body?.messages); } catch (e) { throw new HttpError(400, e.code || "invalid_argument", e.message); }
    if (!limits.samples.take(ctx.uid) || samplesRunning >= MAX_CONCURRENT_SAMPLES) throw new HttpError(429, "rate_limited", "Too many questions at once.");
    samplesRunning++;
    const ac = new AbortController();
    res.on("close", () => { if (!res.writableFinished) ac.abort(); });
    res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
    const line = obj => res.write(`${JSON.stringify(obj)}\n`);
    try {
      const { text, truncated } = await streamMessage({
        apiKey: cfg.anthropicKey, baseUrl: cfg.anthropicUrl, model: cfg.anthropicModel, maxTokens: cfg.sampleMaxTokens,
        messages, signal: ac.signal, onText: d => line({ t: "d", d }),
      });
      line({ t: "done", text, truncated });
    } catch (e) {
      if (!(e instanceof SampleError)) console.error(e);
      if (!ac.signal.aborted) line({ t: "error", code: e instanceof SampleError ? e.code : "error", message: e instanceof SampleError ? e.message : "Something went wrong." });
    } finally {
      samplesRunning--;
      res.end();
    }
  }

  // ---------- routing ----------
  // JSON-only POSTs plus SameSite cookies already stop other sites from posting here; this is a second lock.
  function checkSameOrigin(req) {
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "not_granted", "Cross-site request blocked.");
    const origin = req.headers.origin;
    if (!origin) return;
    const host = (cfg.trustProxy && String(req.headers["x-forwarded-host"] || "").split(",")[0].trim()) || req.headers.host;
    let originHost = null;
    try { originHost = new URL(origin).host; } catch {}
    if (originHost !== host) throw new HttpError(403, "not_granted", "Cross-site request blocked.");
  }

  async function api(req, res, pathname, url, ctx) {
    if (req.method !== "GET" && req.method !== "HEAD") checkSameOrigin(req);
    if (pathname.startsWith("/api/v1/")) return arena.handle(req, res, pathname, url, ctx);
    switch (`${req.method} ${pathname}`) {
      case "GET /api/session": return sendJson(res, 200, sessionInfo(ctx));
      case "GET /api/events": return openPage(req, res, ctx);
      case "POST /api/db": return sendJson(res, 200, dbOp(ctx, await readJson(req, cfg.maxDocBytes + 64 * 1024)));
      case "POST /api/sub": return sendJson(res, 200, subscribe(ctx, await readJson(req, 64 * 1024)));
      case "POST /api/unsub": return sendJson(res, 200, unsubscribe(ctx, await readJson(req, 4096)));
      case "POST /api/room": return sendJson(res, 200, roomOp(ctx, await readJson(req, 16 * 1024)));
      case "POST /api/user/profiles": return sendJson(res, 200, profiles(ctx, await readJson(req, 64 * 1024)));
      case "GET /api/user/search": return sendJson(res, 200, search(ctx, url.searchParams.get("q") || ""));
      case "POST /api/sample": return sample(req, res, ctx);
      case "POST /api/auth/register": return register(req, res);
      case "POST /api/auth/login": return login(req, res);
      case "POST /api/auth/logout": return logout(req, res, ctx);
      case "POST /api/auth/profile": {
        requireUser(ctx);
        const user = accounts.rename(ctx.uid, (await readJson(req, 4096))?.name);
        return sendJson(res, 200, { ok: true, user: accounts.profile(user, ctx.uid) });
      }
      case "POST /api/auth/password": {
        requireUser(ctx);
        const body = (await readJson(req, 4096)) || {};
        if (!limits.logins.take(`password|${ctx.uid}`)) throw new HttpError(429, "resource_exhausted", "Too many tries. Wait a few minutes and try again.");
        await accounts.changePassword(ctx.uid, body.current, body.next);
        accounts.endOtherSessions(ctx.uid, ctx.token);
        return sendJson(res, 200, { ok: true });
      }
    }
    const av = req.method === "GET" && pathname.match(/^\/api\/avatar\/([A-Za-z0-9_-]{1,40})\.svg$/);
    if (av) return avatar(res, av[1]);
    throw new HttpError(404, "not_found", "No such endpoint.");
  }

  function page(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "invalid_argument", "Method not allowed.");
    if (pathname === "/") return serveFile(req, res, path.join(cfg.publicDir, "index.html"), PAGE_HEADERS);
    if (pathname === "/login" || pathname === "/account") return serveFile(req, res, path.join(cfg.publicDir, "login.html"), PAGE_HEADERS);
    if (["/apply", "/applications", "/metrics", "/my", "/board", "/card"].includes(pathname)) return serveFile(req, res, path.join(cfg.publicDir, `${pathname.slice(1)}.html`), PAGE_HEADERS);
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return false; }
    const file = path.resolve(cfg.publicDir, `.${rel}`);
    if (!file.startsWith(cfg.publicDir + path.sep) || rel.includes("\0") || rel.split("/").some(s => s.startsWith("."))) return false;
    return serveFile(req, res, file, file.endsWith(".html") ? PAGE_HEADERS : {});
  }

  // With D3MON_BASE_PATH=/d3mon the site lives at /d3mon/. Requests may arrive with that prefix, or
  // without it when a proxy strips it; both work. The page itself only uses relative URLs.
  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    let pathname = url.pathname;
    try {
      if (cfg.basePath) {
        if (pathname === cfg.basePath) {
          res.writeHead(301, { location: `${cfg.basePath}/${url.search}` });
          return void res.end();
        }
        if (pathname.startsWith(`${cfg.basePath}/`)) pathname = pathname.slice(cfg.basePath.length);
      }
      if (pathname.startsWith("/api/")) return await api(req, res, pathname, url, context(req));
      if (!page(req, res, pathname)) throw new HttpError(404, "not_found", "Not found.");
    } catch (e) {
      if (res.headersSent) return void res.destroy();
      const status = e.status || STATUS[e.code] || 500;
      if (status === 500) console.error(e);
      sendJson(res, status, { error: { code: e.code || "error", message: status === 500 ? "Something went wrong." : e.message, ...(e.field && status !== 500 ? { field: e.field } : {}) } });
    }
  }

  const server = http.createServer((req, res) => void handle(req, res));

  function shutdown() {
    store.saveNow();
    accounts.saveNow();
    arena.close();
    for (const p of pages.values()) p.res.end();
    server.close();
  }

  return { server, store, accounts, arena, cfg, shutdown };
}
