// /metrics: HardSmoke records a whole round for the lineup at once (the manual fallback for scoring).
// Thin client over GET /api/v1/battles/:id/metrics and PUT /api/v1/battles/:id/rounds/:round/metrics.
(function () {
  "use strict";
  const { api, follow, esc, when, session } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { battles: [], battle: null, view: null, idx: null, draft: null, dirty: false, es: null };

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }
  const fmtTime = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const none = v => v === null || v === undefined;
  const money = v => none(v) ? "–" : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;
  // Up to 4 decimal places, dropping trailing zeros down to cents: 0.58, 0.123, 0.1235.
  const perContract = v => none(v) ? "–" : `${v < 0 ? "−" : "+"}$${Math.abs(v).toFixed(4).replace(/0{1,2}$/, "")}/contract`;
  const percent = v => none(v) ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%`;
  const secs = ms => none(ms) ? "–" : `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)} s`;

  // The three ways to record profit. Any, all or none can be used for an entry. `total` is the field in
  // the battle record: dollars and per-contract profit add up, a percent return is averaged per round.
  const PROFITS = [
    { k: "profitUsd", label: "Profit ($)", total: "profitUsd", totalLabel: "Profit ($)", step: "0.01", fmt: money, hint: "a dollar amount, like 0.42 or -1.50" },
    { k: "profitPerContract", label: "Per $1 contract", total: "profitPerContract", totalLabel: "Per $1 contract", step: "0.01", fmt: perContract, hint: "dollars per $1 contract, from -1 to 1, like 0.42" },
    { k: "profitPct", label: "Return (%)", total: "avgProfitPct", totalLabel: "Avg return", step: "0.1", fmt: percent, hint: "a percent return, like 72.4 or -100" },
  ];
  const UNITS_KEY = "d3mon.metrics.units";
  let chosen;
  try { chosen = new Set(JSON.parse(localStorage.getItem(UNITS_KEY)).filter(k => PROFITS.some(u => u.k === k))); } catch (e) { chosen = new Set(["profitUsd"]); }
  // A unit with entries anywhere in this battle is always shown, so no recorded figure is ever hidden.
  const usedUnits = () => new Set(PROFITS.filter(u => S.view.rounds.some(r => r.entries.some(e => e[u.k] !== undefined))).map(u => u.k));
  const shown = () => { const used = usedUnits(); return PROFITS.filter(u => chosen.has(u.k) || used.has(u.k)); };
  const fromSaved = (s, k) => s && s[k] !== undefined ? String(s[k]) : "";

  // Everyone who belongs on this round's grid: the lineup, plus anyone with a recorded entry.
  function people() {
    const r = S.view.rounds[S.idx], out = S.battle.entrants.map(e => ({ id: e.id, name: e.name }));
    for (const en of r.entries) if (!out.some(p => p.id === en.entrantId)) out.push({ id: en.entrantId, name: en.name, left: true });
    return out;
  }
  const saved = id => S.view.rounds[S.idx].entries.find(e => e.entrantId === id) || null;

  function resetDraft() {
    const r = S.view.rounds[S.idx], rows = {};
    for (const p of people()) {
      const s = saved(p.id);
      rows[p.id] = { call: s?.call || null, correct: s?.correct ?? null, speed: s && s.speedMs !== undefined ? String(s.speedMs / 1000) : "" };
      for (const u of PROFITS) rows[p.id][u.k] = fromSaved(s, u.k);
    }
    S.draft = { result: r.result, rows };
    S.dirty = false;
  }

  const isEmpty = d => !d.call && d.correct === null && d.speed.trim() === "" && PROFITS.every(u => d[u.k].trim() === "");
  function rowChanged(id) {
    const d = S.draft.rows[id], s = saved(id);
    if (!s) return !isEmpty(d);
    return d.call !== (s.call || null) || d.correct !== (s.correct ?? null) || d.speed.trim() !== (s.speedMs !== undefined ? String(s.speedMs / 1000) : "")
      || PROFITS.some(u => d[u.k].trim() !== fromSaved(s, u.k));
  }

  // With a result and a call, right or wrong follows.
  function derive(id) {
    const d = S.draft.rows[id];
    if (S.draft.result && d.call) d.correct = d.call === S.draft.result;
  }

  function renderRounds() {
    const b = S.battle, now = Date.now();
    $("rounds").innerHTML = S.view.rounds.map(r => `<button type="button" data-idx="${r.index}" aria-pressed="${r.index === S.idx}" class="${r.result || r.entries.length ? "done" : ""}" ${r.over ? "" : "disabled title=\"Not finished yet\""}>${r.index + 1} · ${esc(fmtTime(r.round))}</button>`).join("");
    if (b.startsAt > now) $("rounds").insertAdjacentHTML("beforeend", `<span class="tag">Starts ${esc(when(b.startsAt))}</span>`);
  }

  function renderRound() {
    const r = S.view.rounds[S.idx];
    $("roundBox").hidden = !r || !r.over;
    if (!r || !r.over) return;
    $("roundTitle").textContent = `Round ${r.index + 1} · ${fmtTime(r.round)}–${fmtTime(r.endsAt)}`;
    document.querySelectorAll("[data-result]").forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.result === S.draft.result)));
    $("resultSrc").textContent = r.resultSource === "kalshi" ? "Settled by Kalshi" : r.result ? "Recorded by host" : "Not recorded yet";
    document.querySelectorAll("[data-result]").forEach(btn => (btn.disabled = r.resultSource === "kalshi"));
    const units = shown(), used = usedUnits();
    $("units").innerHTML = PROFITS.map(u => `<label title="${used.has(u.k) ? "This battle has entries in this unit, so it's always shown" : ""}"><input type="checkbox" data-unit="${u.k}" ${units.includes(u) ? "checked" : ""} ${used.has(u.k) ? "disabled" : ""}> ${esc(u.label)}</label>`).join("");
    $("rowsHead").innerHTML = `<tr><th>Entrant</th><th>Call</th><th>Right?</th><th>Speed (s before lock)</th>${units.map(u => `<th>${esc(u.label)}</th>`).join("")}<th></th></tr>`;
    $("rows").innerHTML = people().map(p => {
      const d = S.draft.rows[p.id], s = saved(p.id);
      const seg = (attr, opts) => `<span class="seg2" role="group">${opts.map(([v, cls, label]) => `<button type="button" class="${cls}" data-${attr}="${esc(p.id)}|${v}" aria-pressed="${String(d[attr === "call" ? "call" : "correct"] === (attr === "ok" ? v === "true" : v))}">${label}</button>`).join("")}</span>`;
      const note = s && s.mismatch ? `<span class="warn">Doesn't match the result</span>` : p.left ? `<span class="tag">left the lineup</span>` : s ? `<span class="tag">recorded</span>` : "";
      return `<tr class="${rowChanged(p.id) ? "changed" : ""}"><td><b>${esc(p.name)}</b></td>
        <td>${seg("call", [["up", "up", "▲"], ["down", "down", "▼"]])}</td>
        <td>${seg("ok", [["true", "ok", "✓"], ["false", "no", "✗"]])}</td>
        <td><input type="number" min="0" step="0.1" inputmode="decimal" data-speed="${esc(p.id)}" value="${esc(d.speed)}" aria-label="Speed for ${esc(p.name)}"></td>
        ${units.map(u => `<td><input type="number" step="${u.step}" inputmode="decimal" data-profit="${esc(p.id)}|${u.k}" value="${esc(d[u.k])}" aria-label="${esc(u.label)} for ${esc(p.name)}"></td>`).join("")}
        <td>${note}</td></tr>`;
    }).join("") || `<tr><td colspan="${5 + units.length}" class="empty">Nobody is in this battle's lineup yet. Approve applications first.</td></tr>`;
    const n = people().filter(p => rowChanged(p.id)).length + (S.draft.result !== r.result ? 1 : 0);
    $("dirty").textContent = n ? `${n} unsaved change${n === 1 ? "" : "s"}` : "Everything is saved.";
  }

  function renderTotals() {
    const units = shown();
    $("totalsHead").innerHTML = `<tr><th>Entrant</th><th>Right</th><th>Wrong</th><th>Rounds recorded</th><th>Avg speed</th>${units.map(u => `<th>${esc(u.totalLabel)}</th>`).join("")}</tr>`;
    $("totals").innerHTML = S.view.totals.map(t => `<tr><td><b>${esc(t.name)}</b>${t.inLineup ? "" : ' <span class="tag">left the lineup</span>'}</td><td>${t.right}</td><td>${t.wrong}</td><td>${t.recorded}</td><td>${esc(secs(t.avgSpeedMs))}</td>${units.map(u => `<td>${esc(u.fmt(t[u.total]))}</td>`).join("")}</tr>`).join("")
      || `<tr><td colspan="${5 + units.length}" class="empty">No entrants yet.</td></tr>`;
    const names = Object.fromEntries(S.view.totals.map(t => [t.entrantId, t.name]));
    $("history").innerHTML = (S.view.history || []).slice().reverse().map(l => {
      const what = l.t === "score" ? `Round ${fmtTime(l.round)} result: ${l.result === "up" ? "▲ up" : "▼ down"}`
        : `${esc(names[l.entrantId] || l.entrantId)}, round ${fmtTime(l.round)}: ${l.void ? "cleared" : [l.call && (l.call === "up" ? "▲ up" : "▼ down"), l.correct === true ? "right" : l.correct === false ? "wrong" : "", l.speedMs !== undefined ? secs(l.speedMs) : "", ...PROFITS.map(u => l[u.k] !== undefined ? u.fmt(l[u.k]) : "")].filter(Boolean).join(", ")}`;
      return `<div class="item"><div class="meta">${esc(when(l.at))} · ${esc(l.byName || "?")} · ${what}</div></div>`;
    }).join("") || `<p class="empty">Nothing recorded yet.</p>`;
  }

  function render() {
    renderRounds();
    renderRound();
    renderTotals();
  }

  async function loadView(keepIdx) {
    const [b, v] = await Promise.all([api("GET", `battles/${S.battle.id}`), api("GET", `battles/${S.battle.id}/metrics?history=1`)]);
    S.battle = b.battle;
    S.view = v;
    const over = v.rounds.filter(r => r.over);
    if (!keepIdx || S.idx === null || !v.rounds[S.idx] || !v.rounds[S.idx].over) S.idx = over.length ? over[over.length - 1].index : 0;
    resetDraft();
    render();
  }

  function follow1() {
    if (S.es) S.es.close();
    S.es = follow(["battles", `battle:${S.battle.id}`], type => {
      if (type !== "round.metrics") return;
      if (S.dirty) msg("Someone saved changes to this battle. Save yours, or switch rounds to load theirs.");
      else loadView(true).catch(() => {});
    }, on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
  }

  async function pickBattle(id) {
    S.battle = S.battles.find(b => b.id === id);
    $("roundBox").hidden = $("totalsBox").hidden = $("histBox").hidden = !S.battle;
    if (!S.battle) return;
    await loadView(false);
    $("totalsBox").hidden = $("histBox").hidden = false;
    follow1();
  }

  function mark() {
    S.dirty = true;
    renderRound();
  }

  document.addEventListener("click", ev => {
    const t = ev.target.closest("button");
    if (!t) return;
    const d = t.dataset;
    if (d.idx !== undefined) {
      if (S.dirty && !confirm("Discard your unsaved changes to this round?")) return;
      S.idx = +d.idx; resetDraft(); msg(""); render(); return;
    }
    if (d.result) {
      S.draft.result = S.draft.result === d.result ? S.view.rounds[S.idx].result : d.result;
      Object.keys(S.draft.rows).forEach(derive);
      return mark();
    }
    if (d.call) {
      const [id, v] = d.call.split("|"), row = S.draft.rows[id];
      row.call = row.call === v ? null : v;
      if (!row.call) row.correct = null;
      derive(id);
      return mark();
    }
    if (d.ok) {
      const [id, v] = d.ok.split("|"), row = S.draft.rows[id], val = v === "true";
      row.correct = row.correct === val ? null : val;
      return mark();
    }
  });

  document.addEventListener("input", ev => {
    const d = ev.target.dataset;
    let id;
    if (d.speed) S.draft.rows[(id = d.speed)].speed = ev.target.value;
    else if (d.profit) { const [pid, k] = d.profit.split("|"); S.draft.rows[(id = pid)][k] = ev.target.value; }
    else return;
    S.dirty = true;
    const tr = ev.target.closest("tr");
    if (tr) tr.classList.toggle("changed", rowChanged(id));
  });

  // Which profit columns to show is a per-viewer preference, remembered in this browser only.
  document.addEventListener("change", ev => {
    const k = ev.target.dataset && ev.target.dataset.unit;
    if (!k) return;
    if (ev.target.checked) chosen.add(k); else chosen.delete(k);
    try { localStorage.setItem(UNITS_KEY, JSON.stringify([...chosen])); } catch (e) {}
    renderRound();
    renderTotals();
  });

  $("battleSel").addEventListener("change", () => {
    if (S.dirty && !confirm("Discard your unsaved changes?")) { $("battleSel").value = S.battle.id; return; }
    msg("");
    pickBattle($("battleSel").value).catch(e => msg(e.message));
  });

  $("save").addEventListener("click", async () => {
    const r = S.view.rounds[S.idx], entries = [];
    for (const p of people()) {
      if (!rowChanged(p.id)) continue;
      const d = S.draft.rows[p.id];
      if (isEmpty(d)) { entries.push({ entrantId: p.id, void: true }); continue; }
      const e = { entrantId: p.id };
      if (d.call) e.call = d.call;
      if (d.correct !== null) e.correct = d.correct;
      if (d.speed.trim() !== "") {
        const s = Number(d.speed);
        if (!Number.isFinite(s) || s < 0) return msg(`${p.name}: speed is a number of seconds, 0 or more.`);
        e.speedMs = Math.round(s * 1000);
      }
      for (const u of PROFITS) {
        if (d[u.k].trim() === "") continue;
        const v = Number(d[u.k]);
        if (!Number.isFinite(v)) return msg(`${p.name}: ${u.label} is ${u.hint}.`);
        e[u.k] = v;
      }
      if (e.correct === undefined) return msg(`${p.name}: mark the call right or wrong, or pick the round result.`);
      entries.push(e);
    }
    const body = { entries };
    if (S.draft.result && S.draft.result !== r.result) body.result = S.draft.result;
    if (!entries.length && !body.result) return msg("Nothing to save.");
    $("save").disabled = true;
    try {
      await api("PUT", `battles/${S.battle.id}/rounds/${r.round}/metrics`, body);
      S.dirty = false;
      msg(`Round ${r.index + 1} saved.`, true);
      await loadView(true);
    } catch (e) {
      msg(e.message);
    } finally {
      $("save").disabled = false;
    }
  });

  window.addEventListener("beforeunload", e => { if (S.dirty) e.preventDefault(); });

  // Kalshi settles rounds automatically (step 5). Say whether it's working, and which rounds still need a result by hand.
  async function kalshiState() {
    try {
      const k = (await api("GET", "kalshi")).kalshi;
      const last = k.lastOkAt ? `last checked ${fmtTime(k.lastOkAt)}` : "not checked yet";
      const trouble = k.consecutiveErrors ? ` · can't reach Kalshi (${k.lastError})` : "";
      const missing = k.missing.length ? ` · ${k.missing.length} round${k.missing.length > 1 ? "s" : ""} Kalshi hasn't settled, enter by hand: ${k.missing.slice(-5).map(r => fmtTime(Date.parse(r))).join(", ")}` : "";
      $("kalshiState").textContent = (k.polling ? `Kalshi results: automatic, ${last}` : "Kalshi results: off") + trouble + missing;
    } catch (e) { $("kalshiState").textContent = ""; }
  }

  (async () => {
    const me = await session();
    if (!me || (me.role !== "admin" && me.role !== "owner")) { $("denied").hidden = false; return; }
    $("pickBox").hidden = false;
    kalshiState();
    setInterval(kalshiState, 60000);
    try {
      S.battles = (await api("GET", "battles")).battles.filter(b => b.status !== "draft");
      if (!S.battles.length) { $("battleSel").innerHTML = `<option value="">No battles yet</option>`; return; }
      $("battleSel").innerHTML = S.battles.map(b => `<option value="${esc(b.id)}">${esc(b.title)} · ${esc(b.status)}</option>`).join("");
      const pick = S.battles.find(b => b.status === "live") || S.battles.find(b => b.startsAt <= Date.now()) || S.battles[0];
      $("battleSel").value = pick.id;
      await pickBattle(pick.id);
    } catch (e) { msg(e.message); }
  })();
})();
