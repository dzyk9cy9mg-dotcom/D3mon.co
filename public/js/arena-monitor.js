// /monitor: HardSmoke's stats monitor. Every entrant × every stat, with health alerts, sortable and
// filterable. Thin client over GET /api/v1/monitor, the history endpoint, PUT /api/v1/monitor/settings
// and the admin:monitor live topic. The server has already left out every value an owner keeps hidden or
// private, so this page can't show them.
(function () {
  "use strict";
  const { api, follow, esc, kindName, session } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { data: null, open: new Set(), sortKey: null };
  const ALERT_NAMES = { quiet: "quiet", stale: "stale stats", rejected: "refused pushes" };

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }
  const ago = iso => {
    if (!iso) return "never";
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
  };
  const pct = (v, signed) => `${signed && v > 0 ? "+" : ""}${Math.round(v * 1000) / 10}%`;
  const money = v => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 })}`;
  const num = (f, v) => f === "percent" ? pct(v) : f === "money" ? money(v) : String(Math.round(v * 10000) / 10000);
  // A short, one-line version of a value for the table.
  function short(c, v) {
    if (v === null || v === undefined) return "–";
    switch (c.type) {
      case "percent": return pct(v);
      case "return": return pct(v, true);
      case "money": return money(v);
      case "duration": return `${Math.round(v / 1000)}s`;
      case "integer": case "number": return c.format === "streak" ? (v > 0 ? `+${v}` : String(v)) : String(v);
      case "record": return `${v.w}–${v.l}${v.t ? ` (${v.t})` : ""}`;
      case "form": return v.slice(-10).map(x => (x === "w" ? "✓" : "✗")).join("");
      case "battles": return `${v.length} battle${v.length === 1 ? "" : "s"}`;
      case "series": return v.length ? `${v.length} pts, last ${num(c.format, v[v.length - 1].v)}` : "–";
      case "histogram": { const k = Object.keys(v); return k.slice(0, 3).map(x => `${x} ${num(c.format, v[x])}`).join(", ") + (k.length > 3 ? " …" : ""); }
      case "text": return v.length > 28 ? `${v.slice(0, 27)}…` : v;
      default: return String(v);
    }
  }

  function columns() {
    const cat = $("fCat").value, src = $("fSrc").value;
    return S.data.columns.filter(c => (!cat || c.category === cat) && (!src || c.source === src));
  }

  function entrants() {
    const kind = $("fKind").value, al = $("fAlert").value, t = $("fText").value.trim().toLowerCase(), sort = $("fSort").value;
    const list = S.data.entrants.filter(e => (!kind || e.kind === kind) && (!t || e.name.toLowerCase().includes(t) || (e.owner || "").toLowerCase().includes(t))
      && (!al || (al === "any" ? e.alerts.length : e.alerts.some(a => a.type === al))));
    const time = iso => (iso ? Date.parse(iso) : 0);
    if (S.sortKey) list.sort((a, b) => time(b.cells[S.sortKey]?.receivedAt) - time(a.cells[S.sortKey]?.receivedAt));
    else if (sort === "alerts") list.sort((a, b) => b.alerts.length - a.alerts.length);
    else if (sort === "recent") list.sort((a, b) => time(b.lastActivity) - time(a.lastActivity));
    else if (sort === "oldest") list.sort((a, b) => time(a.lastActivity) - time(b.lastActivity));
    return list;
  }

  function cell(e, c) {
    const x = e.cells[c.key];
    if (!x) return `<td class="tag">n/a</td>`;
    const staleKeys = new Set((e.alerts.find(a => a.type === "stale")?.stats || []).map(s => s.key));
    const lock = x.shown ? "" : `<span title="${esc(x.visibility)}">🔒</span> `;
    const body = x.shown ? esc(short(c, x.value)) : x.hasValue ? `${lock}<span class="tag">${esc(x.visibility)}</span>` : `${lock}–`;
    const sub = x.verification === "self-reported" ? `<span class="age">${x.updates ? `${esc(ago(x.receivedAt))} · ${x.updates}×${x.via === "owner" ? " typed" : ""}` : "never sent"}</span>` : "";
    return `<td class="mcell ${staleKeys.has(c.key) ? "stale" : ""}" data-hist="${esc(e.id)}|${esc(c.key)}">${body}${sub}</td>`;
  }

  function detail(e, span) {
    const parts = e.alerts.map(a => {
      let more = "";
      if (a.type === "stale") more = a.stats.map(s => `<code>${esc(s.key)}</code> ${s.never ? "never sent" : esc(ago(s.since))}`).join(", ");
      if (a.type === "rejected") more = a.rejects.slice().reverse().map(r => `${esc(new Date(r.at).toLocaleString())}: ${esc(r.kind)} via ${esc(r.via)}, <b>${esc(r.code)}</b>${r.field ? ` at <code>${esc(r.field)}</code>` : ""}${r.key ? ` (<code>${esc(r.key)}</code>)` : ""}`).join("<br>");
      return `<p><span class="monalert">${esc(ALERT_NAMES[a.type] || a.type)}</span> ${esc(a.detail)}${more ? `<br><span class="tag">${more}</span>` : ""}</p>`;
    });
    const custom = e.custom.length ? `<p class="tag">Custom stats: ${e.custom.map(c => `<code>${esc(c.key)}</code> ${c.shown ? esc(short(c, c.value)) : `🔒 ${esc(c.visibility)}`} (${c.updates ? esc(ago(c.receivedAt)) : "never sent"})`).join(" · ")}</p>` : "";
    return `<tr class="mdetail"><td colspan="${span}">${parts.join("") || `<p class="tag">No alerts.</p>`}${custom}
      <p class="tag">Owner ${esc(e.owner || "?")} · ${e.calls} call${e.calls === 1 ? "" : "s"} · last call ${esc(ago(e.lastCallAt))} · last stat ${esc(ago(e.lastStatAt))} · <a href="card?e=${encodeURIComponent(e.slug)}">card</a></p></td></tr>`;
  }

  function render() {
    const d = S.data, s = d.summary;
    const btn = (key, n, label) => `<button type="button" data-sum="${key}" class="${n && key !== "" ? "warn" : ""}" aria-pressed="${$("fAlert").value === key}"><b>${n}</b>${label}</button>`;
    $("summary").innerHTML = btn("", s.entrants, "entrants") + btn("quiet", s.quiet, "quiet") + btn("stale", s.stale, "with stale stats") + btn("rejected", s.rejected, "with refused pushes");
    $("globalAlerts").innerHTML = d.alerts.map(a => `<p class="tag"><span class="monalert">${esc(a.type)}</span> ${esc(a.detail)}. Enter them on <a href="metrics">/metrics</a>.</p>`).join("");
    const cats = [...new Set(d.columns.map(c => c.category))], cur = $("fCat").value;
    $("fCat").innerHTML = `<option value="">All</option>${cats.map(c => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join("")}`;
    const cols = columns(), list = entrants(), span = cols.length + 1;
    const groups = [];
    for (const c of cols) { const g = groups[groups.length - 1]; if (g && g.name === c.category) g.n++; else groups.push({ name: c.category, n: 1 }); }
    $("table").innerHTML = `<thead><tr class="mongrp"><th class="ment"></th>${groups.map(g => `<th colspan="${g.n}">${esc(g.name)}</th>`).join("")}</tr>
      <tr><th class="ment">Entrant</th>${cols.map(c => `<th data-sortkey="${esc(c.key)}" title="${esc(c.key)} · ${c.source === "verified" ? "verified" : "self-reported"}${c.source === "verified" ? "" : " · click to sort by last update"}">${esc(c.label)}${S.sortKey === c.key ? " ▼" : ""}</th>`).join("")}</tr></thead>
      <tbody>${list.length ? list.map(e => `<tr><td class="ment" data-open="${esc(e.id)}"><b>${esc(e.name)}</b> <span class="tag">${esc(kindName(e.kind))}${e.status !== "active" ? ` · ${esc(e.status)}` : ""}</span>
          <span class="age">${esc(e.owner || "")} · active ${esc(ago(e.lastActivity))}</span>${e.alerts.map(a => `<span class="monalert">${esc(ALERT_NAMES[a.type] || a.type)}</span>`).join("")}</td>${cols.map(c => cell(e, c)).join("")}</tr>
        ${S.open.has(e.id) ? detail(e, span) : ""}`).join("") : `<tr><td colspan="${span}" class="empty">Nobody matches.</td></tr>`}</tbody>`;
    const st = d.settings;
    if (document.activeElement?.closest("#setForm") == null) { $("sQuiet").value = st.quietHours; $("sStale").value = st.staleDays; $("sRej").value = st.rejectHours; }
  }

  async function load() {
    S.data = await api("GET", "monitor");
    render();
  }

  async function showHistory(id, key) {
    const e = S.data.entrants.find(x => x.id === id);
    try {
      const h = await api("GET", `monitor/entrants/${id}/stats/${key}`);
      $("histTitle").textContent = `${e ? e.name : id} · ${h.label}`;
      $("hist").innerHTML = h.note ? `<p class="tag">${esc(h.note)}</p>`
        : `${h.shown ? "" : `<p class="tag">🔒 The owner keeps this stat ${esc(h.visibility)}, so only the times are shown.</p>`}
          ${h.history.length ? `<div class="tablewrap"><table class="mgrid"><thead><tr><th>As of</th><th>Received</th><th>How</th>${h.shown ? "<th>Value</th>" : ""}</tr></thead><tbody>${h.history.map(x => `<tr><td>${esc(new Date(x.asOf).toLocaleString())}</td><td>${esc(new Date(x.receivedAt).toLocaleString())}</td><td>${x.via === "owner" ? "typed on /my" : "bot key"}</td>${h.shown ? `<td><code>${esc(JSON.stringify(x.value))}</code></td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<p class="empty">Never sent.</p>`}`;
      $("histBox").hidden = false;
      $("histBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (x) { msg(x.message); }
  }

  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-sum],[data-open],[data-sortkey],[data-hist]");
    if (!t) return;
    if (t.dataset.sum !== undefined) { $("fAlert").value = t.dataset.sum; render(); return; }
    if (t.dataset.open) { const id = t.dataset.open; S.open.has(id) ? S.open.delete(id) : S.open.add(id); render(); return; }
    if (t.dataset.sortkey) { const k = t.dataset.sortkey; S.sortKey = S.sortKey === k ? null : k; render(); return; }
    if (t.dataset.hist) { const [id, key] = t.dataset.hist.split("|"); showHistory(id, key); }
  });
  for (const id of ["fKind", "fCat", "fSrc", "fAlert"]) $(id).addEventListener("change", render);
  $("fSort").addEventListener("change", () => { S.sortKey = null; render(); });
  $("fText").addEventListener("input", render);

  $("setForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    try {
      await api("PUT", "monitor/settings", { quietHours: +$("sQuiet").value, staleDays: +$("sStale").value, rejectHours: +$("sRej").value });
      document.activeElement?.blur();
      msg("Alert limits saved.", true);
      await load();
    } catch (x) { msg(x.message); }
  });

  (async () => {
    const me = await session();
    if (!me || (me.role !== "admin" && me.role !== "owner")) { $("denied").hidden = false; return; }
    try {
      await load();
      $("monBox").hidden = $("setBox").hidden = false;
      let t = null;
      const refresh = () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 500); };
      follow(["admin:monitor", "catalog"], refresh, on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
      setInterval(() => load().catch(() => {}), 60000); // ages and quiet alerts move on with the clock
    } catch (x) { msg(x.message); }
  })();
})();
