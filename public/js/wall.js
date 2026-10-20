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
  const KEY = "d3wall", SPREAD = 520, FLIP = 380, HOLD = 120;
  let cv = null, g = null, W = 0, H = 0, dpr = 1, tiles = [], raf = 0;

  function canvas() {
    if (cv && cv.isConnected) return;
    cv = document.createElement("canvas"); cv.className = "d3-wall"; cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none";
    (document.body || document.documentElement).appendChild(cv);
    g = cv.getContext("2d"); size();
  }
  // a triangular lattice over the screen, like the hero's wall: up and down triangles in rows
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = Math.max(70, Math.min(150, Math.min(W, H) / 6)), h = S * 0.866;
    tiles = [];
    for (let r = -1; r * h < H + h; r++) for (let c = -2; c * S / 2 < W + S; c++) {
      const up = (r + c) % 2 === 0, x = c * S / 2, y = r * h;
      const p = up ? [[x, y + h], [x + S / 2, y], [x + S, y + h]] : [[x, y], [x + S, y], [x + S / 2, y + h]];
      tiles.push({ p, cx: x + S / 2, cy: y + (up ? h * 2 / 3 : h / 3), up, seed: Math.random() });
    }
  }
  const ease = u => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

  // paint the wall at progress `at` (ms) from (x, y): dir 1 closes (tiles flip in), -1 opens (tiles flip away)
  function paint(x, y, at, dir, col, sym) {
    g.clearRect(0, 0, W, H);
    const far = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => Math.hypot(a - x, b - y))) || 1;
    const [cr, cg, cb] = rgb(col);
    let done = true;
    for (const t of tiles) {
      const d = Math.hypot(t.cx - x, t.cy - y) / far, delay = d * SPREAD + t.seed * 60;
      let u = Math.max(0, Math.min(1, (at - delay) / FLIP)); if (u < 1) done = false;
      u = ease(u); const k = dir > 0 ? u : 1 - u; // how far this tile is in place
      if (k <= 0.001) continue;
      // each tile turns over on its own axis toward the wave (squashed across it) and settles flat
      const ang = Math.atan2(t.cy - y, t.cx - x), sq = Math.max(0.02, k), lift = (1 - k) * 18;
      g.save(); g.translate(t.cx + Math.cos(ang) * lift, t.cy + Math.sin(ang) * lift); g.rotate(ang); g.scale(sq, 1); g.rotate(-ang); g.translate(-t.cx, -t.cy);
      g.beginPath(); g.moveTo(...t.p[0]); g.lineTo(...t.p[1]); g.lineTo(...t.p[2]); g.closePath();
      // matte black face, lit a little from the top left, darker as it turns
      const shade = 0.55 + 0.45 * k, gr = g.createLinearGradient(t.p[0][0], t.p[1][1], t.p[2][0], t.p[0][1]);
      gr.addColorStop(0, `rgb(${22 * shade | 0},${24 * shade | 0},${29 * shade | 0})`); gr.addColorStop(1, `rgb(${9 * shade | 0},${10 * shade | 0},${13 * shade | 0})`);
      g.fillStyle = gr; g.fill(); g.strokeStyle = gr; g.lineWidth = 1.6; g.stroke(); // no hairline gaps once closed
      // the wave's front catches the colour; settled tiles keep a faint edge
      const front = Math.sin(Math.PI * Math.min(1, k)) ** 2;
      g.lineWidth = 1; g.strokeStyle = `rgba(${cr},${cg},${cb},${0.06 + 0.7 * front})`; g.stroke();
      g.restore();
    }
    if (sym && window.D3Sigils) { // the symbol draws itself in the middle while the wall closes, and fades as it opens
      const s = Math.min(W, H) * 0.16, t = dir > 0 ? Math.min(1, at / 700) : 1, a = dir > 0 ? 1 : Math.max(0, 1 - at / 450);
      window.D3Sigils.draw(g, sym, W / 2, H / 2, s * (dir > 0 ? 1 : 1 + at / 600), { t, a, lit: 0.6 });
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
