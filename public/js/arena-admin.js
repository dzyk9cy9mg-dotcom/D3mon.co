// /applications: HardSmoke's desk. Create battles and change their status, review the application log,
// and see saved entrants. Everything updates live from /api/v1/feed.
(function () {
  "use strict";
  const { api, follow, esc, when, kindName, session } = window.Arena;
  const $ = id => document.getElementById(id);
  const STATUSES = ["draft", "open", "closed", "live", "final"];
  // When calls close in each round: minutes in, or 0 for "before the round starts".
  const METHODS = [["owner", "each owner picks"], ["auto", "automatic (keys)"], ["manual", "buttons (by hand)"]];
  const WINDOWS = [[0, "before the round starts"], [1, "1 minute in"], [2, "2 minutes in"], [3, "3 minutes in"], [5, "5 minutes in"], [7, "7 minutes in"], [10, "10 minutes in"], [14, "14 minutes in"], [15, "any time during the round"]];
  let battles = [], apps = [], entrants = [];

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }
  const battleTitle = id => id === null ? "Join D3MON (no battle)" : (battles.find(b => b.id === id) || {}).title || "(unknown battle)";

  function renderBattles() {
    $("battles").innerHTML = battles.length ? battles.map(b => {
      const counts = Object.entries(b.applications || {}).map(([k, n]) => `${n} ${k}`).join(" · ") || "no applications";
      return `<div class="item"><div class="top"><span class="st ${esc(b.state)}">${esc(b.state)}</span><b>${esc(b.title)}</b>
        <select data-bstatus="${esc(b.id)}" aria-label="Status of ${esc(b.title)}" style="width:auto;margin-left:auto">${STATUSES.map(s => `<option ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="meta">${b.over && b.state === "over" ? `Over: its last round ended. Its status is still “${esc(b.status)}”. ` : ""}${esc(when(b.startsAt))} · ${b.rounds} rounds · ${b.kinds.map(kindName).join(", ")} · ${esc(counts)}</div>
        <label class="meta">Calls close <select data-bwin="${esc(b.id)}" aria-label="When calls close in ${esc(b.title)}" style="width:auto">${WINDOWS.map(([m, t]) => `<option value="${m}" ${m === b.callWindowMin ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="meta">Bots call <select data-bmethod="${esc(b.id)}" aria-label="How bots and scripts call in ${esc(b.title)}" style="width:auto">${METHODS.map(([m, t]) => `<option value="${m}" ${m === (b.callMethod || "owner") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <div class="meta">Lineup: ${b.entrants.length ? b.entrants.map(e => esc(e.name)).join(", ") : "nobody approved yet"}</div>
        ${b.status === "draft" ? "" : `<label class="checks"><input type="checkbox" data-mainpage="${esc(b.id)}" ${b.onMainPage ? "checked" : ""}> Show this lineup on the main page's Battle of the Bots roster${b.onMainPage ? " (on: lineup changes are copied there live)" : ""}</label>`}</div>`;
    }).join("") : `<p class="empty">No battles yet. Create the first one above.</p>`;
    const cur = $("fBattle").value;
    $("fBattle").innerHTML = `<option value="">Everything</option><option value="join">Join D3MON (no battle)</option>` + battles.map(b => `<option value="${esc(b.id)}">${esc(b.title)}</option>`).join("");
    $("fBattle").value = cur === "join" || battles.some(b => b.id === cur) ? cur : "";
  }

  function renderLog() {
    const fb = $("fBattle").value, fs = $("fStatus").value;
    const list = apps.filter(a => (!fb || (fb === "join" ? a.battleId === null : a.battleId === fb)) && (!fs || a.status === fs));
    $("log").innerHTML = list.length ? list.map(a => {
      const acts = a.status === "pending"
        ? `<button class="btn sm" type="button" data-review="${esc(a.id)}|approve">Approve</button><button class="btn ghost sm" type="button" data-review="${esc(a.id)}|reject">Reject</button>`
        : a.status === "approved" || a.status === "rejected" ? `<button class="btn ghost sm" type="button" data-review="${esc(a.id)}|reopen">Reopen</button>` : "";
      const hist = a.history.map(h => `${when(h.at)} ${h.action}${h.note ? ` (“${h.note}”)` : ""}`).join(" → ");
      return `<div class="item"><div class="top"><span class="st ${esc(a.status)}">${esc(a.status)}</span><b>${esc(a.name)}</b><span class="meta">${esc(kindName(a.kind))}${a.entrantId ? " · saved entrant" : " · new"} · ${esc(battleTitle(a.battleId))}</span></div>
        <div class="meta">Creator: ${esc(a.creatorName)} · Alt account: ${esc(a.altAccount || "–")} · Discord: ${esc(a.discordServer || "–")} · Site account: ${esc(a.applicantName || a.applicantId)}</div>
        ${a.notes ? `<div class="notes">${esc(a.notes)}</div>` : ""}
        <div class="meta">${esc(hist)}</div>
        ${acts ? `<div class="row"><div class="field"><input data-note="${esc(a.id)}" maxlength="500" placeholder="Note to the applicant (optional)" aria-label="Review note for ${esc(a.name)}"></div>${acts}</div>` : ""}</div>`;
    }).join("") : `<p class="empty">No applications match.</p>`;
  }

  function renderEntrants() {
    $("entrants").innerHTML = entrants.length ? entrants.map(e => `<div class="item"><div class="top"><span class="st">${esc(kindName(e.kind))}</span><b>${esc(e.name)}</b><span class="meta">by ${esc(e.creatorName)} · ${e.battles.length} battle${e.battles.length === 1 ? "" : "s"}${e.status !== "active" ? " · " + esc(e.status) : ""}</span></div></div>`).join("")
      : `<p class="empty">Approved entrants appear here and can be re-selected for future battles.</p>`;
  }

  async function load() {
    const [b, a, e] = await Promise.all([api("GET", "battles"), api("GET", "applications"), api("GET", "entrants")]);
    battles = b.battles; apps = a.applications; entrants = e.entrants;
    renderBattles(); renderLog(); renderEntrants();
  }

  $("newForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const startsAt = new Date($("bStart").value).getTime();
    if (!Number.isFinite(startsAt)) return msg("Pick a start time.");
    const kinds = [...document.querySelectorAll("input[name=kinds]:checked")].map(i => i.value);
    try {
      await api("POST", "battles", { title: $("bTitle").value, startsAt, rounds: +$("bRounds").value || 8, kinds, status: $("bStatus").value, callWindowMin: +$("bWin").value });
      ev.target.reset();
      msg("Battle created.", true);
      await load();
    } catch (e) { msg(e.message); }
  });

  document.addEventListener("change", async ev => {
    if (ev.target === $("fBattle") || ev.target === $("fStatus")) return renderLog();
    const mp = ev.target.dataset.mainpage;
    if (mp) {
      if (ev.target.checked && !confirm("Replace the main page's Battle of the Bots roster with this battle's lineup? The current roster is kept in the history.")) { ev.target.checked = false; return; }
      try { await api("PATCH", `battles/${mp}`, { onMainPage: ev.target.checked }); msg(ev.target.checked ? "This lineup is now on the main page." : "No longer copied to the main page.", true); await load(); } catch (e) { msg(e.message); await load(); }
      return;
    }
    const meth = ev.target.dataset.bmethod;
    if (meth) {
      try { await api("PATCH", `battles/${meth}`, { callMethod: ev.target.value }); msg("Saved: how bots call.", true); await load(); } catch (e) { msg(e.message); await load(); }
      return;
    }
    const win = ev.target.dataset.bwin;
    if (win) {
      try { await api("PATCH", `battles/${win}`, { callWindowMin: +ev.target.value }); msg("Saved: when calls close.", true); await load(); } catch (e) { msg(e.message); await load(); }
      return;
    }
    const id = ev.target.dataset.bstatus;
    if (!id) return;
    try { await api("PATCH", `battles/${id}`, { status: ev.target.value }); msg(`Status set to ${ev.target.value}.`, true); await load(); } catch (e) { msg(e.message); await load(); }
  });

  document.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-review]");
    if (!b) return;
    const [id, decision] = b.dataset.review.split("|");
    const note = (document.querySelector(`[data-note="${CSS.escape(id)}"]`) || {}).value || "";
    b.disabled = true;
    try { await api("POST", `applications/${id}/review`, { decision, note }); msg(decision === "approve" ? (apps.find(a => a.id === id)?.battleId === null ? "Approved. It now appears on its owner's My bots." : "Approved and added to the lineup.") : decision === "reject" ? "Rejected." : "Reopened.", true); await load(); }
    catch (e) { msg(e.message); b.disabled = false; }
  });

  (async () => {
    const me = await session();
    if (!me || (me.role !== "admin" && me.role !== "owner")) { $("denied").hidden = false; return; }
    for (const id of ["newBox", "battleBox", "logBox", "entBox"]) $(id).hidden = false;
    try { await load(); } catch (e) { msg(e.message); }
    let t = null;
    follow(["battles", "admin:applications"], () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 150); },
      on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
  })();
})();
