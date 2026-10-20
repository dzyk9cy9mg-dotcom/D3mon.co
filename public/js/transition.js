// Moving between pages (owner, 2026-10-20: "clean and luxurious"). Clicking a link to another D3MON page draws a
// fine gold triangle around the click; then the browser's own page transition opens the next page out of that
// triangle (css/transition.css), with the triangle's gold edge riding the opening. Loaded in <head> so the next
// page's reveal is caught before it first paints. Browsers without page transitions, and reduce motion, just go.
(function () {
  "use strict";
  if (!("CSSViewTransitionRule" in window) || !window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const KEY = "d3vt", DRAW = 380, OPEN = 1200, EASE = "cubic-bezier(.65,0,.25,1)";

  // one equilateral triangle, apex up, its centre on (x, y) and its corners r from the centre
  function triangle(x, y, r) {
    document.querySelectorAll(".d3vt-tri").forEach(n => n.remove());
    const box = document.createElement("div"), d = `M0 ${-r} L${r * 0.866} ${r / 2} L${-r * 0.866} ${r / 2} Z`;
    box.className = "d3vt-tri"; box.setAttribute("aria-hidden", "true");
    box.style.transform = `translate(${x}px,${y}px)`;
    box.innerHTML = `<svg width="1" height="1" viewBox="0 0 1 1"><defs><linearGradient id="d3vt-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFF1CF"/><stop offset=".55" stop-color="#E9C27A"/><stop offset="1" stop-color="#9C7333"/></linearGradient></defs>
      <g><path class="glow" d="${d}" stroke-width="7"/><path d="${d}" stroke-width="1.5"/></g></svg>`;
    document.documentElement.appendChild(box);
    return box;
  }

  // a part's own symbol (js/sigils.js), for links into that part (data-sigil="caller|bot|script|capstone"), in the
  // triangle's place: it draws itself where the visitor clicked, then the next page opens out of the triangle as usual
  function sigil(k, x, y, r) {
    document.querySelectorAll(".d3vt-tri").forEach(n => n.remove());
    const box = document.createElement("div");
    box.className = "d3vt-tri d3vt-sig"; box.setAttribute("aria-hidden", "true");
    box.style.transform = `translate(${x}px,${y}px)`;
    box.innerHTML = `<svg width="1" height="1" viewBox="0 0 1 1"><g transform="scale(${r / 50})">${window.D3Sigils.svg(k)}</g></svg>`;
    document.documentElement.appendChild(box);
    return box;
  }

  // leaving: draw the triangle (or the part's symbol) where the visitor clicked, then go
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (a && a.dataset.sigil && window.D3Wall) return; // a part's link: the wall carries it (js/wall.js)
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // a jump within this page
    e.preventDefault();
    const b = a.getBoundingClientRect(), kb = e.detail === 0; // a key press has no pointer position: use the link's middle
    const x = kb ? b.left + b.width / 2 : e.clientX, y = kb ? b.top + b.height / 2 : e.clientY;
    try { sessionStorage.setItem(KEY, JSON.stringify({ x: x / innerWidth, y: y / innerHeight, at: Date.now() })); } catch {}
    const k = a.dataset.sigil, mark = k && window.D3Sigils && window.D3Sigils.S[k] ? sigil(k, x, y, 34) : triangle(x, y, 26);
    for (const path of mark.querySelectorAll("path:not(.fill)")) {
      const len = path.getTotalLength();
      path.animate([{ strokeDasharray: len, strokeDashoffset: len }, { strokeDasharray: len, strokeDashoffset: 0 }], { duration: DRAW, easing: EASE, fill: "forwards" });
    }
    setTimeout(() => location.assign(url.href), DRAW);
  });

  // arriving: centre the opening on the click and let the gold edge ride just inside it
  addEventListener("pagereveal", e => {
    if (!e.viewTransition) return;
    if (document.documentElement.classList.contains("d3-wall-in")) { e.viewTransition.skipTransition(); return; } // the wall opens this page
    let p = null;
    try { p = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch {}
    if (!p || Date.now() - p.at > 8000) p = { x: 0.5, y: 0.5 }; // back and forward: open from the middle
    const x = p.x * innerWidth, y = p.y * innerHeight, root = document.documentElement.style;
    // just big enough to cover the screen when it ends (its inner circle reaches the farthest corner), so the
    // whole opening is one long glide rather than a snap
    const far = Math.max(...[[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight]].map(([cx, cy]) => Math.hypot(cx - x, cy - y)));
    const R = 2 * far + 40;
    root.setProperty("--vx", `${x}px`); root.setProperty("--vy", `${y}px`); root.setProperty("--vr", `${R}px`);
    // the opening and its gold edge start together on one clock, the edge a hair inside the opening
    const box = triangle(x, y, 100), g = box.querySelector("g"); // growing the inner group keeps the lines hair-thin
    g.style.transform = "scale(0)";
    e.viewTransition.ready.then(() => {
      const tri = r => `polygon(${x}px ${y - r}px, ${x + r * 0.866}px ${y + r / 2}px, ${x - r * 0.866}px ${y + r / 2}px)`, t = { duration: OPEN, easing: EASE, fill: "both" };
      document.documentElement.animate({ clipPath: [tri(0), tri(R)] }, { ...t, pseudoElement: "::view-transition-new(root)" });
      g.animate({ transform: ["scale(0)", `scale(${(R * 0.992) / 100})`] }, t);
      box.animate({ opacity: [1, 1, 0], offset: [0, 0.55, 1] }, { duration: OPEN, fill: "both" });
    }, () => box.remove());
    e.viewTransition.finished.finally(() => box.remove());
  });

  // coming back through the browser's page cache: clear the triangle left from leaving
  addEventListener("pageshow", e => { if (e.persisted) document.querySelectorAll(".d3vt-tri").forEach(n => n.remove()); });
})();
