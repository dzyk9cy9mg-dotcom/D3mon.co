// A small client for /api/v1 shared by the Arena pages (/apply, /applications, /my, /card, /catalog…). Everything here goes
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
    for (const type of ["battle.updated", "application.created", "application.updated", "entrant.updated", "round.metrics", "call.received", "round.locked", "round.scored", "stats.updated", "catalog.updated", "monitor.updated", "display.updated"]) {
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

  // One stat from a d3mon.statcard/v2 card (or the owner's settings) as HTML, by its type and format.
  const pct = (v, signed) => v === null || v === undefined ? "–" : `${signed && v > 0 ? "+" : ""}${(Math.round(v * 1000) / 10).toFixed(1).replace(/\.0$/, "")}%`;
  const dur = ms => { if (ms === null || ms === undefined) return "–"; const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
  const money = v => { if (v === null || v === undefined) return "–"; const a = Math.abs(v), d = a < 1 ? 4 : 2; return `${v < 0 ? "−" : ""}$${a.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: d })}`; };
  const num = (v, signed) => v === null || v === undefined ? "–" : `${signed && v > 0 ? "+" : ""}${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  const byFormat = (f, v) => f === "percent" ? pct(v) : f === "money" ? money(v) : num(v, f === "signed");
  const day = s => new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  function sparkline(pts, f) {
    const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), W = 300, H = 70, span = hi - lo || 1;
    const xy = pts.map((p, i) => `${pts.length > 1 ? Math.round((i / (pts.length - 1)) * W) : W / 2},${Math.round(H - 4 - ((p.v - lo) / span) * (H - 8))}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(`${pts.length} points, from ${byFormat(f, vs[0])} to ${byFormat(f, vs[vs.length - 1])}`)}"><polyline points="${xy}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
      <div class="tag">${esc(pts[0].t)} → ${esc(pts[pts.length - 1].t)} · now <b>${esc(byFormat(f, vs[vs.length - 1]))}</b> · low ${esc(byFormat(f, lo))} · high ${esc(byFormat(f, hi))}</div>`;
  }
  function statValue(st) {
    const v = st.value, f = st.format;
    if (v === null || v === undefined) return `<span class="sv">–</span>`;
    switch (st.type) {
      case "percent": return `<span class="sv">${pct(v)}</span>${st.n !== undefined ? `<span class="tag"> of ${st.n}</span>` : ""}`;
      case "form": return `<span class="form">${v.map(x => `<i class="${x === "w" ? "pos" : "neg"}" title="${x === "w" ? "right" : "wrong"}">${x === "w" ? "✓" : "✗"}</i>`).join("")}</span>`;
      case "battles": return `<div class="tablewrap"><table class="mgrid"><thead><tr><th>Battle</th><th>Record</th><th>Rounds called</th></tr></thead><tbody>${v.map(b => `<tr><td>${esc(b.t)}</td><td><span class="pos">${b.w}</span>–<span class="neg">${b.l}</span></td><td>${b.called} of ${b.rounds}</td></tr>`).join("")}</tbody></table></div>`;
      case "return": return `<span class="sv ${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${pct(v, true)}</span>`;
      case "money": return `<span class="sv ${v < 0 ? "neg" : ""}">${money(v)}</span>`;
      case "duration": return `<span class="sv">${dur(v)}</span>`;
      case "integer": case "number":
        if (f === "streak") return `<span class="sv ${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${v > 0 ? `${v} win${v === 1 ? "" : "s"}` : v < 0 ? `${-v} loss${v === -1 ? "" : "es"}` : "–"}</span>${v ? `<span class="tag"> in a row</span>` : ""}`;
        return `<span class="sv">${esc(num(v, f === "signed"))}</span>${st.unit && st.unit !== "$" && st.unit !== "%" ? `<span class="tag"> ${esc(st.unit)}</span>` : ""}`;
      case "text": return f === "paragraph" ? `<p class="para">${esc(v)}</p>` : `<span class="sv">${esc(v)}</span>`;
      case "date": {
        const days = Math.max(0, Math.floor((Date.now() - Date.parse(`${v}T00:00:00Z`)) / 86400000));
        return f === "since" ? `<span class="sv">${days} day${days === 1 ? "" : "s"}</span><span class="tag"> since ${esc(day(v))}</span>` : `<span class="sv">${esc(day(v))}</span>`;
      }
      case "record": {
        const n = v.w + v.l;
        return `<span class="sv"><span class="pos">${v.w}</span>–<span class="neg">${v.l}</span></span>${n ? `<span class="tag"> ${pct(v.w / n)} right</span>` : ""}${v.profit !== undefined ? `<span class="tag"> · ${money(v.profit)}</span>` : ""}${v.t ? `<div class="tag">${esc(v.t)}</div>` : ""}`;
      }
      case "histogram": {
        const keys = Object.keys(v);
        if (!keys.length) return `<span class="tag">Nothing yet</span>`;
        const top = Math.max(...keys.map(k => Math.abs(v[k]))) || 1;
        const h = x => Math.max(4, Math.round((f === "percent" ? Math.min(1, Math.abs(x)) : Math.abs(x) / top) * 100));
        return `<div class="hist">${keys.map(k => `<div class="hb" title="${esc(k)}: ${esc(byFormat(f, v[k]))}${st.counts ? ` of ${st.counts[k]}` : ""}"><em>${esc(byFormat(f, v[k]))}</em><i class="${v[k] < 0 ? "neg" : ""}" style="height:${h(v[k])}%"></i><span>${esc(k.replace(":00", ""))}</span></div>`).join("")}</div>`;
      }
      case "series": return v.length ? sparkline(v, f) : `<span class="tag">Nothing yet</span>`;
      default: return `<span class="sv">${esc(String(v))}</span>`;
    }
  }
  const wide = st => ["histogram", "series", "battles", "form"].includes(st.type) || st.format === "paragraph";
  const tPct = (v, signed) => `${signed && v > 0 ? "+" : ""}${Math.round(v * 1000) / 10}%`;
  const tMoney = v => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 })}`;
  const tNum = (f, v) => f === "percent" ? tPct(v) : f === "money" ? tMoney(v) : String(Math.round(v * 10000) / 10000);
  // A short, one-line, plain-text version of a stat's value (tables, tickers).
  function statText(c) {
    const v = c.value;
    if (v === null || v === undefined) return "–";
    switch (c.type) {
      case "percent": return tPct(v);
      case "return": return tPct(v, true);
      case "money": return tMoney(v);
      case "duration": return `${Math.round(v / 1000)}s`;
      case "integer": case "number": return c.format === "streak" ? (v > 0 ? `+${v}` : String(v)) : String(v);
      case "record": return `${v.w}–${v.l}${v.t ? ` (${v.t})` : ""}`;
      case "form": return v.slice(-10).map(x => (x === "w" ? "✓" : "✗")).join("");
      case "battles": return `${v.length} battle${v.length === 1 ? "" : "s"}`;
      case "series": return v.length ? `${v.length} pts, last ${tNum(c.format, v[v.length - 1].v)}` : "–";
      case "histogram": { const k = Object.keys(v); return k.slice(0, 3).map(x => `${x} ${tNum(c.format, v[x])}`).join(", ") + (k.length > 3 ? " …" : ""); }
      case "text": return v.length > 28 ? `${v.slice(0, 27)}…` : v;
      default: return String(v);
    }
  }

  const verifTag = st => st.verification ? `<span class="vbadge ${esc(st.verification.replace(/\s+/g, "-"))}" title="${st.sources ? esc(`Kalshi: ${st.sources.kalshi}, host: ${st.sources.host}`) : ""}">${esc(st.verification)}</span>` : "";

  window.Arena = { api, follow, esc, when, kindName, session, syncClock, serverNow, nextRound, mmss, ROUND_MS, statValue, statText, verifTag, wide };
})();
