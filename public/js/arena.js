// A small client for /api/v1 shared by the Arena pages (/apply, /applications). Everything here goes
// through the public API, the same one the future 3D site will use.
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function api(method, path, body) {
    const res = await fetch(`api/v1/${path}`, {
      method, credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = {};
    try { json = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error((json.error && json.error.message) || "Something went wrong. Try again.");
      err.field = json.error && json.error.field;
      throw err;
    }
    return json;
  }

  // Follows the live feed and calls onEvent(type, data) for each event. Reconnects by itself.
  function follow(topics, onEvent, onState) {
    const es = new EventSource(`api/v1/feed?topics=${encodeURIComponent(topics.join(","))}`);
    es.addEventListener("hello", () => onState && onState(true));
    es.onerror = () => onState && onState(false);
    for (const type of ["battle.updated", "application.created", "application.updated", "entrant.updated", "round.metrics", "call.received", "round.locked", "round.scored"]) {
      es.addEventListener(type, e => { try { onEvent(type, JSON.parse(e.data).data); } catch (x) {} });
    }
    return es;
  }

  const when = ms => new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const kindName = k => ({ bot: "Bot", caller: "Caller", script: "Script" })[k] || k;

  async function session() {
    try { return (await (await fetch("api/session", { credentials: "same-origin" })).json()).user; } catch (e) { return null; }
  }

  // The server's clock decides when rounds lock. Pages count down by it, not by this computer's clock.
  let offset = 0;
  async function syncClock() {
    const t0 = Date.now(), c = await api("GET", "clock"), t1 = Date.now();
    offset = c.now - (t0 + t1) / 2;
    return c;
  }
  const serverNow = () => Date.now() + offset;
  const ROUND_MS = 15 * 60000;
  const nextRound = (now = serverNow()) => Math.floor(now / ROUND_MS) * ROUND_MS + ROUND_MS;
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  window.Arena = { api, follow, esc, when, kindName, session, syncClock, serverNow, nextRound, mmss, ROUND_MS };
})();
