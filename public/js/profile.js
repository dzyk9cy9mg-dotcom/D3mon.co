// /profile?e=<slug>: an entrant's profile in the cinematic style (owner, 2026-10-16 and 2026-10-20). A full-screen
// stage pinned while you scroll the first part of the page; the scroll drives the art: a bot assembles from its
// metal plates into the D3MON cube, a caller's hologram forms out of scanlines into the eye, a chart script's chart
// draws itself in light. "I am NAME." with the name in the kind's colour, HUD labels in the corners, the owner's
// tagline in a glass card. Then the record (verified, then self-reported), recent calls and the shop window.
// Without ?e=, every entrant to choose from. Thin client over /api/v1: only what the owner made public shows.
// Reduce motion shows the finished art.
(function () {
  "use strict";
  const { api, esc, kindName, statText, statValue, verifTag, wide } = window.Arena;
  const $ = id => document.getElementById(id);
  const slug = new URLSearchParams(location.search).get("e") || "";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLOR = { bot: "#4DA3FF", script: "#B98CFF", caller: "#FFB547" };
  const RGB = { bot: [77, 163, 255], script: [185, 140, 255], caller: [255, 181, 71] };
  const KIND = { caller: "Caller", bot: "Bot", script: "Chart script" };
  const when = ms => new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const time = ms => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  // ---------- the art, driven by the scroll (p: 0 at the top of the page, 1 when the stage lets go) ----------
  function art(kind) {
    const cv = $("art"), g = cv.getContext("2d"), hero = $("hero"), C = RGB[kind] || RGB.bot;
    const rgba = a => `rgba(${C[0]},${C[1]},${C[2]},${a})`;
    let W = 0, H = 0, dpr = 1, p = reduce ? 1 : 0, show = p, t = 0, last = performance.now(), raf = 0;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ease = u => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3, ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

    // where the figure sits: right of the words on wide screens, behind them on phones
    const place = () => (W > 900 ? { x: W * 0.66, y: H * 0.5, s: Math.min(H * 0.62, W * 0.4) } : { x: W * 0.5, y: H * 0.3, s: Math.min(W * 0.78, H * 0.38) });

    // the bot: an isometric cube in plates. Each face is cut into a 3x3 grid of plates; they start scattered and
    // fly in to their places, one face after another; then the edges light and the core glows.
    const plates = [];
    const cube = (() => { // the cube's three visible faces, as in the Bots symbol (js/sigils.js)
      const v = { top: [0, -1], tr: [0.866, -0.5], br: [0.866, 0.5], bot: [0, 1], bl: [-0.866, 0.5], tl: [-0.866, -0.5], c: [0, 0] };
      return [[v.tl, v.top, v.tr, v.c], [v.c, v.tr, v.br, v.bot], [v.tl, v.c, v.bot, v.bl]];
    })();
    cube.forEach((f, fi) => {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        const at = (u, w) => lerp(lerp(f[0], f[1], u), lerp(f[3], f[2], u), w);
        const q = [at(i / 3, j / 3), at((i + 1) / 3, j / 3), at((i + 1) / 3, (j + 1) / 3), at(i / 3, (j + 1) / 3)].map(([x, y]) => [x * 0.94 + (at((i + 0.5) / 3, (j + 0.5) / 3)[0]) * 0.06, y * 0.94 + (at((i + 0.5) / 3, (j + 0.5) / 3)[1]) * 0.06]);
        const a = rnd() * Math.PI * 2;
        plates.push({ q, face: fi, from: [Math.cos(a) * (1.6 + rnd() * 1.6), Math.sin(a) * (1.2 + rnd() * 1.4)], spin: (rnd() - 0.5) * 6, delay: fi * 0.12 + rnd() * 0.14 });
      }
    });
    // the caller: the eye drawn as horizontal scanlines that slide in from both sides, with dust settling into it
    const lines = Array.from({ length: 34 }, (_, i) => ({ y: -1 + (i + 0.5) * (2 / 34), from: rnd() < 0.5 ? -1 : 1, delay: rnd() * 0.35 }));
    const dust = Array.from({ length: 260 }, () => ({ a: rnd() * Math.PI * 2, r: 0.2 + rnd() * 1.6, tx: (rnd() - 0.5) * 1.5, ty: (rnd() - 0.5) * 0.7, d: rnd() * 0.3 }));
    // the chart script: candles rising on a grid, then the rising wave drawing itself in light, with the maths
    let price = 0.5; const candles = Array.from({ length: 26 }, (_, i) => { const o = price; price = Math.min(0.9, Math.max(0.12, price + (rnd() - 0.42) * 0.12)); return { o, c: price, h: Math.max(o, price) + rnd() * 0.05, l: Math.min(o, price) - rnd() * 0.05, d: i / 26 }; });
    const maths = ["Σ(Δp · v) / n", "∂p/∂t > 0", "μ + 2σ", "EMA₂₁ ↗", "p = 0.71"];

    function size() { dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function frame(nowMs) {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000)); last = nowMs; t += dt;
      show += (p - show) * Math.min(1, dt * 6);
      const k = reduce ? 1 : show, { x, y, s } = place();
      g.clearRect(0, 0, W, H);
      // a pool of the kind's colour behind the figure, growing as it forms
      const pool = g.createRadialGradient(x, y, 0, x, y, s * 1.2); pool.addColorStop(0, rgba(0.16 * (0.3 + k))); pool.addColorStop(1, rgba(0));
      g.fillStyle = pool; g.fillRect(0, 0, W, H);
      g.save(); g.translate(x, y);
      if (kind === "bot") {
        const S = s * 0.42;
        for (const pl of plates) {
          const u = ease((k - pl.delay) / 0.55), fx = pl.from[0] * (1 - u) * S, fy = pl.from[1] * (1 - u) * S, rot = pl.spin * (1 - u);
          const cx = pl.q.reduce((a, b) => a + b[0], 0) / 4 * S, cy = pl.q.reduce((a, b) => a + b[1], 0) / 4 * S;
          g.save(); g.translate(fx + cx, fy + cy); g.rotate(rot); g.globalAlpha = 0.25 + 0.75 * u;
          g.beginPath(); pl.q.forEach(([px, py], i) => g[i ? "lineTo" : "moveTo"](px * S - cx, py * S - cy)); g.closePath();
          const shade = [0.2, 0.11, 0.07][pl.face];
          g.fillStyle = `rgba(${18 + 40 * shade},${24 + 60 * shade},${36 + 90 * shade},0.92)`; g.fill();
          g.strokeStyle = rgba(0.25 + 0.55 * u); g.lineWidth = 1; g.stroke();
          g.restore();
        }
        const lit = ss(0.72, 0.95, k);
        if (lit > 0) { // the edges light, then the core
          g.globalAlpha = lit; g.strokeStyle = rgba(0.95); g.lineWidth = 2; g.shadowColor = rgba(1); g.shadowBlur = 18;
          g.beginPath(); [[0, -1], [0.866, -0.5], [0.866, 0.5], [0, 1], [-0.866, 0.5], [-0.866, -0.5]].forEach(([px, py], i) => g[i ? "lineTo" : "moveTo"](px * S, py * S)); g.closePath(); g.stroke();
          g.beginPath(); g.moveTo(0, 0); g.lineTo(0, S); g.moveTo(0, 0); g.lineTo(-0.866 * S, -0.5 * S); g.moveTo(0, 0); g.lineTo(0.866 * S, -0.5 * S); g.stroke();
          g.shadowBlur = 0;
          const core = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.35); core.addColorStop(0, `rgba(235,246,255,${0.9 * lit})`); core.addColorStop(0.3, rgba(0.5 * lit)); core.addColorStop(1, rgba(0));
          g.fillStyle = core; g.beginPath(); g.arc(0, 0, S * 0.35, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      } else if (kind === "caller") {
        const S = s * 0.5, eyeH = y2 => { const ax = Math.abs(y2); return Math.sqrt(Math.max(0, 1 - (ax / 0.55) ** 2)); }; // half-width of the eye at height y
        for (const l of lines) {
          const yy = l.y * 0.55, half = eyeH(yy) * S * 1.05; if (half <= 0) continue;
          const u = ease((k - l.delay) / 0.5), off = l.from * (1 - u) * W * 0.6, flick = reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 9 + l.y * 20);
          g.strokeStyle = rgba(0.18 + 0.5 * u * flick); g.lineWidth = 1.4;
          g.beginPath(); g.moveTo(-half + off, yy * S); g.lineTo(half + off, yy * S); g.stroke();
        }
        const iris = ss(0.45, 0.8, k);
        if (iris > 0) { // the iris and its pupil, then the light above (the signal)
          g.globalAlpha = iris; g.strokeStyle = rgba(1); g.lineWidth = 2.5; g.shadowColor = rgba(1); g.shadowBlur = 20;
          g.beginPath(); g.arc(0, 0, S * 0.24, 0, 7); g.stroke();
          g.beginPath(); g.moveTo(-S * 1.05, 0); g.quadraticCurveTo(0, -S * 0.78, S * 1.05, 0); g.quadraticCurveTo(0, S * 0.78, -S * 1.05, 0); g.stroke();
          g.shadowBlur = 0;
          const pupil = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.12); pupil.addColorStop(0, "rgba(255,245,225,1)"); pupil.addColorStop(1, rgba(0));
          g.fillStyle = pupil; g.beginPath(); g.arc(0, 0, S * 0.12, 0, 7); g.fill();
          const sig = ss(0.8, 1, k); g.globalAlpha = sig;
          for (const r of [0.55, 0.85]) { g.beginPath(); g.arc(0, -S * 0.25, S * r, Math.PI * 1.25, Math.PI * 1.75); g.stroke(); }
          g.globalAlpha = 1;
        }
        for (const d of dust) { // dust drifting in and settling into the eye
          const u = ease((k - d.d) / 0.6), px = (Math.cos(d.a) * d.r * (1 - u) + d.tx * u) * S, py = (Math.sin(d.a) * d.r * (1 - u) + d.ty * u * eyeH(d.ty * 0.55)) * S;
          g.fillStyle = rgba(0.15 + 0.5 * (1 - u)); g.fillRect(px, py, 1.6, 1.6);
        }
      } else { // script
        const S = s * 0.55, gx = -S, gw = 2 * S, gy = -S * 0.7, gh = 1.4 * S;
        g.strokeStyle = rgba(0.1); g.lineWidth = 1;
        for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(gx, gy + gh * i / 6); g.lineTo(gx + gw * ss(0, 0.3, k), gy + gh * i / 6); g.stroke(); }
        const cw = gw / candles.length;
        candles.forEach((c, i) => {
          const u = ease((k - 0.1 - c.d * 0.45) / 0.18); if (u <= 0) return;
          const X = gx + cw * (i + 0.5), Y = v => gy + gh * (1 - v), up = c.c >= c.o, col = up ? "46,229,157" : "255,90,114";
          g.strokeStyle = `rgba(${col},${0.5 * u})`; g.beginPath(); g.moveTo(X, Y(c.l)); g.lineTo(X, Y(c.h)); g.stroke();
          const top = Y(Math.max(c.o, c.c)), bot = Y(Math.min(c.o, c.c)), mid = (top + bot) / 2;
          g.fillStyle = `rgba(${col},${0.55 * u})`; g.fillRect(X - cw * 0.3, mid - (mid - top) * u, cw * 0.6, Math.max(1.5, (bot - top) * u));
        });
        const draw = ss(0.5, 0.92, k);
        if (draw > 0) { // the wave of light, drawing itself across the chart
          g.save(); g.beginPath(); g.rect(gx - 4, gy - 40, gw * draw + 8, gh + 80); g.clip();
          g.strokeStyle = rgba(1); g.lineWidth = 2.6; g.shadowColor = rgba(1); g.shadowBlur = 16;
          g.beginPath(); candles.forEach((c, i) => { const X = gx + cw * (i + 0.5), Yv = gy + gh * (1 - (c.o + c.c) / 2); i ? g.lineTo(X, Yv) : g.moveTo(X, Yv); }); g.stroke();
          g.restore();
          const i = Math.min(candles.length - 1, Math.floor(draw * candles.length)), c = candles[i];
          g.fillStyle = "rgba(255,245,225,1)"; g.beginPath(); g.arc(gx + cw * (i + 0.5), gy + gh * (1 - (c.o + c.c) / 2), 4, 0, 7); g.fill();
        }
        const m = ss(0.7, 1, k);
        if (m > 0) { g.font = '500 14px "IBM Plex Mono", monospace'; maths.forEach((f, i) => { g.fillStyle = rgba(0.45 * m); g.fillText(f, gx + gw * (0.05 + (i % 3) * 0.33), gy - 18 - (i > 2 ? 22 : 0)); }); }
      }
      g.restore();
      if (!reduce && Math.abs(p - show) > 0.001 || kind === "caller" && !reduce) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const onScroll = () => {
      const r = hero.getBoundingClientRect(), span = Math.max(1, r.height - innerHeight);
      p = reduce ? 1 : Math.min(1, Math.max(0, -r.top / (span * 0.8)));
      // the words and the tagline arrive with the art; the scroll cue fades
      hero.style.setProperty("--p", p.toFixed(3));
      $("quote").classList.toggle("on", p > 0.55);
      $("cue").classList.toggle("off", p > 0.05);
      kick();
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", () => { size(); kick(); });
    size(); onScroll(); kick();
  }

  // ---------- the record, calls and shop ----------
  function statCard(st) {
    return `<div class="pf-stat${wide(st) ? " wide" : ""}"><span class="pf-sl">${esc(st.label)}</span><span class="pf-sv">${statValue(st)}</span>${st.description ? `<span class="pf-sd">${esc(st.description)}</span>` : ""}</div>`;
  }
  async function load() {
    const [{ entrant: e }, card, calls] = await Promise.all([
      api("GET", `entrants/${encodeURIComponent(slug)}`),
      api("GET", `entrants/${encodeURIComponent(slug)}/card`).catch(() => ({ stats: [] })),
      api("GET", `entrants/${encodeURIComponent(slug)}/calls?limit=12`).then(r => r.calls).catch(() => []),
    ]);
    const kind = e.kind in COLOR ? e.kind : "bot";
    document.title = `${e.name} · ${KIND[kind]} · D3MON`;
    document.body.style.setProperty("--kc", COLOR[kind]);
    document.body.dataset.kind = kind;
    $("hero").hidden = false; $("body").hidden = false;
    const cur = Math.floor(Date.now() / 900000) * 900000, live = calls.some(c => c.round === cur);
    $("kind").innerHTML = `<canvas width="56" height="56" aria-hidden="true"></canvas><span>${esc(KIND[kind])}${live ? " · called this round" : ""}</span>`;
    if (window.D3Sigils) window.D3Sigils.draw($("kind").querySelector("canvas").getContext("2d"), kind, 28, 28, 44, { t: 1, a: 1, lit: 0.5 });
    $("nameEm").textContent = `${e.name}.`;
    // a long name shrinks to fit its line rather than breaking mid-word
    requestAnimationFrame(() => { const em = $("nameEm"), room = $("pfName").clientWidth, need = em.scrollWidth; if (need > room) em.style.fontSize = `${(parseFloat(getComputedStyle(em).fontSize) * room / need).toFixed(1)}px`; });
    $("by").innerHTML = `Made by <b>${esc(e.creatorName)}</b>`;
    $("badges").innerHTML = (e.badges || []).map(b => `<span class="pf-badge">Winner · ${esc(b.title)}</span>`).join("");
    $("quote").hidden = !e.tagline;
    $("tagline").textContent = e.tagline || "";
    $("tagBy").textContent = e.name;
    $("hudTL").innerHTML = `${esc(KIND[kind])}<br><b>${esc(e.name)}</b>`;
    $("hudTR").innerHTML = `Active since<br><b>${esc(when(e.approvedAt))}</b>`;
    $("hudBL").innerHTML = `${live ? '<i class="on"></i>Called this round' : '<i></i>Not called this round'}`;
    $("hudBR").innerHTML = `Battles <b>${(e.battles || []).length}</b> · Wins <b>${(e.badges || []).length}</b>`;
    // the record: verified first, then self-reported
    const shown = card.stats.filter(st => st.value !== null && st.value !== undefined);
    const ver = shown.filter(st => st.verification !== "self-reported"), self = shown.filter(st => st.verification === "self-reported");
    $("verH").hidden = !ver.length; $("verified").innerHTML = ver.map(statCard).join("");
    $("selfH").hidden = !self.length; $("self").innerHTML = self.map(statCard).join("");
    $("noStats").hidden = !!shown.length;
    $("calls").innerHTML = calls.length ? calls.map(c => `<li><time>${esc(time(c.round))}</time><span>${c.sealed ? '<span class="pf-k">Sealed until the close</span>' : c.direction === "up" ? '<b class="up">▲ Up</b>' : '<b class="dn">▼ Down</b>'}${c.price ? ` <span class="pf-k">@${Math.round(c.price.paid * 100)}¢</span>` : ""}</span>
        <span>${c.correct === true ? '<b class="up">Right</b>' : c.correct === false ? '<b class="dn">Wrong</b>' : '<span class="pf-k">Waiting for Kalshi</span>'}</span></li>`).join("")
      : `<li class="pf-empty">No calls yet.</li>`;
    // the shop window
    $("shopName").textContent = e.name;
    $("shopLede").textContent = e.shopUrl ? `${e.name} is made by ${e.creatorName}. Its record above is kept by Kalshi, so you can check it before you buy.` : `${e.name} is made by ${e.creatorName}. Watch it on the floor and follow its record.`;
    $("actions").innerHTML = [
      e.shopUrl ? `<a class="s-amber" href="${esc(e.shopUrl)}" target="_blank" rel="sponsored noopener">Get ${esc(e.name)}</a>` : "",
      `<a class="btn ghost" href="live">Watch it on the floor</a>`,
      e.streamUrl ? `<a class="btn ghost" href="${esc(e.streamUrl)}" target="_blank" rel="noopener">Its stream</a>` : "",
      e.discordServer ? `<span class="pf-disc">Discord: <b>${esc(e.discordServer)}</b></span>` : "",
    ].join("");
    art(kind);
  }

  // ---------- no one chosen: every entrant to choose from ----------
  async function pick() {
    $("pick").hidden = false;
    const { entrants } = await api("GET", "entrants");
    const list = entrants.filter(e => e.status === "active");
    $("list").innerHTML = list.length ? list.map(e => `<li class="k-${esc(e.kind)}"><a href="profile?e=${encodeURIComponent(e.slug)}"><canvas width="80" height="80" aria-hidden="true" data-kind="${esc(e.kind)}"></canvas><span><b>${esc(e.name)}</b><small>${esc(KIND[e.kind] || kindName(e.kind))} · ${esc(e.creatorName)}</small></span></a></li>`).join("")
      : `<li class="pf-empty">No one has joined yet. <a href="apply">Be the first</a>.</li>`;
    if (window.D3Sigils) for (const c of $("list").querySelectorAll("canvas")) window.D3Sigils.draw(c.getContext("2d"), c.dataset.kind, 40, 40, 60, { t: 1, a: 1, lit: 0.5 });
  }

  (async () => {
    try { await (slug ? load() : pick()); }
    catch (e) { $("msg").textContent = slug ? `We couldn't find that profile. ${e.message}` : e.message; if (slug) pick().catch(() => {}); }
  })();
})();
