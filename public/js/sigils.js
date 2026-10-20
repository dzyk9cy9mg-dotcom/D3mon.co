// D3MON's four symbols (owner, 2026-10-20: no words or circles round the pyramid; abstract symbols for each part,
// usable as transitions into each part's page). Fine engraved line art, one colour each, never a star shape:
//   caller   amber   the Eye: an eye with its iris, sending a signal (human insight, the call)
//   bot      blue    the Cube: a machine cube with its core and nodes (bot technology)
//   script   violet  the Wave: a rising wave across a lens, over three bars (the chart, the maths)
//   capstone gold    the Apex: the crowned tip with its seam and a light above (the room at the peak)
// Each is drawn in a 100-unit box centred on 0,0. window.D3Sigils.draw() paints one on a canvas (with a draw-in
// progress), .svg() builds one as SVG, and .portal() plays the way into a part on the same page through the wall
// (js/wall.js).
(function () {
  "use strict";
  const S = {
    caller: { color: "#FFB547", name: "Callers", paths: [
      "M-34 6 Q0 -22 34 6 Q0 34 -34 6 Z", "M0 6 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0", "M-15 -22 Q0 -32 15 -22", "M-24 -32 Q0 -47 24 -32",
    ], dots: [[0, 6, 3.6]] },
    bot: { color: "#4DA3FF", name: "Bots", paths: [
      "M0 -34 L29.4 -17 L29.4 17 L0 34 L-29.4 17 L-29.4 -17 Z", "M0 0 L0 34 M0 0 L-29.4 -17 M0 0 L29.4 -17", "M0 -14 L12.1 -7 L12.1 7 L0 14 L-12.1 7 L-12.1 -7 Z",
    ], dots: [[0, 0, 3.4], [0, -34, 2.2], [29.4, 17, 2.2], [-29.4, 17, 2.2]] },
    script: { color: "#B98CFF", name: "Chart scripts", paths: [
      "M0 -2 m-30 0 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0", "M-38 10 C-20 10 -16 -14 -2 -6 S 16 4 36 -24", "M-12 34 V22 M0 34 V16 M12 34 V26", "M-42 -2 H-34 M34 -2 H42",
    ], dots: [[36, -24, 3]] },
    capstone: { color: "#FFE2A8", name: "Capstone", paths: [
      "M0 -30 L31 24 L-31 24 Z", "M-11.5 -10 L11.5 -10", "M0 -30 V-46", "M-42 32 H42",
    ], dots: [[0, -48, 3]], fill: "M0 -30 L11.5 -10 L-11.5 -10 Z" },
  };
  const P2 = {}, LEN = {};
  // each path's length, from a hidden SVG, so a symbol can draw itself stroke by stroke
  function lengths(k) {
    if (LEN[k]) return LEN[k];
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0;visibility:hidden"); document.body.appendChild(svg);
    LEN[k] = S[k].paths.map(d => { const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); svg.appendChild(p); return p.getTotalLength(); });
    svg.remove(); return LEN[k];
  }
  const path = k => (P2[k] ||= { paths: S[k].paths.map(d => new Path2D(d)), fill: S[k].fill && new Path2D(S[k].fill) });

  // paint symbol k centred on (x, y), `size` px across. o: { t (0..1 draw-in), a (alpha), lit (0..1 hover glow), spin }
  function draw(g, k, x, y, size, o = {}) {
    const s = S[k], P = path(k), L = lengths(k), t = o.t ?? 1, a = o.a ?? 1, lit = o.lit ?? 0, sc = size / 100;
    if (a <= 0 || t <= 0) return;
    g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(o.spin || 0);
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = s.color; g.fillStyle = s.color;
    const n = P.paths.length;
    for (const pass of [0, 1]) { // a wide soft line under a fine one, so it reads as light
      g.globalAlpha = a * (pass ? 1 : 0.16 + 0.2 * lit); g.lineWidth = (pass ? 1.25 : 5 + 3 * lit) / Math.max(0.35, sc);
      if (pass) { g.shadowColor = s.color; g.shadowBlur = 6 + 10 * lit; }
      P.paths.forEach((p, i) => {
        const u = Math.max(0, Math.min(1, t * n - i * 0.75)); // the strokes follow one another
        if (!u) return;
        g.setLineDash([L[i] * u, L[i] + 1]); g.stroke(p);
      });
    }
    g.setLineDash([]); g.shadowBlur = 0;
    if (t >= 1) {
      g.globalAlpha = a * (0.22 + 0.25 * lit); if (P.fill) g.fill(P.fill);
      g.globalAlpha = a; for (const [dx, dy, r] of s.dots) { g.beginPath(); g.arc(dx, dy, r, 0, 6.2832); g.fill(); }
    }
    g.restore();
  }

  // the symbol as SVG, r px from the centre to the edge of its box
  function svg(k, cls = "") {
    const s = S[k], d = s.paths.join(" ");
    return `<g class="${cls}" style="--c:${s.color}">${s.fill ? `<path class="fill" d="${s.fill}" fill="${s.color}" fill-opacity=".25" stroke="none"/>` : ""}` +
      `<path class="glow" d="${d}" stroke="${s.color}" stroke-width="5"/>` + s.paths.map(p => `<path d="${p}" stroke="${s.color}" stroke-width="1.4"/>`).join("") +
      s.dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${s.color}" stroke="none"/>`).join("") + `</g>`;
  }

  // the way into a part on this page: the wall (js/wall.js) closes over the screen from where you clicked, in the
  // part's colour, with its symbol drawing itself in the middle; the page moves behind it (`mid`), then it opens
  function portal(k, x, y, mid) {
    const W = window.D3Wall, c = S[k] ? S[k].color : "#E9C27A";
    if (!W) { mid(); return; }
    W.close(x, y, c, k, () => { mid(); requestAnimationFrame(() => W.open(x, y, c, k)); });
  }

  window.D3Sigils = { S, draw, svg, portal, kinds: ["caller", "bot", "script", "capstone"] };
})();
