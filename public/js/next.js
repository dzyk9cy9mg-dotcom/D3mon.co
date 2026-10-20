// The new D3MON front page (/next): a thin client over /api/v1. The hero's field of tiny triangles in the three
// colours, the live round and its calls, the chat, HardSmoke's next battle as a countdown, the marketplace of
// callers, bots and scripts, the tournaments and the next capstone session. No logic the server doesn't decide.
(function () {
  "use strict";
  const { api, esc, session, syncClock, serverNow } = window.Arena;
  const $ = id => document.getElementById(id);
  const Q = 15 * 60000, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = { kind: "daily", filter: "all", entrants: [] };
  const time = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const pct = v => (v == null ? "–" : `${Math.round(v * 100)}%`);
  const KIND = { caller: "Caller", bot: "Bot", script: "Chart script" };

  // ---------- the hero's wall: dark triangle tiles that slowly push in and out (after Rubric's tile wall), rising
  // toward the pointer. Lit from above: a tile further forward catches more light. The glass pyramid glows on top.
  function field() {
    const cv = $("field"), g = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    let W, H, S, tiles = [], mx = -1e4, my = -1e4, ease = 0;
    function size() {
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = W > 900 ? 96 : 64; // a tile's side
      const h = S * 0.866; tiles = [];
      for (let r = -1; r * h < H + h; r++) for (let c = -2; c * S / 2 < W + S; c++) {
        const up = (r + c) % 2 === 0, x = c * S / 2, y = r * h;
        tiles.push({ up, x, y, cx: x + S / 2, cy: y + (up ? h * 2 / 3 : h / 3), p: Math.random() * 6.28, f: 0.25 + Math.random() * 0.35 });
      }
    }
    function tri(t, inset) {
      const h = S * 0.866, x = t.x, y = t.y, k = inset;
      const pts = t.up ? [[x + S / 2, y], [x + S, y + h], [x, y + h]] : [[x, y], [x + S, y], [x + S / 2, y + h]];
      g.beginPath();
      pts.forEach(([px, py], i) => { const qx = px + (t.cx - px) * k, qy = py + (t.cy - py) * k; g[i ? "lineTo" : "moveTo"](qx, qy); });
      g.closePath();
    }
    function draw(now) {
      const tt = now / 1000;
      ease = Math.min(1, ease + 0.02);
      g.fillStyle = "#06080c"; g.fillRect(0, 0, W, H);
      for (const t of tiles) {
        // how far forward the tile sits: a slow swell across the wall, plus the pointer pulling nearby tiles out
        const swell = reduce ? 0.4 : 0.5 + 0.5 * Math.sin(tt * t.f + t.p + t.cx * 0.004 - t.cy * 0.003);
        const d = Math.hypot(t.cx - mx, t.cy - my), pull = Math.max(0, 1 - d / 260);
        const z = (0.25 + 0.55 * swell + 0.6 * pull) * ease;
        // the wall darkens toward the middle-left, where the text sits, so it never fights the words
        const quiet = Math.min(1, Math.hypot((t.cx - W * 0.28) / (W * 0.45), (t.cy - H * 0.5) / (H * 0.6)));
        const lit = Math.round(10 + 22 * z * (0.35 + 0.65 * quiet));
        // the tile's face, lighter at the top edge (light from above), then a dark seam around it
        const grd = g.createLinearGradient(0, t.y, 0, t.y + S * 0.866);
        grd.addColorStop(0, `rgb(${lit + 8},${lit + 10},${lit + 14})`); grd.addColorStop(1, `rgb(${lit - 4},${lit - 3},${lit})`);
        g.fillStyle = grd; tri(t, 0.06 + 0.05 * (1 - z)); g.fill();
        g.strokeStyle = `rgba(170,200,240,${0.03 + 0.07 * z * quiet})`; g.lineWidth = 1; g.stroke();
      }
      if (seen && !reduce && !document.hidden) requestAnimationFrame(draw);
    }
    let seen = true; // the wall rests while the hero is scrolled away
    new IntersectionObserver(([en]) => { const was = seen; seen = en.isIntersecting; if (seen && !was && !reduce) requestAnimationFrame(draw); }).observe(cv);
    size(); requestAnimationFrame(draw);
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    addEventListener("pointermove", e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && seen && !reduce) requestAnimationFrame(draw); });
  }

  // ---------- the gathering (after Dala): tiny triangles drift in from everywhere and come together on a triangle's
  // edges, coloured by its corners (callers at the top, bots left, scripts right). The pointer scatters the nearest
  // ones and they drift back. shape() gives the corners in the canvas's pixels; onNear fires as they arrive.
  function gather(cv, shape, { cols, n, rest = 0.3, onNear }) {
    const g = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    let W, H, A, pts = [], t0 = 0, near = false, mx = -1e4, my = -1e4, run = false;
    const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",");
    function size() {
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      A = shape();
      for (const q of pts) home(q);
    }
    function home(q) {
      const a = A[q.side], b = A[(q.side + 1) % 3];
      q.hx = a[0] + (b[0] - a[0]) * q.f + q.j; q.hy = a[1] + (b[1] - a[1]) * q.f + q.j * 0.6;
    }
    pts = Array.from({ length: n }, (_, i) => ({
      side: i % 3, f: Math.random(), j: (Math.random() - 0.5) * (Math.random() < 0.8 ? 3 : 18),
      sx: Math.random(), sy: Math.random(), d: Math.random() * 0.8, s: 1 + Math.random() * 2.4, r: Math.random() * 6.3, p: Math.random() * 6.3, ox: 0, oy: 0
    }));
    size();
    for (const q of pts) q.c = mix(cols[q.side], cols[(q.side + 1) % 3], q.f);
    function draw(now) {
      const t = (now - t0) / 1000;
      g.clearRect(0, 0, W, H);
      for (const q of pts) {
        const k = reduce ? 1 : Math.min(1, Math.max(0, (t - q.d) / 3)), e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
        const sx = q.sx * W, sy = q.sy * H, wob = reduce ? 0 : 1.2 + 6 * (1 - e);
        let x = sx + (q.hx - sx) * e + Math.sin(t * 0.7 + q.p) * wob, y = sy + (q.hy - sy) * e + Math.cos(t * 0.6 + q.p) * wob;
        // the pointer pushes nearby ones aside; they ease back once it moves on
        const dx = x - mx, dy = y - my, dd = Math.hypot(dx, dy), push = reduce ? 0 : Math.max(0, 1 - dd / 110) * 26;
        q.ox += ((dd ? dx / dd : 0) * push - q.ox) * 0.08; q.oy += ((dd ? dy / dd : 0) * push - q.oy) * 0.08;
        x += q.ox; y += q.oy;
        // bright in flight, then settling to a faint shimmer on the edge
        const settle = Math.min(1, Math.max(0, t - 3.4) / 1.6), a = (0.55 + 0.4 * Math.sin(t * 1.3 + q.p) ** 2) * (1 - settle * (1 - rest));
        const r = q.r + (reduce ? 0 : t * 0.4);
        g.fillStyle = `rgba(${q.c},${a.toFixed(3)})`;
        g.beginPath();
        for (let m = 0; m < 3; m++) { const an = r + m * 2.094; g[m ? "lineTo" : "moveTo"](x + Math.cos(an) * q.s, y + Math.sin(an) * q.s); }
        g.fill();
      }
      if (!near && (reduce || t > 2)) { near = true; onNear && onNear(); }
      if (run && !reduce && !document.hidden) requestAnimationFrame(draw);
    }
    const go = () => { if (run) return; run = true; requestAnimationFrame(draw); };
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) go(); else run = false; });
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    addEventListener("pointermove", e => { const b = cv.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && run && !reduce) requestAnimationFrame(draw); });
    return { start() { t0 = performance.now(); io.observe(cv); }, size };
  }

  // The hero: the particles gather on the glass pyramid's front face, found in the picture (its pixels below), then
  // the pyramid fades in where they meet.
  const FACE = { wide: [[1157, 322], [903, 742], [1488, 746]], phone: [[390, 466], [2, 1105], [778, 1105]] };
  function heroDust() {
    const cv = $("dust"), im = document.querySelector(".n-jewel img");
    const shape = () => {
      const c = cv.getBoundingClientRect(), b = im.getBoundingClientRect(), iw = im.naturalWidth || 1600, ih = im.naturalHeight || 1000;
      const s = Math.max(b.width / iw, b.height / ih), [px, py] = getComputedStyle(im).objectPosition.split(" ").map(v => parseFloat(v) / 100);
      const ox = b.left - c.left + (b.width - iw * s) * px, oy = b.top - c.top + (b.height - ih * s) * py;
      return FACE[ih > iw ? "phone" : "wide"].map(([x, y]) => [ox + x * s, oy + y * s]);
    };
    const dust = gather(cv, shape, { cols: [[255, 181, 71], [77, 163, 255], [185, 140, 255]], n: innerWidth > 900 ? 900 : 480, rest: 0.22, onNear: () => im.classList.add("on") });
    let begun = false;
    const begin = () => { if (begun) return; begun = true; dust.size(); dust.start(); };
    im.complete && im.naturalWidth ? begin() : (im.addEventListener("load", begin), im.addEventListener("error", begin), setTimeout(begin, 2500));
  }

  // The capstone: gold particles gather into the capstone's small triangle as the section comes into view.
  function capDust() {
    const cv = $("capDust");
    const shape = () => { const w = cv.clientWidth, h = cv.clientHeight, r = Math.min(w, h * 1.3) * 0.32, cx = w / 2, cy = h * 0.58; return [[cx, cy - r], [cx - r * 0.95, cy + r * 0.62], [cx + r * 0.95, cy + r * 0.62]]; };
    const dust = gather(cv, shape, { cols: [[255, 241, 207], [233, 194, 122], [156, 115, 51]], n: 260, rest: 0.6 });
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { io.disconnect(); dust.start(); } }, { rootMargin: "0px 0px -20% 0px" });
    io.observe(cv);
  }

  // ---------- live ----------
  function tick() {
    const now = serverNow(), cur = Math.floor(now / Q) * Q, left = cur + Q - now;
    $("sLeft").textContent = mmss(left); $("lClock").textContent = mmss(left);
    $("lBar").style.width = `${((now - cur) / Q) * 100}%`;
    $("lRound").textContent = `Round ${time(cur)}–${time(cur + Q)} · Bitcoin up or down`;
    $("heroRound").textContent = `Live · round ${time(cur)}–${time(cur + Q)}`;
    if (S.round && S.round !== cur) loadLive();
    S.round = cur;
    countdown();
  }
  async function loadLive() {
    const cur = Math.floor(serverNow() / Q) * Q;
    const [calls, prev, market] = await Promise.all([api("GET", `rounds/${cur}/calls`), api("GET", `rounds/${cur - Q}/calls`), api("GET", "market").catch(() => null)]);
    $("sCalls").textContent = String(calls.calls.length);
    $("sUp").textContent = market?.price ? pct(market.price.up) : "–";
    $("lCalls").innerHTML = calls.calls.length ? calls.calls.slice(0, 8).map(c => `<li class="k-${esc(c.kind)}"><a href="profile?e=${encodeURIComponent(c.slug)}">${esc(c.name)}</a>
      <span>${c.sealed ? '<span class="sealed">sealed</span>' : c.direction === "up" ? '<b class="up">▲ Up</b>' : '<b class="dn">▼ Down</b>'}${c.price ? ` <span class="sealed">@${Math.round(c.price.paid * 100)}¢</span>` : ""}</span><time>${esc(time(c.receivedAt))}</time></li>`).join("")
      : `<li class="n-empty">No calls yet this round.</li>`;
    const right = prev.calls.filter(x => x.correct === true).length, wrong = prev.calls.filter(x => x.correct === false).length;
    $("lPrev").innerHTML = prev.result ? `Last round Bitcoin went <b class="${prev.result === "up" ? "up" : "dn"}">${prev.result}</b> · ${right} right, ${wrong} wrong` : "Last round: waiting for Kalshi";
  }
  async function loadChat() {
    const c = await api("GET", "hall/chat?limit=6").catch(() => null);
    if (c && c.messages.length) $("lChat").innerHTML = c.messages.slice(-5).map(m => `<li><b>${esc(m.name)}</b>${esc(m.text)}</li>`).join("");
  }
  async function loadHere() {
    const p = await api("GET", "presence").catch(() => null);
    if (!p) return;
    $("sHere").textContent = String(p.here);
    $("chatHere").textContent = `· ${p.here} here`;
  }

  // ---------- the battle ----------
  function countdown() {
    const b = S.battle;
    if (!b) return;
    const now = serverNow(), ms = b.startsAt - now;
    $("bCount").hidden = ms <= 0;
    if (ms <= 0) return;
    const s = Math.floor(ms / 1000);
    $("cD").textContent = Math.floor(s / 86400); $("cH").textContent = Math.floor((s % 86400) / 3600);
    $("cM").textContent = Math.floor((s % 3600) / 60); $("cS").textContent = s % 60;
  }
  async function loadBattle() {
    const { battles } = await api("GET", "battles");
    const now = serverNow(), live = battles.filter(b => b.status !== "draft");
    const b = live.find(x => x.startsAt <= now && now < x.endsAt) || live.filter(x => x.startsAt > now).sort((a, c) => a.startsAt - c.startsAt)[0] || null;
    S.battle = b;
    if (!b) { // no battle announced: say so, and point at joining instead of an empty countdown
      $("bWhen").textContent = "HardSmoke's next battle is announced here, with its lineup and a countdown.";
      $("bCount").hidden = true; $("bWatch").hidden = true;
      $("bApply").firstChild.textContent = "Join D3MON "; $("bApply").href = "apply";
      return;
    }
    const on = b.startsAt <= now;
    $("bTitle").textContent = b.title;
    $("bWhen").textContent = `${new Date(b.startsAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", hour: "numeric", minute: "2-digit" })} PT · ${b.rounds} rounds${on ? " · live now" : ""}`;
    $("bLineup").innerHTML = b.entrants.map(e => `<a class="k-${esc(e.kind)}" href="profile?e=${encodeURIComponent(e.slug)}">${esc(e.name)}<small>${esc(KIND[e.kind] || e.kind)}</small></a>`).join("");
    $("bStreams").innerHTML = (b.streams || []).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join("");
    const open = b.status === "open" && !on;
    $("bApply").hidden = !open; $("bApply").href = `apply?battle=${encodeURIComponent(b.id)}`;
    if (on) {
      const r = await api("GET", `battles/${b.id}/results`).catch(() => null);
      $("bBoard").hidden = !r;
      if (r) $("bBoard").innerHTML = r.standings.slice(0, 8).map(x => `<li><span class="r">${x.rank}</span><a href="profile?e=${encodeURIComponent(x.entrant.slug)}">${esc(x.entrant.name)}</a><span class="s">${x.correct} right · ${pct(x.accuracy)}</span></li>`).join("");
    }
    countdown();
  }

  // ---------- the marketplace ----------
  function renderShop() {
    const list = S.entrants.filter(e => S.filter === "all" || e.kind === S.filter);
    $("shop").innerHTML = list.length ? list.map(e => `<a class="n-item k-${esc(e.kind)}" href="profile?e=${encodeURIComponent(e.slug)}"><i class="glow" aria-hidden="true"></i>
        <small>${esc(KIND[e.kind] || e.kind)}${(e.badges || []).length ? " · battle winner" : ""}</small><h3>${esc(e.name)}</h3>
        <p>by ${esc(e.creatorName)}</p>${e.tagline ? `<p class="tag">“${esc(e.tagline)}”</p>` : ""}
        <span class="go">${e.shopUrl ? `Get ${esc(e.name)} →` : "See the record →"}</span></a>`).join("")
      : `<p class="n-empty">Nobody here yet. <a href="apply">Be the first.</a></p>`;
  }
  async function loadShop() {
    S.entrants = (await api("GET", "entrants")).entrants.filter(e => e.status === "active");
    renderShop();
  }

  // ---------- tournaments ----------
  async function loadTour() {
    const cur = await api("GET", "tournaments");
    $("tTabs").innerHTML = cur.tournaments.map(t => `<button type="button" role="tab" data-kind="${esc(t.kind)}" aria-selected="${t.kind === S.kind}">${esc(t.title.replace(" tournament", ""))}</button>`).join("");
    const id = cur.tournaments.find(t => t.kind === S.kind).id, t = (await api("GET", `tournaments/${id}`)).tournament;
    $("tWhen").textContent = `${t.title}: ${t.settledRounds} of ${t.rounds} rounds scored by Kalshi.`;
    $("tRows").innerHTML = t.standings.length ? t.standings.slice(0, 10).map(r => `<li><span class="r">${r.rank}</span><a href="profile?e=${encodeURIComponent(r.entrant.slug)}">${esc(r.entrant.name)}</a><span class="s">${r.correct} right · ${pct(r.accuracy)}</span></li>`).join("")
      : `<li><span class="r">–</span><span>No bots in this one yet.</span><a class="s" href="my">Join from My bots →</a></li>`;
  }

  // ---------- capstone ----------
  async function loadCap() {
    const s = (await api("GET", "vip/sessions")).upcoming[0];
    if (s) $("capNext").innerHTML = `<p class="n-k">Next session</p><b>${esc(s.title)}</b><p class="n-small">${esc(new Date(s.startsAt).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · ${s.minutes} minutes${s.leads ? ` · ${esc(s.leads)}` : ""}</p>`;
  }

  // ---------- page motion: the bar turns to glass on scroll, sections rise in, the nav marks where you are ----------
  function motion() {
    const bar = $("bar");
    addEventListener("scroll", () => bar.classList.toggle("solid", scrollY > 40), { passive: true });
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px" });
    document.querySelectorAll(".reveal").forEach(el => io.observe(el));
    const links = [...document.querySelectorAll(".n-nav a")];
    const spy = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === `#${e.target.id}`)); }), { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll("main section[id]").forEach(s => spy.observe(s));
    // on phones the nav folds into a Menu button that drops it down as a glass sheet
    const menu = $("menu"), open = on => { menu.setAttribute("aria-expanded", String(on)); bar.classList.toggle("open", on); };
    menu.addEventListener("click", () => open(menu.getAttribute("aria-expanded") !== "true"));
    links.forEach(a => a.addEventListener("click", () => open(false)));
    addEventListener("keydown", e => { if (e.key === "Escape") open(false); });
  }

  document.addEventListener("click", e => {
    const f = e.target.closest("[data-k]");
    if (f) { S.filter = f.dataset.k; document.querySelectorAll("[data-k]").forEach(b => b.setAttribute("aria-pressed", String(b === f))); renderShop(); }
    const t = e.target.closest("[data-kind]");
    if (t) { S.kind = t.dataset.kind; loadTour().catch(() => {}); }
  });

  field(); heroDust(); capDust(); motion();
  (async () => {
    const me = await session().catch(() => null);
    if (me) for (const a of [$("acct"), $("acct2")]) { a.textContent = me.name || me.username; a.href = "my"; }
    await syncClock().catch(() => {});
    tick(); setInterval(tick, 1000);
    const safe = f => f().catch(() => {});
    await Promise.all([loadLive, loadChat, loadHere, loadBattle, loadShop, loadTour, loadCap].map(safe));
    setInterval(() => safe(loadLive), 20000); setInterval(() => safe(loadChat), 15000); setInterval(() => safe(loadHere), 30000);
  })();
})();
