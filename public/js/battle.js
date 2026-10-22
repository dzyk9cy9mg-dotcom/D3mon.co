// HardSmoke's Battle of the Bots, live (/battle): a thin client over /api/v1.
//
// The cockpit: the owner's curved cockpit (media/cockpit2.jpg, a loop to come) with nine displays on its two curved screens. Each one gets a module, chosen by
// HardSmoke or any admin in "HardSmoke's controls" (GET/PUT /api/v1/cockpit): the bots, callers, chart scripts,
// standings, the round clock and Kalshi's odds, the stream, the crowd's votes, vote, chat, last round, a message, a
// promo video, or nothing. The displays are fitted onto the video's screens with a CSS perspective transform, using
// the corners measured from the video itself (QUADS below; remeasure them if the video changes).
//
// The stream screen opens the Stream Wall: every stream at once, the featured one big with its sound, a few others
// playing muted and the rest as still cards, to keep laptops cool. Keys: ← → change stream, G grid, Esc back.
//
// ?demo plays it on made-up data, for previews. Phones get the screens as cards over a still of the cockpit.
(function () {
  "use strict";
  const A = window.Arena, $ = id => document.getElementById(id), esc = A.esc;
  const qs = new URLSearchParams(location.search), DEMO = qs.has("demo");
  const Q = 15 * 60000, LOCK = 10000;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KIND = { caller: "Caller", bot: "Bot", script: "Chart script" };
  const SLOT_NAME = { ticker: "Top strip (centre)", main: "Main screen, centre", leftTop: "Main screen, left top", leftBottom: "Main screen, left bottom", rightTop: "Main screen, right top", rightBottom: "Main screen, right bottom", lowerLeft: "Lower screen, left", console: "Lower screen, centre", lowerRight: "Lower screen, right" };
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const cents = x => (x == null ? "" : `${Math.round(x * 100)}¢`);
  const signed = x => (x == null ? "" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}¢`);
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = ms => new Date(ms).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // ---------- the cockpit's geometry ----------
  // The curved cockpit (owner, 2026-10-21): one big curved screen and a lower curved screen under it, measured from the
  // last frame of media/intro.mp4 (saved as media/cockpit2.jpg). Each glass edge is a parabola,
  // y = yc + (ye − yc)·((x − CX) / HW)², and each display is a four-cornered piece cut from between two edges, kept just
  // inside the glass and fitted with a perspective transform, so the pieces at the sides lean in as the screen wraps.
  // Remeasure CURVE if the video changes.
  const CX = 940;
  const CURVE = { mainTop: [192, 55, 860], mainBot: [667, 725, 890], lowTop: [700, 757, 890], lowBot: [850, 962, 890] };
  const edge = k => { const [yc, ye, hw] = CURVE[k]; return x => yc + (ye - yc) * ((x - CX) / hw) ** 2; };
  // the piece between two edges from x0 to x1: its straight top and bottom are moved in until they clear the curve
  function cut(top, bot, x0, x1, inset = 14) {
    const T = edge(top), B = edge(bot);
    let dt = 0, db = 0;
    for (let i = 0; i <= 24; i++) {
      const k = i / 24, x = x0 + (x1 - x0) * k;
      dt = Math.max(dt, T(x) - (T(x0) + (T(x1) - T(x0)) * k));
      db = Math.max(db, B(x0) + (B(x1) - B(x0)) * k - B(x));
    }
    const p = [[x0 + inset, T(x0) + dt + inset], [x1 - inset, T(x1) + dt + inset], [x1 - inset, B(x1) - db - inset], [x0 + inset, B(x0) - db - inset]];
    const w = Math.round(Math.max(p[1][0] - p[0][0], p[2][0] - p[3][0])), h = Math.round(Math.max(p[3][1] - p[0][1], p[2][1] - p[1][1]));
    return { w, h, p };
  }
  // symmetric about the screen's centre (CX): three columns on the main screen, three parts on the lower one
  const QUADS = {
    left: cut("mainTop", "mainBot", 76, 500), center: cut("mainTop", "mainBot", 512, 1368), right: cut("mainTop", "mainBot", 1380, 1804),
    lowLeft: cut("lowTop", "lowBot", 150, 640, 20), lowCenter: cut("lowTop", "lowBot", 652, 1228, 12), lowRight: cut("lowTop", "lowBot", 1240, 1730, 20),
  };
  // The CSS matrix that takes a w × h box onto four corners (a projective transform, solved directly).
  function homography(w, h, p) {
    const src = [[0, 0], [w, 0], [w, h], [0, h]], M = [], v = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [X, Y] = p[i];
      M.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); v.push(X);
      M.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); v.push(Y);
    }
    for (let c = 0; c < 8; c++) { // Gaussian elimination with pivoting
      let r = c; for (let k = c + 1; k < 8; k++) if (Math.abs(M[k][c]) > Math.abs(M[r][c])) r = k;
      [M[c], M[r]] = [M[r], M[c]]; [v[c], v[r]] = [v[r], v[c]];
      for (let k = 0; k < 8; k++) if (k !== c) { const f = M[k][c] / M[c][c]; for (let j = c; j < 8; j++) M[k][j] -= f * M[c][j]; v[k] -= f * v[c]; }
    }
    const H = v.map((x, i) => x / M[i][i]);
    return `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,1)`;
  }
  const phone = matchMedia("(max-width: 900px), (max-aspect-ratio: 1/1)");
  function place() {
    const flat = phone.matches;
    document.body.classList.toggle("bt-cards", flat);
    for (const [k, q] of Object.entries(QUADS)) {
      const el = document.querySelector(`[data-quad="${k}"]`);
      el.style.cssText = flat ? "" : `width:${q.w}px;height:${q.h}px;transform:${homography(q.w, q.h, q.p)}`;
    }
    fit();
  }
  // The stage is 1920 × 1080, scaled to fill the space under the menu (cropping a little at the edges rather than
  // leaving bars, but never past the screens).
  function fit() {
    const stage = $("stage"), view = $("view");
    if (phone.matches) { stage.style.transform = ""; view.style.height = ""; return; }
    const bar = document.querySelector(".s-bar"), top = bar ? bar.getBoundingClientRect().height : 0;
    const vw = view.clientWidth, vh = Math.max(320, innerHeight - top - 64);
    const s = Math.min(Math.max(vw / 1920, vh / 1080), vw / 1800, vh / 1020);
    view.style.height = `${Math.min(vh, 1080 * s)}px`;
    stage.style.transform = `translate(${(vw - 1920 * s) / 2}px,${(Math.min(vh, 1080 * s) - 1080 * s) / 2}px) scale(${s})`;
  }

  // ---------- the background video: the small one on small screens, paused when nobody can see it ----------
  const bg = $("bg");
  const small = () => innerWidth * (devicePixelRatio || 1) < 1500;
  // The cockpit loop behind the displays: media/<LOOP>.mp4 (and <LOOP>-720.mp4). Until the owner's loop for the curved
  // cockpit is made, LOOP is null and the still (media/cockpit2.jpg, the intro's last frame) stands in.
  const LOOP = null;
  function video() {
    if (phone.matches || reduce || !LOOP) { bg.pause(); if (bg.getAttribute("src")) { bg.removeAttribute("src"); bg.load(); } return; }
    const want = `media/${small() ? `${LOOP}-720` : LOOP}.mp4`;
    if (!bg.src.endsWith(want)) bg.src = want;
    if (!document.hidden && $("wall").hidden && !document.body.classList.contains("bt-gated")) bg.play().catch(() => {});
  }
  // ---------- the intro: a cinematic flight that lands exactly on the cockpit ----------
  // media/intro.mp4 (made in Higgsfield, with sound) ends on the cockpit still the loop starts from. It plays once,
  // on a visitor's first visit, after they press "Enter the battle" (browsers only allow sound after a click); "▶ Intro"
  // under the cockpit plays it again. When its camera has settled (SETTLE s), the loop starts underneath, the intro is
  // nudged onto the cockpit's exact framing (FIX, measured from the two videos' main screens), its sound fades and it
  // fades out, and the screens light up one by one. Remeasure FIX if either video changes.
  const INTRO = { SETTLE: 14.7, END: 15.04, FIX: [1, 1, 0, 0] }; // third intro (2026-10-21): it ends on media/cockpit2.jpg itself, so nothing to nudge
  let film = null;
  const seen = () => { try { return localStorage.getItem("d3b.intro") === "1"; } catch { return false; } };
  // The intro starts loading as soon as the gate is up, so it plays through without stopping. On an unknown or slow
  // connection the 720p copy is used (owner, 2026-10-21: the 1080p one froze while it loaded).
  let pre = null;
  const introSrc = () => { const c = navigator.connection, fast = !!c && c.downlink >= 10 && !c.saveData; return `media/${!small() && fast ? "intro" : "intro-720"}.mp4`; };
  function loadIntro() {
    if (pre) return pre;
    const v = document.createElement("video");
    v.className = "bt-intro"; v.playsInline = true; v.preload = "auto"; v.poster = "media/intro.jpg"; v.src = introSrc();
    v.style.visibility = "hidden";
    (phone.matches ? $("film") : $("stage")).append(v);
    v.load();
    return (pre = v);
  }
  function dropIntro() { if (!pre) return; pre.removeAttribute("src"); pre.load(); pre.remove(); pre = null; }
  // enough is loaded to play to the end without stopping
  const buffered = v => { const b = v.buffered, d = v.duration || 13; return b.length ? Math.min(1, b.end(b.length - 1) / d) : 0; };
  const ready = v => v.readyState >= 4 || buffered(v) >= 0.97;
  const loading = (on, pct) => { $("introLoad").hidden = !on; if (on) $("introPct").textContent = pct == null ? "" : `${Math.round(pct * 100)}%`; };
  function gate() {
    if (reduce || (seen() && !qs.has("intro"))) return;
    document.body.classList.add("bt-gated"); bg.pause();
    $("gate").hidden = false; $("enterBtn").focus();
    loadIntro();
  }
  function playIntro() {
    if (film) return;
    try { localStorage.setItem("d3b.intro", "1"); } catch {}
    $("gate").hidden = true;
    const flat = phone.matches, v = loadIntro(); pre = null;
    if (flat) { $("film").hidden = false; $("film").append(v); } else $("stage").append(v);
    v.style.visibility = "";
    document.body.classList.add("bt-gated", "bt-filming"); bg.pause();
    if (!$("wall").hidden) closeWall();
    $("skipIntro").hidden = false; $("skipIntro").focus();
    film = { v, handed: false, started: false };
    const step = () => {
      if (!film || film.v !== v) return;
      const t = v.currentTime;
      if (t >= INTRO.SETTLE && !film.handed) handoff(false);
      if (t >= INTRO.SETTLE) v.volume = Math.max(0, 1 - (t - INTRO.SETTLE) / (INTRO.END - INTRO.SETTLE + 0.2));
      requestAnimationFrame(step);
    };
    v.addEventListener("ended", () => { if (film && !film.handed) handoff(false); });
    v.addEventListener("error", () => { if (film && !film.handed) handoff(true); });
    // if it still has to stop to load, say so rather than look frozen
    v.addEventListener("waiting", () => { if (film && film.v === v && !film.handed) loading(true, null); });
    v.addEventListener("playing", () => loading(false));
    const go = () => {
      if (!film || film.v !== v || film.started) return;
      film.started = true; loading(false);
      v.currentTime = 0;
      v.play().then(() => requestAnimationFrame(step)).catch(() => handoff(true));
    };
    if (ready(v)) return go();
    // not loaded yet: start and pause inside this click (so the sound is allowed later), then wait for the rest
    v.muted = true; v.play().then(() => { v.pause(); v.muted = false; }).catch(() => { v.muted = false; });
    loading(true, buffered(v));
    const wait = setInterval(() => {
      if (!film || film.v !== v || film.started) return clearInterval(wait);
      loading(true, buffered(v));
      if (ready(v)) { clearInterval(wait); go(); }
    }, 200);
    setTimeout(() => { clearInterval(wait); go(); }, 15000); // a very slow connection: play what there is
  }
  // the hand-off: quick when skipped, otherwise timed to the intro's last second
  function handoff(quick) {
    if (!film || film.handed) return;
    film.handed = true;
    const v = film.v, flat = phone.matches, ms = quick ? 450 : 900;
    document.body.classList.remove("bt-gated", "bt-filming");
    video();
    if (quick) { const from = v.volume, t0 = performance.now(); const fade = () => { const k = Math.min(1, (performance.now() - t0) / ms); v.volume = from * (1 - k); if (k < 1) requestAnimationFrame(fade); }; fade(); }
    const [sx, sy, tx, ty] = INTRO.FIX;
    v.style.transition = `transform ${ms * 0.8}ms ease-out, opacity ${ms}ms ease ${quick ? 0 : 100}ms`;
    if (!flat) v.style.transform = `matrix(${sx},0,0,${sy},${tx},${ty})`;
    v.style.opacity = "0";
    if (flat) $("film").classList.add("out");
    document.body.classList.add("bt-arrive");
    $("skipIntro").hidden = true; loading(false);
    setTimeout(() => {
      v.pause(); v.removeAttribute("src"); v.load(); v.remove(); film = null;
      $("film").hidden = true; $("film").classList.remove("out");
      document.body.classList.remove("bt-arrive");
    }, ms + 1400);
  }
  function skipGate() { try { localStorage.setItem("d3b.intro", "1"); } catch {} dropIntro(); $("gate").hidden = true; document.body.classList.remove("bt-gated"); document.body.classList.add("bt-arrive"); video(); setTimeout(() => document.body.classList.remove("bt-arrive"), 1600); $("wallBtn").focus(); }
  $("enterBtn").addEventListener("click", playIntro);
  $("skipGate").addEventListener("click", skipGate);
  $("skipIntro").addEventListener("click", () => handoff(true));
  $("introBtn").addEventListener("click", playIntro);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && film && !film.handed) handoff(true); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) bg.pause(); else video(); });

  // ---------- the data ----------
  const S = { cp: null, b: null, board: null, results: null, market: null, votes: null, chat: [], prev: null, me: null, round: 0, sound: false, flash: null };
  const D = DEMO ? demo() : null;
  const now = () => (DEMO ? Date.now() : A.serverNow());
  const get = path => (DEMO ? D.get(path) : A.api("GET", path));
  const admin = () => DEMO || (S.me && (S.me.role === "admin" || S.me.role === "owner"));
  // a battle runs from its first round's start to its last round's end (its status is HardSmoke's label)
  const running = b => !!b && b.status !== "draft" && now() >= b.startsAt && now() < b.endsAt;
  const session = () => (running(S.b) ? `battle:${S.b.id}` : "live");

  async function loadCockpit() { S.cp = await get("cockpit"); S.b = S.cp.battle; header(); renderAll(); }
  async function loadBoard() { if (!S.b) return (S.board = null); S.board = await get(`battles/${S.b.id}/board`).catch(() => S.board); }
  async function loadResults() { if (!S.b) return (S.results = null); S.results = await get(`battles/${S.b.id}/results`).catch(() => S.results); }
  async function loadMarket() { S.market = await get("market").catch(() => S.market); }
  async function loadVotes() { S.votes = await get(`votes/round?session=${encodeURIComponent(session())}`).catch(() => S.votes); toastNew(); }
  async function loadChat() { const c = await get("hall/chat?limit=30").catch(() => null); if (c) S.chat = c.messages; }
  async function loadPrev() { S.prev = await get(`rounds/${Math.floor(now() / Q) * Q - Q}/calls`).catch(() => S.prev); }

  function header() {
    const b = S.b;
    $("bTitle").textContent = b ? b.title : "Battle of the Bots";
    $("bState").textContent = !b ? " · No battle announced yet" : running(b) ? " · Live now" : now() >= b.endsAt ? " · Over" : ` · Starts ${day(b.startsAt)}`;
    $("liveDot").classList.toggle("on", running(b));
  }

  // ---------- the people in the battle, with this round's call and their record ----------
  function fighters(kind) {
    const b = S.b; if (!b) return [];
    const board = S.board, cur = Math.floor(now() / Q) * Q;
    const round = board && board.rounds.find(r => r.round === cur);
    const stats = new Map((board ? board.entrants : []).map(e => [e.entrantId, e]));
    return b.entrants.filter(e => !kind || e.kind === kind).map(e => ({ e, s: stats.get(e.id) || {}, call: round && round.calls.find(c => c.entrantId === e.id) }));
  }
  const callTag = c => !c ? `<span class="bt-none">No call yet</span>` : c.sealed ? `<span class="bt-sealed">Sealed</span>`
    : `<b class="${c.direction === "up" ? "up" : "dn"}">${c.direction === "up" ? "▲ Up" : "▼ Down"}</b>${c.price ? `<span class="bt-paid">@${cents(c.price.paid)}</span>` : ""}`;
  const record = s => s.called ? `${s.right || 0} right · ${s.wrong || 0} wrong${s.paperPerContract != null ? ` · <span class="${s.paperPerContract >= 0 ? "up" : "dn"}">${signed(s.paperPerContract)}</span>` : ""}` : "No calls yet";
  // more fighters than fit: show a page at a time, turning every 8 s
  const page = (list, per) => { const pages = Math.max(1, Math.ceil(list.length / per)), i = Math.floor(Date.now() / 8000) % pages; return { list: list.slice(i * per, i * per + per), i, pages }; };
  const dots = p => (p.pages > 1 ? `<div class="bt-dots" aria-hidden="true">${Array.from({ length: p.pages }, (_, k) => `<i${k === p.i ? ' class="on"' : ""}></i>`).join("")}</div>` : "");

  function mFighters(size, kind, title) {
    const all = fighters(kind), noun = { bot: "bots", caller: "callers", script: "chart scripts" }[kind] || "fighters";
    if (!S.b) return `<h3>${esc(title)}</h3><p class="bt-empty">No battle announced yet. <a href="next#battle">See what's coming</a></p>`;
    if (!all.length) return `<h3>${esc(title)}</h3><p class="bt-empty">No ${noun} in this battle yet.${S.b.over ? "" : ` <a href="apply?battle=${encodeURIComponent(S.b.id)}">Apply to battle</a>`}</p>`;
    if (size === "strip") return `<div class="bt-run">${all.map(({ e, call }) => `<span class="k-${esc(e.kind)}"><b>${esc(e.name)}</b> ${callTag(call)}</span>`).join("")}</div>`;
    if (size === "big") {
      const p = page(all, 6);
      return `<h3>${esc(title)}<small>${all.length} in · this round's calls</small></h3><div class="bt-tiles n${p.list.length}">${p.list.map(({ e, s, call }) => `
        <a class="bt-tile k-${esc(e.kind)}" href="profile?e=${encodeURIComponent(e.slug)}"><canvas class="bt-sig" data-kind="${esc(e.kind)}" width="104" height="104" aria-hidden="true"></canvas>
          <span class="bt-name">${esc(e.name)}<small>${esc(KIND[e.kind] || e.kind)}${e.creatorName ? ` · ${esc(e.creatorName)}` : ""}</small></span>
          <span class="bt-call">${callTag(call)}</span><span class="bt-rec">${record(s)}</span></a>`).join("")}</div>${dots(p)}`;
    }
    const p = page(all, size === "low" ? 3 : size === "desk" ? 4 : 5);
    return `<h3>${esc(title)}</h3><ol class="bt-rows">${p.list.map(({ e, s, call }) => `<li class="k-${esc(e.kind)}"><a href="profile?e=${encodeURIComponent(e.slug)}">${esc(e.name)}</a><span class="bt-call">${callTag(call)}</span><small>${record(s)}</small></li>`).join("")}</ol>${dots(p)}`;
  }

  function mStandings(size, title) {
    const r = S.results;
    if (!S.b || !r) return `<h3>${esc(title)}</h3><p class="bt-empty">Standings show once the battle starts.</p>`;
    const rows = r.standings;
    if (!rows.length) return `<h3>${esc(title)}</h3><p class="bt-empty">No one in this battle yet.</p>`;
    const n = size === "big" ? 8 : size === "strip" ? 6 : size === "low" ? 3 : 5;
    if (size === "strip") return `<div class="bt-run">${rows.slice(0, n).map(x => `<span><b>#${x.rank} ${esc(x.entrant.name)}</b> ${x.correct} right</span>`).join("")}</div>`;
    return `<h3>${esc(title)}<small>${r.status === "final" ? "Final" : `${r.settledRounds} of ${r.rounds} rounds settled`}</small></h3>
      <ol class="bt-rank">${rows.slice(0, n).map(x => `<li class="k-${esc(x.entrant.kind)}"><span class="r">${x.rank}</span><a href="profile?e=${encodeURIComponent(x.entrant.slug)}">${esc(x.entrant.name)}</a><span class="s">${x.correct} right${x.accuracy != null ? ` · ${Math.round(x.accuracy * 100)}%` : ""}</span></li>`).join("")}</ol>
      <p class="bt-fine">${esc(r.notice || "Not financial advice.")}</p>`;
  }

  // ---------- the round: clock and Kalshi's odds as two beams colliding ----------
  function odds() {
    const pr = S.market && S.market.price;
    return pr && pr.up != null && pr.down != null ? pr.up / (pr.up + pr.down) : null;
  }
  function mOdds(size) {
    const n = now(), cur = Math.floor(n / Q) * Q, left = cur + Q - n, p = odds(), b = S.b;
    const roundNo = b && n >= b.startsAt && n < b.endsAt ? `Round ${Math.floor((n - b.startsAt) / b.roundMs) + 1} of ${b.rounds}` : "This round";
    const pct = p == null ? ["–", "–"] : [`${Math.round(p * 100)}%`, `${100 - Math.round(p * 100)}%`];
    const target = S.market && S.market.price && S.market.price.target ? `Above or below $${S.market.price.target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Bitcoin, 15 minutes";
    const lock = left <= LOCK ? `<span class="bt-lock">Calls close <b>${Math.max(1, Math.ceil(left / 1000))}</b></span>` : "";
    const flash = S.flash && Date.now() - S.flash.at < 5000 ? `<span class="bt-flash ${S.flash.dir === "up" ? "up" : "dn"}">Bitcoin went ${S.flash.dir === "up" ? "Up" : "Down"}</span>` : "";
    return `<div class="bt-odds">
      <span class="bt-round">${roundNo}</span><span class="bt-clock" data-clock>${mmss(left)}</span>
      <span class="bt-up">Above <b>${pct[0]}</b></span><canvas class="bt-beams" aria-hidden="true"></canvas><span class="bt-dn"><b>${pct[1]}</b> Below</span>
      <span class="bt-target">${esc(target)}</span>${lock}${flash}</div>`;
  }
  // the beams: drawn on every odds screen's canvas, about 30 times a second while it's on screen
  const beams = (() => {
    const UP = "54,230,195", DN = "255,79,122";
    let shown = 0.5, t = 0, last = 0;
    function frame(ts) {
      requestAnimationFrame(frame);
      if (ts - last < 33 || document.hidden || !$("wall").hidden) return;
      const dt = Math.min(0.1, (ts - last) / 1000); last = ts; t += dt;
      const p = odds(), want = p == null ? 0.5 : p;
      shown += (want - shown) * Math.min(1, dt * 2);
      for (const cv of document.querySelectorAll("canvas.bt-beams")) {
        const w = cv.clientWidth, h = cv.clientHeight;
        if (!w || !h) continue;
        if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
        const g = cv.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, w, h);
        g.globalCompositeOperation = "lighter";
        const x = shown * w, y = h / 2, k = p == null ? 0.35 : 1, th = Math.max(1, h / 14);
        for (const [c, x0, share] of [[UP, 0, shown], [DN, w, 1 - shown]]) for (const [lw, a] of [[10, 0.12], [4, 0.45], [1.4, 0.95]]) {
          const gr = g.createLinearGradient(x0, 0, x, 0); gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(1, `rgba(${c},${a * k})`);
          g.strokeStyle = gr; g.lineWidth = lw * th * (0.6 + share) * (1 + 0.06 * Math.sin(t * 31 + x0)); g.lineCap = "round";
          g.beginPath(); g.moveTo(x0, y); g.lineTo(x, y); g.stroke();
        }
        const r = h * (0.55 + 0.08 * Math.sin(t * 19)), gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(255,250,240,${0.95 * k})`); gr.addColorStop(0.25, `rgba(255,197,106,${0.6 * k})`); gr.addColorStop(1, "rgba(255,197,106,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
    }
    if (!reduce) requestAnimationFrame(frame);
    return { draw() { if (reduce) { last = -1e9; frame(performance.now()); } } };
  })();

  function mLastRound(size, title) {
    const prev = S.prev;
    if (!prev || !prev.result) return `<h3>${esc(title)}</h3><p class="bt-empty">Waiting for Kalshi's result.</p>`;
    const right = prev.calls.filter(c => c.correct === true).length, wrong = prev.calls.filter(c => c.correct === false).length;
    const best = prev.calls.filter(c => c.paperPerContract != null).sort((a, b) => b.paperPerContract - a.paperPerContract)[0];
    const up = prev.result === "up";
    if (size === "strip") return `<div class="bt-run"><span>Last round Bitcoin went <b class="${up ? "up" : "dn"}">${up ? "▲ Up" : "▼ Down"}</b></span><span>${right} right · ${wrong} wrong</span>${best ? `<span>Best: <b>${esc(best.name)}</b> ${signed(best.paperPerContract)}</span>` : ""}</div>`;
    return `<h3>${esc(title)}<small>${time(prev.round)}–${time(prev.round + Q)}</small></h3><p class="bt-big ${up ? "up" : "dn"}">${up ? "▲ Up" : "▼ Down"}</p>
      <p class="bt-sub">${right} right · ${wrong} wrong</p>${best ? `<p class="bt-sub">Best paper result: <b>${esc(best.name)}</b> <span class="up">${signed(best.paperPerContract)}</span> on $1</p>` : ""}`;
  }

  // ---------- streams: the battle's links, its fighters' own streams, and the hall's video ----------
  // Each becomes { label, url, embed(muted) | null, thumb | null }. YouTube, Twitch and Kick play here; the rest open.
  function embedOf(url) {
    let u; try { u = new URL(url); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www|m)\./, ""), parts = u.pathname.split("/").filter(Boolean);
    let yt = null;
    if (host === "youtu.be") yt = parts[0];
    else if (host === "youtube.com") yt = parts[0] === "watch" ? u.searchParams.get("v") : ["shorts", "live", "embed"].includes(parts[0]) ? parts[1] : null;
    if (yt && /^[A-Za-z0-9_-]{11}$/.test(yt)) return { kind: parts[0] === "shorts" ? "short" : "video", thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, src: m => `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=${m ? 1 : 0}&playsinline=1&rel=0` };
    if (host === "twitch.tv" && parts[0] && /^\w{2,25}$/.test(parts[0])) return { kind: "video", thumb: null, src: m => `https://player.twitch.tv/?channel=${parts[0]}&parent=${location.hostname}&autoplay=true&muted=${m}` };
    if (host === "kick.com" && parts[0] && /^[\w-]{2,25}$/.test(parts[0])) return { kind: "video", thumb: null, src: m => `https://player.kick.com/${parts[0]}?autoplay=true&muted=${m}` };
    return null;
  }
  function streams() {
    const out = [], seen = new Set();
    const add = (label, url) => { if (!url || seen.has(url)) return; seen.add(url); out.push({ label, url, ...(embedOf(url) || { src: null, thumb: null }) }); };
    if (S.b) { for (const s of S.b.streams) add(s.label, s.url); for (const e of S.b.entrants) if (e.streamUrl) add(e.name, e.streamUrl); }
    if (S.hallVideo) add(S.hallVideo.title || "On D3MON", S.hallVideo.watch);
    return out;
  }
  const featured = () => { const all = streams(), i = S.cp ? S.cp.featured || 0 : 0; return all[i] || all[0] || null; };
  function frame(st, muted, cls = "") {
    return st.src ? `<iframe class="${cls}" src="${esc(st.src(muted))}" title="${esc(st.label)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`
      : `<a class="bt-ext ${cls}" href="${esc(st.url)}" target="_blank" rel="noopener"><b>${esc(st.label)}</b><span>Open the stream ↗</span></a>`;
  }
  function mStream(size, title) {
    const st = featured(), all = streams();
    if (!st) return `<h3>${esc(title)}</h3><p class="bt-empty">No streams yet. HardSmoke adds them to the battle.</p>`;
    return `<h3>${esc(title || st.label)}<small>${all.length > 1 ? `${all.length} streams` : "Live"}</small></h3>
      <div class="bt-frame">${!$("wall").hidden ? "" : frame(st, !S.sound)}<button type="button" class="bt-open" data-wall aria-label="Open the Stream Wall"><span>${all.length > 1 ? `All ${all.length} streams` : "Full screen"} ⤢</span></button></div>`;
  }
  function mPromo(size, title, scr) {
    const v = scr.promo;
    if (!v) return `<h3>${esc(title)}</h3>`;
    return `${title ? `<h3>${esc(title)}</h3>` : ""}<div class="bt-frame"><iframe src="${esc(`${v.embed}?autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=0&playsinline=1&rel=0`)}" title="${esc(title || "Promo")}" allow="autoplay; encrypted-media" loading="lazy"></iframe></div>`;
  }
  function mMessage(size, title, scr) {
    return `${title ? `<h3>${esc(title)}</h3>` : ""}<p class="bt-msg">${esc(scr.text || "")}</p>`;
  }

  // ---------- the crowd: the members' own paper votes on this round ----------
  function mCrowd(size, title) {
    const d = S.votes;
    if (!d) return `<h3>${esc(title)}</h3><p class="bt-empty">Loading the floor…</p>`;
    const sp = d.split, total = sp.openUp + sp.openDown, up = total ? sp.openUp / total : 0.5;
    const line = total ? `${Math.round(up * 100)}% Up · ${total} in` : "Be the first to call it";
    if (size === "strip") return `<div class="bt-run"><span>The crowd: <b>${line}</b></span>${d.actions.slice(-4).reverse().map(a => `<span><b>${esc(a.name)}</b> ${a.action === "exit" ? "cashed out" : `<span class="${a.dir === "up" ? "up" : "dn"}">${a.dir === "up" ? "▲" : "▼"}</span>`}</span>`).join("")}</div>`;
    return `<h3>${esc(title)}<small>${line}</small></h3><div class="bt-split" aria-hidden="true"><i class="up" style="width:${up * 100}%"></i><i class="dn" style="width:${(1 - up) * 100}%"></i></div>
      <ol class="bt-feed">${d.actions.slice(size === "big" ? -10 : size === "low" ? -3 : -5).reverse().map(a => `<li${a.badge ? ' class="b"' : ""}><b>${esc(a.name)}</b>${a.badge ? '<i aria-label="badge">★</i>' : ""} ${a.action === "exit" ? `cashed out${a.got != null ? ` @ ${cents(a.got)}` : ""}` : `${a.action === "switch" ? "switched to" : "called"} <span class="${a.dir === "up" ? "up" : "dn"}">${a.dir === "up" ? "▲ Up" : "▼ Down"}</span>${a.paid != null ? ` @ ${cents(a.paid)}` : ""}`}</li>`).join("") || `<li class="bt-empty">No votes yet this round.</li>`}</ol>`;
  }

  // ---------- vote and chat: built once per screen, then updated in place (so typing isn't interrupted) ----------
  function voteBox() {
    return `<div class="bt-vote"><div class="bt-vbtns"><button type="button" class="bt-vb up" data-v="up">▲ Up</button><button type="button" class="bt-vb dn" data-v="down">▼ Down</button><button type="button" class="bt-vb out" data-v="out" hidden>Cash out</button></div>
      <p class="bt-mine" aria-live="polite"></p><p class="bt-err" role="alert"></p></div>`;
  }
  function chatBox() {
    return `<div class="bt-chat"><ol class="bt-msgs"></ol>${S.me || DEMO ? `<form class="bt-say" autocomplete="off"><input maxlength="400" placeholder="Say something to the floor" aria-label="Message" required><button type="submit" class="bt-vb send">Send</button></form>` : `<p class="bt-sub"><a href="login">Sign in</a> to chat and vote.</p>`}<p class="bt-err" role="alert"></p></div>`;
  }
  function fillVote(root) {
    const d = S.votes, box = root.querySelector(".bt-vote"); if (!box) return;
    const btns = box.querySelector(".bt-vbtns");
    btns.hidden = !(S.me || DEMO) || (d && d.canVote === false);
    if (!d) return;
    const o = d.open, ch = d.mode === "changeable", pr = S.market && S.market.price;
    const [bu, bd, bo] = btns.children;
    bo.hidden = !o; bu.hidden = !!o && (o.dir === "up" || !ch); bd.hidden = !!o && (o.dir === "down" || !ch);
    bu.textContent = o ? "Switch to ▲ Up" : "▲ Up"; bd.textContent = o ? "Switch to ▼ Down" : "▼ Down";
    const worth = o && pr ? (o.dir === "up" ? (pr.down != null ? 1 - pr.down : null) : pr.up != null ? 1 - pr.up : null) : null;
    const pl = worth != null && o.paid != null ? worth - o.paid : null;
    box.querySelector(".bt-mine").innerHTML = !(S.me || DEMO) ? (root.querySelector(".bt-chat") ? "" : `<a href="login">Sign in</a> to make your call.`) : d.canVote === false ? "Voting is off for you in this battle."
      : o ? `You're in <b class="${o.dir === "up" ? "up" : "dn"}">${o.dir === "up" ? "▲ Up" : "▼ Down"}</b>${o.paid != null ? ` @ ${cents(o.paid)}` : ""}${pl != null ? ` · <span class="${pl >= 0 ? "up" : "dn"}">${signed(pl)} if you cash out</span>` : ""}` : "Your call: Up or Down by the end of the round.";
  }
  function fillChat(root) {
    const list = root.querySelector(".bt-msgs"); if (!list) return;
    const n = root.dataset.size === "low" ? 3 : root.dataset.size === "desk" ? 4 : root.dataset.size === "big" ? 12 : 7;
    const html = S.chat.slice(-n).map(m => `<li${m.as ? ` class="as-${esc(m.as)}"` : ""}><b>${esc(m.name)}</b>${m.from === "discord" ? '<span class="bt-via">Discord</span>' : ""} ${esc(m.text)}</li>`).join("") || `<li class="bt-empty">Quiet so far. Say hello.</li>`;
    if (list.innerHTML !== html) list.innerHTML = html;
  }

  // ---------- each screen: its module, rebuilt only when what it shows changes ----------
  const BUILD = {
    odds: s => mOdds(s), bots: (s, t) => mFighters(s, "bot", t || "The bots"), callers: (s, t) => mFighters(s, "caller", t || "Callers"),
    scripts: (s, t) => mFighters(s, "script", t || "Chart scripts"), lineup: (s, t) => mFighters(s, null, t || "The fighters"),
    standings: (s, t) => mStandings(s, t || "Standings"), stream: (s, t) => mStream(s, t), crowd: (s, t) => mCrowd(s, t || "The crowd"),
    lastRound: (s, t) => mLastRound(s, t || "Last round"), message: (s, t, scr) => mMessage(s, t, scr), promo: (s, t, scr) => mPromo(s, t, scr), off: () => "",
  };
  function renderAll() {
    if (!S.cp) return;
    for (const el of document.querySelectorAll("[data-slot]")) {
      const scr = S.cp.screens[el.dataset.slot] || { show: "off" }, size = el.dataset.size, mod = scr.show;
      el.dataset.mod = mod;
      if (mod === "vote" || mod === "chat" || mod === "desk") {
        const key = `${mod}|${scr.title || ""}|${!!S.me}`;
        if (el.dataset.key !== key) {
          el.dataset.key = key;
          const t = scr.title || { vote: "Your call", chat: "The chat", desk: "" }[mod];
          el.innerHTML = `${t ? `<h3>${esc(t)}</h3>` : ""}<div class="bt-desk">${mod !== "chat" ? voteBox() : ""}${mod !== "vote" ? chatBox() : ""}</div>`;
        }
        fillVote(el); fillChat(el);
        continue;
      }
      // iframes (streams, promos) are kept as they are unless what they play changes
      const html = BUILD[mod] ? BUILD[mod](size, scr.title || "", scr) : "";
      const key = mod === "stream" || mod === "promo" ? `${mod}|${html}` : html;
      if (el.dataset.key === key) continue;
      el.dataset.key = key; el.innerHTML = html;
      for (const cv of el.querySelectorAll("canvas.bt-sig")) if (window.D3Sigils) window.D3Sigils.draw(cv.getContext("2d"), cv.dataset.kind, 52, 52, 80, { t: 1, a: 1, lit: 0.5 });
    }
    beams.draw();
  }
  // the clock ticks every second without rebuilding anything else
  function tick() {
    const n = now(), cur = Math.floor(n / Q) * Q;
    if (S.round && cur !== S.round) roundOver(S.round);
    if (cur !== S.round) { S.round = cur; Promise.all([loadBoard(), loadVotes(), loadMarket()]).then(renderAll); }
    const odd = document.querySelectorAll('[data-mod="odds"]');
    if (odd.length && (n - cur > Q - LOCK - 1000 || (S.flash && Date.now() - S.flash.at < 6000))) renderAll();
    else for (const c of document.querySelectorAll("[data-clock]")) c.textContent = mmss(cur + Q - n);
  }
  function roundOver(r) {
    let tries = 0;
    const look = async () => {
      const prev = await get(`rounds/${r}/calls`).catch(() => null);
      if (prev && prev.result) { S.prev = prev; S.flash = { dir: prev.result, at: Date.now() }; loadBoard().then(loadResults).then(renderAll); return; }
      if (++tries < 40) setTimeout(look, 3000);
    };
    setTimeout(look, DEMO ? 2500 : 4000);
    setTimeout(() => loadBoard().then(renderAll), 1500); // the sealed calls are revealed at the close
  }

  // ---------- clicks on the screens ----------
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-wall]")) return openWall();
    const v = e.target.closest("[data-v]");
    if (v) {
      const box = v.closest(".bt-vote"), err = box.querySelector(".bt-err"); err.textContent = "";
      if (DEMO) { err.textContent = "This is a preview, so votes aren't sent."; return; }
      const path = v.dataset.v === "out" ? "votes/exit" : S.votes && S.votes.open ? "votes/change" : "votes";
      try { const r = await A.api("POST", path, v.dataset.v === "out" ? { session: session() } : { dir: v.dataset.v, session: session() }); S.votes = r.round; renderAll(); }
      catch (x) { err.textContent = x.message; }
    }
  });
  document.addEventListener("submit", async e => {
    const f = e.target.closest(".bt-say"); if (!f) return;
    e.preventDefault();
    const input = f.querySelector("input"), err = f.parentElement.querySelector(".bt-err"), text = input.value.trim();
    if (!text) return;
    err.textContent = "";
    if (DEMO) { err.textContent = "This is a preview, so messages aren't sent."; return; }
    try { await A.api("POST", "hall/chat", { text }); input.value = ""; await loadChat(); renderAll(); } catch (x) { err.textContent = x.message; }
  });

  // a badge holder's vote pops up for everyone
  const seenBadge = new Set(); let toastsReady = false;
  function toastNew() {
    const d = S.votes; if (!d) return;
    for (const a of d.actions) if (a.badge && a.action !== "exit" && !seenBadge.has(a.id)) { seenBadge.add(a.id); if (toastsReady) toast(a); }
    toastsReady = true;
  }
  function toast(a) {
    const el = document.createElement("div");
    el.className = `bt-toast ${a.dir === "up" ? "up" : "dn"}`;
    el.innerHTML = `<i aria-hidden="true">★</i><span><b>${esc(a.name)}</b> called <b>${a.dir === "up" ? "▲ UP" : "▼ DOWN"}</b>${a.paid != null ? ` @ ${cents(a.paid)}` : ""}</span>`;
    $("toasts").append(el);
    setTimeout(() => el.classList.add("out"), 5200); setTimeout(() => el.remove(), 6000);
  }

  // ---------- the Stream Wall ----------
  // The featured stream plays big with sound; up to three others play muted beside it; the rest are still cards
  // (a picture where YouTube has one) until chosen. Grid mode shows them all the same size. Only one has sound.
  const W = { i: 0, grid: false, back: null, live: 3 };
  function openWall() {
    const all = streams();
    if (!all.length) return;
    W.back = document.activeElement;
    const f = featured(); W.i = Math.max(0, all.indexOf(all.find(s => f && s.url === f.url)));
    $("wall").hidden = false; document.body.classList.add("bt-walled");
    bg.pause(); renderAll(); drawWall();
    $("wallClose").focus();
  }
  function closeWall() {
    $("wall").hidden = true; document.body.classList.remove("bt-walled");
    $("wallBody").innerHTML = ""; video(); renderAll();
    if (W.back && W.back.focus) W.back.focus();
  }
  function drawWall() {
    const all = streams(), body = $("wallBody");
    W.i = Math.min(W.i, all.length - 1);
    $("gridBtn").setAttribute("aria-pressed", String(W.grid)); $("gridBtn").textContent = W.grid ? "Feature one" : "Grid";
    const others = all.map((s, i) => [s, i]).filter(([, i]) => i !== W.i);
    const card = ([s, i], live) => `<button type="button" class="bt-wcard" data-pick="${i}" aria-label="Watch ${esc(s.label)}">${live && s.src ? frame(s, true, "bt-wlive") : s.thumb ? `<img src="${esc(s.thumb)}" alt="" loading="lazy">` : `<span class="bt-wblank">▶</span>`}<b>${esc(s.label)}</b></button>`;
    if (W.grid) {
      body.className = `bt-wall-body grid n${Math.min(all.length, 16)}`;
      body.innerHTML = all.map((s, i) => i === W.i ? `<div class="bt-wcard on">${frame(s, false, "bt-wlive")}<b>${esc(s.label)} · sound on</b></div>` : card([s, i], others.findIndex(([, k]) => k === i) < W.live)).join("");
      return;
    }
    const f = all[W.i];
    body.className = "bt-wall-body";
    body.innerHTML = `<div class="bt-wmain">${frame(f, false, "bt-wbig")}<p><b>${esc(f.label)}</b> <a href="${esc(f.url)}" target="_blank" rel="noopener">Open on its site ↗</a></p></div>
      <div class="bt-wside" aria-label="Other streams">${others.map((o, k) => card(o, k < W.live)).join("") || `<p class="bt-empty">This is the only stream.</p>`}</div>`;
  }
  $("wallBody").addEventListener("click", e => { const b = e.target.closest("[data-pick]"); if (b) { W.i = +b.dataset.pick; W.grid = false; drawWall(); } });
  $("wallClose").addEventListener("click", closeWall);
  $("gridBtn").addEventListener("click", () => { W.grid = !W.grid; drawWall(); });
  $("wallBtn").addEventListener("click", openWall);
  document.addEventListener("keydown", e => {
    if ($("wall").hidden || e.target.closest("input, select, textarea")) return;
    const n = streams().length;
    if (e.key === "Escape") closeWall();
    else if (e.key === "ArrowRight") { W.i = (W.i + 1) % n; drawWall(); }
    else if (e.key === "ArrowLeft") { W.i = (W.i - 1 + n) % n; drawWall(); }
    else if (e.key === "g" || e.key === "G") { W.grid = !W.grid; drawWall(); }
    else if (/^[1-9]$/.test(e.key) && +e.key <= n) { W.i = +e.key - 1; W.grid = false; drawWall(); }
    else if (e.key === "Tab") { // keep focus inside the wall
      const f = [...$("wall").querySelectorAll("button, a[href], iframe")]; if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  // sound on the cockpit's stream screen (browsers start videos muted)
  $("soundBtn").addEventListener("click", () => { S.sound = !S.sound; $("soundBtn").textContent = S.sound ? "Sound on" : "Sound off"; $("soundBtn").setAttribute("aria-pressed", String(S.sound)); renderAll(); });

  // ---------- HardSmoke's controls (admins) ----------
  async function openCtl() {
    const cp = S.cp; $("ctlErr").textContent = ""; $("ctlErr").classList.remove("ok");
    const { battles } = DEMO ? { battles: [S.b] } : await A.api("GET", "battles").catch(() => ({ battles: [] }));
    $("cBattle").innerHTML = `<option value="">Choose by itself: the one running now, else the next</option>` + battles.filter(Boolean).map(b => `<option value="${esc(b.id)}"${cp.battleId === b.id ? " selected" : ""}>${esc(b.title)} · ${esc(day(b.startsAt))}${b.status === "draft" ? " (draft, not shown)" : ""}</option>`).join("");
    const all = streams();
    $("cFeatured").innerHTML = all.length ? all.map((s, i) => `<option value="${i}"${(cp.featured || 0) === i ? " selected" : ""}>${esc(s.label)}${s.src ? "" : " (opens on its site)"}</option>`).join("") : `<option value="0">No streams yet: add them to the battle on Applications</option>`;
    $("cScreens").innerHTML = cp.slots.map(slot => {
      const s = cp.screens[slot];
      return `<div class="bt-ctl-row" data-row="${slot}"><label for="m-${slot}">${esc(SLOT_NAME[slot] || slot)}</label>
        <select id="m-${slot}" data-f="show">${Object.entries(cp.modules).map(([k, name]) => `<option value="${k}"${s.show === k ? " selected" : ""}>${esc(name)}</option>`).join("")}</select>
        <input data-f="title" maxlength="40" placeholder="Heading (optional)" value="${esc(s.title || "")}" aria-label="${esc(SLOT_NAME[slot])} heading">
        <textarea data-f="text" maxlength="280" rows="2" placeholder="The message" aria-label="${esc(SLOT_NAME[slot])} message">${esc(s.text || "")}</textarea>
        <input data-f="video" maxlength="300" placeholder="YouTube link for the promo" value="${esc(s.video || "")}" aria-label="${esc(SLOT_NAME[slot])} promo link"></div>`;
    }).join("");
    for (const row of $("cScreens").children) showFields(row);
    // the votes for this battle (or the everyday floor when no battle is running)
    $("cVoteSession").textContent = session() === "live" ? "No battle is running, so these are the everyday floor's settings (the same as on Live)." : "For this battle's votes.";
    const vs = DEMO ? { mode: "locked", off: [] } : await A.api("GET", `votes/sessions/${session()}`).catch(() => null);
    $("cVotes").hidden = !vs;
    if (vs) { $("cChange").checked = vs.mode === "changeable"; for (const c of document.querySelectorAll("#cVotes [data-cat]")) c.checked = !vs.off.includes(c.dataset.cat); }
    $("ctl").hidden = false; $("cBattle").focus();
  }
  function showFields(row) {
    const m = row.querySelector('[data-f="show"]').value;
    row.querySelector('[data-f="text"]').hidden = m !== "message";
    row.querySelector('[data-f="video"]').hidden = m !== "promo";
    row.querySelector('[data-f="title"]').hidden = m === "off" || m === "odds";
  }
  $("cScreens").addEventListener("change", e => { const row = e.target.closest("[data-row]"); if (row) showFields(row); });
  // point at a row and its screen lights up in the cockpit behind
  $("cScreens").addEventListener("focusin", e => { const row = e.target.closest("[data-row]"); for (const el of document.querySelectorAll("[data-slot]")) el.classList.toggle("bt-hl", !!row && el.dataset.slot === row.dataset.row); });
  $("ctlForm").addEventListener("submit", async e => {
    e.preventDefault();
    const screens = {};
    for (const row of $("cScreens").children) {
      const f = k => row.querySelector(`[data-f="${k}"]`).value.trim(), show = f("show");
      screens[row.dataset.row] = { show, ...(f("title") && show !== "off" && show !== "odds" ? { title: f("title") } : {}), ...(show === "message" ? { text: f("text") } : {}), ...(show === "promo" ? { video: f("video") } : {}) };
    }
    const body = { battleId: $("cBattle").value || null, featured: +$("cFeatured").value || 0, screens };
    if (DEMO) { Object.assign(S.cp, { featured: body.featured }); for (const [k, v] of Object.entries(screens)) S.cp.screens[k] = { ...v, promo: null }; renderAll(); return closeCtl(); }
    try {
      const vs = { mode: $("cChange").checked ? "changeable" : "locked", off: [...document.querySelectorAll("#cVotes [data-cat]")].filter(c => !c.checked).map(c => c.dataset.cat) };
      S.cp = await A.api("PUT", "cockpit", body); S.b = S.cp.battle;
      if (!$("cVotes").hidden) await A.api("PUT", `votes/sessions/${session()}`, vs);
      header(); await Promise.all([loadBoard(), loadResults(), loadVotes()]); renderAll(); closeCtl();
    } catch (x) {
      $("ctlErr").textContent = x.message;
      const row = x.field && $("cScreens").querySelector(`[data-row="${x.field.split(".")[1]}"]`);
      if (row) row.querySelector(`[data-f="${x.field.split(".")[2] || "show"}"]`)?.focus();
    }
  });
  $("ctlReset").addEventListener("click", async () => {
    if (DEMO) return closeCtl();
    try { S.cp = await A.api("PUT", "cockpit", { screens: Object.fromEntries(S.cp.slots.map(s => [s, null])) }); renderAll(); closeCtl(); } catch (x) { $("ctlErr").textContent = x.message; }
  });
  function closeCtl() { $("ctl").hidden = true; for (const el of document.querySelectorAll(".bt-hl")) el.classList.remove("bt-hl"); $("ctlBtn").focus(); }
  $("ctlBtn").addEventListener("click", openCtl);
  $("ctlClose").addEventListener("click", closeCtl);
  $("ctl").addEventListener("keydown", e => { if (e.key === "Escape") closeCtl(); });

  // ---------- made-up data for ?demo ----------
  function demo() {
    const names = [["Valhalla", "bot", "Odin"], ["NeuroBot 9", "bot", "Ada"], ["Tidewater", "bot", "Kai"], ["Iron Owl", "bot", "Mira"], ["Quanta", "bot", "Zed"], ["Helix 7", "bot", "Noor"], ["Ghost", "caller", ""], ["Maya", "caller", ""], ["Rook", "caller", ""], ["Kronos", "script", "Lena"], ["Fibonacci Fox", "script", "Sam"], ["Sigma Lines", "script", "Ivo"]];
    const t0 = Date.now(), start = Math.floor(t0 / Q) * Q - 2 * Q;
    const entrants = names.map(([name, kind, creatorName], i) => ({ id: `e${i}`, name, kind, creatorName, slug: name.toLowerCase().replace(/\W+/g, "-"), streamUrl: "" }));
    const b = { id: "demo1", title: "Battle of the Bots · Saturday", startsAt: start, rounds: 8, roundMs: Q, endsAt: start + 8 * Q, status: "open", entrants,
      streams: [["HardSmoke live", "https://www.youtube.com/watch?v=jfKfPfyJRdk"], ["Valhalla's desk", "https://www.youtube.com/watch?v=5qap5aO4i9A"], ["Kronos charts", "https://www.twitch.tv/hardsmoke"], ["Odin's stream", "https://www.youtube.com/watch?v=DWcJFNfaw9c"], ["Maya calls", "https://kick.com/maya"], ["D3MON Discord", "https://discord.gg/d3mon"]].map(([label, url]) => ({ label, url })) };
    const cp = { battleId: null, featured: 0, battle: b, slots: ["ticker", "main", "leftTop", "leftBottom", "rightTop", "rightBottom", "lowerLeft", "console", "lowerRight"],
      modules: { odds: "Round clock and Kalshi's odds", bots: "Bots", callers: "Callers", scripts: "Chart scripts", lineup: "Everyone in the battle", standings: "Battle standings", stream: "Stream (opens the Stream Wall)", crowd: "The crowd's votes", desk: "Vote and chat", vote: "Vote", chat: "Chat", lastRound: "Last round", message: "A message", promo: "Promo video", off: "Nothing (screen off)" },
      screens: { ticker: { show: "odds" }, main: { show: "bots" }, leftTop: { show: "callers" }, leftBottom: { show: "scripts" }, rightTop: { show: "stream" }, rightBottom: { show: "crowd" }, lowerLeft: { show: "vote" }, console: { show: "chat" }, lowerRight: { show: "lastRound" } } };
    let up = 0.58;
    const call = (e, i, r) => e.kind === "caller" && Date.now() < r + Q ? { entrantId: e.id, sealed: true } : { entrantId: e.id, name: e.name, direction: (i * 7 + r / Q) % 3 < 2 ? "up" : "down", price: { paid: +(0.38 + ((i * 13) % 30) / 100).toFixed(2) } };
    const chat = [["Maya", "Morning floor. Leaning up this round."], ["Rook", "Funding flipped negative, careful."], ["Valhalla", "Called. Let's see it.", "bot"], ["Dex", "first time here, this is sick"], ["HardSmoke", "Welcome to the Battle of the Bots!"], ["Kronos", "Signal: momentum up, 0.71", "script"]];
    return {
      get(path) {
        const n = Date.now(), cur = Math.floor(n / Q) * Q;
        up = Math.min(0.9, Math.max(0.1, up + (Math.random() - 0.5) * 0.06));
        if (path === "cockpit") return Promise.resolve(cp);
        if (path === "market") return Promise.resolve({ round: cur, price: { up: +up.toFixed(2), down: +(1.02 - up).toFixed(2), target: 108450.12 } });
        if (path.endsWith("/board")) {
          const k = Math.min(entrants.length, 3 + Math.floor((n - t0) / 3000));
          return Promise.resolve({ rounds: [{ round: cur, calls: entrants.slice(0, k).map((e, i) => call(e, i, cur)) }], entrants: entrants.map((e, i) => ({ entrantId: e.id, called: 2, right: 1 + (i % 2), wrong: 1 - (i % 2), paperPerContract: i % 2 ? 0.42 : -0.12 })) });
        }
        if (path.endsWith("/results")) return Promise.resolve({ status: "live", settledRounds: 2, rounds: 8, notice: "Not financial advice.", standings: entrants.slice(0, 8).map((e, i) => ({ rank: i + 1, correct: 8 - i, accuracy: 0.9 - i * 0.05, entrant: e })) });
        if (path.startsWith("votes/round")) {
          const who = ["Maya", "Dex", "Rook", "Odin", "Lena", "Ghost"], k = Math.min(who.length, 2 + Math.floor((n - t0) / 4000));
          const actions = who.slice(0, k).map((name, i) => ({ id: `v${i}`, name, action: "enter", dir: i % 3 ? "up" : "down", paid: 0.5, at: cur, badge: name === "Ghost" ? "auto" : null }));
          const u = actions.filter(a => a.dir === "up").length;
          return Promise.resolve({ round: cur, mode: "locked", split: { openUp: u, openDown: k - u, entries: k, voters: k }, actions, open: null, canVote: true });
        }
        if (path.startsWith("hall/chat")) return Promise.resolve({ messages: chat.slice(0, 2 + Math.floor((n - t0) / 5000)).map(([name, text, as], i) => ({ id: `m${i}`, name, text, ...(as ? { as } : {}) })) });
        if (path.startsWith("rounds/")) return Promise.resolve({ round: cur - Q, result: "up", calls: entrants.slice(0, 9).map((e, i) => ({ name: e.name, correct: i % 3 > 0, paperPerContract: i % 3 ? 0.4 - i * 0.02 : -0.5 })) });
        if (path === "hall/video") return Promise.resolve({ video: null });
        return Promise.resolve({});
      },
    };
  }

  // ---------- start ----------
  (async () => {
    place(); phone.addEventListener("change", () => { place(); video(); renderAll(); });
    gate(); $("introBtn").hidden = reduce;
    addEventListener("resize", fit);
    if (!DEMO) await A.syncClock().catch(() => {});
    S.me = DEMO ? null : await A.session().catch(() => null);
    $("ctlBtn").hidden = !admin();
    await loadCockpit().catch(() => { S.cp = null; });
    if (!S.cp) { $("bState").textContent = " · Couldn't load the battle. Refresh to try again."; return; }
    S.hallVideo = (await get("hall/video").catch(() => ({}))).video || null;
    await Promise.all([loadBoard(), loadResults(), loadMarket(), loadVotes(), loadChat(), loadPrev()].map(p => p.catch(() => {})));
    S.round = Math.floor(now() / Q) * Q;
    renderAll(); fit(); video();
    $("soundBtn").hidden = !featured() || !featured().src;
    setInterval(tick, 1000);
    setInterval(() => renderAll(), 8000); // turns the pages of long lineups
    setInterval(() => loadMarket().then(renderAll), 5000);
    setInterval(() => loadBoard().then(renderAll), DEMO ? 3000 : 15000);
    setInterval(() => loadResults().then(renderAll), 60000);
    setInterval(() => loadVotes().then(renderAll), DEMO ? 4000 : 30000);
    setInterval(() => loadChat().then(renderAll), DEMO ? 5000 : 20000);
    if (DEMO) return;
    // the live feed brings calls, results, votes, chat and HardSmoke's changes at once
    let soon = 0; const later = fn => { clearTimeout(soon); soon = setTimeout(() => fn().then(renderAll).catch(() => {}), 300); };
    const topics = ["cockpit", "hall", "votes", "battles", ...(S.b ? [`battle:${S.b.id}`] : [])];
    A.follow(topics, (type, data) => {
      if (type === "cockpit.updated") {
        if ((data.battle && data.battle.id) !== (S.b && S.b.id)) return location.reload(); // a different battle: follow its feed
        S.cp = data; S.b = data.battle; header(); later(() => Promise.all([loadBoard(), loadResults(), loadVotes()])); }
      else if (type === "hall.chat") later(loadChat);
      else if (type === "votes.badge" && data && !seenBadge.has(data.id)) { seenBadge.add(data.id); toast(data); }
      else if (type === "votes.action" || type === "votes.session") later(loadVotes);
      else if (type === "battle.updated" && S.b && data && data.id === S.b.id) { S.b = data; header(); later(loadBoard); }
      else if (type === "call.received" || type === "round.locked" || type === "round.scored" || type === "round.metrics") later(() => Promise.all([loadBoard(), loadResults()]));
    }, on => $("liveDot").classList.toggle("feed", on));
  })();
})();
