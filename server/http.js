// Small HTTP helpers: JSON requests and replies, cookies, static files and rate limits.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-length": Buffer.byteLength(json), ...headers });
  res.end(json);
}

export function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) {
      req.resume();
      return reject(new HttpError(415, "invalid_argument", "Send JSON."));
    }
    const chunks = [];
    let size = 0, tooBig = false;
    req.on("data", c => {
      size += c.length;
      if (size > limit) tooBig = true;
      else chunks.push(c);
    });
    req.on("end", () => {
      if (tooBig) return reject(new HttpError(413, "quota_exceeded", "That request is too large."));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(new HttpError(400, "invalid_argument", "Bad JSON."));
      }
    });
    req.on("error", reject);
  });
}

export function parseCookies(header) {
  const out = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}

export function sessionCookie(name, value, { maxAge, secure, path = "/" }) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export const clientIp = (req, trustProxy) =>
  (trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "";

export const isHttps = (req, trustProxy) =>
  !!req.socket.encrypted || (trustProxy && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".mp4": "video/mp4", ".webm": "video/webm",
};
const gzipCache = new Map(); // file -> { etag, body }

// Serves one file with revalidation and gzip. Returns false when there's no such file to serve.
export function serveFile(req, res, file, headers = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!st.isFile() || !type) return false;
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const base = { "content-type": type, etag, "cache-control": "no-cache", vary: "accept-encoding", "x-content-type-options": "nosniff", ...headers };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, base);
    return res.end(), true;
  }
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] || "")) && /^(text\/|application\/json|image\/svg)/.test(type)) {
    let c = gzipCache.get(file);
    if (!c || c.etag !== etag) gzipCache.set(file, (c = { etag, body: zlib.gzipSync(fs.readFileSync(file), { level: 9 }) }));
    res.writeHead(200, { ...base, "content-encoding": "gzip", "content-length": c.body.length });
    return res.end(req.method === "HEAD" ? undefined : c.body), true;
  }
  // Videos are read in pieces (Safari won't play one without byte ranges): one range per request.
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (range && type.startsWith("video/") && (range[1] || range[2])) {
    let start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]), end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.writeHead(416, { ...base, "content-range": `bytes */${st.size}` }); return res.end(), true; }
    res.writeHead(206, { ...base, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") return res.end(), true;
    fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...base, "content-length": st.size, ...(type.startsWith("video/") ? { "accept-ranges": "bytes" } : {}) });
  if (req.method === "HEAD") return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

// Token buckets per key: `capacity` actions at once, refilling at `refillPerSec`.
export class RateLimiter {
  constructor({ capacity, refillPerSec }) {
    this.capacity = capacity;
    this.rate = refillPerSec;
    this.buckets = new Map();
  }

  take(key, n = 1) {
    const now = Date.now();
    if (this.buckets.size > 10000) {
      for (const [k, x] of this.buckets) if (x.tokens + ((now - x.t) / 1000) * this.rate >= this.capacity) this.buckets.delete(k);
    }
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { tokens: this.capacity, t: now }));
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.t) / 1000) * this.rate);
    b.t = now;
    if (b.tokens < n) return false;
    b.tokens -= n;
    return true;
  }
}
