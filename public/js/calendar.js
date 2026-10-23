// /calendar: what's coming (battles, Capstone, admin events), grouped by day, with Remind me for members.
// Admins add events and send announcements. A thin client over /api/v1/calendar and /api/v1/notifications.
(function () {
  "use strict";
  const { api, esc } = window.Arena;
  const $ = id => document.getElementById(id);
  let data = null, signedIn = false, busy = false;

  function msg(text, ok) { $("msg").textContent = text || ""; $("msg").classList.toggle("ok", !!ok); }
  const day = ms => new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const href = l => (/^https:\/\//.test(l) ? l : l || "");

  function render() {
    const evs = data.events.filter(e => !e.over);
    if (!evs.length) { $("days").innerHTML = `<p class="empty">Nothing on the calendar yet. Battles and sessions show up here once they're scheduled.</p>`; return; }
    const groups = [];
    for (const e of evs) { const d = day(e.startsAt); if (!groups.length || groups.at(-1)[0] !== d) groups.push([d, []]); groups.at(-1)[1].push(e); }
    $("days").innerHTML = groups.map(([d, list]) => `<h2 class="cal-day">${esc(d)}</h2><div class="list">${list.map(e => {
      const link = href(e.link), ext = /^https:/.test(link);
      return `<div class="item cal-ev k-${esc(e.kind)}"><div class="top">
        <span class="cal-time">${esc(time(e.startsAt))}<small>–${esc(time(e.endsAt))}</small></span>
        <span class="st">${esc(e.label)}</span>${e.live ? `<span class="st cal-live">● Live now</span>` : ""}
        <b class="cal-title">${link ? `<a href="${esc(link)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(e.title)}</a>` : esc(e.title)}</b>
        <span class="cal-acts">${!e.live && signedIn ? `<button type="button" class="btn ${e.remind ? "" : "ghost"} sm" data-remind="${esc(e.key)}" aria-pressed="${e.remind}">${e.remind ? "🔔 Reminding you" : "Remind me"}</button>` : ""}
        ${!e.live && !signedIn ? `<a class="btn ghost sm" href="login">Sign in for reminders</a>` : ""}
        ${data.admin && e.type === "event" ? `<button type="button" class="btn ghost sm" data-cancel="${esc(e.key.split(":")[1])}">Cancel</button>` : ""}</span></div>
        ${e.note ? `<div class="meta">${esc(e.note)}</div>` : ""}</div>`;
    }).join("")}</div>`).join("");
  }

  async function load() {
    data = await api("GET", "calendar");
    $("adminBox").hidden = !data.admin;
    if (data.admin && !$("evKind").options.length) $("evKind").innerHTML = Object.entries(data.kinds).map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join("");
    render();
  }

  document.addEventListener("click", async ev => {
    const b = ev.target.closest("button");
    if (!b || busy) return;
    if (b.dataset.remind) {
      busy = true;
      const key = b.dataset.remind, on = b.getAttribute("aria-pressed") !== "true";
      try {
        await api("PUT", "calendar/remind", { key, on });
        data.events.find(e => e.key === key).remind = on;
        msg(on ? "Done. The bell will remind you 15 minutes before, and when it starts." : "Reminder off.", true);
        render();
      } catch (e) { msg(e.message); } finally { busy = false; }
    }
    if (b.dataset.cancel) {
      if (!confirm("Cancel this event? It comes off the calendar for everyone.")) return;
      try { await api("DELETE", `calendar/events/${b.dataset.cancel}`); msg("Event cancelled.", true); await load(); } catch (e) { msg(e.message); }
    }
  });

  $("evForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const startsAt = new Date($("evStart").value).getTime();
    if (!Number.isFinite(startsAt)) return msg("Pick a start time.");
    try {
      await api("POST", "calendar/events", { title: $("evTitle").value, kind: $("evKind").value, startsAt, minutes: +$("evMin").value, link: $("evLink").value.trim(), note: $("evNote").value.trim() });
      ev.target.reset(); msg("Added to the calendar.", true); await load();
    } catch (e) { msg(e.message); }
  });

  $("annForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!confirm("Send this to every member's bell?")) return;
    try {
      const r = await api("POST", "notifications/announce", { text: $("annText").value, link: $("annLink").value.trim() });
      ev.target.reset(); msg(`Sent to ${r.sent} members.`, true);
    } catch (e) { msg(e.message); }
  });

  (async () => {
    try { signedIn = !!(await window.Arena.session()); } catch (e) {}
    try { await load(); } catch (e) { $("days").innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
    setInterval(() => load().catch(() => {}), 60000);
  })();
})();
