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
    for (const type of ["battle.updated", "application.created", "application.updated", "entrant.updated", "round.metrics", "call.received", "round.locked", "round.scored", "stats.updated"]) {
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

  // One stat from a d3mon.statcard/v1 card (or the owner's settings) as HTML, by its type.
  const pct = v => v === null || v === undefined ? "–" : `${(Math.round(v * 1000) / 10).toFixed(1).replace(/\.0$/, "")}%`;
  const dur = ms => { if (ms === null || ms === undefined) return "–"; const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
  function statValue(st) {
    const v = st.value;
    switch (st.type) {
      case "percent": return `<span class="sv">${pct(v)}</span>${st.n !== undefined ? `<span class="tag"> of ${st.n} scored</span>` : ""}`;
      case "streak": return `<span class="sv ${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${v > 0 ? `+${v} right` : v < 0 ? `${-v} wrong` : "–"}</span>`;
      case "duration": return `<span class="sv">${dur(v)}</span>`;
      case "histogram": {
        const keys = Object.keys(v || {});
        if (!keys.length) return `<span class="tag">No scored rounds yet</span>`;
        return `<div class="hist">${keys.map(k => `<div class="hb" title="${esc(k)}${st.timezone ? " " + esc(st.timezone) : ""}: ${pct(v[k])}${st.counts ? ` of ${st.counts[k]}` : ""}"><em>${pct(v[k])}</em><i style="height:${Math.max(4, Math.round((v[k] || 0) * 100))}%"></i><span>${esc(k.replace(":00", ""))}</span></div>`).join("")}</div>`;
      }
      case "series": {
        const pts = (v || []).slice(-14);
        if (!pts.length) return `<span class="tag">No scored rounds yet</span>`;
        return `<div class="days">${pts.map(p => `<div title="${esc(p.t)}: ${p.w ?? ""}–${p.l ?? ""}"><b>${esc(p.t.slice(5))}</b><span>${p.w !== undefined ? `${p.w}–${p.l}` : esc(String(p.v))}</span></div>`).join("")}</div>`;
      }
      case "text": return `<span class="sv">${esc(v ?? "–")}</span>`;
      default: return `<span class="sv">${v === null || v === undefined ? "–" : esc(String(v))}</span>`;
    }
  }
  const verifTag = st => st.verification ? `<span class="vbadge ${esc(st.verification.replace(/\s+/g, "-"))}" title="${st.sources ? esc(`Kalshi: ${st.sources.kalshi}, host: ${st.sources.host}`) : ""}">${esc(st.verification)}</span>` : "";

  window.Arena = { api, follow, esc, when, kindName, session, syncClock, serverNow, nextRound, mmss, ROUND_MS, statValue, verifTag };
})();
