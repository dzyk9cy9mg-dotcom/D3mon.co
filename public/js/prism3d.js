// The front page's crown jewel (/next): the D3MON pyramid as real glass, drawn with three.js (vendored, no build).
// A three-sided glass pyramid with true refraction and a little dispersion, lit by a small studio of light strips so
// its faces catch a sheen as it turns. Its corners are gems in the three colours (amber callers, blue bots, violet
// chart scripts) joined by glowing edges; a fine gold seam marks the Capstone near the tip. At its heart the Live
// Trade Cortex: the emblem's triangle and dashed ring lying on the floor, its three rings tumbling above it with the
// main page's movements, and the pulsing heart sending the beam up through the tip. Seen through the glass, all of it
// bends. Lights climb each edge to the tip; a click sends a pulse up the beam.
// Same ways in as the 2D version: point at a corner or the tip to slow it, light it and name it; click to go there.
// Drag to spin it, the pointer tilts it. js/next.js loads this only when WebGL works and motion is allowed, and falls
// back to the 2D pyramid if it can't start or runs slowly.
import * as THREE from "../vendor/three-0.169.0.module.min.js";
import { EffectComposer } from "../vendor/three-addons-0.169.0/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/three-addons-0.169.0/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/three-addons-0.169.0/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/three-addons-0.169.0/postprocessing/OutputPass.js";

const COL = [0xffb547, 0x4da3ff, 0xb98cff].map(c => new THREE.Color(c)); // callers, bots, chart scripts
const GOLD = new THREE.Color(0xffe2a8), TIPC = new THREE.Color(0xfff1cf);
const R = 1, HT = 1.72; // base corner radius and height, in world units
const SEAM = 0.8; // the Capstone's gold seam, as a share of the height
const BASE = (2 * Math.PI) / 40; // one turn in 40 s

// a round soft light, for glows (drawn on a canvas once)
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,.55)"); r.addColorStop(0.45, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// the floor under the pyramid: a pool of blue light, a fine circle and a dotted outer ring (it turns slowly)
function floorTex() {
  const N = 1024, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), m = N / 2;
  g.fillStyle = "#000"; g.fillRect(0, 0, N, N);
  const pool = g.createRadialGradient(m, m, 0, m, m, m * 0.9);
  pool.addColorStop(0, "rgba(77,163,255,.34)"); pool.addColorStop(0.45, "rgba(60,120,210,.12)"); pool.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = pool; g.fillRect(0, 0, N, N);
  g.strokeStyle = "rgba(120,170,230,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(m, m, m * 0.62, 0, 6.2832); g.stroke();
  g.fillStyle = "rgba(150,190,240,.7)";
  for (let k = 0; k < 120; k++) { const a = (k / 120) * 6.2832; g.beginPath(); g.arc(m + Math.cos(a) * m * 0.86, m + Math.sin(a) * m * 0.86, k % 10 === 0 ? 4 : 2, 0, 6.2832); g.fill(); }
  g.strokeStyle = "rgba(77,163,255,.18)"; g.lineWidth = 1.5; g.setLineDash([60, 18, 8, 18]); g.beginPath(); g.arc(m, m, m * 0.74, 0, 6.2832); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// a glowing line between two points: a thin tube whose colour runs from one end's to the other's (k > 1 blooms)
