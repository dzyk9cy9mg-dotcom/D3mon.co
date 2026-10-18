// /world: the preview of the 3D site (docs/world/BLUEPRINT.md, SITEMAP.md). This first version is the
// complete 2D site: the top bar and Menu, the quality switch, and the four places with live data. The
// 3D world will be drawn behind the same places in later updates, and 2D never downloads it.
// Thin client: everything comes from /api/v1 (tournaments, rounds, calls, entrants) and the live feed.
(function () {
  "use strict";
  const { api, follow, esc, session, syncClock, serverNow } = window.Arena;
  const $ = id => document.getElementById(id);
  const Q = 15 * 60000;
  const KINDS = [["hourly", "Hourly"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]];
  const STRANDS = [["caller", "Callers", "c-cal"], ["bot", "Bots", "c-bot"], ["script", "Chart Scripts", "c-scr"]];
  const S = { kind: "daily", t: null, rounds: [], calls: null, prev: null, entrants: [], strand: "all", round: null };

  const msg = text => { $("msg").textContent = text || ""; };
  const tz = { timeZone: "America/New_York" };
  const fmt = (ms, o) => new Date(ms).toLocaleString(undefined, { ...tz, ...o });
  const time = ms => fmt(ms, { hour: "numeric", minute: "2-digit" });
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const pct = v => (v === null ? "–" : `${Math.round(v * 1000) / 10}%`);
  const dirHtml = d => (d === "up" ? '<b class="up">▲ Up</b>' : d === "down" ? '<b class="dn">▼ Down</b>' : "");
  const kindClass = k => (STRANDS.find(s => s[0] === k) || [, , ""])[2];
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ---------- quality: device levels (Full / Lite / Mobile Lite / 2D) ----------
  // Auto starts at Lite and only steps down: anything that makes 3D a poor experience goes to 2D.
  function detect() {
    const reasons = [];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) reasons.push("reduce motion is on");
    const c = navigator.connection;
    if (c && c.saveData) reasons.push("data saver is on");
    if (navigator.deviceMemory && navigator.deviceMemory < 4) reasons.push("this device has little memory");
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) reasons.push("this device has few processor cores");
    let gl = null;
    try { const cv = document.createElement("canvas"); gl = cv.getContext("webgl2") || cv.getContext("webgl"); } catch (e) {}
    if (!gl) reasons.push("3D graphics aren't available");
    else {
      const ext = gl.getExtension("WEBGL_debug_renderer_info"), r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      if (/swiftshader|llvmpipe|software/i.test(r)) reasons.push("3D runs in software here");
    }
    if (reasons.length) return { level: "2d", reasons };
    const phone = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 700;
    return { level: phone ? "mobile-lite" : "lite", reasons: [] };
  }
  const LEVELS = [["auto", "Auto"], ["full", "Full"], ["lite", "Lite"], ["2d", "2D"]];
  const auto = detect();
  let choice = store.get("d3w.quality") || "auto";
  if (!LEVELS.some(l => l[0] === choice)) choice = "auto";
  const level = () => (choice === "auto" ? auto.level : choice);
  function renderQuality() {
    $("qualOpts").innerHTML = LEVELS.map(([k, name]) => `<label><input type="radio" name="q" value="${k}" ${k === choice ? "checked" : ""}> ${name}${k === "auto" ? ` <small>(${auto.level === "2d" ? "2D" : auto.level === "mobile-lite" ? "Mobile Lite" : "Lite"})</small>` : ""}</label>`).join("");
    const why = choice === "auto" && auto.reasons.length ? ` Auto chose 2D because ${auto.reasons.join(", ")}.` : "";
    const slow = choice === "auto" && slowFps ? ` Auto switched to 2D because 3D ran at about ${slowFps} frames a second here.` : "";
    const lv = level();
    $("qualNote").textContent = lv === "2d" ? `You're seeing the 2D version.${why}${slow}` : `You're seeing the 3D version (${lv === "full" ? "Full" : lv === "mobile-lite" ? "Mobile Lite" : "Lite"}). Choose 2D for a lighter page.`;
    document.body.dataset.level = lv;
  }
  $("qualOpts").addEventListener("change", e => { choice = e.target.value; store.set("d3w.quality", choice); slowFps = 0; renderQuality(); world3d(); });

  // ---------- the 3D world: loaded only when the level isn't 2D ----------
  let slowFps = 0, scene3d = null, loading = null;
  try { slowFps = +(sessionStorage.getItem("d3w.slow") || 0) || 0; } catch (e) {}
  if (slowFps && choice === "auto") auto.level = "2d";
  async function world3d() {
    const lv = level();
    if (scene3d) { scene3d.stop(); scene3d = null; }
    if (lv === "2d") return;
    const mine = (loading = Symbol());
    try {
      const m = await import("./world3d.js");
      if (mine !== loading || level() === "2d") return;
      scene3d = m.start({ level: lv, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, showFps: new URLSearchParams(location.search).has("fps"),
        onSlow: fps => {
          if (choice !== "auto") return; // a level chosen by hand stays
          try { sessionStorage.setItem("d3w.slow", String(fps)); } catch (e) {}
          slowFps = fps; auto.level = "2d"; renderQuality(); world3d();
        } });
      if (!scene3d) { auto.level = "2d"; renderQuality(); }
    } catch (e) { console.error("3D world:", e); auto.level = "2d"; renderQuality(); }
  }

  // ---------- menus ----------
  const pops = [["mapBtn", "mapPanel"], ["menuBtn", "menuPanel"], ["adminBtn", "adminPanel"], ["qualBtn", "qualPanel"]];
  function closeAll(except) {
    for (const [b, p] of pops) if (p !== except) { $(p).hidden = true; $(b).setAttribute("aria-expanded", "false"); }
  }
  for (const [b, p] of pops) $(b).addEventListener("click", e => {
    e.stopPropagation();
    const open = $(p).hidden;
    closeAll(p);
    $(p).hidden = !open;
    $(b).setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", e => { if (!e.target.closest(".w-panel")) closeAll(); else if (e.target.closest("a")) closeAll(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });

  // ---------- Grand Hall: the round clock (the last 24 hours) ----------
  function renderRing() {
    const now = serverNow(), cur = Math.floor(now / Q) * Q, by = new Map(S.rounds.map(r => [r.round, r.result]));
    const N = 96, R1 = 100, R0 = 78, gap = 0.012, segs = [];
    for (let i = 0; i < N; i++) {
      const round = cur - (N - 1 - i) * Q; // the current round sits at the top, older ones run clockwise behind it
      const a0 = -Math.PI / 2 + ((i + 1) / N) * 2 * Math.PI + gap, a1 = -Math.PI / 2 + ((i + 2) / N) * 2 * Math.PI - gap;
      const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
      const res = round === cur ? "now" : by.get(round) || "na";
      segs.push(`<path class="s-${res}" d="M${p(R0, a0)} L${p(R1, a0)} A${R1} ${R1} 0 0 1 ${p(R1, a1)} L${p(R0, a1)} A${R0} ${R0} 0 0 0 ${p(R0, a0)} Z"><title>${esc(time(round))}: ${res === "now" ? "in progress" : res === "na" ? "no result" : res}</title></path>`);
    }
    $("ring").innerHTML = `<title id="ringT">The last 24 hours of rounds</title>${segs.join("")}`;
  }
  function tickClock() {
    const now = serverNow(), cur = Math.floor(now / Q) * Q;
    $("rTime").textContent = `${time(cur)}–${time(cur + Q)}`;
    $("rLeft").textContent = mmss(cur + Q - now);
    if (S.round !== null && cur !== S.round) loadHall().catch(() => {});
    S.round = cur;
  }

  function renderCalls() {
    const c = S.calls;
    $("calls").innerHTML = c && c.calls.length ? c.calls.map(x => `<li class="${kindClass(x.kind)}"><a href="card?e=${encodeURIComponent(x.slug)}">${esc(x.name)}</a>
        <span class="w-k">${x.kind === "caller" ? "caller" : x.kind === "script" ? "script" : "bot"}</span>
        <span class="w-d">${x.sealed ? '<span class="w-seal">● sealed</span>' : dirHtml(x.direction)}</span><time>${esc(time(x.receivedAt))}</time></li>`).join("")
      : `<li class="w-empty">No calls yet this round.</li>`;
    const p = S.prev;
    if (!p) { $("prev").textContent = "–"; return; }
    const right = p.calls.filter(x => x.correct === true).length, wrong = p.calls.filter(x => x.correct === false).length;
    $("prev").innerHTML = p.result ? `${esc(time(p.round))}: Bitcoin went ${dirHtml(p.result)} · ${right} right, ${wrong} wrong` : `${esc(time(p.round))}: waiting for Kalshi's result`;
  }

  function renderStandings() {
    $("tabs").innerHTML = KINDS.map(([k, name]) => `<button type="button" role="tab" aria-selected="${k === S.kind}" data-kind="${k}">${name}</button>`).join("");
    $("moreLink").href = `tournaments?t=${S.kind}`;
    const t = S.t;
    if (!t) return;
    $("paused").hidden = !t.paused;
    if (t.paused) $("paused").textContent = `Tournaments paused: ${t.paused.reason}`;
    $("tWhen").innerHTML = `${esc(t.title)} · ends in <b>${esc(left(t.endsAt - Date.now()))}</b> · ${t.settledRounds} of ${t.rounds} rounds scored`;
    const top = t.standings.slice(0, 10);
    $("rows").innerHTML = top.length ? top.map(r => `<li><span class="w-rank">${r.rank}</span><a href="card?e=${encodeURIComponent(r.entrant.slug)}">${esc(r.entrant.name)}</a>
        <span class="w-k">${r.entrant.kind}</span><span class="w-score"><b>${r.correct}</b> right · ${pct(r.accuracy)}</span></li>`).join("")
      : `<li class="w-empty">No bots in this tournament yet. Owners switch it on in <a href="my">My bots</a>.</li>`;
  }
  const left = ms => { const m = Math.max(0, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`; };

  async function loadStandings() {
    const cur = await api("GET", "tournaments");
    const id = cur.tournaments.find(t => t.kind === S.kind).id;
    S.t = (await api("GET", `tournaments/${id}`)).tournament;
    renderStandings();
  }
  async function loadHall() {
    const now = serverNow(), cur = Math.floor(now / Q) * Q;
    const [rounds, calls, prev] = await Promise.all([api("GET", "rounds"), api("GET", `rounds/${cur}/calls`), api("GET", `rounds/${cur - Q}/calls`)]);
    S.rounds = rounds.rounds; S.calls = calls; S.prev = prev;
    renderRing(); renderCalls();
    await loadStandings();
  }

  // ---------- Helix: every entrant, by strand, in name order (never ranked) ----------
  function renderHelix() {
    $("chips").innerHTML = [["all", "All"], ...STRANDS].map(([k, name]) => `<button type="button" data-strand="${k}" aria-pressed="${k === S.strand}">${name}</button>`).join("");
    $("strands").innerHTML = STRANDS.filter(([k]) => S.strand === "all" || S.strand === k).map(([k, name, cls]) => {
      const list = S.entrants.filter(e => e.kind === k);
      return `<div class="w-strand ${cls}"><h3>${name} <small>${list.length}</small></h3><div class="w-cards">${list.length ? list.map(e => `<a class="w-ecard" href="card?e=${encodeURIComponent(e.slug)}"><b>${esc(e.name)}</b><span>by ${esc(e.creatorName)}</span></a>`).join("") : `<p class="w-empty">None yet.</p>`}</div></div>`;
    }).join("");
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.kind) { S.kind = b.dataset.kind; renderStandings(); try { await loadStandings(); } catch (x) { msg(x.message); } }
    if (b.dataset.strand) { S.strand = b.dataset.strand; renderHelix(); }
  });

  // ---------- start ----------
  renderQuality();
  world3d();
  renderStandings();
  renderHelix();
  (async () => {
    const me = await session();
    const admin = !!me && (me.role === "admin" || me.role === "owner");
    $("adminWrap").hidden = !admin;
    if (me) { $("acctBtn").textContent = me.name || me.username || "Account"; $("acctBtn").href = "login"; }
    try {
      await syncClock();
      tickClock();
      setInterval(tickClock, 1000);
      const [e] = await Promise.all([api("GET", "entrants"), loadHall()]);
      S.entrants = e.entrants.filter(x => x.status === "active").sort((a, b) => a.name.localeCompare(b.name));
      renderHelix();
      if (me) {
        const mine = (await api("GET", "entrants?mine=1")).entrants;
        if (mine.length) { $("joinBtn").textContent = "My bots"; $("joinBtn").href = "my"; }
      }
    } catch (x) { msg(x.message); }
    let t = null;
    follow(["tournaments"], () => { clearTimeout(t); t = setTimeout(() => loadHall().catch(() => {}), 400); },
      on => { $("live").textContent = on ? "● live" : "○ reconnecting"; $("live").classList.toggle("on", on); });
  })();
})();
