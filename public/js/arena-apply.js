// /apply: a member asks to join D3MON with a new bot, script or caller (no battle needed, for the
// tournaments), or applies to a battle, re-selecting a saved entrant. Applications are followed live.
(function () {
  "use strict";
  const { api, follow, esc, when, kindName, session } = window.Arena;
  const $ = id => document.getElementById(id);
  let battles = [], saved = [], mine = [];

  function msg(text, ok) {
    $("msg").textContent = text || "";
    $("msg").classList.toggle("ok", !!ok);
  }

  // Only battles still to come: once its start time has passed, a battle isn't offered here.
  const openBattles = () => battles.filter(b => b.status === "open" && b.startsAt > Date.now());

  // "join" (the default) asks to join D3MON with a new entrant; a battle id applies to that battle.
  const picked = () => (document.querySelector("input[name=battle]:checked") || {}).value || "join";

  function renderBattles() {
    const was = picked();
    $("battles").innerHTML = `<label class="pick"><input type="radio" name="battle" value="join" ${was === "join" ? "checked" : ""}>
          <span><b>Join D3MON</b><br><span class="meta">A new bot, script or caller. Once an admin approves it, it appears on My bots, where bots and scripts can join the tournaments.</span></span></label>`
      + openBattles().map(b => `<label class="pick"><input type="radio" name="battle" value="${esc(b.id)}" ${b.id === was ? "checked" : ""}>
          <span><b>${esc(b.title)}</b><br><span class="meta">Battle · ${esc(when(b.startsAt))} · ${b.rounds} rounds · open to ${b.kinds.map(kindName).join(", ").toLowerCase()} · ${b.entrants.length} approved</span></span></label>`).join("");
    syncPick();
  }

  // Joining is for new entrants only, so the saved-entrant choice is for battles.
  function syncPick() {
    const join = picked() === "join";
    $("savedField").hidden = join;
    if (join && $("saved").value) { $("saved").value = ""; $("name").disabled = $("kind").disabled = false; }
  }
  $("battles").addEventListener("change", syncPick);

  function renderSaved() {
    const cur = $("saved").value;
    $("saved").innerHTML = `<option value="">New entrant</option>` + saved.filter(e => e.status === "active").map(e => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(kindName(e.kind))})</option>`).join("");
    $("saved").value = saved.some(e => e.id === cur) ? cur : "";
  }

  function renderMine() {
    const title = id => id === null ? "Join D3MON" : (battles.find(b => b.id === id) || {}).title || "A past battle";
    $("mine").innerHTML = mine.length ? mine.map(a => `<div class="item"><div class="top"><span class="st ${esc(a.status)}">${esc(a.status)}</span><b>${esc(a.name)}</b><span class="meta">${esc(kindName(a.kind))} · ${esc(title(a.battleId))} · sent ${esc(when(a.submittedAt))}</span>
        ${a.status === "pending" || a.status === "approved" ? `<button class="btn ghost sm" type="button" data-withdraw="${esc(a.id)}">Withdraw</button>` : ""}</div>
        ${a.reviewNote ? `<div class="notes">HardSmoke: ${esc(a.reviewNote)}</div>` : ""}</div>`).join("")
      : `<p class="empty">You haven't applied yet.</p>`;
  }

  // Choosing a saved entrant fills in its details; its name and kind can't change.
  $("saved").addEventListener("change", () => {
    const e = saved.find(x => x.id === $("saved").value);
    $("name").disabled = $("kind").disabled = !!e;
    if (!e) return;
    $("name").value = e.name;
    $("kind").value = e.kind;
    $("creatorName").value = e.creatorName || "";
    $("altAccount").value = e.altAccount || "";
    $("discordServer").value = e.discordServer || "";
    $("notes").value = e.notes || "";
  });

  $("applyForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const battle = picked();
    const body = { creatorName: $("creatorName").value, altAccount: $("altAccount").value, discordServer: $("discordServer").value, notes: $("notes").value };
    if ($("saved").value) body.entrantId = $("saved").value;
    else Object.assign(body, { kind: $("kind").value, name: $("name").value });
    const btn = ev.target.querySelector("button");
    btn.disabled = true;
    msg("");
    try {
      await api("POST", battle === "join" ? "applications" : `battles/${battle}/applications`, body);
      msg("Application sent. An admin will review it, and this page shows the decision as soon as it's made.", true);
      for (const id of ["name", "altAccount", "discordServer", "notes"]) $(id).value = "";
      $("saved").value = "";
      $("name").disabled = $("kind").disabled = false;
      await load();
    } catch (e) {
      msg(e.message);
      if (e.field && $(e.field)) $(e.field).focus();
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-withdraw]");
    if (!b || !confirm("Withdraw this application? It stays in the log as withdrawn.")) return;
    try { await api("POST", `applications/${b.dataset.withdraw}/withdraw`, {}); msg("Withdrawn.", true); await load(); } catch (e) { msg(e.message); }
  });

  async function load() {
    const [b, s, m] = await Promise.all([api("GET", "battles"), api("GET", "entrants?mine=1"), api("GET", "applications")]);
    battles = b.battles; saved = s.entrants; mine = m.applications;
    renderBattles(); renderSaved(); renderMine();
  }

  (async () => {
    const me = await session();
    if (!me) { $("guest").hidden = false; return; }
    $("applyBox").hidden = $("mineBox").hidden = false;
    try { await load(); } catch (e) { msg(e.message); }
    let t = null;
    follow(["battles", "me:applications"], () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 150); },
      on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
  })();
})();