function tube(A, B, ca, cb, r, k = 1, fadeB = false) {
  const d = new THREE.Vector3().subVectors(B, A), len = d.length();
  const geo = new THREE.CylinderGeometry(r, r, len, 8, 12, true), pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const f = pos.getY(i) / len + 0.5, c = ca.clone().lerp(cb, f).multiplyScalar(k * (fadeB ? (1 - f) ** 1.6 : 1));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function start({ hero, labels, stageAt, onGo }) {
  // ---------- renderer, camera, the studio lighting
  const canvas = document.createElement("canvas");
  canvas.className = "n-pyr3d"; canvas.setAttribute("aria-hidden", "true");
  hero.insertBefore(canvas, labels);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const phone = matchMedia("(pointer: coarse)").matches;
  const dpr = Math.min(phone ? 1.5 : 1.75, devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 1); // black reads as see-through: the canvas is screen-blended over the wall

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

  // a little studio for the reflections: a warm key strip upper left, a cool rim to the right, the three colours low
  const pmrem = new THREE.PMREMGenerator(renderer), studio = new THREE.Scene();
  studio.background = new THREE.Color(0x020304);
  const strip = (w, h, c, k, p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(0, 0.6, 0); studio.add(m); };
  strip(6, 0.5, 0xfff4e0, 7, [-4, 5, 3]); strip(0.4, 5, 0xdfeaff, 5, [5, 1.5, -1]); strip(3, 0.3, 0xffffff, 3, [1, 6, -4]);
  strip(2.5, 0.8, 0xffb547, 1.6, [-5, -0.5, 2]); strip(2.5, 0.8, 0x4da3ff, 1.6, [0, -0.5, 5]); strip(2.5, 0.8, 0xb98cff, 1.6, [5, -0.5, 2]);
  scene.environment = pmrem.fromScene(studio, 0.03).texture;
  const glow = glowTex();

  // ---------- the pyramid: everything turns together in `rig`
  const rig = new THREE.Group(); scene.add(rig);
  const turn = new THREE.Group(); rig.add(turn);
  const corner = [0, 1, 2].map(k => { const a = Math.PI / 2 + (k * 2 * Math.PI) / 3; return new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R); });
  const tip = new THREE.Vector3(0, HT, 0), V = [...corner, tip];

  // the glass: four flat faces, each side tinted faintly between its two corners' colours
  {
    const faces = [[0, 1, 3], [1, 2, 3], [2, 0, 3], [0, 2, 1]], pos = [], col = [];
    for (const f of faces) {
      const tint = f[2] === 3 ? COL[f[0]].clone().lerp(COL[f[1]], 0.5).lerp(new THREE.Color(1, 1, 1), 0.72) : new THREE.Color(0.85, 0.9, 1);
      for (const n of f) { pos.push(V[n].x, V[n].y, V[n].z); col.push(tint.r, tint.g, tint.b); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const glass = new THREE.MeshPhysicalMaterial({
      vertexColors: true, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.9, ior: 1.5, dispersion: 4,
      specularIntensity: 1, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05, attenuationColor: new THREE.Color(0.75, 0.82, 1), attenuationDistance: 3,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    turn.add(new THREE.Mesh(geo, glass));
  }
  // the edges: base corner to corner, each corner up to the tip
  const EDGE = 0.0085;
  for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) turn.add(tube(V[i], V[j], COL[i], COL[j], EDGE, 1.9));
  for (let k = 0; k < 3; k++) turn.add(tube(V[k], tip, COL[k], TIPC, EDGE, 1.9));
  // the Capstone's seam: a fine gold triangle round the glass near the tip
  const seam = V.slice(0, 3).map(c => c.clone().lerp(tip, SEAM));
  for (let k = 0; k < 3; k++) turn.add(tube(seam[k], seam[(k + 1) % 3], GOLD, GOLD, EDGE * 0.6, 1.5));

  // the gems at the corners and the tip, each with a soft glow
  const sprite = (c, s, o = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false })); m.scale.setScalar(s); return m; };
  const gems = V.map((p, k) => {
    const c = k === 3 ? TIPC : COL[k];
    const g = new THREE.Group(); g.position.copy(p);
    const stone = new THREE.Mesh(new THREE.OctahedronGeometry(k === 3 ? 0.05 : 0.042), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.4), toneMapped: false }));
    const halo = sprite(c, k === 3 ? 0.42 : 0.36, 0.55);
    g.add(stone, halo); turn.add(g);
    return { g, stone, halo, base: halo.scale.x };
  });

  // ---------- the Live Trade Cortex at the heart
  const cortex = new THREE.Group(); turn.add(cortex);
  // on the floor: the emblem's triangle pointing at the pyramid's corners, its spokes, the fine inner circle
  const ER = 0.36, tri = corner.map(c => c.clone().setLength(ER).setY(0.004));
  for (let k = 0; k < 3; k++) cortex.add(tube(tri[k], tri[(k + 1) % 3], COL[k], COL[(k + 1) % 3], 0.0045, 1.6));
  const mid = new THREE.Vector3(0, 0.004, 0);
  for (let k = 0; k < 3; k++) cortex.add(tube(tri[k], mid, COL[k], COL[k], 0.002, 0.6));
  for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), new THREE.MeshBasicMaterial({ color: COL[k].clone().multiplyScalar(2), toneMapped: false })); d.rotation.x = -Math.PI / 2; d.position.copy(tri[k]).setY(0.006); cortex.add(d); }
  // the three rings, tumbling as on the main page (14 s round X, 11 s round Y, 8 s back round X), each spinning in
  // its own plane (30 s, 16 s back, 10 s)
  const HEART = 0.42, rings = [], RC = [[COL[0], COL[1]], [COL[1], COL[2]], [COL[2], COL[0]]];
  [[0.3, 0.0042], [0.25, 0.005], [0.2, 0.0042]].forEach(([r, w], i) => {
    const geo = new THREE.TorusGeometry(r, w, 6, 160), pos = geo.attributes.position, col = [];
    for (let n = 0; n < pos.count; n++) {
      const a = Math.atan2(pos.getY(n), pos.getX(n)), f = 0.5 + 0.5 * Math.sin(a), dash = i === 0 ? (Math.sin(a * 18) > 0.6 ? 0.2 : 1) : 1;
      const c = RC[i][0].clone().lerp(RC[i][1], f).multiplyScalar(1.7 * dash); col.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const tumble = new THREE.Group(), spin = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    tumble.position.y = HEART; tumble.add(spin); cortex.add(tumble); rings.push({ tumble, spin });
  });
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.04, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdce7ee).multiplyScalar(3), toneMapped: false }));
  heart.position.y = HEART; cortex.add(heart);
  const heartGlow = sprite(COL[1], 0.55, 0.9); heartGlow.position.y = HEART; cortex.add(heartGlow);
  // the beam: from the heart up through the tip, then fading out above it
  rig.add(tube(new THREE.Vector3(0, HEART, 0), tip, new THREE.Color(0xbfe0ff), TIPC, 0.0055, 2.2));
  const beamUp = tube(tip, new THREE.Vector3(0, HT + 1.25, 0), TIPC, TIPC, 0.005, 2.2, true);
  beamUp.material.transparent = true; beamUp.material.blending = THREE.AdditiveBlending; beamUp.material.depthWrite = false;
  rig.add(beamUp);
  // the floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: floorTex(), toneMapped: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.006; rig.add(floor);

  // lights that climb each edge to the tip in turn, and pulses up the beam
  const climbers = [0, 1, 2].map(k => { const s = sprite(COL[k], 0.2, 0.9); turn.add(s); return s; });
  const pulses = [];
  const pulse = c => { const s = sprite(c, 0.4, 1); rig.add(s); pulses.push({ s, t: clock, c }); };

  // ---------- post: a gentle bloom so the gems, edges and beam glow without blowing out
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.55, 0.92);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  // ---------- placing it: the pyramid's middle sits where the 2D one did (stageAt), about the same size
  let W = 1, H = 1, st = { x: 0, y: 0, s: 1 };
  const LOOK = new THREE.Vector3(0, HT * 0.42, 0), ELEV = 0.3;
  function size() {
    W = hero.clientWidth; H = hero.clientHeight; st = stageAt(W, H);
    renderer.setSize(W, H, false); composer.setSize(W, H);
    bloom.resolution.set(Math.round(W / 2), Math.round(H / 2));
    const px = (st.s * 0.78) / (HT + 0.5); // pixels per world unit: the pyramid about 0.78 s tall with its floor
    const dist = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * px);
    camera.position.set(0, LOOK.y + Math.sin(ELEV) * dist, Math.cos(ELEV) * dist); camera.lookAt(LOOK);
    camera.aspect = W / H;
    camera.setViewOffset(W, H, W / 2 - st.x, H / 2 - st.y, W, H);
    camera.updateProjectionMatrix();
    labels.width = W * dpr; labels.height = H * dpr; lg.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const lg = labels.getContext("2d");

  // ---------- motion and the ways in (as in the 2D version)
  const NAMES = ["Callers", "Bots", "Chart scripts", "Capstone"];
  let theta = 0.35, omega = 0, tiltX = 0, tiltY = 0, mx = -1e4, my = -1e4, drag = null, fast = false, hot = -1;
  let clock = 0, last = performance.now(), running = true, seen = true, raf = 0, scr = [];
  const tmp = new THREE.Vector3();
  const project = p => { tmp.copy(p).applyMatrix4(turn.matrixWorld).project(camera); return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H }; };
  const onIt = (x, y) => Math.hypot(x - st.x, y - st.y) < st.s * 0.48;
  const cornerAt = (x, y) => { let best = -1, bd = st.s * 0.085; scr.forEach((A, k) => { const d = Math.hypot(x - A.x, y - A.y); if (d < bd) { bd = d; best = k; } }); return best; };
  const frames = [];

  function frame(now) {
    raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; clock += dt;
    if (frames.length < 90) frames.push(dt);
    // the turn: dragging sets it, then it eases back to its own pace (slow under a corner, quicker on the glass)
    if (!drag) { const want = hot >= 0 ? BASE * 0.12 : BASE * (fast ? 3 : 1); omega += (want - omega) * Math.min(1, dt * 1.5); theta += omega * dt; }
    const tx = mx > -1e3 ? ((mx - st.x) / W) * 0.25 : 0, ty = my > -1e3 ? ((my - st.y) / H) * 0.18 : 0;
    tiltX += (tx - tiltX) * 0.04; tiltY += (ty - tiltY) * 0.04;
    // the arrival: it rises a little and settles as it fades in
    const io = Math.min(1, clock / 2.2), e = 1 - (1 - io) ** 3;
    turn.rotation.y = -(theta + tiltX) + (1 - e) * 1.2;
    rig.rotation.x = tiltY * 0.9; rig.position.y = -(1 - e) * 0.25;
    floor.rotation.z = clock * 0.03;
    // the Cortex's rings and heart
    const sp = fast ? 2.6 : 1, T = Math.PI * 2;
    rings[0].tumble.rotation.x = (clock / 14) * T * sp; rings[0].spin.rotation.z = (clock / 30) * T;
    rings[1].tumble.rotation.y = (clock / 11) * T * sp; rings[1].spin.rotation.z = -(clock / 16) * T * sp;
    rings[2].tumble.rotation.x = -(clock / 8) * T * sp; rings[2].spin.rotation.z = (clock / 10) * T * sp;
    const beat = 0.5 + 0.5 * Math.sin((clock / 2.4) * T);
    heart.scale.setScalar(1 + beat * 0.25); heartGlow.material.opacity = 0.55 + beat * 0.4;
    // the gems breathe; the one under the pointer swells
    gems.forEach((G, k) => { const on = k === hot, s = G.base * (on ? 1.9 : 1 + 0.08 * Math.sin(clock * 2 + k * 2)); G.halo.scale.x += (s - G.halo.scale.x) * 0.15; G.halo.scale.y = G.halo.scale.x; G.stone.rotation.y = clock * 0.8 + k; });
    // the climbers
    climbers.forEach((s, k) => { const u = (clock * 0.22 + k / 3) % 1, f = Math.min(1, u / 0.85); s.position.copy(corner[k]).lerp(tip, f); s.material.color.copy(COL[k]).lerp(TIPC, f); s.material.opacity = u < 0.85 ? 0.95 * Math.sin(Math.PI * f) ** 0.5 : 0; });
    // a pulse up the beam every 3.2 s, and on a click
    if (Math.floor(clock / 3.2) !== Math.floor((clock - dt) / 3.2)) pulse(TIPC);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i], u = (clock - p.t) / 1.6;
      if (u >= 1) { rig.remove(p.s); p.s.material.dispose(); pulses.splice(i, 1); continue; }
      p.s.position.set(0, HT + (1 - (1 - u) ** 2) * 1.2, 0); p.s.material.opacity = 0.9 * (1 - u); p.s.scale.setScalar(0.4 * (1 - u * 0.4));
    }
    canvas.style.opacity = String(e);
    composer.render(dt);

    // the names: on arrival all four show for a few seconds, then only the one under the pointer
    rig.updateMatrixWorld(); scr = V.map(project);
    lg.clearRect(0, 0, W, H);
    const teach = Math.max(0, Math.min(1, (clock - 1.6) / 0.6, (5.4 - clock) / 0.8));
    for (let k = 0; k < 4; k++) {
      const A = scr[k], on = k === hot, a = on ? 1 : teach * 0.8;
      if (!a) continue;
      const c = k === 3 ? TIPC : COL[k], css = `#${c.getHexString()}`;
      lg.save(); lg.globalAlpha = a; lg.textBaseline = "middle";
      if (on) { lg.strokeStyle = css; lg.lineWidth = 1; lg.beginPath(); lg.arc(A.x, A.y, st.s * 0.045, 0, 6.2832); lg.stroke(); }
      lg.font = '600 11px "IBM Plex Mono", monospace'; lg.letterSpacing = "2px"; lg.fillStyle = css; lg.shadowColor = "rgba(0,0,0,.85)"; lg.shadowBlur = 8;
      let ox = k === 3 ? 1 : Math.sign(A.x - st.x) || 1;
      const label = NAMES[k].toUpperCase() + (on ? "  →" : ""), wn = lg.measureText(label).width;
      if (ox > 0 && A.x + st.s * 0.07 + wn > W - 16) ox = -1;
      lg.textAlign = ox > 0 ? "left" : "right";
      lg.fillText(ox > 0 ? label : NAMES[k].toUpperCase(), A.x + ox * st.s * 0.07, k === 3 ? A.y : A.y + st.s * 0.06);
      lg.restore();
    }
    if (running && seen && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && running && seen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  // ---------- the pointer
  const onMove = e => {
    const r = hero.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
    if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; const dtm = Math.max(1, e.timeStamp - drag.t); drag.t = e.timeStamp; theta += dx * 0.008; omega = (dx * 0.008) / (dtm / 1000); drag.moved += Math.abs(dx); }
    hot = drag || e.pointerType === "touch" ? -1 : cornerAt(mx, my);
    hero.style.cursor = hot >= 0 ? "pointer" : onIt(mx, my) ? "grab" : "";
    fast = hot < 0 && (!!drag || onIt(mx, my));
  };
  const onDown = e => {
    const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, k = cornerAt(x, y);
    if (e.target.closest("a,button") || (k < 0 && !onIt(x, y))) return;
    drag = { x: e.clientX, t: e.timeStamp, moved: 0, k };
  };
  const onUp = e => {
    if (!drag) return;
    if (drag.moved < 6 && drag.k >= 0) { const k = drag.k; drag = null; omega = BASE; onGo(k, e); return; }
    if (drag.moved < 6) pulse(COL[Math.floor(Math.random() * 3)]);
    omega = Math.max(-6, Math.min(6, omega)); drag = null;
  };
  const onLeave = () => { mx = my = -1e4; hot = -1; fast = false; };
  const io2 = new IntersectionObserver(([en]) => { seen = en.isIntersecting; wake(); });
  addEventListener("pointermove", onMove, { passive: true }); hero.addEventListener("pointerdown", onDown); addEventListener("pointerup", onUp);
  document.documentElement.addEventListener("pointerleave", onLeave);
  addEventListener("resize", size); document.addEventListener("visibilitychange", wake); io2.observe(hero);

  size(); raf = requestAnimationFrame(frame);

  return {
    // average frame time over the first frames, so next.js can fall back to 2D on slow devices
    fps() { if (frames.length < 60) return null; const s = frames.slice(15); return s.length / s.reduce((a, b) => a + b, 0); },
    stop() {
      running = false; cancelAnimationFrame(raf); io2.disconnect();
      removeEventListener("pointermove", onMove); hero.removeEventListener("pointerdown", onDown); removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave); removeEventListener("resize", size);
      lg.clearRect(0, 0, W, H); hero.style.cursor = "";
      scene.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      composer.dispose(); pmrem.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
