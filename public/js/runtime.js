/* D3MON.CO standalone runtime.
   The page was built as a claude.ai artifact and asks its host for features through
   window.claude.use(name). This file provides the same four features, backed by this site's server,
   so js/d3mon.js runs unchanged:
     db      shared documents with live updates
     user    who is signed in, member names and avatars
     room    who else is on the page, and what they're doing
     sample  answers from Claude for the Cosmic assistant
   If the server can't be reached, use() returns null and the page shows its offline view. */
(function () {
  "use strict";

  class RuntimeError extends Error {
    constructor(code, message, text) {
      super(message || code);
      this.code = code;
      if (text !== undefined) this.text = text;
    }
  }

  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  async function post(url, body, signal) {
    let res;
    try {
      res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
    } catch (e) {
      throw new RuntimeError("unavailable", "Couldn't reach the server.");
    }
    let json = null;
    try { json = await res.json(); } catch (e) {}
    if (!res.ok || !json || json.error) {
      const err = (json && json.error) || {};
      throw new RuntimeError(err.code || (res.status === 429 ? "resource_exhausted" : "unavailable"), err.message || "Request failed (" + res.status + ")");
    }
    return json;
  }

  let sessionPromise = null;
  function session() {
    if (!sessionPromise) {
      sessionPromise = fetch("api/session", { credentials: "same-origin", cache: "no-store" })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return sessionPromise;
  }

  // ---------- live connection: one Server-Sent Events stream per page ----------
  const live = { es: null, cid: null, waiters: [], subs: new Map(), rooms: new Map(), nextSid: 1 };

  function ensureLive() {
    if (live.es) return;
    const es = (live.es = new EventSource("api/events"));
    es.addEventListener("hello", e => {
      live.cid = JSON.parse(e.data).cid;
      // A new connection starts empty on the server: register this page's views and rooms again.
      for (const [sid, s] of live.subs) registerSub(sid, s);
      for (const [name, r] of live.rooms) restoreRoom(name, r);
      live.waiters.splice(0).forEach(resolve => resolve(live.cid));
    });
    es.addEventListener("snap", e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      const s = live.subs.get(m.sid);
      if (!s) return;
      if (m.error) { if (s.onError) s.onError(new RuntimeError(m.error, m.message)); return; }
      s.onData(m);
    });
    es.addEventListener("peers", e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      const r = live.rooms.get(m.room || "");
      if (!r) return;
      r.peers = m.peers || [];
      for (const cb of [...r.listeners]) {
        try { cb({ peers: r.peers.slice() }); } catch (err) { console.error(err); }
      }
    });
    es.onerror = () => {
      live.cid = null;
      // EventSource retries on its own unless the server refused the stream; then start a fresh one.
      if (es.readyState === 2) {
        live.es = null;
        setTimeout(ensureLive, 3000);
      }
    };
  }

  function whenLive() {
    ensureLive();
    return live.cid ? Promise.resolve(live.cid) : new Promise(resolve => live.waiters.push(resolve));
  }

  function registerSub(sid, s) {
    const body = Object.assign({ cid: live.cid, sid }, s.spec);
    s.registered = post("api/sub", body).catch(err => {
      // not_found: the connection was replaced; the next "hello" registers this view again.
      if (live.subs.get(sid) === s && err.code !== "not_found" && s.onError) s.onError(err);
    });
  }

  function subscribe(spec, onData, onError) {
    const sid = live.nextSid++;
    const s = { spec, onData, onError: typeof onError === "function" ? onError : null, registered: null };
    live.subs.set(sid, s);
    ensureLive();
    if (live.cid) registerSub(sid, s);
    return () => {
      if (live.subs.get(sid) !== s) return;
      live.subs.delete(sid);
      const cid = live.cid;
      if (cid) Promise.resolve(s.registered).then(() => post("api/unsub", { cid, sid })).catch(() => {});
    };
  }

  // ---------- db ----------
  function getField(data, field) {
    let v = data;
    for (const part of String(field).split(".")) {
      if (!v || typeof v !== "object" || !Object.prototype.hasOwnProperty.call(v, part)) return undefined;
      v = v[part];
    }
    return clone(v);
  }

  function docSnapshot(id, exists, data) {
    return {
      id,
      exists: !!exists,
      data: () => (exists ? clone(data) : undefined),
      get: field => (exists ? getField(data, field) : undefined),
    };
  }

  function querySnapshot(docs) {
    const list = (docs || []).map(d => docSnapshot(d.id, true, d.data));
    return { docs: list, size: list.length, empty: !list.length, forEach: (fn, thisArg) => list.forEach(fn, thisArg) };
  }

  const observer = (next, error) =>
    typeof next === "function" ? [next, error] : [next && next.next && next.next.bind(next), next && next.error && next.error.bind(next)];

  class DocumentReference {
    constructor(path) {
      this.path = String(path);
      this.id = this.path.split("/").pop();
    }
    get() {
      return post("api/db", { op: "get", path: this.path }).then(r => docSnapshot(r.id, r.exists, r.data));
    }
    set(data, options) {
      return post("api/db", { op: options && options.merge ? "merge" : "set", path: this.path, data }).then(() => undefined);
    }
    update(data) {
      return post("api/db", { op: "update", path: this.path, data }).then(() => undefined);
    }
    delete() {
      return post("api/db", { op: "delete", path: this.path }).then(() => undefined);
    }
    acquire(opts) {
      const o = opts || {};
      return post("api/db", { op: "acquire", path: this.path, holder: String(o.holder || "anon"), ttlMs: o.ttlMs }).then(r => ({ acquired: !!r.acquired, expiresAt: r.expiresAt }));
    }
    release(opts) {
      return post("api/db", { op: "release", path: this.path, holder: String((opts && opts.holder) || "anon") }).then(r => ({ released: !!r.released }));
    }
    collection(name) {
      return new Query(this.path + "/" + name);
    }
    onSnapshot(next, error) {
      const [onNext, onError] = observer(next, error);
      return subscribe({ kind: "doc", path: this.path }, m => onNext && onNext(docSnapshot(m.id, m.exists, m.data)), onError);
    }
  }

  class Query {
    constructor(path, q) {
      this.path = String(path);
      this.id = this.path.split("/").pop();
      this._q = q || { where: [], orderBy: [], limit: null };
    }
    _with(change) {
      return new Query(this.path, Object.assign({}, this._q, change));
    }
    where(field, op, value) {
      return this._with({ where: this._q.where.concat([[String(field), String(op), value === undefined ? null : value]]) });
    }
    orderBy(field, dir) {
      return this._with({ orderBy: this._q.orderBy.concat([[String(field), dir === "desc" ? "desc" : "asc"]]) });
    }
    limit(n) {
      return this._with({ limit: n });
    }
    _spec() {
      return { collection: this.path, where: this._q.where, orderBy: this._q.orderBy, limit: this._q.limit };
    }
    get() {
      return post("api/db", { op: "query", query: this._spec() }).then(r => querySnapshot(r.docs));
    }
    onSnapshot(next, error) {
      const [onNext, onError] = observer(next, error);
      return subscribe({ kind: "query", query: this._spec() }, m => onNext && onNext(querySnapshot(m.docs)), onError);
    }
    doc(id) {
      return new DocumentReference(this.path + "/" + (id || Date.now().toString(36) + Math.random().toString(36).slice(2, 12)));
    }
    add(data) {
      return post("api/db", { op: "add", collection: this.path, data }).then(r => new DocumentReference(r.path));
    }
  }

  const db = {
    collection: path => new Query(path),
    doc: path => new DocumentReference(path),
  };

  // ---------- user ----------
  const user = {
    async me() {
      const s = await session();
      const u = s && s.user;
      return u ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl, isOwner: u.role === "owner", guest: false } : { id: null, name: "", avatarUrl: "", isOwner: false, guest: true };
    },
    async canEdit() {
      const s = await session();
      return !!(s && s.user && (s.user.role === "owner" || s.user.role === "admin"));
    },
    async can(permission) {
      const s = await session();
      return permission === "data.write" ? !!(s && s.user && !s.user.banned) : false;
    },
    async profiles(ids) {
      const list = [...new Set((ids || []).filter(Boolean).map(String))];
      const out = {};
      for (let i = 0; i < list.length; i += 200) Object.assign(out, (await post("api/user/profiles", { ids: list.slice(i, i + 200) })).profiles);
      return out;
    },
    async search(q) {
      const r = await fetch("api/user/search?q=" + encodeURIComponent(q || ""), { credentials: "same-origin", cache: "no-store" });
      return r.ok ? (await r.json()).results || [] : [];
    },
  };

  // ---------- room ----------
  function roomState(name) {
    let r = live.rooms.get(name);
    if (!r) live.rooms.set(name, (r = { presence: undefined, listeners: new Set(), peers: null }));
    return r;
  }

  function restoreRoom(name, r) {
    const cid = live.cid;
    const join = name ? post("api/room", { cid, op: "join", room: name }) : Promise.resolve();
    join.then(() => r.presence !== undefined && post("api/room", { cid, op: "presence", room: name, presence: r.presence })).catch(() => {});
  }

  function roomHandle(name) {
    const r = roomState(name);
    return {
      presence(p) {
        r.presence = p === undefined ? null : clone(p);
        return whenLive().then(cid => post("api/room", { cid, op: "presence", room: name, presence: r.presence })).then(() => undefined);
      },
      onPeers(cb) {
        r.listeners.add(cb);
        ensureLive();
        if (r.peers) setTimeout(() => r.listeners.has(cb) && cb({ peers: r.peers.slice() }), 0);
        return () => r.listeners.delete(cb);
      },
      leave() {
        if (!name) return Promise.resolve();
        live.rooms.delete(name);
        return live.cid ? post("api/room", { cid: live.cid, op: "leave", room: name }).then(() => undefined, () => undefined) : Promise.resolve();
      },
    };
  }

  const room = Object.assign(roomHandle(""), {
    async join(name) {
      name = String(name || "");
      const handle = roomHandle(name);
      if (name) await post("api/room", { cid: await whenLive(), op: "join", room: name });
      return handle;
    },
  });

  // ---------- sample ----------
  async function sample(input, options) {
    const opts = options || {};
    const onText = typeof opts.onText === "function" ? opts.onText : null;
    const aborted = () => !!(opts.signal && opts.signal.aborted);
    let text = "", res;
    try {
      res = await fetch("api/sample", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: input, modelTier: opts.modelTier || "quick" }), signal: opts.signal,
      });
    } catch (e) {
      if (aborted()) throw new RuntimeError("cancelled", "Stopped", "");
      throw new RuntimeError("unavailable", "Couldn't reach the server.");
    }
    if (!res.ok) {
      let err = {};
      try { err = (await res.json()).error || {}; } catch (e) {}
      throw new RuntimeError(err.code || "error", err.message || "Request failed (" + res.status + ")");
    }
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buf = "", done = null;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const m = JSON.parse(line);
          if (m.t === "d") {
            text += m.d;
            if (onText) onText({ text });
          } else if (m.t === "done") done = m;
          else if (m.t === "error") throw new RuntimeError(m.code || "error", m.message, text);
        }
      }
    } catch (e) {
      if (e instanceof RuntimeError) throw e;
      if (aborted()) throw new RuntimeError("cancelled", "Stopped", text);
      throw new RuntimeError("error", "The answer was interrupted.", text);
    }
    if (!done) throw aborted() ? new RuntimeError("cancelled", "Stopped", text) : new RuntimeError("error", "The answer was interrupted.", text);
    return { text: typeof done.text === "string" ? done.text : text, truncated: !!done.truncated };
  }

  // ---------- window.claude ----------
  const features = { db, user, room };
  window.claude = Object.freeze({
    use(name) {
      return session().then(s => {
        if (!s) return null;
        if (name === "sample") return s.sampling ? sample : null;
        return Object.prototype.hasOwnProperty.call(features, name) ? features[name] : null;
      });
    },
  });

  // ---------- sign-in link in the header (the artifact's host handled sign-in) ----------
  function authLink(box, out) {
    const a = document.createElement("a");
    a.className = out ? "d3-auth d3-out" : "d3-auth";
    a.href = out ? "account" : "login";
    a.textContent = out ? "⏻" : "Sign in";
    if (out) {
      a.title = "Account and sign out";
      a.setAttribute("aria-label", "Account and sign out");
    }
    a.addEventListener("click", e => e.stopPropagation());
    box.appendChild(a);
  }

  function addAuthLinks() {
    const box = document.getElementById("me");
    if (!box) return;
    session().then(s => {
      if (!s) return;
      if (!s.user) return void (box.querySelector(".d3-auth") || authLink(box, false));
      // The page fills this box with the member's avatar and name once it knows who they are.
      const add = () => { if (box.querySelector("img") && !box.querySelector(".d3-auth")) authLink(box, true); };
      new MutationObserver(add).observe(box, { childList: true });
      add();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addAuthLinks);
  else addAuthLinks();
})();
