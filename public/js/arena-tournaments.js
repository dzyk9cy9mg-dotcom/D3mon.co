// /tournaments: the hourly, daily, weekly and monthly standings, live. Thin client over
// GET /api/v1/tournaments, GET /api/v1/tournaments/:id and the "tournaments" feed topic.
(function () {
  "use strict";
  const { api, follow, esc } = window.Arena;
  const $ = id => document.getElementById(id);
  const KINDS = [["hourly", "Hourly"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
  const S = { current: null, kind: "daily", id: null, t: null };

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
      : t.status === "scoring" ? "<b>Ended</b> · waiting for Kalshi to score the last rounds" : "<b>Final</b>";
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
    $("now").hidden = t.status === "live";
    $("rows").innerHTML = t.standings.length ? t.standings.map(r => `<tr${r.rank === 1 && r.correct ? ' class="lead"' : ""}>
        <td class="trank">${r.rank}</td>
        <td><a href="card?e=${encodeURIComponent(r.entrant.slug)}"><b>${esc(r.entrant.name)}</b></a> <span class="tag">${r.entrant.kind === "script" ? "script" : "bot"} · by ${esc(r.entrant.creatorName)}</span></td>
        <td><b>${r.correct}</b></td><td>${pct(r.accuracy)}</td><td>${r.calls}</td><td>${r.missed}</td><td>${dur(r.avgLeadMs)}</td></tr>`).join("")
      : `<tr><td colspan="7" class="empty">No bots in this tournament yet. Bot owners join on <a href="my">My bots</a>.</td></tr>`;
  }

  async function show(id) {
    try {
      S.t = (await api("GET", `tournaments/${id}`)).tournament;
      S.id = id;
      S.kind = S.t.kind;
      msg("");
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
    if (b.dataset.kind) { S.kind = b.dataset.kind; await show(await loadCurrent()); history.replaceState(null, "", `?t=${S.kind}`); return; }
    if (b.id === "prev" && S.t) return show(S.t.previous);
    if (b.id === "next" && S.t && S.t.next) return show(S.t.next);
    if (b.id === "now") return show(await loadCurrent());
  });

  // Countdown, and moving on to the next tournament when the one on screen ends.
  setInterval(() => {
    document.querySelectorAll("[data-ends]").forEach(el => (el.textContent = left(+el.dataset.ends - Date.now())));
    if (S.t && S.t.status === "live" && Date.now() >= S.t.endsAt) loadCurrent().then(show).catch(() => {});
  }, 1000);

  (async () => {
    const q = new URLSearchParams(location.search).get("t") || "";
    if (KINDS.some(([k]) => k === q)) S.kind = q;
    render();
    try {
      await show(/^(hourly|daily|weekly|monthly)-/.test(q) ? q : await loadCurrent());
    } catch (e) { msg(e.message); }
    let t = null;
    follow(["tournaments"], () => { clearTimeout(t); t = setTimeout(() => S.id && show(S.id), 400); },
      on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
  })();
})();
