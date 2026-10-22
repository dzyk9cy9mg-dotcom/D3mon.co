// /tournaments: the hourly, daily, weekly and monthly standings, live. Thin client over
// GET /api/v1/tournaments, GET /api/v1/tournaments/:id and the "tournaments" feed topic.
(function () {
  "use strict";
  const { api, follow, esc, session, when: whenAt } = window.Arena;
  const $ = id => document.getElementById(id);
  const KINDS = [["hourly", "Hourly"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
  const S = { current: null, kind: "daily", id: null, t: null, admin: false, adminView: null };

  function msg(text) { $("msg").textContent = text || ""; }
  const tz = { timeZone: "America/New_York" };
  const fmt = (ms, o) => new Date(ms).toLocaleString(undefined, { ...tz, ...o });
  const pct = v => (v === null ? "–" : `${Math.round(v * 1000) / 10}%`);
  const dur = ms => { if (ms === null) return "–"; const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
  const left = ms => { const m = Math.max(0, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`; };

  function when(t) {
    const day = { weekday: "short", month: "short", day: "numeric" }, time = { hour: "numeric", minute: "2-digit" };
    const span = t.kind === "hourly" ? `${fmt(t.startsAt, day)}, ${fmt(t.startsAt, time)}–${fmt(t.endsAt, { ...time, timeZoneName: "short" })}`
      : t.kind === "daily" ? fmt(t.startsAt, { weekday: "long", month: "long", day: "numeric" })
      : t.kind === "weekly" ? `${fmt(t.startsAt, day)} – ${fmt(t.endsAt - 1, day)}`
      : fmt(t.startsAt, { month: "long", year: "numeric" });
    const state = t.status === "live" ? `Live · ends in <b data-ends="${t.endsAt}">${left(t.endsAt - Date.now())}</b>`
      : t.status === "scoring" ? "<b>Ended</b> · the last rounds are settling" : "<b>Final</b>";
    return `${esc(span)} · ${state} · ${t.settledRounds} of ${t.rounds} rounds scored${t.corrected ? `<br><span class="tag">${esc(t.correctedNote)}</span>` : ""}`;
  }

  function render() {
    $("kinds").innerHTML = KINDS.map(([k, name]) => `<button type="button" data-kind="${k}" aria-pressed="${k === S.kind}">${name}</button>`).join("");
    const t = S.t;
    if (!t) return;
    $("tTitle").textContent = t.title;
    $("tWhen").innerHTML = when(t);
    $("scoring").textContent = t.scoring;
    $("notice").textContent = t.notice;
    $("next").hidden = !t.next;
    $("pausedBox").hidden = !t.paused;
    if (t.paused) $("pausedText").textContent = `Since ${fmt(t.paused.since, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}: ${t.paused.reason}. Rounds during a pause count for nobody.`;
    $("now").hidden = t.status === "live";
    $("rows").innerHTML = t.standings.length ? t.standings.map(r => `<tr${r.rank === 1 && r.correct ? ' class="lead"' : ""}>
        <td class="trank">${r.rank}</td>
        <td><a href="card?e=${encodeURIComponent(r.entrant.slug)}"><b>${esc(r.entrant.name)}</b></a> <span class="tag">${r.entrant.kind === "script" ? "script" : "bot"} · by ${esc(r.entrant.creatorName)}</span></td>
        <td><b>${r.correct}</b></td><td>${pct(r.accuracy)}</td><td>${r.calls}</td><td>${r.missed}</td><td>${dur(r.avgLeadMs)}</td><td class="${r.paperPerContract > 0 ? "pos" : r.paperPerContract < 0 ? "neg" : ""}">${r.paperPerContract === null || r.paperPerContract === undefined ? "–" : `${r.paperPerContract > 0 ? "+" : r.paperPerContract < 0 ? "−" : ""}$${Math.abs(r.paperPerContract).toFixed(2)}`}</td>
        ${S.admin ? `<td><button class="btn ghost sm" type="button" data-remove="${esc(r.entrant.id)}|${esc(r.entrant.name)}">Remove</button></td>` : ""}</tr>`).join("")
      : `<tr><td colspan="9" class="empty">The field is open. Enter your bot or script from <a href="my">My bots</a>.</td></tr>`;
  }

  function renderAdmin() {
    const a = S.adminView;
    $("adminBox").hidden = !S.admin || !a;
    if (!a) return;
    $("pauseBtn").textContent = a.paused ? "Resume all tournaments" : "Pause all tournaments";
    $("pauseReason").closest(".field").hidden = !!a.paused;
    $("removed").innerHTML = a.removed.length ? a.removed.map(x => `<div class="item"><div class="top"><b>${esc(x.entrant.name)}</b><span class="meta">${esc(x.entrant.kind)} · by ${esc(x.entrant.creatorName)} · removed ${esc(whenAt(x.at))}: ${esc(x.reason)}</span>
        <button class="btn ghost sm" type="button" data-restore="${esc(x.entrant.id)}" style="margin-left:auto">Restore</button></div></div>`).join("") : `<p class="empty">No bots removed.</p>`;
  }
  async function loadAdmin() {
    if (!S.admin) return;
    try { S.adminView = await api("GET", "tournaments/admin"); } catch (e) { S.adminView = null; }
    renderAdmin();
  }

  $("pauseForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const paused = !(S.adminView && S.adminView.paused);
    if (!paused && !confirm("Resume all tournaments? Rounds count again from the next round.")) return;
    try {
      await api("PUT", "tournaments/pause", paused ? { paused, reason: $("pauseReason").value } : { paused });
      $("pauseReason").value = "";
      await Promise.all([loadAdmin(), S.id && show(S.id)]);
      msg(paused ? "Tournaments paused." : "Tournaments resume from the next round.");
    } catch (e) { msg(e.message); }
  });

  async function show(id) {
    try {
      S.t = (await api("GET", `tournaments/${id}`)).tournament;
      S.id = id;
      S.kind = S.t.kind;
      render();
    } catch (e) { msg(e.message); }
  }

  async function loadCurrent() {
    S.current = await api("GET", "tournaments");
    return S.current.tournaments.find(t => t.kind === S.kind).id;
  }

  document.addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.kind) { msg(""); S.kind = b.dataset.kind; await show(await loadCurrent()); history.replaceState(null, "", `?t=${S.kind}`); return; }
    if (b.id === "prev" && S.t) return show(S.t.previous);
    if (b.id === "next" && S.t && S.t.next) return show(S.t.next);
    if (b.id === "now") return show(await loadCurrent());
    if (b.dataset.remove) {
      const [id, name] = b.dataset.remove.split("|");
      const reason = prompt(`Remove ${name} from the tournaments, from the round in progress? Its owner sees this reason:`);
      if (reason === null) return;
      try { await api("PUT", `entrants/${id}/tournaments/removal`, { removed: true, reason }); await Promise.all([loadAdmin(), show(S.id)]); msg(`${name} removed.`); } catch (e) { msg(e.message); }
      return;
    }
    if (b.dataset.restore) {
      if (!confirm("Restore this bot? It counts again from the next round, once its owner has it joined.")) return;
      try { await api("PUT", `entrants/${b.dataset.restore}/tournaments/removal`, { removed: false }); await Promise.all([loadAdmin(), show(S.id)]); msg("Restored."); } catch (e) { msg(e.message); }
    }
  });

  // Countdown, and moving on to the next tournament when the one on screen ends.
  setInterval(() => {
    document.querySelectorAll("[data-ends]").forEach(el => (el.textContent = left(+el.dataset.ends - Date.now())));
    if (S.t && S.t.status === "live" && Date.now() >= S.t.endsAt) loadCurrent().then(show).catch(() => {});
  }, 1000);

  (async () => {
    const q = new URLSearchParams(location.search).get("t") || "";
    if (KINDS.some(([k]) => k === q)) S.kind = q;
    const me = await session();
    S.admin = !!me && (me.role === "admin" || me.role === "owner");
    if (S.admin) document.querySelector(".tstand thead tr").insertAdjacentHTML("beforeend", "<th></th>");
    render();
    loadAdmin();
    try {
      await show(/^(hourly|daily|weekly|monthly)-/.test(q) ? q : await loadCurrent());
    } catch (e) { msg(e.message); }
    let t = null;
    follow(["tournaments"], () => { clearTimeout(t); t = setTimeout(() => { if (S.id) show(S.id); loadAdmin(); }, 400); },
      on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
  })();
})();
