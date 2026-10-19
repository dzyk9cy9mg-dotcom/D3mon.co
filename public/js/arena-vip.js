// /vip: the VIP Room (top of the pyramid). Members with access see the featured entrants' calls this
// round, the callers' included; admins grant access and choose who's featured. Thin client over /api/v1/vip.
(function () {
  "use strict";
  const { api, follow, esc, when, kindName, session, syncClock, serverNow, mmss } = window.Arena;
  const $ = id => document.getElementById(id);
  const S = { info: null, room: null, holders: [], entrants: [], sessions: { upcoming: [] } };
  const Q = 15 * 60000;
  const msg = (t, ok) => { $("msg").textContent = t || ""; $("msg").classList.toggle("ok", !!ok); };
  const fmtTime = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dir = d => (d === "up" ? '<b style="color:var(--up)">▲ Up</b>' : '<b style="color:var(--dn)">▼ Down</b>');
  const card = e => `<a class="item" href="profile?e=${encodeURIComponent(e.slug)}"><b>${esc(e.name)}</b> <span class="tag">${esc(kindName(e.kind))} · by ${esc(e.creatorName)}</span></a>`;

  function render() {
    const i = S.info;
    if (!i) return;
    const now = Date.now();
    $("sessions").innerHTML = S.sessions.upcoming.length ? S.sessions.upcoming.map(s => `<div class="item"><div class="top"><span class="st ${s.startsAt <= now ? "approved" : "pending"}">${s.startsAt <= now ? "on now" : "upcoming"}</span><b>${esc(s.title)}</b>
        <span class="meta">${esc(new Date(s.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · ${s.minutes} min${s.leads ? ` · ${esc(s.leads)}` : ""}</span>
        ${i.admin ? `<button class="btn ghost sm" type="button" data-cancel="${esc(s.id)}" style="margin-left:auto">Cancel</button>` : ""}</div></div>`).join("")
      : `<p class="empty">No sessions scheduled yet.</p>`;
    $("door").hidden = i.access;
    $("room").hidden = !i.access;
    $("teaser").innerHTML = i.featured.length ? `<p class="tag">Featured now:</p><div class="vipcards">${i.featured.map(card).join("")}</div>` : "";
    if (i.access && S.room) {
      $("until").textContent = i.admin ? "You have access as an admin." : `Your access lasts until ${when(i.until)}.`;
      $("vCalls").innerHTML = S.room.calls.length ? S.room.calls.map(c => `<div class="item"><div class="top"><b>${esc(c.name)}</b><span class="tag">${esc(kindName(c.kind))}</span>
          <span style="margin-left:auto">${dir(c.direction)}</span><span class="meta">${esc(fmtTime(c.receivedAt))}${c.early ? " · sealed for everyone else" : ""}</span></div></div>`).join("")
        : `<p class="empty">No featured calls yet this round.</p>`;
      $("vFeatured").innerHTML = S.room.featured.length ? S.room.featured.map(card).join("") : `<p class="empty">Nobody is featured yet.</p>`;
    }
    if (i.admin) {
      $("adminBox").hidden = false;
      const now = Date.now();
      $("holders").innerHTML = S.holders.length ? S.holders.map(h => `<div class="item"><div class="top"><span class="st ${h.active ? "approved" : "rejected"}">${h.active ? "active" : "ended"}</span><b>${esc(h.name || h.username)}</b>
          <span class="meta">@${esc(h.username)} · ${h.active ? `until ${esc(when(h.until))} (${Math.ceil((h.until - now) / 86400000)} days left)` : `ended ${esc(when(h.until))}`}${h.note ? ` · ${esc(h.note)}` : ""}</span>
          ${h.active ? `<button class="btn ghost sm" type="button" data-end="${esc(h.uid)}" style="margin-left:auto">End access</button>` : ""}</div></div>`).join("")
        : `<p class="empty">Nobody has access yet.</p>`;
      const on = new Set(i.featured.map(e => e.id));
      $("pick").innerHTML = S.entrants.map(e => `<label class="checks"><input type="checkbox" value="${esc(e.id)}" ${on.has(e.id) ? "checked" : ""}> ${esc(e.name)} <span class="tag">${esc(kindName(e.kind))}</span></label>`).join("") || `<p class="empty">No approved entrants yet.</p>`;
    }
  }

  async function load() {
    [S.info, S.sessions] = await Promise.all([api("GET", "vip"), api("GET", "vip/sessions")]);
    S.room = S.info.access ? await api("GET", "vip/room") : null;
    if (S.info.admin) {
      const [h, e] = await Promise.all([api("GET", "vip/access"), api("GET", "entrants")]);
      S.holders = h.access;
      S.entrants = e.entrants.filter(x => x.status === "active");
    }
    render();
  }

  $("grantForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    try {
      const r = await api("POST", "vip/access", { username: $("gUser").value, days: +$("gDays").value, note: $("gNote").value });
      $("gUser").value = $("gNote").value = "";
      await load();
      msg(`${r.access.name || r.access.username} has access until ${when(r.access.until)}.`, true);
    } catch (e) { msg(e.message); }
  });
  $("sessForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    try {
      const r = await api("POST", "vip/sessions", { title: $("sTitle").value, startsAt: new Date($("sStart").value).getTime(), minutes: +$("sMin").value, leads: $("sLeads").value });
      $("sTitle").value = $("sLeads").value = "";
      await load();
      msg(`Scheduled: ${r.session.title}.`, true);
    } catch (e) { msg(e.message); }
  });
  document.addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.end) {
      if (!confirm("End this member's access now?")) return;
      try { await api("DELETE", `vip/access/${b.dataset.end}`); await load(); msg("Access ended.", true); } catch (e) { msg(e.message); }
    }
    if (b.dataset.cancel) {
      if (!confirm("Cancel this session?")) return;
      try { await api("DELETE", `vip/sessions/${b.dataset.cancel}`); await load(); msg("Session cancelled.", true); } catch (e) { msg(e.message); }
    }
    if (b.id === "saveFeatured") {
      const ids = [...document.querySelectorAll("#pick input:checked")].map(x => x.value);
      try { await api("PUT", "vip/featured", { entrantIds: ids }); await load(); msg("Featured saved.", true); } catch (e) { msg(e.message); }
    }
  });

  (async () => {
    const me = await session();
    try {
      await syncClock();
      await load();
      if (!me) $("doorText").innerHTML = 'The VIP Room needs access. <a href="login">Sign in</a>, then ask an admin to get in.';
    } catch (e) { msg(e.message); }
    let round = Math.floor(serverNow() / Q) * Q;
    setInterval(() => {
      const now = serverNow(), cur = Math.floor(now / Q) * Q;
      $("vClock").textContent = `${fmtTime(cur)}–${fmtTime(cur + Q)} · ends in ${mmss(cur + Q - now)}`;
      if (cur !== round) { round = cur; load().catch(() => {}); }
    }, 1000);
    let t = null;
    follow(["tournaments", "vip"], () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 400); },
      on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
  })();
})();
