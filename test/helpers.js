// Test helpers: a throwaway server (data in .test-data/, never reads .env) and a small HTTP client
// that keeps its session cookie and can read the live event stream.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createApp } from "../server/index.js";
import { loadConfig, ROOT } from "../server/config.js";

export async function startServer(overrides = {}) {
  const dataDir = overrides.dataDir || path.join(ROOT, ".test-data", crypto.randomBytes(6).toString("hex"));
  const cfg = loadConfig({
    skipDotEnv: true, host: "127.0.0.1", port: 0, owner: "", signups: "open", signupsPerHour: 1000,
    anthropicKey: "", anthropicModel: "claude-haiku-5-5", saveDelayMs: 20, ...overrides, dataDir,
  });
  const app = await createApp(cfg);
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    app, base, dataDir,
    async stop({ keepData = false } = {}) {
      app.shutdown();
      await new Promise(r => setTimeout(r, 30));
      if (!keepData) fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// Reads "event:/data:" blocks from a Server-Sent Events response body.
export async function* readEvents(body) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
  }
}

// A browser-style EventSource for code under test, sending the visitor's session cookie.
// Like a browser's, it fires no error event after close().
export function eventSourceFor(base, client) {
  return class EventSource {
    constructor(url) {
      this.readyState = 0;
      this.listeners = {};
      this.ac = new AbortController();
      fetch(new URL(url, base), { headers: client.cookie ? { cookie: client.cookie } : {}, signal: this.ac.signal })
        .then(async res => {
          if (!res.ok) throw new Error(`status ${res.status}`);
          this.readyState = 1;
          for await (const e of readEvents(res.body)) for (const f of this.listeners[e.event] || []) f({ data: e.data });
        })
        .catch(() => {
          if (this.closed) return;
          this.readyState = 2;
          if (this.onerror) this.onerror({});
        });
      EventSource.open.add(this);
    }
    addEventListener(type, f) { (this.listeners[type] ||= []).push(f); }
    close() {
      this.closed = true;
      this.readyState = 2;
      this.ac.abort();
      EventSource.open.delete(this);
    }
    static open = new Set();
    static closeAll() { for (const s of [...EventSource.open]) s.close(); }
  };
}

export class Client {
  constructor(base) {
    this.base = base;
    this.cookie = "";
    this.user = null;
  }

  async req(method, url, body, headers = {}) {
    const res = await fetch(this.base + url, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    const m = set && set.match(/^d3mon_session=([^;]*)/);
    if (m) this.cookie = m[1] ? `d3mon_session=${m[1]}` : "";
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, headers: res.headers };
  }

  get(url, headers) { return this.req("GET", url, undefined, headers); }
  post(url, body = {}, headers) { return this.req("POST", url, body, headers); }
  db(op, args) { return this.post("/api/db", { op, ...args }); }

  async register(username, password, name) {
    const r = await this.post("/api/auth/register", { username, password, name });
    if (r.status !== 200) throw new Error(`register ${username}: ${r.text}`);
    this.user = (await this.get("/api/session")).json.user;
    return this.user;
  }

  // Opens the page's live stream. next(match) waits for the first matching event not yet taken.
  async events() {
    const ac = new AbortController();
    const res = await fetch(`${this.base}/api/events`, { headers: this.cookie ? { cookie: this.cookie } : {}, signal: ac.signal });
    const queue = [];
    let wake = null;
    (async () => {
      try {
        for await (const e of readEvents(res.body)) {
          queue.push({ event: e.event, data: JSON.parse(e.data) });
          if (wake) wake();
        }
      } catch {}
    })();
    async function next(match, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const i = queue.findIndex(match);
        if (i >= 0) return queue.splice(i, 1)[0];
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`timed out; queued: ${JSON.stringify(queue).slice(0, 500)}`);
        await new Promise(resolve => {
          const t = setTimeout(resolve, left);
          wake = () => { clearTimeout(t); wake = null; resolve(); };
        });
      }
    }
    const hello = await next(e => e.event === "hello");
    return { cid: hello.data.cid, next, queue, close: () => ac.abort() };
  }
}
