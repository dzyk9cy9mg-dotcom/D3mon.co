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

  // ---------- the hero's field: tiny triangles drifting, gathering into one large triangle (after Dala) ----------
  function field() {
    const cv = $("field"), g = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    const COLS = ["255,181,71", "77,163,255", "185,140,255"];
    let W, H, pts = [], t0 = performance.now();
    function size() {
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(900, W * H / 1500)), cx = W > 900 ? W * 0.72 : W * 0.5, cy = W > 900 ? H * 0.48 : 150, R = W > 900 ? Math.min(W, H) * 0.34 : Math.min(W * 0.22, 90);
      const A = [[cx, cy - R], [cx + R * 0.866, cy + R * 0.5], [cx - R * 0.866, cy + R * 0.5]];
      pts = Array.from({ length: n }, (_, i) => {
        const side = i % 3, a = A[side], b = A[(side + 1) % 3], f = Math.random(), inset = Math.random() < 0.7 ? 0 : Math.random() * 0.35;
        const ex = a[0] + (b[0] - a[0]) * f, ey = a[1] + (b[1] - a[1]) * f; // a home on the triangle's edge, some inside it
        return { hx: ex + (cx - ex) * inset, hy: ey + (cy - ey) * inset, x: Math.random() * W, y: Math.random() * H, s: 1.2 + Math.random() * 2.6, c: COLS[side], r: Math.random() * 6.3, p: Math.random() * 6.3 };
      });
    }
    function draw(now) {
      const k = reduce ? 1 : Math.min(1, (now - t0) / 2600), e = 1 - (1 - k) ** 3, tt = now / 1000;
      g.clearRect(0, 0, W, H);
      for (const q of pts) {
        const wob = reduce ? 0 : 3;
        const x = q.x + (q.hx - q.x) * e + Math.sin(tt * 0.6 + q.p) * wob, y = q.y + (q.hy - q.y) * e + Math.cos(tt * 0.5 + q.p) * wob, s = q.s, r = q.r + (reduce ? 0 : tt * 0.3);
        g.fillStyle = `rgba(${q.c},${0.35 + 0.45 * (0.5 + 0.5 * Math.sin(tt + q.p))})`;
        g.beginPath();
        for (let j = 0; j < 3; j++) { const a = r + j * 2.094; g[j ? "lineTo" : "moveTo"](x + Math.cos(a) * s, y + Math.sin(a) * s); }
        g.fill();
      }
      if (!reduce && !document.hidden) requestAnimationFrame(draw);
    }
    size(); requestAnimationFrame(draw);
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !reduce) requestAnimationFrame(draw); });
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
    if (!b) return;
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
    $("shop").innerHTML = list.length ? list.map(e => `<a class="n-item k-${esc(e.kind)}" href="profile?e=${encodeURIComponent(e.slug)}">
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
  }

  document.addEventListener("click", e => {
    const f = e.target.closest("[data-k]");
    if (f) { S.filter = f.dataset.k; document.querySelectorAll("[data-k]").forEach(b => b.setAttribute("aria-pressed", String(b === f))); renderShop(); }
    const t = e.target.closest("[data-kind]");
    if (t) { S.kind = t.dataset.kind; loadTour().catch(() => {}); }
  });

  field(); motion();
  (async () => {
    const me = await session().catch(() => null);
    if (me) { $("acct").textContent = me.name || me.username; $("acct").href = "my"; }
    await syncClock().catch(() => {});
    tick(); setInterval(tick, 1000);
    const safe = f => f().catch(() => {});
    await Promise.all([loadLive, loadChat, loadHere, loadBattle, loadShop, loadTour, loadCap].map(safe));
    setInterval(() => safe(loadLive), 20000); setInterval(() => safe(loadChat), 15000); setInterval(() => safe(loadHere), 30000);
  })();
})();
