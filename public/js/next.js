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
      ({ x: vx, y: vy } = stageAt(W, H));
      const h = S * 0.866, open = wide ? Math.min(W, H) * 0.42 : W * 0.48; tiles = [];
      for (let r = -2; r * h < H + 2 * h; r++) for (let c = -3; c * S / 2 < W + 2 * S; c++) {
        const up = (r + c) % 2 === 0, x = c * S / 2, y = r * h;
        const pts = up ? [[x + S / 2, y], [x + S, y + h], [x, y + h]] : [[x, y], [x + S, y], [x + S / 2, y + h]];
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const ins = pts.map(([px, py]) => [px + (cx - px) * 0.06, py + (cy - py) * 0.06]); // the seam between blocks
        const k = Math.min(1, Math.max(0, (Math.hypot(cx - vx, cy - vy) - open) / (open * 1.3)));
        // calm behind the words: the blocks there sit back and stay dark so the text reads
        const calm = wide ? Math.max(0, 1 - Math.hypot((cx - W * 0.22) / (W * 0.26), (cy - H * 0.5) / (H * 0.42))) : 0;
        tiles.push({ pts: ins, cx, cy, up, calm, k, base: (40 + 230 * k * k * (3 - 2 * k)) * (1 - 0.7 * calm), z: 0, v: 0, p: Math.random() * 6.28, f: 0.25 + Math.random() * 0.25 });
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
        const breathe = reduce ? 0 : 8 * Math.sin(tt * t.f + t.p);
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
          const l = (9 + 13 * up + 8 * depth) * (1 - 0.6 * t.calm) * (0.3 + 0.7 * t.k);
          const warm = t.near * 18;
          const grd = g.createLinearGradient(...front[m], ...back[m]);
          grd.addColorStop(0, `rgb(${Math.round(l + warm)},${Math.round(l + warm * 0.75)},${Math.round(l + 4 + warm * 0.35)})`); grd.addColorStop(1, "rgb(3,4,6)");
          g.fillStyle = grd;
          g.beginPath(); g.moveTo(...front[m]); g.lineTo(...front[(m + 1) % 3]); g.lineTo(...back[(m + 1) % 3]); g.lineTo(...back[m]); g.closePath(); g.fill();
        }
        // the face: matte black, a touch lighter at the top, a faint rim, gold where the pointer is near
        const top = Math.min(front[0][1], front[1][1], front[2][1]), bot = Math.max(front[0][1], front[1][1], front[2][1]);
        const lf = Math.round((15 + 7 * depth) * (1 - 0.55 * t.calm) * (0.35 + 0.65 * t.k)), fg = g.createLinearGradient(0, top, 0, bot);
        fg.addColorStop(0, `rgb(${lf + 3},${lf + 4},${lf + 6})`); fg.addColorStop(1, `rgb(${Math.max(0, lf - 4)},${Math.max(0, lf - 4)},${Math.max(0, lf - 2)})`);
        g.fillStyle = fg;
        g.beginPath(); g.moveTo(...front[0]); g.lineTo(...front[1]); g.lineTo(...front[2]); g.closePath(); g.fill();
        g.strokeStyle = t.near > 0.05 ? `rgba(233,194,122,${(0.06 + 0.4 * t.near).toFixed(3)})` : `rgba(190,205,230,${((0.025 + 0.035 * depth) * (1 - 0.6 * t.calm)).toFixed(3)})`;
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

  // Where the pyramid stands in the hero, and how big: right of the words on wide screens, the top half on phones.
  // The wall's tunnel opens on the same point.
  const stageAt = (W, H) => W > 900 ? { x: W * 0.72, y: H * 0.52, s: Math.min(H * 0.74, W * 0.42) } : { x: W * 0.5, y: innerHeight * 0.31, s: Math.min(W * 0.86, innerHeight * 0.44) };

  // ---------- the glass pyramid, live: a three-sided pyramid turning slowly, its corners the three kinds (callers
  // amber at the front, bots blue, chart scripts violet) and its tip gold, the light rising from each corner up its
  // edge to the tip and on up the beam: three meeting in one place. The main page's Live Trade Cortex emblem turns at
  // its heart. Drag to spin it (it eases back to its own pace), the pointer tilts it, hovering quickens it and the
  // emblem, a click sends a pulse up the beam. The far side is drawn behind the emblem, the near side in front.
  function pyramid() {
    const back = $("pyrBack"), front = $("pyrFront"), core = $("core"), hero = back.closest(".n-hero");
    const gb = back.getContext("2d"), gf = front.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    const COL = [[255, 181, 71], [77, 163, 255], [185, 140, 255]], TIP = [255, 241, 207];
    let W, H, st, theta = 0.35, omega = 0, tiltX = 0, tiltY = 0, mx = -1e4, my = -1e4, drag = null, fast = false, pulses = [], seen = true, last = performance.now(), t0 = last;
    const BASE = (2 * Math.PI) / 40; // one turn in 40 s
    function size() {
      W = hero.clientWidth; H = hero.clientHeight;
      for (const c of [back, front]) { c.width = W * dpr; c.height = H * dpr; c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0); }
      st = stageAt(W, H);
    }
    // the pyramid in its own space (y down): base corners on a circle, tip above, turned by theta, then tilted toward us
    function points() {
      const s = st.s, rb = s * 0.4, yb = s * 0.25, ya = -s * 0.42, P = 0.3 + tiltY, D = s * 2.6;
      const v = [0, 1, 2].map(k => { const a = theta + tiltX + Math.PI / 2 + k * 2.0944; return [Math.cos(a) * rb, yb, Math.sin(a) * rb]; });
      v.push([0, ya, 0]);
      return v.map(([x, y, z]) => {
        const y2 = y * Math.cos(P) - z * Math.sin(P), z2 = y * Math.sin(P) + z * Math.cos(P), k = D / (D + z2);
        return { x: st.x + x * k, y: st.y + y2 * k, z: z2, k, X: x, Y: y2 };
      });
    }
    const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
    function edge(g, A, B, ca, cb, bright) {
      const gr = g.createLinearGradient(A.x, A.y, B.x, B.y);
      gr.addColorStop(0, rgb(ca, 0.9 * bright)); gr.addColorStop(1, rgb(cb, 0.9 * bright));
      g.strokeStyle = gr; g.lineCap = "round";
      g.globalAlpha = 0.18; g.lineWidth = 9; g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
      g.globalAlpha = 1; g.lineWidth = bright > 0.8 ? 2 : 1.3; g.stroke();
    }
    function orb(g, x, y, r, c, a) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgb([255, 255, 255], a)); gr.addColorStop(0.25, rgb(c, a * 0.9)); gr.addColorStop(1, rgb(c, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000), tt = (now - t0) / 1000; last = now;
      // the turn: dragging sets it, then it eases back to its own pace (quicker under the pointer)
      if (!drag && !reduce) { const want = BASE * (fast ? 3 : 1); omega += (want - omega) * Math.min(1, dt * 1.5); theta += omega * dt; }
      if (!reduce) { // the pointer tilts it a little
        const tx = mx > -1e3 ? ((mx - st.x) / W) * 0.25 : 0, ty = my > -1e3 ? ((my - st.y) / H) * 0.18 : 0;
        tiltX += (tx - tiltX) * 0.04; tiltY += (ty - tiltY) * 0.04;
      }
      const v = points(), T = v[3], s = st.s, intro = reduce ? 1 : Math.min(1, tt / 1.8), io = 1 - (1 - intro) ** 3;
      for (const g of [gb, gf]) { g.clearRect(0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = "lighter"; }
      // the floor: a soft pool of light and a slow dashed ring under the base
      const fl = st.y + s * 0.25 * Math.cos(0.3 + tiltY);
      gb.save(); gb.translate(st.x, fl); gb.scale(1, 0.3 + tiltY * 0.6);
      const pool = gb.createRadialGradient(0, 0, 0, 0, 0, s * 0.62); pool.addColorStop(0, `rgba(77,163,255,${0.16 * io})`); pool.addColorStop(1, "rgba(77,163,255,0)");
      gb.fillStyle = pool; gb.beginPath(); gb.arc(0, 0, s * 0.62, 0, 6.2832); gb.fill();
      gb.rotate(theta * 0.5); gb.setLineDash([2, 9]); gb.strokeStyle = `rgba(143,163,178,${0.35 * io})`; gb.lineWidth = 1.2;
      gb.beginPath(); gb.arc(0, 0, s * 0.53, 0, 6.2832); gb.stroke(); gb.setLineDash([]); gb.restore();
      // the beam: from the tip up out of the top, with pulses rising
      const bg = gf.createLinearGradient(0, T.y, 0, 0); bg.addColorStop(0, `rgba(255,248,230,${0.85 * io})`); bg.addColorStop(1, "rgba(255,248,230,0)");
      gf.strokeStyle = bg; gf.globalAlpha = 0.2; gf.lineWidth = 10; gf.beginPath(); gf.moveTo(T.x, T.y); gf.lineTo(T.x, 0); gf.stroke();
      gf.globalAlpha = 1; gf.lineWidth = 1.6; gf.stroke();
      pulses = pulses.filter(p => tt - p.t < 1.6);
      if (!reduce && (!pulses.length || tt - pulses[pulses.length - 1].t > 3.2) && Math.floor(tt / 3.2) !== Math.floor((tt - dt) / 3.2)) pulses.push({ t: tt, c: TIP });
      for (const p of pulses) { const u = (tt - p.t) / 1.6, e = 1 - (1 - u) ** 2, y = T.y - e * (T.y + 40); orb(gf, T.x, y, 16 + 10 * (1 - u), p.c, 0.9 * (1 - u)); }
      // the faces: faint glass, the far ones behind the emblem, the near ones in front, lit from the upper left
      const C = [(v[0].x + v[1].x + v[2].x + T.x) / 4, (v[0].z + v[1].z + v[2].z + T.z) / 4];
      const M = [0, 1, 2].reduce((q, n) => [q[0] + v[n].X / 4, q[1] + v[n].Y / 4, q[2] + v[n].z / 4], [T.X / 4, T.Y / 4, T.z / 4]);
      const L = [-0.45, -0.75, -0.5], Ll = Math.hypot(...L);
      const faces = [[0, 1, 3], [1, 2, 3], [2, 0, 3], [0, 1, 2]];
      for (const f of faces) {
        const [a, b, c] = f.map(n => v[n]);
        // the face's outward normal in camera space: facing us when it points toward the camera (negative z)
        const u1 = [b.X - a.X, b.Y - a.Y, b.z - a.z], u2 = [c.X - a.X, c.Y - a.Y, c.z - a.z];
        let n = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
        const fc = [(a.X + b.X + c.X) / 3 - M[0], (a.Y + b.Y + c.Y) / 3 - M[1], (a.z + b.z + c.z) / 3 - M[2]];
        if (n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] < 0) n = n.map(q => -q);
        const nl = Math.hypot(...n) || 1, near = n[2] / nl < 0 && f[2] === 3; // the base is always seen through the glass
        const spec = Math.max(0, -(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nl * Ll)) ** 3; // the sheen as it turns to the light
        const tint = f[2] === 3 ? mix(COL[f[0]], COL[f[1]], 0.5) : [77, 163, 255]; // each side tinted between its corners
        const g = near ? gf : gb;
        const gr = g.createLinearGradient(c.x, c.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        gr.addColorStop(0, rgb([255, 250, 238], (near ? 0.08 + 0.42 * spec : 0.04) * io));
        gr.addColorStop(1, rgb(tint, (near ? 0.12 + 0.16 * spec : 0.07) * io));
        g.fillStyle = gr; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.closePath(); g.fill();
      }
      // faint lines from each corner in to the heart, as in the emblem
      const hx = st.x, hy0 = st.y + (s * 0.25 + (-s * 0.42 - s * 0.25) * 0.36) * Math.cos(0.3 + tiltY);
      for (let k = 0; k < 4; k++) { const A = v[k]; gb.strokeStyle = rgb(k === 3 ? TIP : COL[k], 0.22 * io); gb.lineWidth = 1; gb.beginPath(); gb.moveTo(A.x, A.y); gb.lineTo(hx, hy0); gb.stroke(); }
      // the edges: base corner to corner, each corner up to the tip; near edges brighter and in front
      const E = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
      for (const [i, j] of E) {
        const A = v[i], B = v[j], near = (A.z + B.z) / 2 < C[1];
        edge(near ? gf : gb, A, B, i === 3 ? TIP : COL[i], j === 3 ? TIP : COL[j], (near ? 1 : 0.55) * io);
      }
      // the lights: from each corner up its edge to the tip, in turn, and the corners and tip glowing
      for (let k = 0; k < 3; k++) {
        const u = ((tt * 0.22) + k / 3) % 1;
        if (u < 0.85 && !reduce) { const e = u / 0.85, A = v[k], x = A.x + (T.x - A.x) * e, y = A.y + (T.y - A.y) * e; orb((A.z + T.z) / 2 < C[1] ? gf : gb, x, y, s * 0.035, mix(COL[k], TIP, e), 0.95 * io); }
        const A = v[k]; orb(A.z < C[1] ? gf : gb, A.x, A.y, s * 0.05, COL[k], (0.75 + 0.25 * Math.sin(tt * 2 + k * 2)) * io);
      }
      orb(gf, T.x, T.y, s * 0.055, TIP, (0.75 + 0.25 * Math.sin(tt * 1.4)) * io);
      // the emblem sits at the pyramid's heart
      const cs = s * 0.4;
      core.style.width = core.style.height = `${cs}px`; core.style.transform = `translate(${hx - cs / 2}px,${hy0 - cs / 2}px)`;
      if (seen && !reduce && !document.hidden) requestAnimationFrame(draw);
    }
    new IntersectionObserver(([en]) => { const was = seen; seen = en.isIntersecting; if (seen && !was && !reduce) { last = performance.now(); requestAnimationFrame(draw); } }).observe(back);
    size(); requestAnimationFrame(draw); setTimeout(() => core.classList.add("on"), 50);
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && seen && !reduce) { last = performance.now(); requestAnimationFrame(draw); } });
    if (reduce) return;
    // the pointer: near the pyramid it quickens; a press on it starts a spin (a drag) or, if it barely moves, a pulse
    const onIt = (x, y) => Math.hypot(x - st.x, y - st.y) < st.s * 0.48;
    addEventListener("pointermove", e => {
      const r = hero.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
      if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; const dtm = Math.max(1, e.timeStamp - drag.t); drag.t = e.timeStamp; theta += dx * 0.008; omega = (dx * 0.008) / (dtm / 1000); drag.moved += Math.abs(dx); }
      const on = !!drag || onIt(mx, my); if (on !== fast) { fast = on; core.classList.toggle("fast", on); }
    }, { passive: true });
    hero.addEventListener("pointerdown", e => {
      const r = hero.getBoundingClientRect();
      if (e.target.closest("a,button") || !onIt(e.clientX - r.left, e.clientY - r.top)) return;
      drag = { x: e.clientX, t: e.timeStamp, moved: 0 };
    });
    addEventListener("pointerup", () => {
      if (!drag) return;
      if (drag.moved < 6) pulses.push({ t: (performance.now() - t0) / 1000, c: COL[Math.floor(Math.random() * 3)] });
      omega = Math.max(-6, Math.min(6, omega)); drag = null;
    });
    document.documentElement.addEventListener("pointerleave", () => { mx = my = -1e4; if (fast) { fast = false; core.classList.remove("fast"); } });
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

  field(); pyramid(); motion();
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
