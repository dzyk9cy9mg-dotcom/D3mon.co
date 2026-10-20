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

  // ---------- the hero's wall (after Rubric's deep tiles, made D3MON's own; owner, 2026-10-20: "tiles popping in and
  // out like pistons", "more metallic", no black voids, no random pattern): a grid of deep triangular blocks in
  // gunmetal, seen in perspective, forming a shallow tunnel that opens around the glass pyramid. The faces have a
  // brushed sheen lit from the pointer like a lamp, bevelled edges and metal sides; the gaps are dark metal, never
  // black holes. Every few seconds a piston wave runs out from the pyramid: upward triangles pop out and downward
  // ones sink in, each with a mechanical snap and settle, and the wave's front catches one of the three colours in
  // turn (amber, blue, violet). The blocks near the pointer push out together, and a click sends a ripple.
  // Reduce motion gets the still wall.
  function field() {
    const cv = $("field"), g = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    let W, H, S, F, vx, vy, tiles = [], mx = -1e4, my = -1e4, lx = 0, ly = 0, sx = 0, sy = 0, seen = true, waves = [], t0 = performance.now();
    const BACK = -170, COLS = [[255, 181, 71], [77, 163, 255], [185, 140, 255]];
    const EVERY = 5.2, SPEED = 900, PISTON = 46; // a piston wave every 5.2 s, travelling 900 px/s, 46 deep
    function size() {
      W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wide = W > 900;
      S = wide ? 190 : 120; F = wide ? 1700 : 1100;
      ({ x: vx, y: vy } = stageAt(W, H)); lx = vx; ly = vy * 0.6;
      const h = S * 0.866, open = wide ? Math.min(W, H) * 0.42 : W * 0.48; tiles = [];
      for (let r = -2; r * h < H + 2 * h; r++) for (let c = -3; c * S / 2 < W + 2 * S; c++) {
        const up = (r + c) % 2 === 0, x = c * S / 2, y = r * h;
        const pts = up ? [[x + S / 2, y], [x + S, y + h], [x, y + h]] : [[x, y], [x + S, y], [x + S / 2, y + h]];
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const ins = pts.map(([px, py]) => [px + (cx - px) * 0.035, py + (cy - py) * 0.035]); // a fine seam between blocks
        const k = Math.min(1, Math.max(0, (Math.hypot(cx - vx, cy - vy) - open) / (open * 1.3)));
        // calm behind the words: the blocks there sit back and stay dark so the text reads
        const calm = wide ? Math.max(0, 1 - Math.hypot((cx - W * 0.22) / (W * 0.26), (cy - H * 0.5) / (H * 0.42))) : 0;
        tiles.push({ pts: ins, cx, cy, up, calm, k, base: (30 + 55 * k * k * (3 - 2 * k)) * (1 - 0.7 * calm), z: 0, v: 0, d0: Math.hypot(cx - vx, cy - vy) });
      }
    }
    // one piston stroke, 0..1.1 s: a quick snap out with a small overshoot, a hold, then an easy return
    const stroke = s => { if (s <= 0 || s >= 1.1) return 0; if (s < 0.16) { const u = s / 0.16 - 1; return 1 + 2.7 * u ** 3 + 1.7 * u * u; } return s < 0.42 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (s - 0.42) / 0.68); };
    // a point at depth z, seen from in front of the vanishing point (which drifts a little with the pointer)
    const proj = (x, y, z) => { const s = F / (F - z), ox = vx + sx, oy = vy + sy; return [ox + (x - ox) * s, oy + (y - oy) * s]; };
    function draw(now) {
      const tt = (now - t0) / 1000, R = W > 900 ? 460 : 260;
      waves = waves.filter(w => tt - w.t < 2.6);
      if (!reduce) { sx += ((mx > -1e3 ? (mx - vx) * -0.02 : 0) - sx) * 0.04; sy += ((my > -1e3 ? (my - vy) * -0.02 : 0) - sy) * 0.04; }
      // the lamp: follows the pointer softly; without one it rests above the pyramid
      const tx = mx > -1e3 ? mx : vx, ty = my > -1e3 ? my : vy * 0.6; lx += (tx - lx) * 0.08; ly += (ty - ly) * 0.08;
      const intro = reduce ? 1 : Math.min(1, tt / 2.2), io = 1 - (1 - intro) ** 3; // on arrival the blocks slide forward out of the dark
      const n = Math.floor((tt - 1.5) / EVERY), since = tt - 1.5 - n * EVERY, wc = COLS[((n % 3) + 3) % 3]; // the current wave
      for (const t of tiles) {
        const d = Math.hypot(t.cx - mx, t.cy - my), near = Math.max(0, 1 - d / R), push = near * near * (3 - 2 * near) * 55;
        let ring = 0;
        for (const w of waves) { const rr = (tt - w.t) * 700, gap = Math.abs(Math.hypot(t.cx - w.x, t.cy - w.y) - rr); const q = Math.max(0, 1 - gap / 220); ring = Math.max(ring, q * q * (3 - 2 * q) * (1 - (tt - w.t) / 2.6)); }
        const target = (t.base + push + 60 * ring) * io - 200 * (1 - io);
        if (reduce) t.z = target; else { t.v += (target - t.z) * 0.05; t.v *= 0.7; t.z += t.v; } // a soft, well-damped spring
        // the piston wave: out for upward blocks, in for downward ones, reaching each block as the wave passes it
        const st = reduce || n < 0 ? 0 : stroke(since - t.d0 / SPEED);
        t.pz = st * PISTON * (t.up ? 1 : -0.6) * (1 - 0.8 * t.calm);
        t.glow = st > 0 ? Math.max(0, Math.sin(Math.PI * Math.min(1, (since - t.d0 / SPEED) / 0.5))) * (1 - t.calm) : 0;
        t.near = near;
      }
      g.fillStyle = "#0b0d11"; g.fillRect(0, 0, W, H); // the gaps are dark metal, not holes
      const ox = vx + sx, oy = vy + sy;
      for (const t of [...tiles].sort((a, b) => (a.z + a.pz) - (b.z + b.pz))) { // far blocks first
        const z = t.z + t.pz, front = t.pts.map(([x, y]) => proj(x, y, z)), back = t.pts.map(([x, y]) => proj(x, y, BACK));
        const dim = (1 - 0.55 * t.calm) * (0.72 + 0.28 * t.k), lamp = Math.max(0, 1 - Math.hypot(t.cx - lx, t.cy - ly) / (W > 900 ? 700 : 420));
        // the sides that face the opening: brushed metal, lit from above, fading darker toward the back (never to black)
        for (let m = 0; m < 3; m++) {
          const a = t.pts[m], b = t.pts[(m + 1) % 3], mxm = (a[0] + b[0]) / 2, mym = (a[1] + b[1]) / 2;
          let nx = b[1] - a[1], ny = a[0] - b[0];
          if (nx * (mxm - t.cx) + ny * (mym - t.cy) < 0) { nx = -nx; ny = -ny; } // the side's outward direction
          if (nx * (ox - mxm) + ny * (oy - mym) <= 0) continue;
          const nl = Math.hypot(nx, ny), up = Math.max(0, -ny / nl), l = (26 + 30 * up + 22 * lamp) * dim;
          const grd = g.createLinearGradient(...front[m], ...back[m]);
          grd.addColorStop(0, `rgb(${l | 0},${(l + 2) | 0},${(l + 6) | 0})`); grd.addColorStop(1, `rgb(${(l * 0.38) | 0},${(l * 0.4) | 0},${(l * 0.45) | 0})`);
          g.fillStyle = grd; g.beginPath(); g.moveTo(...front[m]); g.lineTo(...front[(m + 1) % 3]); g.lineTo(...back[(m + 1) % 3]); g.lineTo(...back[m]); g.closePath(); g.fill();
        }
        // the face: gunmetal with a brushed band of light running across it toward the lamp
        const [fx0, fy0] = front[0], cxp = (front[0][0] + front[1][0] + front[2][0]) / 3, cyp = (front[0][1] + front[1][1] + front[2][1]) / 3;
        const ang = Math.atan2(ly - cyp, lx - cxp), rr2 = Math.hypot(front[1][0] - fx0, front[1][1] - fy0) * 0.6;
        const fg = g.createLinearGradient(cxp - Math.cos(ang) * rr2, cyp - Math.sin(ang) * rr2, cxp + Math.cos(ang) * rr2, cyp + Math.sin(ang) * rr2);
        const base = (24 + 10 * Math.min(1, Math.max(0, z / 200))) * dim, hi = base + (14 + 34 * lamp) * dim;
        const c = v => `rgb(${v | 0},${(v + 2) | 0},${(v + 6) | 0})`;
        fg.addColorStop(0, c(base * 0.7)); fg.addColorStop(0.55, c(base)); fg.addColorStop(0.8, c(hi)); fg.addColorStop(1, c(base * 1.05));
        g.fillStyle = fg; g.beginPath(); g.moveTo(...front[0]); g.lineTo(...front[1]); g.lineTo(...front[2]); g.closePath(); g.fill();
        // the bevel: the upper edges catch the light, the lower ones fall into shade; gold near the pointer, the
        // wave's colour as the piston fires
        for (let m = 0; m < 3; m++) {
          const A = front[m], B = front[(m + 1) % 3], top = (A[1] + B[1]) / 2 < cyp;
          g.strokeStyle = top ? `rgba(215,225,240,${((0.1 + 0.18 * lamp) * dim).toFixed(3)})` : `rgba(0,0,0,${(0.35 * dim).toFixed(3)})`;
          g.lineWidth = 1; g.beginPath(); g.moveTo(...A); g.lineTo(...B); g.stroke();
        }
        const glow = Math.max(t.near * 0.45, t.glow * 0.7);
        if (glow > 0.02) {
          const col = t.glow * 0.7 > t.near * 0.45 ? wc : [233, 194, 122];
          g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${glow.toFixed(3)})`; g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(...front[0]); g.lineTo(...front[1]); g.lineTo(...front[2]); g.closePath(); g.stroke();
        }
      }
      if (seen && !reduce && !document.hidden) requestAnimationFrame(draw);
    }
    new IntersectionObserver(([en]) => { const was = seen; seen = en.isIntersecting; if (seen && !was && !reduce) requestAnimationFrame(draw); }).observe(cv); // the wall rests while scrolled away
    size(); requestAnimationFrame(draw);
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    addEventListener("pointermove", e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => { mx = my = -1e4; });
    cv.closest(".n-hero").addEventListener("pointerdown", e => { if (reduce) return; const r = cv.getBoundingClientRect(); waves.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: (performance.now() - t0) / 1000 }); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && seen && !reduce) requestAnimationFrame(draw); });
  }

  // Where the pyramid stands in the hero, and how big: right of the words on wide screens, the top half on phones.
  // The wall's tunnel opens on the same point.
  const stageAt = (W, H) => W > 900 ? { x: W * 0.72, y: H * 0.52, s: Math.min(H * 0.74, W * 0.42) } : { x: W * 0.5, y: innerHeight * 0.31, s: Math.min(W * 0.86, innerHeight * 0.44) };

  // ---------- the glass pyramid, live: a three-sided pyramid turning slowly, its corners the three kinds (callers
  // amber at the front, bots blue, chart scripts violet) and its tip gold, the light rising from each corner up its
  // edge to the tip and on up the beam: three meeting in one place. The main page's Live Trade Cortex emblem lies flat
  // on its floor. The corners and the tip are the way in (owner, 2026-10-20): pointing at one slows the pyramid so it
  // can be caught, lights it and names it; a click takes you there (callers, bots or chart scripts in the
  // marketplace, the tip to the Capstone). The names show once on arrival so people learn it. Drag to spin it (it
  // eases back to its own pace), the pointer tilts it, hovering elsewhere quickens it and the emblem, a click
  // elsewhere sends a pulse up the beam. The far side is drawn behind the emblem, the near side in front.
  function pyramid2d() {
    const back = $("pyrBack"), front = $("pyrFront"), core = $("core"), hero = back.closest(".n-hero");
    const gb = back.getContext("2d"), gf = front.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    const COL = [[255, 181, 71], [77, 163, 255], [185, 140, 255]], TIP = [255, 241, 207];
    // the corners link through goTo() (below), with their symbols from js/sigils.js
    let hot = -1, pts = null, sym = [], shown = [0, 0, 0, 0];
    let W, H, st, theta = 0.35, omega = 0, tiltX = 0, tiltY = 0, mx = -1e4, my = -1e4, drag = null, fast = false, pulses = [], seen = true, last = performance.now(), t0 = last;
    const BASE = (2 * Math.PI) / 40; // one turn in 40 s
    function size() {
      W = hero.clientWidth; H = hero.clientHeight;
      for (const c of [back, front]) { c.width = W * dpr; c.height = H * dpr; c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0); }
      st = stageAt(W, H);
    }
    // the pyramid in its own space (y down): base corners on a circle, tip above, turned by theta, then tilted toward us
    function points() {
      const s = st.s, rb = s * 0.4, yb = s * 0.25, ya = -s * 0.42, P = 0.3 + tiltY, D = s * 2.6; // keep in step with the floor and emblem in draw()
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
      if (!drag && !reduce) { const want = hot >= 0 ? BASE * 0.12 : BASE * (fast ? 3 : 1); omega += (want - omega) * Math.min(1, dt * 1.5); theta += omega * dt; }
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
      gb.restore();
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
      // the heart is the middle of the floor, where the emblem lies; faint lines run from each corner in to it
      const P = 0.3 + tiltY, D = s * 2.6, fy = s * 0.25 * Math.cos(P), fz = s * 0.25 * Math.sin(P);
      const hx = st.x, hy0 = st.y + fy * (D / (D + fz));
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
      // the way in: each corner's symbol (js/sigils.js) floats just outside it; they draw themselves in turn on
      // arrival and stay; the one under the pointer lights up and names itself
      pts = v;
      const SIG = window.D3Sigils;
      if (SIG) {
        const bx = (v[0].x + v[1].x + v[2].x) / 3, by = (v[0].y + v[1].y + v[2].y) / 3, size = Math.max(40, s * 0.1), off = s * 0.15;
        sym = v.map((A, k) => {
          if (k === 3) return { x: A.x + off * 0.95, y: A.y + off * 0.15 };
          let dx = A.x - bx, dy = A.y - by; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          return { x: Math.min(W - size * 0.7, Math.max(size * 0.7, A.x + dx * off)), y: A.y + dy * off * 0.8 + off * 0.12 };
        });
        gf.save(); gf.globalCompositeOperation = "source-over";
        for (let k = 0; k < 4; k++) {
          const P = sym[k], on = k === hot, kind = SIG.kinds[k];
          shown[k] = reduce ? +on : Math.max(0, Math.min(1, shown[k] + (on ? dt / 0.45 : -dt / 0.25))); const t = shown[k]; // only while pointed at
          if (!t) continue;
          SIG.draw(gf, kind, P.x, P.y, size, { t, a: Math.min(1, t * 1.6), lit: 0.6 });
          if (t > 0.6) { gf.save(); gf.globalAlpha = (t - 0.6) / 0.4; gf.font = '500 10px "IBM Plex Mono", monospace'; gf.letterSpacing = "2px"; gf.fillStyle = SIG.S[kind].color; gf.textAlign = "center"; gf.textBaseline = "top"; gf.fillText(SIG.S[kind].name.toUpperCase(), P.x, P.y + size * 0.72); gf.restore(); }
        }
        gf.restore();
      }
      // the emblem sits at the pyramid's heart
      // the emblem lies flat on the floor, seen at the pyramid's own tilt, its triangle pointing at the pyramid's
      // corners and turning with them; sized so its outer ring sits inside the floor's own circle (the base's inner
      // circle is half its corner radius, 0.2 s; the outer ring is 0.47 of the emblem), its rings tumbling within the glass
      const cs = s * 0.42;
      core.style.width = core.style.height = `${cs}px`;
      core.style.transform = `translate(${hx - cs / 2}px,${hy0 - cs / 2}px) perspective(${D}px) rotateX(${90 - P * 57.2958}deg) rotateZ(${-(theta + tiltX) * 57.2958}deg)`;
      if (seen && !reduce && !document.hidden) requestAnimationFrame(draw);
    }
    new IntersectionObserver(([en]) => { const was = seen; seen = en.isIntersecting; if (seen && !was && !reduce) { last = performance.now(); requestAnimationFrame(draw); } }).observe(back);
    size(); requestAnimationFrame(draw); setTimeout(() => core.classList.add("on"), 50);
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && seen && !reduce) { last = performance.now(); requestAnimationFrame(draw); } });
    if (reduce) return;
    // the pointer: near the pyramid it quickens; a press on it starts a spin (a drag) or, if it barely moves, a pulse
    const onIt = (x, y) => Math.hypot(x - st.x, y - st.y) < st.s * 0.48;
    const cornerAt = (x, y) => { // the corner or tip under a point, generous enough to catch while it turns
      if (!pts) return -1;
      let best = -1, bd = st.s * 0.085;
      [...pts, ...sym.map((P, k) => (shown[k] > 0.3 ? P : null))].forEach((A, n) => { if (!A) return; const d = Math.hypot(x - A.x, y - A.y); if (d < bd) { bd = d; best = n % 4; } });
      return best;
    };
    // where each one leads: the marketplace showing that kind, or the Capstone page through the page transition
    const go = (k, e) => { const r = hero.getBoundingClientRect(), P = sym[k] || pts[k]; goTo(k, e, P && { x: r.left + P.x, y: r.top + P.y }); };
    addEventListener("pointermove", e => {
      const r = hero.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
      if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; const dtm = Math.max(1, e.timeStamp - drag.t); drag.t = e.timeStamp; theta += dx * 0.008; omega = (dx * 0.008) / (dtm / 1000); drag.moved += Math.abs(dx); }
      hot = drag || e.pointerType === "touch" ? -1 : cornerAt(mx, my);
      hero.style.cursor = hot >= 0 ? "pointer" : onIt(mx, my) ? "grab" : "";
      const on = hot < 0 && (!!drag || onIt(mx, my)); if (on !== fast) { fast = on; core.classList.toggle("fast", on); }
    }, { passive: true });
    hero.addEventListener("pointerdown", e => {
      const r = hero.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top, k = cornerAt(x, y);
      if (e.target.closest("a,button") || (k < 0 && !onIt(x, y))) return;
      drag = { x: e.clientX, t: e.timeStamp, moved: 0, k };
    });
    addEventListener("pointerup", e => {
      if (!drag) return;
      if (drag.moved < 6 && drag.k >= 0) { const k = drag.k; drag = null; omega = BASE; go(k, e); return; }
      if (drag.moved < 6) pulses.push({ t: (performance.now() - t0) / 1000, c: COL[Math.floor(Math.random() * 3)] });
      omega = Math.max(-6, Math.min(6, omega)); drag = null;
    });
    document.documentElement.addEventListener("pointerleave", () => { mx = my = -1e4; hot = -1; if (fast) { fast = false; core.classList.remove("fast"); } });
  }

  // The way in from the pyramid's corners and tip: each part's symbol (js/sigils.js) opens like a gate where it was
  // clicked. Callers, bots and chart scripts open the marketplace showing that kind; the tip opens the Capstone page
  // (transition.js draws the Capstone's symbol before the page opens out of it).
  const KINDS = ["caller", "bot", "script"];
  function goTo(k, e, P) {
    const x = P ? P.x : e.clientX, y = P ? P.y : e.clientY;
    if (k < 3) {
      const show = () => { document.querySelector(`[data-k="${KINDS[k]}"]`)?.click(); $("market").scrollIntoView({ behavior: "instant", block: "start" }); };
      return window.D3Sigils ? window.D3Sigils.portal(KINDS[k], x, y, show) : show();
    }
    const a = document.createElement("a"); a.href = "vip"; a.dataset.sigil = "capstone"; a.hidden = true; document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 }));
    a.remove();
  }

  // The glass pyramid: real 3D glass (js/prism3d.js, three.js) where WebGL works and motion is allowed; the 2D
  // pyramid above otherwise, or if the 3D one can't start or runs slower than about 30 fps (remembered for the visit).
  function pyramid() {
    const hero = $("pyrBack").closest(".n-hero");
    const gl = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2")); } catch { return false; } })();
    let slow = false; try { slow = sessionStorage.getItem("n.slow") === "1"; } catch {}
    if (reduce || !gl || slow || /[?&]flat\b/.test(location.search)) return pyramid2d();
    import("./prism3d.js").then(m => {
      const p = m.start({ hero, labels: $("pyrFront"), stageAt, onGo: goTo });
      hero.classList.add("has3d");
      const check = setInterval(() => {
        const f = p.fps(); if (f == null) return; clearInterval(check);
        if (f < 30 && !/[?&]fps\b/.test(location.search)) { try { sessionStorage.setItem("n.slow", "1"); } catch {} p.stop(); hero.classList.remove("has3d"); pyramid2d(); }
      }, 500);
    }).catch(err => { console.warn("3D pyramid unavailable, using 2D", err); pyramid2d(); });
  }

  // ---------- the sacred geometry: the original site's Flower of Life (circles on a triangular lattice, as in the
  // main page's background) on a fixed canvas behind the sections. Faint everywhere; around the pointer it lights up
  // in the three colours (amber on the left, blue in the middle, violet on the right), as if lit by a lamp; on touch
  // screens the light drifts by itself. A click sends a ring of light out through it. It drifts a little with the
  // scroll. Reduce motion keeps it faint and still.
  function geometry() {
    const cv = $("geo"), g = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), R = 46, hero = document.querySelector(".n-hero");
    const COLS = [[255, 181, 71], [77, 163, 255], [185, 140, 255]];
    let W, H, faint, lit, spot, sg, ring, rg, mx = -1, my = -1, lastMove = -1e9, ex = 0, ey = 0, rings = [], t0 = performance.now();
    function tile(stroke, dot) { // one repeat of the lattice: circles of radius R centred a distance R apart
      const tw = R, th = R * Math.sqrt(3), c = document.createElement("canvas");
      c.width = Math.round(tw * dpr); c.height = Math.round(th * dpr);
      const x = c.getContext("2d"); x.scale(c.width / tw, c.height / th); x.strokeStyle = stroke; x.lineWidth = 1; x.fillStyle = dot;
      for (let i = -3; i <= 4; i++) for (let j = -4; j <= 5; j++) {
        const cx = i * tw + (Math.abs(j) % 2 ? tw / 2 : 0), cy = (j * th) / 2;
        x.beginPath(); x.arc(cx, cy, R, 0, 6.2832); x.stroke();
        x.beginPath(); x.arc(cx, cy, 1.2, 0, 6.2832); x.fill();
      }
      const p = g.createPattern(c, "repeat"); p.setTransform(new DOMMatrix().scale(tw / c.width, th / c.height)); return p;
    }
    function size() {
      W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      faint = tile("rgba(77,163,255,.075)", "rgba(143,163,178,.22)"); lit = tile("rgba(255,255,255,.55)", "rgba(255,255,255,.9)");
      spot = document.createElement("canvas"); spot.width = spot.height = Math.round(640 * dpr); sg = spot.getContext("2d"); sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      ring = document.createElement("canvas"); ring.width = W * dpr; ring.height = H * dpr; rg = ring.getContext("2d"); rg.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // the lit lattice, shifted so it lines up with the faint one, coloured and faded by a mask
    function litInto(x, ctx, ox, oy, w, h, mask) {
      ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, w, h);
      ctx.save(); ctx.translate(-ox, -oy); ctx.fillStyle = lit; ctx.fillRect(ox, oy, w, h); ctx.restore();
      ctx.globalCompositeOperation = "source-in"; ctx.fillStyle = mask; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
    function tint(x) { const f = Math.max(0, Math.min(1, x / W)) * 2, i = Math.min(1, Math.floor(f)), k = f - i; return COLS[i].map((v, n) => Math.round(v + (COLS[i + 1][n] - v) * k)); }
    function draw(now) {
      const tt = (now - t0) / 1000, par = -scrollY * 0.12;
      // nothing to draw while the hero still fills the screen
      if (hero.getBoundingClientRect().bottom < H + 40) {
        g.clearRect(0, 0, W, H);
        g.save(); g.translate(0, par % (R * Math.sqrt(3))); g.fillStyle = faint; g.fillRect(0, -R * 2, W, H + R * 4); g.restore();
        if (!reduce) {
          // the lamp follows the pointer; after a few quiet seconds (or on touch screens) it drifts on its own
          const idle = now - lastMove > 4000, tx = idle ? W * (0.5 + 0.38 * Math.sin(tt * 0.11)) : mx, ty = idle ? H * (0.5 + 0.32 * Math.sin(tt * 0.083 + 1)) : my;
          ex += (tx - ex) * 0.08; ey += (ty - ey) * 0.08;
          const SR = 320, c = tint(ex), m = sg.createRadialGradient(SR, SR, 0, SR, SR, SR);
          m.addColorStop(0, `rgba(${c},.62)`); m.addColorStop(0.45, `rgba(${c},.22)`); m.addColorStop(1, `rgba(${c},0)`);
          litInto(null, sg, ex - SR, ey - SR - (par % (R * Math.sqrt(3))), 2 * SR, 2 * SR, m);
          g.drawImage(spot, ex - SR, ey - SR, 2 * SR, 2 * SR);
          rings = rings.filter(r => tt - r.t < 2.4);
          for (const r of rings) { // a ring of light running out through the lattice from a click
            const u = (tt - r.t) / 2.4, rad = 40 + u * Math.hypot(W, H) * 0.7, c2 = tint(r.x), mm = rg.createRadialGradient(r.x, r.y, Math.max(0, rad - 70), r.x, r.y, rad + 50);
            mm.addColorStop(0, `rgba(${c2},0)`); mm.addColorStop(0.55, `rgba(${c2},${(0.7 * (1 - u)).toFixed(3)})`); mm.addColorStop(1, `rgba(${c2},0)`);
            litInto(null, rg, 0, -(par % (R * Math.sqrt(3))), W, H, mm);
            g.drawImage(ring, 0, 0, W, H);
          }
        }
      }
      if (!reduce) requestAnimationFrame(draw);
    }
    size(); requestAnimationFrame(draw);
    addEventListener("resize", () => { size(); if (reduce) requestAnimationFrame(draw); });
    if (reduce) { addEventListener("scroll", () => requestAnimationFrame(draw), { passive: true }); return; }
    addEventListener("pointermove", e => { if (e.pointerType === "touch") return; mx = e.clientX; my = e.clientY; if (now() - lastMove > 4000) { ex = mx; ey = my; } lastMove = now(); }, { passive: true });
    addEventListener("pointerdown", e => { if (e.target.closest(".n-hero")) return; rings.push({ x: e.clientX, y: e.clientY, t: (performance.now() - t0) / 1000 }); });
    function now() { return performance.now(); }
  }

  // ---------- hints of 3D: cards lean toward the pointer with a soft glare, and the amber buttons are drawn to it.
  // Pointer devices only; reduce motion keeps everything still.
  function touches() {
    if (reduce || !matchMedia("(hover: hover)").matches) return;
    let cur = null;
    const drop = () => { if (!cur) return; cur.classList.remove("on"); cur.style.removeProperty("--rx"); cur.style.removeProperty("--ry"); cur = null; };
    addEventListener("pointermove", e => {
      const t = e.target.closest && e.target.closest(".tilt");
      if (cur !== t) drop();
      if (t) {
        const b = t.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
        t.style.setProperty("--ry", `${((x - 0.5) * 7).toFixed(2)}deg`); t.style.setProperty("--rx", `${((0.5 - y) * 5).toFixed(2)}deg`);
        t.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`); t.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
        t.classList.add("on"); cur = t;
      }
      for (const a of document.querySelectorAll(".n-amber")) {
        const b = a.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2, reach = Math.max(b.width, b.height) * 1.2, d = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (d < reach) { const k = (1 - d / reach) * 0.3; a.style.setProperty("--mgx", `${((e.clientX - cx) * k).toFixed(1)}px`); a.style.setProperty("--mgy", `${((e.clientY - cy) * k).toFixed(1)}px`); }
        else if (a.style.getPropertyValue("--mgx")) { a.style.removeProperty("--mgx"); a.style.removeProperty("--mgy"); }
      }
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", drop);
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
    $("shop").innerHTML = list.length ? list.map(e => `<a class="n-item tilt k-${esc(e.kind)}" href="profile?e=${encodeURIComponent(e.slug)}"><i class="glow" aria-hidden="true"></i>
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

  field(); pyramid(); geometry(); touches(); motion();
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
