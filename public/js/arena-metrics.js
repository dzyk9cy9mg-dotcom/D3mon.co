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
  const money = v => v === null || v === undefined ? "–" : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;
  const secs = ms => ms === null || ms === undefined ? "–" : `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)} s`;

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
      rows[p.id] = s ? { call: s.call || null, correct: s.correct ?? null, speed: s.speedMs !== undefined ? String(s.speedMs / 1000) : "", profit: s.profit !== undefined ? String(s.profit) : "" }
        : { call: null, correct: null, speed: "", profit: "" };
    }
    S.draft = { result: r.result, rows };
    S.dirty = false;
  }

  const isEmpty = d => !d.call && d.correct === null && d.speed.trim() === "" && d.profit.trim() === "";
  function rowChanged(id) {
    const d = S.draft.rows[id], s = saved(id);
    if (!s) return !isEmpty(d);
    return d.call !== (s.call || null) || d.correct !== (s.correct ?? null) || d.speed.trim() !== (s.speedMs !== undefined ? String(s.speedMs / 1000) : "") || d.profit.trim() !== (s.profit !== undefined ? String(s.profit) : "");
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
    $("rows").innerHTML = people().map(p => {
      const d = S.draft.rows[p.id], s = saved(p.id);
      const seg = (attr, opts) => `<span class="seg2" role="group">${opts.map(([v, cls, label]) => `<button type="button" class="${cls}" data-${attr}="${esc(p.id)}|${v}" aria-pressed="${String(d[attr === "call" ? "call" : "correct"] === (attr === "ok" ? v === "true" : v))}">${label}</button>`).join("")}</span>`;
      const note = s && s.mismatch ? `<span class="warn">Doesn't match the result</span>` : p.left ? `<span class="tag">left the lineup</span>` : s ? `<span class="tag">recorded</span>` : "";
      return `<tr class="${rowChanged(p.id) ? "changed" : ""}"><td><b>${esc(p.name)}</b></td>
        <td>${seg("call", [["up", "up", "▲"], ["down", "down", "▼"]])}</td>
        <td>${seg("ok", [["true", "ok", "✓"], ["false", "no", "✗"]])}</td>
        <td><input type="number" min="0" step="0.1" inputmode="decimal" data-speed="${esc(p.id)}" value="${esc(d.speed)}" aria-label="Speed for ${esc(p.name)}"></td>
        <td><input type="number" step="0.01" inputmode="decimal" data-profit="${esc(p.id)}" value="${esc(d.profit)}" aria-label="Profit for ${esc(p.name)}"></td>
        <td>${note}</td></tr>`;
    }).join("") || `<tr><td colspan="6" class="empty">Nobody is in this battle's lineup yet. Approve applications first.</td></tr>`;
    const n = people().filter(p => rowChanged(p.id)).length + (S.draft.result !== r.result ? 1 : 0);
    $("dirty").textContent = n ? `${n} unsaved change${n === 1 ? "" : "s"}` : "Everything is saved.";
  }

  function renderTotals() {
    $("totals").innerHTML = S.view.totals.map(t => `<tr><td><b>${esc(t.name)}</b>${t.inLineup ? "" : ' <span class="tag">left the lineup</span>'}</td><td>${t.right}</td><td>${t.wrong}</td><td>${t.recorded}</td><td>${esc(secs(t.avgSpeedMs))}</td><td>${esc(money(t.profit))}</td></tr>`).join("")
      || `<tr><td colspan="6" class="empty">No entrants yet.</td></tr>`;
    const names = Object.fromEntries(S.view.totals.map(t => [t.entrantId, t.name]));
    $("history").innerHTML = (S.view.history || []).slice().reverse().map(l => {
      const what = l.t === "score" ? `Round ${fmtTime(l.round)} result: ${l.result === "up" ? "▲ up" : "▼ down"}`
        : `${esc(names[l.entrantId] || l.entrantId)}, round ${fmtTime(l.round)}: ${l.void ? "cleared" : [l.call && (l.call === "up" ? "▲ up" : "▼ down"), l.correct === true ? "right" : l.correct === false ? "wrong" : "", l.speedMs !== undefined ? secs(l.speedMs) : "", l.profit !== undefined ? money(l.profit) : ""].filter(Boolean).join(", ")}`;
      return `<div class="item"><div class="meta">${esc(when(l.at))} · ${esc(l.byName || "?")} · ${l.t === "score" ? what : what}</div></div>`;
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
    if (d.speed) S.draft.rows[d.speed].speed = ev.target.value;
    else if (d.profit) S.draft.rows[d.profit].profit = ev.target.value;
    else return;
    S.dirty = true;
    const tr = ev.target.closest("tr");
    if (tr) tr.classList.toggle("changed", rowChanged(d.speed || d.profit));
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
      if (d.profit.trim() !== "") {
        const v = Number(d.profit);
        if (!Number.isFinite(v)) return msg(`${p.name}: profit is a dollar amount, like 0.42 or -1.50.`);
        e.profit = v;
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

  (async () => {
    const me = await session();
    if (!me || (me.role !== "admin" && me.role !== "owner")) { $("denied").hidden = false; return; }
    $("pickBox").hidden = false;
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
