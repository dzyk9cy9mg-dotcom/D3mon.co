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

  // ---------- the hero's wall (after Rubric's deep tiles, made D3MON's own): big matte-black triangular blocks with
  // deep sides, seen in perspective, forming a tunnel that opens around the glass pyramid. Blocks further out stand
  // nearer; each breathes slowly in and out, the ones near the pointer push out toward you on a spring and settle
  // back, and a click sends a push rippling through the wall. The edges facing the light catch a faint gold.
  // Reduce motion gets the still tunnel.
  function field() {
    const cv = $("field"), g = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    let W, H, S, F, vx, vy, tiles = [], mx = -1e4, my = -1e4, sx = 0, sy = 0, seen = true, waves = [], t0 = performance.now();
    const BACK = -520; // how deep the blocks' sides run
    // a few blocks are shortcuts, engraved with where they go (wide screens; phones have the Menu). Each sits at a
    // spot clear of the words and the pyramid, given as a share of the hero's width and height.
    const LINKS = [{ at: [0.49, 0.3], label: "Live", href: "#live" }, { at: [0.9, 0.25], label: "Tournaments", href: "tournaments" },
      { at: [0.49, 0.7], label: "Capstone", href: "vip" }];
    let hover = null;
    function size() {
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wide = W > 900;
      S = wide ? 190 : 120; F = wide ? 1700 : 1100;
      // the tunnel opens where the pyramid stands: right of the words on wide screens, the top half on phones
      vx = wide ? W * 0.72 : W * 0.5; vy = wide ? H * 0.5 : H * 0.26;
      const h = S * 0.866, open = wide ? Math.min(W, H) * 0.42 : W * 0.48; tiles = [];
      for (let r = -2; r * h < H + 2 * h; r++) for (let c = -3; c * S / 2 < W + 2 * S; c++) {
        const up = (r + c) % 2 === 0, x = c * S / 2, y = r * h;
        const pts = up ? [[x + S / 2, y], [x + S, y + h], [x, y + h]] : [[x, y], [x + S, y], [x + S / 2, y + h]];
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const ins = pts.map(([px, py]) => [px + (cx - px) * 0.06, py + (cy - py) * 0.06]); // the seam between blocks
        const k = Math.min(1, Math.max(0, (Math.hypot(cx - vx, cy - vy) - open) / (open * 1.3)));
        // calm behind the words: the blocks there sit back and stay dark so the text reads
        const calm = wide ? Math.max(0, 1 - Math.hypot((cx - W * 0.22) / (W * 0.26), (cy - H * 0.5) / (H * 0.42))) : 0;
        tiles.push({ pts: ins, cx, cy, up, calm, base: (40 + 230 * k * k * (3 - 2 * k)) * (1 - 0.7 * calm), z: 0, v: 0, p: Math.random() * 6.28, f: 0.25 + Math.random() * 0.25 });
      }
      if (wide) for (const l of LINKS) { // the upward block nearest each spot carries the shortcut
        const [px, py] = [l.at[0] * W, l.at[1] * H];
        const at = x => proj(x.cx, x.cy, x.base + 70); // where it will stand, raised
        const t = tiles.filter(x => x.up && !x.link && x.calm < 0.05 && at(x)[1] > H * 0.2 && at(x)[1] < H * 0.78 && at(x)[0] < W - S * 0.5)
          .sort((a, b) => Math.hypot(at(a)[0] - px, at(a)[1] - py) - Math.hypot(at(b)[0] - px, at(b)[1] - py))[0];
        if (t) t.link = l;
      }
    }
    // a point at depth z, seen from in front of the vanishing point (which drifts a little with the pointer)
    const proj = (x, y, z) => { const s = F / (F - z), ox = vx + sx, oy = vy + sy; return [ox + (x - ox) * s, oy + (y - oy) * s]; };
    function draw(now) {
      const tt = (now - t0) / 1000, R = W > 900 ? 300 : 180;
      waves = waves.filter(w => tt - w.t < 2.6);
      if (!reduce) { sx += ((mx > -1e3 ? (mx - vx) * -0.04 : 0) - sx) * 0.05; sy += ((my > -1e3 ? (my - vy) * -0.04 : 0) - sy) * 0.05; }
      const intro = reduce ? 1 : Math.min(1, tt / 2.2), io = 1 - (1 - intro) ** 3; // on arrival the blocks slide forward out of the dark
      for (const t of tiles) {
        const breathe = reduce ? 0 : 18 * Math.sin(tt * t.f + t.p);
        const d = Math.hypot(t.cx - mx, t.cy - my), near = Math.max(0, 1 - d / R), push = near * near * (3 - 2 * near) * 110;
        let ring = 0;
        for (const w of waves) { const rr = (tt - w.t) * 700, gap = Math.abs(Math.hypot(t.cx - w.x, t.cy - w.y) - rr); ring = Math.max(ring, Math.max(0, 1 - gap / 120) * (1 - (tt - w.t) / 2.6)); }
        const target = (t.base + breathe + push + 110 * ring + (t.link ? 70 : 0) + (t === hover ? 45 : 0)) * io - 200 * (1 - io);
        if (reduce) t.z = target; else { t.v += (target - t.z) * 0.06; t.v *= 0.8; t.z += t.v; } // a soft spring: it pumps out, then settles
        t.near = near;
      }
      g.fillStyle = "#040507"; g.fillRect(0, 0, W, H);
      const ox = vx + sx, oy = vy + sy;
      for (const t of [...tiles].sort((a, b) => a.z - b.z)) { // far blocks first
        const front = t.pts.map(([x, y]) => proj(x, y, t.z)), back = t.pts.map(([x, y]) => proj(x, y, BACK));
        const depth = Math.max(0, Math.min(1, t.z / 300));
        // the sides: only the ones that face the opening are seen; lit a little from above, warmed by the pointer
        for (let m = 0; m < 3; m++) {
          const a = t.pts[m], b = t.pts[(m + 1) % 3], mxm = (a[0] + b[0]) / 2, mym = (a[1] + b[1]) / 2;
          let nx = b[1] - a[1], ny = a[0] - b[0];
          if (nx * (mxm - t.cx) + ny * (mym - t.cy) < 0) { nx = -nx; ny = -ny; } // the side's outward direction
          if (nx * (ox - mxm) + ny * (oy - mym) <= 0) continue;
          const nl = Math.hypot(nx, ny), up = Math.max(0, -ny / nl);
          const l = (16 + 22 * up + 14 * depth) * (1 - 0.6 * t.calm);
          const warm = t.near * 26;
          const grd = g.createLinearGradient(...front[m], ...back[m]);
          grd.addColorStop(0, `rgb(${Math.round(l + warm)},${Math.round(l + warm * 0.75)},${Math.round(l + 4 + warm * 0.35)})`); grd.addColorStop(1, "rgb(3,4,6)");
          g.fillStyle = grd;
          g.beginPath(); g.moveTo(...front[m]); g.lineTo(...front[(m + 1) % 3]); g.lineTo(...back[(m + 1) % 3]); g.lineTo(...back[m]); g.closePath(); g.fill();
        }
        // the face: matte black, a touch lighter at the top, a faint rim, gold where the pointer is near
        const top = Math.min(front[0][1], front[1][1], front[2][1]), bot = Math.max(front[0][1], front[1][1], front[2][1]);
        const lf = Math.round((28 + 12 * depth) * (1 - 0.55 * t.calm)), fg = g.createLinearGradient(0, top, 0, bot);
        fg.addColorStop(0, `rgb(${lf + 5},${lf + 6},${lf + 9})`); fg.addColorStop(1, `rgb(${lf - 5},${lf - 5},${lf - 3})`);
        g.fillStyle = fg;
        g.beginPath(); g.moveTo(...front[0]); g.lineTo(...front[1]); g.lineTo(...front[2]); g.closePath(); g.fill();
        g.strokeStyle = t.near > 0.05 ? `rgba(233,194,122,${(0.06 + 0.4 * t.near).toFixed(3)})` : `rgba(190,205,230,${((0.06 + 0.08 * depth) * (1 - 0.6 * t.calm)).toFixed(3)})`;
        g.lineWidth = 1; g.stroke();
        t.front = front;
      }
      for (const t of tiles) {
        if (t.link && t.front) { const front = t.front; // the engraving: the place's name, gold with an arrow when the pointer is on it
          const on = t === hover, c = front.reduce((q, [x, y]) => [q[0] + x / 3, q[1] + y / 3], [0, 0]), sc = F / (F - t.z);
          g.save(); g.textAlign = "center"; g.textBaseline = "middle";
          g.font = `500 ${Math.round(11 * sc)}px "IBM Plex Mono", monospace`; g.letterSpacing = `${(2 * sc).toFixed(1)}px`;
          g.fillStyle = on ? "#F2D49A" : `rgba(205,215,232,${(0.62 * io).toFixed(2)})`;
          if (on) { g.shadowColor = "rgba(233,194,122,.7)"; g.shadowBlur = 12; }
          g.fillText(t.link.label.toUpperCase(), c[0], c[1] - 2 * sc);
          g.font = `400 ${Math.round(13 * sc)}px "IBM Plex Mono", monospace`;
          g.fillStyle = on ? "#F2D49A" : `rgba(200,212,230,${(0.28 * io).toFixed(2)})`;
          g.fillText(on ? "→" : "·", c[0], c[1] + 18 * sc);
          g.restore();
        }
      }
      if (seen && !reduce && !document.hidden) requestAnimationFrame(draw);
    }
    new IntersectionObserver(([en]) => { const was = seen; seen = en.isIntersecting; if (seen && !was && !reduce) requestAnimationFrame(draw); }).observe(cv); // the wall rests while scrolled away
    size(); requestAnimationFrame(draw);
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    // which shortcut block, if any, is under a point (its face as drawn last frame)
    const inside = (P, x, y) => { let sgn = 0; for (let m = 0; m < 3; m++) { const [ax, ay] = P[m], [bx, by] = P[(m + 1) % 3], c = (bx - ax) * (y - ay) - (by - ay) * (x - ax); if (c) { if (sgn && Math.sign(c) !== sgn) return false; sgn = Math.sign(c); } } return true; };
    const linkAt = (x, y) => tiles.find(t => t.link && t.front && inside(t.front, x, y)) || null;
    addEventListener("pointermove", e => {
      const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
      hover = e.target === cv ? linkAt(mx, my) : null; cv.style.cursor = hover ? "pointer" : "";
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { mx = my = -1e4; hover = null; });
    cv.addEventListener("click", e => {
      const r = cv.getBoundingClientRect(), t = linkAt(e.clientX - r.left, e.clientY - r.top);
      if (!t) return;
      if (t.link.href.startsWith("#")) { document.querySelector(t.link.href).scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); return; }
      // a real link, clicked where the block is, so the page transition opens from the block
      const a = document.createElement("a"); a.href = t.link.href; a.hidden = true; document.body.appendChild(a);
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, detail: 1 }));
      a.remove();
    });
    cv.closest(".n-hero").addEventListener("pointerdown", e => { if (reduce) return; const r = cv.getBoundingClientRect(); waves.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: (performance.now() - t0) / 1000 }); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && seen && !reduce) requestAnimationFrame(draw); });
  }

  // ---------- the pyramid comes alive: a point of light slowly circles its edges, a pulse rises up the beam from the
  // tip, the tip breathes, and the whole pyramid shifts a little with the pointer for depth. The lines are laid over
  // the picture from its own pixels (FACE: tip, left and right corners; BEAM: where the beam leaves the top).
  const FACE = { wide: [[1157, 322], [903, 742], [1488, 746]], phone: [[390, 466], [2, 1105], [778, 1105]] };
  function jewel() {
    const im = document.querySelector(".n-jewel img"), sv = $("glint"), hero = sv.closest(".n-hero");
    const place = () => {
      const c = sv.getBoundingClientRect(), b = im.parentNode.getBoundingClientRect(), iw = im.naturalWidth, ih = im.naturalHeight; // the frame, not the picture, which zooms in as it fades
      if (!iw || !b.width) return;
      const s = Math.max(b.width / iw, b.height / ih), [px, py] = getComputedStyle(im).objectPosition.split(" ").map(v => parseFloat(v) / 100);
      const ox = b.left - c.left + (b.width - iw * s) * px, oy = b.top - c.top + (b.height - ih * s) * py;
      const [T, L, R] = FACE[ih > iw ? "phone" : "wide"].map(([x, y]) => [ox + x * s, oy + y * s]);
      const loop = `M${T} L${L} L${R} Z`;
      sv.querySelectorAll(".run").forEach(p => p.setAttribute("d", loop));
      sv.querySelector(".pulse").setAttribute("d", `M${T} L${T[0]} ${Math.max(0, oy)}`);
      const ap = sv.querySelector(".apex"); ap.setAttribute("cx", T[0]); ap.setAttribute("cy", T[1]);
      sv.classList.add("on");
    };
    const on = () => { im.classList.add("on"); place(); };
    im.complete && im.naturalWidth ? on() : im.addEventListener("load", on);
    addEventListener("resize", place);
    if (reduce) return;
    // depth: the pyramid drifts a few pixels against the pointer, easing there in CSS
    hero.addEventListener("pointermove", e => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--px", `${(((e.clientX - r.left) / r.width) - 0.5) * -18}px`);
      hero.style.setProperty("--py", `${(((e.clientY - r.top) / r.height) - 0.5) * -12}px`);
    }, { passive: true });
    hero.addEventListener("pointerleave", () => { hero.style.setProperty("--px", "0px"); hero.style.setProperty("--py", "0px"); });
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

  field(); jewel(); motion();
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
