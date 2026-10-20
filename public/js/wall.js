// The wall transition (owner, 2026-10-20: "the black triangles move when I hover; what if for transitions they did
// cool moves? consider it for the whole site"). The hero's wall of matte-black triangles becomes the way between
// places: leaving, its triangles flip in from where you clicked, in a wave, until they close over the screen (the
// edges at the wave's front catch the colour of where you're going, and that part's symbol draws itself in the
// middle); arriving, the next page starts behind the closed wall and the triangles flip away in a wave to reveal it.
// Loaded in <head> on every page that should arrive this way, so the cover is up before the page first paints.
// window.D3Wall: close(x, y, colour, symbol, done), open(x, y, colour), leave(url, x, y, colour, symbol).
// Reduce motion: no wall, pages just change.
(function () {
  "use strict";
  const reduce = !window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KEY = "d3wall", HOLD = 140;
  const IN = { spread: 430, each: 560 }, OUT = { spread: 560, each: 780 }; // ms: the wave's sweep, and each block's move
  const F = 1400, DEEP = 300; // the viewing distance, and how deep each block runs (as on the hero's wall)
  let cv = null, g = null, W = 0, H = 0, dpr = 1, tiles = [], raf = 0;

  function canvas() {
    if (cv && cv.isConnected) return;
    cv = document.createElement("canvas"); cv.className = "d3-wall"; cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none";
    (document.body || document.documentElement).appendChild(cv);
    g = cv.getContext("2d"); size();
  }
  // the hero's lattice: up and down triangles in rows, with a fine seam between blocks
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = W > 900 ? 170 : 110, h = S * 0.866;
    tiles = [];
    for (let r = -1; r * h < H + h; r++) for (let c = -2; c * S / 2 < W + S; c++) {
      const up = (r + c) % 2 === 0, x = c * S / 2, y = r * h;
      const p = up ? [[x + S / 2, y], [x + S, y + h], [x, y + h]] : [[x, y], [x + S, y], [x + S / 2, y + h]];
      const cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
      tiles.push({ p: p.map(([px, py]) => [px + (cx - px) * 0.035, py + (cy - py) * 0.035]), cx, cy, seed: Math.random() });
    }
  }
  const easeOut = u => 1 - (1 - u) ** 3, easeIn = u => u * u * u;
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

  // paint the wall `at` ms in, seen from in front of (x, y). Closing (dir 1): each block rushes forward out of the
  // dark to its place, in a wave from (x, y), its edge catching the colour as it lands. Opening (dir -1): the blocks
  // fall back into the dark, nearest the click first, so the page behind opens out from where you clicked.
  function paint(x, y, at, dir, col, sym) {
    g.clearRect(0, 0, W, H);
    const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => Math.hypot(a - x, b - y))) || 1;
    const [cr, cg, cb] = rgb(col), T = dir > 0 ? IN : OUT;
    const proj = (px, py, z) => { const s = F / (F - z); return [x + (px - x) * s, y + (py - y) * s]; };
    let done = true, sum = 0;
    const list = [];
    for (const t of tiles) {
      const d = Math.hypot(t.cx - x, t.cy - y) / far;
      const u = Math.max(0, Math.min(1, (at - (d * T.spread + t.seed * 70)) / T.each)); if (u < 1) done = false;
      // z: where the block's face is (0 = in place, covering); a: how solid it is
      const z = dir > 0 ? -1100 * (1 - easeOut(u)) : -1300 * easeIn(u);
      const a = dir > 0 ? Math.min(1, u * 2.2) : 1 - u ** 1.4;
      sum += dir > 0 ? u : 1 - u;
      if (a > 0.002) list.push({ t, z, a, u });
    }
    // the dark behind the blocks fills in as they land, and drains away as they fly off
    const cover = sum / tiles.length;
    g.fillStyle = `rgba(4,5,7,${(dir > 0 ? cover ** 1.5 : cover ** 2.5).toFixed(3)})`; g.fillRect(0, 0, W, H);
    list.sort((A, B) => A.z - B.z); // far blocks first
    for (const { t, z, a, u } of list) {
      const front = t.p.map(([px, py]) => proj(px, py, z)), back = t.p.map(([px, py]) => proj(px, py, z - DEEP));
      const moving = Math.sin(Math.PI * u), lit = 0.45 + 0.55 * Math.max(0, Math.min(1, (z + 1100) / 1100));
      g.globalAlpha = a;
      // the sides that face the click, lit a little from above, falling away to black
      for (let m = 0; m < 3; m++) {
        const A = t.p[m], B = t.p[(m + 1) % 3], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        let nx = B[1] - A[1], ny = A[0] - B[0];
        if (nx * (mx - t.cx) + ny * (my - t.cy) < 0) { nx = -nx; ny = -ny; }
        if (nx * (x - mx) + ny * (y - my) <= 0) continue;
        const up = Math.max(0, -ny / Math.hypot(nx, ny)), l = (18 + 20 * up) * lit;
        const sg = g.createLinearGradient(...front[m], ...back[m]);
        sg.addColorStop(0, `rgb(${l | 0},${l | 0},${(l + 4) | 0})`); sg.addColorStop(1, "rgb(3,4,6)");
        g.fillStyle = sg; g.beginPath(); g.moveTo(...front[m]); g.lineTo(...front[(m + 1) % 3]); g.lineTo(...back[(m + 1) % 3]); g.lineTo(...back[m]); g.closePath(); g.fill();
      }
      // the face: matte black, a touch lighter at the top; its rim catches the colour while it moves
      const top = Math.min(front[0][1], front[1][1], front[2][1]), bot = Math.max(front[0][1], front[1][1], front[2][1]);
      const lf = Math.round(30 * lit), fg = g.createLinearGradient(0, top, 0, bot);
      fg.addColorStop(0, `rgb(${lf + 5},${lf + 6},${lf + 9})`); fg.addColorStop(1, `rgb(${lf - 6},${lf - 6},${lf - 4})`);
      g.fillStyle = fg; g.beginPath(); g.moveTo(...front[0]); g.lineTo(...front[1]); g.lineTo(...front[2]); g.closePath(); g.fill();
      g.lineWidth = 1; g.strokeStyle = `rgba(${cr},${cg},${cb},${(0.07 + 0.75 * moving).toFixed(3)})`; g.stroke();
    }
    g.globalAlpha = 1;
    if (sym && window.D3Sigils) { // the symbol draws itself at the heart of the wall; on the way out you pass through it
      const s = Math.min(W, H) * 0.16;
      if (dir > 0) window.D3Sigils.draw(g, sym, x, y, s, { t: Math.min(1, Math.max(0, (at - 180) / 650)), a: 1, lit: 0.7 });
      else { const k = Math.min(1, at / 520); window.D3Sigils.draw(g, sym, x, y, s * (1 + 5 * easeIn(k)), { t: 1, a: 1 - k, lit: 0.7 }); }
    }
    return done;
  }
  function run(x, y, dir, col, sym, then) {
    canvas(); cancelAnimationFrame(raf);
    const t0 = performance.now();
    const step = now => {
      const done = paint(x, y, now - t0, dir, col, sym);
      if (!done) raf = requestAnimationFrame(step);
      else { if (dir < 0) cv.remove(); then && then(); }
    };
    raf = requestAnimationFrame(step);
  }

  // close the wall over this page from (x, y), then `done` (the screen is covered)
  function close(x, y, col = "#E9C27A", sym = null, done = () => {}) {
    if (reduce) return done();
    run(x, y, 1, col, sym, () => setTimeout(done, HOLD));
  }
  // open the wall that covers the page, from (x, y)
  function open(x = innerWidth / 2, y = innerHeight / 2, col = "#E9C27A", sym = null) {
    if (reduce) { cv && cv.remove(); return; }
    run(x, y, -1, col, sym);
  }
  // leave for another page: close the wall, remember where, then go; the next page opens it
  function leave(url, x, y, col, sym) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ x: x / innerWidth, y: y / innerHeight, col, sym, at: Date.now() })); } catch {}
    close(x, y, col, sym, () => location.assign(url));
  }

  // arriving behind a closed wall: cover at once, before the first paint, then open once the page is ready
  if (!reduce) {
    let p = null;
    try { p = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch {}
    if (p && Date.now() - p.at < 8000) {
      canvas(); paint(0, 0, 1e6, 1, p.col, null);
      document.documentElement.classList.add("d3-wall-in"); // transition.js skips its own opening for this page
      const go = () => setTimeout(() => open(p.x * innerWidth, p.y * innerHeight, p.col, p.sym), 60);
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { if (!cv.isConnected || cv.parentNode !== document.body) document.body.appendChild(cv); go(); }); else go();
    }
  }
  addEventListener("resize", () => { if (cv && cv.isConnected) size(); });
  // back through the page cache: never leave the wall standing
  addEventListener("pageshow", e => { if (e.persisted && cv) { cancelAnimationFrame(raf); cv.remove(); } });

  // links into a part (data-sigil="caller|bot|script|capstone") go through the wall, in that part's colour and symbol
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[data-sigil][href]");
    if (reduce || !a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    const b = a.getBoundingClientRect(), kb = e.detail === 0, k = a.dataset.sigil, S = window.D3Sigils && window.D3Sigils.S[k];
    leave(url.href, kb ? b.left + b.width / 2 : e.clientX, kb ? b.top + b.height / 2 : e.clientY, S ? S.color : "#E9C27A", S ? k : null);
  });

  window.D3Wall = { close, open, leave };
})();
