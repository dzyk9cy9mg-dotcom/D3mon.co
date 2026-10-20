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
        const target = (t.base + breathe + push + 110 * ring) * io - 200 * (1 - io);
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
          const l = (16 + 22 * up + 14 * depth) * (1 - 0.6 * t.calm) * (0.7 + 0.3 * t.k);
          const warm = t.near * 26;
          const grd = g.createLinearGradient(...front[m], ...back[m]);
          grd.addColorStop(0, `rgb(${Math.round(l + warm)},${Math.round(l + warm * 0.75)},${Math.round(l + 4 + warm * 0.35)})`); grd.addColorStop(1, "rgb(3,4,6)");
          g.fillStyle = grd;
          g.beginPath(); g.moveTo(...front[m]); g.lineTo(...front[(m + 1) % 3]); g.lineTo(...back[(m + 1) % 3]); g.lineTo(...back[m]); g.closePath(); g.fill();
        }
        // the face: matte black, a touch lighter at the top, a faint rim, gold where the pointer is near
        const top = Math.min(front[0][1], front[1][1], front[2][1]), bot = Math.max(front[0][1], front[1][1], front[2][1]);
        const lf = Math.round((28 + 12 * depth) * (1 - 0.55 * t.calm) * (0.7 + 0.3 * t.k)), fg = g.createLinearGradient(0, top, 0, bot);
        fg.addColorStop(0, `rgb(${lf + 5},${lf + 6},${lf + 9})`); fg.addColorStop(1, `rgb(${lf - 5},${lf - 5},${lf - 3})`);
        g.fillStyle = fg;
        g.beginPath(); g.moveTo(...front[0]); g.lineTo(...front[1]); g.lineTo(...front[2]); g.closePath(); g.fill();
        g.strokeStyle = t.near > 0.05 ? `rgba(233,194,122,${(0.06 + 0.4 * t.near).toFixed(3)})` : `rgba(190,205,230,${((0.06 + 0.08 * depth) * (1 - 0.6 * t.calm)).toFixed(3)})`;
        g.lineWidth = 1; g.stroke();
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
  // amber at the front, bots blue, chart scripts violet) and its tip gold, the light running from each corner in
  // across the floor, up the middle and out of the tip up the beam: three meeting in one place. The main page's Live Trade Cortex emblem lies flat
  // on its floor. The corners and the tip are the way in (owner, 2026-10-20): pointing at one slows the pyramid so it
  // can be caught and it becomes its living form (no words); a click takes you there (callers, bots or chart scripts in
  // the marketplace, the tip to the Capstone). The glyphs bloom once on arrival so people learn it. Drag to spin it (it
  // eases back to its own pace), the pointer tilts it, hovering elsewhere quickens it and the emblem, a click
  // elsewhere sends a pulse up the beam. The far side is drawn behind the emblem, the near side in front.
  function pyramid() {
    const back = $("pyrBack"), front = $("pyrFront"), core = $("core"), hero = back.closest(".n-hero");
    const gb = back.getContext("2d"), gf = front.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
    const COL = [[255, 181, 71], [77, 163, 255], [185, 140, 255]], TIP = [255, 241, 207];
    const KINDS = ["caller", "bot", "script"];
    let hot = -1, pts = null;
    const lastU = [0, 0, 0]; // where each light was last frame, to send its pulse as it leaves the capstone
    const bloom = [0, 0, 0, 0], opened = [-9, -9, -9, -9]; // how far each has opened, and when it last began to
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
    // the three corner nodes become living forms drawn in fine light, abstract but true to what they stand for:
    // callers (readers) an iris of fine fibres that slowly dilates around the triangle, someone reading the chart;
    // bots a gyroscope, tilted rings turning with points riding them at a steady pace, machine precision; chart
    // scripts a Lissajous figure traced by a point of light and slowly changing shape, maths and signals
    function form(g, k, x, y, r, t, c, a) {
      const hi = mix(c, [255, 255, 255], 0.55), glow = (draw, w, al = 1) => {
        g.strokeStyle = rgb(c, 0.2 * a * al); g.lineWidth = w * 4; g.beginPath(); draw(); g.stroke();
        g.strokeStyle = rgb(hi, 0.9 * a * al); g.lineWidth = w; g.beginPath(); draw(); g.stroke();
      };
      g.save(); g.translate(x, y); g.lineCap = g.lineJoin = "round";
      if (k === 0) { // the iris
        const dil = 0.5 + 0.5 * Math.sin(t * 1.1), ri = r * (0.26 + 0.12 * dil), N = 56;
        for (let i = 0; i < N; i++) {
          const an = (i / N) * 6.2832 + Math.sin(t * 0.3) * 0.15, wob = 0.5 + 0.5 * Math.sin(i * 2.7 + t * 1.7), ro = r * (0.78 + 0.18 * wob);
          const tw = 0.18 * Math.sin(i * 1.3); // the fibres curve a little, like a real iris
          g.strokeStyle = rgb(i % 3 ? c : hi, (0.25 + 0.55 * wob) * a); g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(Math.cos(an) * ri, Math.sin(an) * ri);
          g.quadraticCurveTo(Math.cos(an + tw) * (ri + ro) / 2, Math.sin(an + tw) * (ri + ro) / 2, Math.cos(an) * ro, Math.sin(an) * ro); g.stroke();
        }
        glow(() => g.arc(0, 0, r, 0, 6.2832), 0.8, 0.6);
        glow(() => g.arc(0, 0, ri, 0, 6.2832), 0.9);
        const pr = ri * 0.62, ro2 = -t * 0.4; // the pupil: the triangle
        glow(() => { for (let m = 0; m < 3; m++) { const an = ro2 - Math.PI / 2 + m * 2.0944; g[m ? "lineTo" : "moveTo"](Math.cos(an) * pr, Math.sin(an) * pr); } g.closePath(); }, 1.2);
      } else if (k === 1) { // the gyroscope
        const rings = [[0.55, 0, 1.1], [1.25, 1.05, -0.8], [-1.0, 2.1, 0.65]];
        rings.forEach(([tx, tz, sp], m) => {
          const rot = t * sp, pt = u => { // a point on a unit circle, tilted round x then z, turning
            let X = Math.cos(u), Y = Math.sin(u) * Math.cos(tx), Z = Math.sin(u) * Math.sin(tx);
            const cz = Math.cos(tz + rot * 0.25), sz = Math.sin(tz + rot * 0.25); [X, Y] = [X * cz - Y * sz, X * sz + Y * cz];
            return [X * r * (0.95 - m * 0.06), Y * r * (0.95 - m * 0.06), Z];
          };
          glow(() => { for (let i = 0; i <= 64; i++) { const q = pt((i / 64) * 6.2832); g[i ? "lineTo" : "moveTo"](q[0], q[1]); } }, 0.9, 0.75);
          for (let j = 0; j < 2; j++) { const q = pt(rot + j * Math.PI); g.fillStyle = rgb([255, 255, 255], (q[2] > 0 ? 0.55 : 1) * a); g.beginPath(); g.arc(q[0], q[1], r * 0.065, 0, 6.2832); g.fill(); }
        });
        orb(g, 0, 0, r * 0.32, c, 0.7 * a); g.fillStyle = rgb([255, 255, 255], a); g.beginPath(); g.arc(0, 0, r * 0.1, 0, 6.2832); g.fill();
      } else { // the Lissajous figure
        const ph = t * 0.45, A = 3, B = 2, P = u => [Math.sin(A * u + ph) * r * 0.92, Math.sin(B * u) * r * 0.92];
        glow(() => { for (let i = 0; i <= 220; i++) { const q = P((i / 220) * 6.2832); g[i ? "lineTo" : "moveTo"](q[0], q[1]); } }, 0.9, 0.7);
        for (let j = 0; j < 26; j++) { // the point of light and its fading trail
          const q = P(t * 1.6 - j * 0.035); g.fillStyle = rgb(j ? hi : [255, 255, 255], (1 - j / 26) * a); g.beginPath(); g.arc(q[0], q[1], r * (j ? 0.05 : 0.085) * (1 - j / 40), 0, 6.2832); g.fill();
        }
      }
      g.restore();
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
      // the capstone: the top quarter of the pyramid is a gold crystal sitting on a fine seam; pointed at, it lifts a
      // little off the pyramid and brightens
      const CUT = 0.27, lift = s * 0.04 * bloom[3];
      const cut = [0, 1, 2].map(k => ({ x: T.x + (v[k].x - T.x) * CUT, y: T.y + (v[k].y - T.y) * CUT, z: T.z + (v[k].z - T.z) * CUT }));
      const Tc = { x: T.x, y: T.y - lift, z: T.z }, capCut = cut.map(q => ({ ...q, y: q.y - lift }));
      for (const g of [gb, gf]) { g.clearRect(0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = "lighter"; }
      // the floor: a soft pool of light and a slow dashed ring under the base
      const fl = st.y + s * 0.25 * Math.cos(0.3 + tiltY);
      gb.save(); gb.translate(st.x, fl); gb.scale(1, 0.3 + tiltY * 0.6);
      const pool = gb.createRadialGradient(0, 0, 0, 0, 0, s * 0.62); pool.addColorStop(0, `rgba(77,163,255,${0.16 * io})`); pool.addColorStop(1, "rgba(77,163,255,0)");
      gb.fillStyle = pool; gb.beginPath(); gb.arc(0, 0, s * 0.62, 0, 6.2832); gb.fill();
      gb.restore();
      // the beam: from the tip up out of the top, with pulses rising
      const bg = gf.createLinearGradient(0, Tc.y, 0, 0); bg.addColorStop(0, `rgba(255,248,230,${0.85 * io})`); bg.addColorStop(1, "rgba(255,248,230,0)");
      gf.strokeStyle = bg; gf.globalAlpha = 0.2; gf.lineWidth = 10; gf.beginPath(); gf.moveTo(Tc.x, Tc.y); gf.lineTo(Tc.x, 0); gf.stroke();
      gf.globalAlpha = 1; gf.lineWidth = 1.6; gf.stroke();
      pulses = pulses.filter(p => tt - p.t < 1.6);
      for (const p of pulses) { const u = (tt - p.t) / 1.6, e = 1 - (1 - u) ** 2, y = Tc.y - e * (Tc.y + 40); orb(gf, Tc.x, y, 16 + 10 * (1 - u), p.c, 0.9 * (1 - u)); }
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
        g.fillStyle = gr; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        if (f[2] === 3) { g.lineTo(cut[f[1]].x, cut[f[1]].y); g.lineTo(cut[f[0]].x, cut[f[0]].y); } else g.lineTo(c.x, c.y); // the sides stop at the seam
        g.closePath(); g.fill();
      }
      // the heart is the middle of the floor, where the emblem lies; faint lines run from each corner in to it
      const P = 0.3 + tiltY, D = s * 2.6, fy = s * 0.25 * Math.cos(P), fz = s * 0.25 * Math.sin(P);
      const hx = st.x, hy0 = st.y + fy * (D / (D + fz));
      for (let k = 0; k < 4; k++) { const A = v[k]; gb.strokeStyle = rgb(k === 3 ? TIP : COL[k], 0.22 * io); gb.lineWidth = 1; gb.beginPath(); gb.moveTo(A.x, A.y); gb.lineTo(hx, hy0); gb.stroke(); }
      // the edges: base corner to corner, each corner up to the tip; near edges brighter and in front
      const E = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
      for (const [i, j] of E) {
        const A = v[i], B = j === 3 ? cut[i] : v[j], near = (A.z + B.z) / 2 < C[1];
        edge(near ? gf : gb, A, B, i === 3 ? TIP : COL[i], j === 3 ? TIP : COL[j], (near ? 1 : 0.55) * io);
      }
      // the lights, in turn: from each corner inward across the floor to the heart, straight up the middle through
      // the capstone, then out of the top as a pulse up the beam (three meeting in one place, rising together)
      for (let k = 0; k < 3; k++) {
        const u = ((tt * 0.2) + k / 3) % 1, A = v[k], sm = q => q * q * (3 - 2 * q);
        if (!reduce && u < 0.8) {
          let x, y, c, g;
          if (u < 0.38) { const e = sm(u / 0.38); x = A.x + (hx - A.x) * e; y = A.y + (hy0 - A.y) * e; c = COL[k]; g = A.z * (1 - e) < C[1] ? gf : gb; } // across the floor
          else { const e = sm((u - 0.38) / 0.42); x = hx + (Tc.x - hx) * e; y = hy0 + (Tc.y - hy0) * e; c = mix(COL[k], TIP, e); g = gf; } // up the middle
          orb(g, x, y, s * 0.035, c, 0.95 * io);
        }
        if (!reduce && lastU[k] < 0.8 && u >= 0.8) pulses.push({ t: tt, c: mix(COL[k], TIP, 0.45) }); // out of the capstone, up the beam
        lastU[k] = u; orb(A.z < C[1] ? gf : gb, A.x, A.y, s * 0.05, COL[k], (0.75 + 0.25 * Math.sin(tt * 2 + k * 2)) * io * (1 - 0.85 * bloom[k])); // dims while its form is open
      }
      // the crystal capstone: gold glass faces brightest at the tip, fine facets, the seam it sits on glowing as it
      // lifts (light through the gap), and a slow band of light rising through it
      const flash = reduce ? 0 : Math.max(...[0, 1, 2].map(k => Math.max(0, 1 - Math.abs(((tt * 0.2 + k / 3) % 1) - 0.8) / 0.05))); // a light passing through
      const cb = Math.min(1, bloom[3] + 0.7 * flash), gold = [233, 194, 122];
      gf.strokeStyle = rgb(gold, (0.12 + 0.3 * cb) * io); gf.lineWidth = 7; gf.beginPath(); cut.forEach((q, m) => gf[m ? "lineTo" : "moveTo"](q.x, q.y)); gf.closePath(); gf.stroke();
      gf.strokeStyle = rgb(gold, (0.6 + 0.4 * cb) * io); gf.lineWidth = 1.2; gf.stroke();
      for (let m = 0; m < 3; m++) {
        const A = capCut[m], B = capCut[(m + 1) % 3], mxp = (A.x + B.x) / 2, myp = (A.y + B.y) / 2;
        const gr = gf.createLinearGradient(Tc.x, Tc.y, mxp, myp);
        gr.addColorStop(0, rgb([255, 247, 228], (0.34 + 0.3 * cb) * io)); gr.addColorStop(1, rgb(gold, (0.08 + 0.12 * cb) * io));
        gf.fillStyle = gr; gf.beginPath(); gf.moveTo(Tc.x, Tc.y); gf.lineTo(A.x, A.y); gf.lineTo(B.x, B.y); gf.closePath(); gf.fill();
        gf.strokeStyle = rgb([255, 240, 205], 0.28 * io); gf.lineWidth = 0.8; gf.beginPath(); gf.moveTo(Tc.x, Tc.y); gf.lineTo(mxp, myp); gf.stroke(); // a facet
      }
      gf.strokeStyle = rgb([255, 244, 214], (0.75 + 0.25 * cb) * io); gf.lineWidth = 1.4; gf.beginPath();
      for (let m = 0; m < 3; m++) { gf.moveTo(Tc.x, Tc.y); gf.lineTo(capCut[m].x, capCut[m].y); }
      capCut.forEach((q, m) => gf[m ? "lineTo" : "moveTo"](q.x, q.y)); gf.closePath(); gf.stroke();
      if (!reduce) { // the band of light rising through the crystal, quicker when pointed at
        const u = (tt * (0.25 + 0.35 * cb)) % 1, P2 = capCut.map(q => ({ x: q.x + (Tc.x - q.x) * u, y: q.y + (Tc.y - q.y) * u })).sort((a, b) => a.x - b.x);
        gf.strokeStyle = rgb([255, 250, 236], 0.55 * Math.sin(u * Math.PI) * io); gf.lineWidth = 1.2; gf.beginPath(); gf.moveTo(P2[0].x, P2[0].y); gf.lineTo(P2[2].x, P2[2].y); gf.stroke();
      }
      orb(gf, Tc.x, Tc.y, s * (0.045 + 0.02 * cb), TIP, (0.7 + 0.3 * Math.sin(tt * 1.4)) * io);
      // the way in: the node under the pointer becomes its living form, grown out of the node as a ring of light
      // closes in (the capstone lifts instead); on arrival they bloom softly for a few seconds so people learn it
      pts = v.slice(); pts[3] = { x: Tc.x, y: (Tc.y * 2 + cut[0].y + cut[1].y + cut[2].y) / 5 }; // the capstone is caught anywhere on it
      const teach = reduce ? 0 : Math.max(0, Math.min(1, (tt - 1.4) / 0.6, (5.4 - tt) / 0.8));
      for (let k = 0; k < 4; k++) {
        const want = k === hot ? 1 : teach * 0.8;
        if (want > 0.5 && bloom[k] < 0.15 && tt - opened[k] > 0.8) opened[k] = tt;
        bloom[k] += (want - bloom[k]) * Math.min(1, dt * (want > bloom[k] ? 7 : 4));
        if (k === 3 || bloom[k] < 0.02) continue; // the capstone lifts instead (above)
        const A = v[k], c = COL[k], b = bloom[k], r = s * 0.09 * b, u = (tt - opened[k]) / 0.7;
        orb(gf, A.x, A.y, s * 0.11 * b, c, 0.18 * b);
        if (u < 1) { gf.strokeStyle = rgb(c, 0.9 * (1 - u)); gf.lineWidth = 1.2; gf.beginPath(); gf.arc(A.x, A.y, s * 0.09 * (2.4 - 1.4 * (1 - (1 - u) ** 3)), 0, 6.2832); gf.stroke(); } // a ring of light closes in once as it opens
        form(gf, k, A.x, A.y, r, tt, c, Math.min(1, b * 1.2));
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
      pts.forEach((A, k) => { const d = Math.hypot(x - A.x, y - A.y); if (d < bd) { bd = d; best = k; } });
      return best;
    };
    // where each one leads: the marketplace showing that kind, or the Capstone page through the page transition
    function go(k, e) {
      if (k < 3) { document.querySelector(`[data-k="${KINDS[k]}"]`)?.click(); $("market").scrollIntoView({ behavior: "smooth" }); return; }
      const a = document.createElement("a"); a.href = "vip"; a.hidden = true; document.body.appendChild(a);
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, detail: 1 }));
      a.remove();
    }
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
