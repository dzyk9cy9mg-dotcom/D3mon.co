// /world in 3D: the outside (docs/world/BLUEPRINT.md, step 3). Loaded by world.js only on devices that get
// the 3D version; the 2D version never downloads it. Scrolling through the Outside place drives the camera:
//   0.00  overhead, the pyramid flat on the floor: seen from above it's the D3MON logo
//   0.35  the triangle has risen into the pyramid, particles lifting with it
//   0.70  the opening shot, low and in front
//   1.00  through the front glass, down to the bright core of the trading floor, with a burst of light
// The upright stargate was taken out (owner, 2026-10-18: it had no use): the core and its beam are the centre.
// The look follows the owner's concept board (docs/world/inspiration/05-grand-hall-concepts.webp): clear glass
// walls, and inside them the trading floor: a glass walkway ring, a ring of up and down ticks, the calls
// streaming into a bright core, the golden beam up to the capstone, and glass screens with charts.
// Comfort: the camera never spins or rolls; it only glides and tilts. Reduce motion cuts between the shots.
import * as THREE from "../vendor/three-0.169.0.module.min.js";

const C = { callers: 0xffb547, bots: 0x4da3ff, scripts: 0xb98cff, ink: 0xdce7ee, bg: 0x05080c };
const R = 3.1, H = 4.3; // base radius and height of the pyramid
const CORNERS = { callers: new THREE.Vector3(0, 0, -R), bots: new THREE.Vector3(-R * Math.sin(Math.PI / 3), 0, R / 2), scripts: new THREE.Vector3(R * Math.sin(Math.PI / 3), 0, R / 2) };
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = v => Math.min(1, Math.max(0, v));

export function start({ level = "lite", reducedMotion = false, showFps = false, onSlow = () => {} } = {}) {
  const full = level === "full", phone = level === "mobile-lite";
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: full, powerPreference: "high-performance" });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, full ? 2 : phone ? 1.25 : 1.5));
  renderer.setClearColor(C.bg, 1);
  const canvas = renderer.domElement;
  canvas.id = "w3d";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  document.body.dataset.three = "on";

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(C.bg, 0.045);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

  // ---------- light ----------
  scene.add(new THREE.AmbientLight(0x223344, 1.2));
  for (const [k, v] of Object.entries(CORNERS)) {
    const l = new THREE.PointLight(C[k], 14, 14, 2);
    l.position.copy(v).setY(1.2);
    scene.add(l);
  }

  // ---------- floor: the main page's own Flower of Life (d3mon.css --fol), fading out into the dark ----------
  // Seen from overhead it matches the main page's background; as the camera tilts it becomes the floor.
  // On arrival it forms, spreading out from the pyramid.
  const TILE = 0.84; // one 52 x 90 tile in world units: from the overhead shot it's the main page's size
  const floorTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = 52 * 4; cv.height = 90 * 4;
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(200 / TILE, 200 / (TILE * 90 / 52));
    t.anisotropy = 8;
    const m = getComputedStyle(document.documentElement).getPropertyValue("--fol").trim().match(/^url\(["']?(.*?)["']?\)$/s);
    if (m) {
      const im = new Image();
      im.onload = () => { const g = cv.getContext("2d"); g.drawImage(im, 0, 0, cv.width, cv.height); t.needsUpdate = true; };
      im.src = m[1].replace(/stroke-opacity='[.0-9]+'/g, "stroke-opacity='.9'");
    }
    return t;
  })();
  const floorFade = (() => {
    const s = 256, cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g = cv.getContext("2d"), grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "#fff"); grd.addColorStop(0.35, "#888"); grd.addColorStop(1, "#000");
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  })();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(100, 96), new THREE.MeshBasicMaterial({ map: floorTex, alphaMap: floorFade, transparent: true, opacity: 0.13, depthWrite: false }));
  const formFloor = time => { // the mask grows from a speck to the whole floor in the first seconds
    const k = reducedMotion ? 1 : 0.02 + 0.98 * smooth(clamp01(time / 3.5)), r = 1 / k;
    floorFade.repeat.set(r, r); floorFade.offset.set(0.5 - 0.5 * r, 0.5 - 0.5 * r);
  };
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // The light around the pyramid fades softly into the dark, with no edge (owner, 2026-10-18).
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: radial(), color: 0x4d8fd6, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01;
  scene.add(glow);

  // ---------- the pyramid ----------
  const pyr = new THREE.Group();
  scene.add(pyr);
  const apex = new THREE.Vector3(0, H, 0);
  const edgeMat = (color, o) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const edges = []; // { a, b, color } in pyramid space (y scaled by the rise)
  const keys = Object.keys(CORNERS);
  keys.forEach((k, i) => {
    edges.push({ a: CORNERS[k], b: apex, color: C[k] });
    const k2 = keys[(i + 1) % 3], mid = CORNERS[k].clone().lerp(CORNERS[k2], 0.5);
    edges.push({ a: CORNERS[k], b: mid, color: C[k] }, { a: mid, b: CORNERS[k2], color: C[k2] });
  });
  const edgeMeshes = [];
  for (const e of edges) {
    for (const [r, o] of [[0.022, 0.95], [0.09, 0.16]]) {
      const len = e.a.distanceTo(e.b), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8, 1, true), edgeMat(e.color, o));
      m.userData = e;
      pyr.add(m);
      edgeMeshes.push(m);
    }
  }
  // Dark glass faces.
  const faceGeo = new THREE.BufferGeometry();
  const fv = [];
  keys.forEach((k, i) => { const k2 = keys[(i + 1) % 3]; fv.push(...CORNERS[k].toArray(), ...CORNERS[k2].toArray(), ...apex.toArray()); });
  faceGeo.setAttribute("position", new THREE.Float32BufferAttribute(fv, 3));
  faceGeo.computeVertexNormals();
  const faces = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: 0x2a4a66, metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  pyr.add(faces);
  // The glass is made of panels: faint seams across each face.
  const seams = [];
  keys.forEach((k, i) => {
    const A = CORNERS[k], B = CORNERS[keys[(i + 1) % 3]];
    for (let t = 1; t < 5; t++) { const f = t / 5; seams.push(...A.clone().lerp(apex, f).toArray(), ...B.clone().lerp(apex, f).toArray()); }
    for (let t = 1; t < 4; t++) seams.push(...A.clone().lerp(B, t / 4).toArray(), ...apex.toArray());
  });
  const seamLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(seams, 3)),
    new THREE.LineBasicMaterial({ color: 0x9fc4e6, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
  pyr.add(seamLines);
  const capGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: 0x9fd0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  capGlow.scale.setScalar(2.2);
  scene.add(capGlow);

  // ---------- inside: the trading floor ----------
  const hall = new THREE.Group();
  scene.add(hall);
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fc4ff, metalness: 0.3, roughness: 0.1, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const walk = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 96), glass);
  walk.rotation.x = -Math.PI / 2; walk.position.y = 0.12;
  hall.add(walk);
  for (const r of [1.2, 1.5]) { // the walkway's glowing rims and railings
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 128), edgeMat(0x9fd0ff, 0.9));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.12; hall.add(rim);
    const rail = rim.clone(); rail.position.y = 0.34; rail.material = edgeMat(0x9fd0ff, 0.6); hall.add(rail);
  }
  const postGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), postMat = edgeMat(0x9fd0ff, 0.55);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    for (const r of [1.2, 1.5]) { const m = new THREE.Mesh(postGeo, postMat); m.position.set(Math.cos(a) * r, 0.23, Math.sin(a) * r); hall.add(m); }
  }
  // A ring of ticks, green for up and red for down, like the board's calls.
  const tickGeo = new THREE.BoxGeometry(0.03, 0.02, 0.2), ticks = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, up = Math.random() < 0.55;
    const m = new THREE.Mesh(tickGeo, edgeMat(up ? 0x37e08a : 0xff4d5e, 0.85));
    m.position.set(Math.cos(a) * 0.95, 0.03, Math.sin(a) * 0.95); m.rotation.y = -a;
    hall.add(m); ticks.push(m);
  }
  // The calls stream into the bright core.
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: 0xfff2d6, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.y = 0.15; core.scale.setScalar(1.8);
  hall.add(core);
  const spokes = [], nodes = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, r = 0.55 + (i % 3) * 0.12, color = C[keys[i % 3]];
    const end = new THREE.Vector3(Math.cos(a) * r, 0.15, Math.sin(a) * r);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.15, 0), end]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    const node = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    node.position.copy(end); node.scale.setScalar(0.24);
    hall.add(line, node); spokes.push(line); nodes.push(node);
  }
  // The wave a round's result sends across the floor: green for up, red for down.
  // A round's result: a ring of green (up) or red (down) draws in to the core, then one pulse of that colour
  // rides up the beam and out of the capstone into the sky (owner: clean, nothing running outward).
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 128), new THREE.MeshBasicMaterial({ color: 0x37e08a, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2; wave.position.y = 0.06;
  scene.add(wave);
  const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: 0x37e08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  orb.scale.setScalar(0.9);
  scene.add(orb);
  // The golden beam from the core up to the capstone.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 8, 1, true), edgeMat(C.callers, 0.95));
  const beamGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 12, 1, true), edgeMat(C.callers, 0.18));
  scene.add(beam, beamGlow);
  const palette = [C.callers, C.bots, C.scripts, 0xffffff];
  // ---------- the main page's emblem at the heart of the triangle (owner, 2026-10-19) ----------
  // The same drawing as the gyroscope in the main page's triangle (index.html .sigil.gim), layer for layer, with
  // the same movements as d3mon.css: three outer rings tumbling (14 s round X, 11 s round Y, 8 s back round X),
  // each also spinning in its own plane (30 s, 16 s back, 10 s), the inner dashed ring (22 s back), the triangle
  // (40 s) and the pulsing heart (2.4 s). Its lines are a little bolder than the page's, as it's drawn smaller.
  // It lies on the floor at the foot of the beam (owner, 2026-10-19), facing up, its triangle's corners toward
  // the pyramid's, so from the overhead opening it looks just as it does on the main page and the beam rises
  // out of its heart. Its lines glow (additive), and its rings tumble up out of the floor.
  const sigil = new THREE.Group();
  sigil.rotation.x = -Math.PI / 2; sigil.position.y = 0.05;
  scene.add(sigil);
  const SVG_DEFS = '<defs><linearGradient id="t" x1="0" y1="-70" x2="0" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB547"/><stop offset=".55" stop-color="#4DA3FF"/><stop offset="1" stop-color="#B98CFF"/></linearGradient><radialGradient id="c"><stop offset="0" stop-color="#4DA3FF" stop-opacity=".6"/><stop offset="1" stop-color="#4DA3FF" stop-opacity="0"/></radialGradient></defs>';
  const sigilLayer = (body, z, parent = sigil, additive = false) => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 512;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const im = new Image();
    im.onload = () => { cv.getContext("2d").drawImage(im, 0, 0, 512, 512); tex.needsUpdate = true; };
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-100 -100 200 200">${SVG_DEFS}${body}</svg>`);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.position.z = z; m.userData.o = 1; parent.add(m);
    return m;
  };
  const gimbal = () => { const g = new THREE.Group(); sigil.add(g); return g; };
  const sg = {
    halo: sigilLayer('<circle r="98" fill="url(#c)"/>', -0.02, sigil, true),
    back: sigilLayer('<circle r="74" fill="#05080C" fill-opacity=".5" stroke="#1A2A36"/>', -0.015),
    g1: gimbal(), g2: gimbal(), g3: gimbal(),
  };
  sg.s3 = sigilLayer('<circle r="94" fill="none" stroke="#8FA3B2" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="1.6 5"/>', 0, sg.g1, true);
  sg.s1 = sigilLayer('<circle r="84" fill="none" stroke="url(#t)" stroke-width="2.6" stroke-dasharray="36 10 4 10"/>', 0, sg.g2, true);
  sg.s2 = sigilLayer('<polygon points="0,-66 57.2,-33 57.2,33 0,66 -57.2,33 -57.2,-33" fill="none" stroke="#4DA3FF" stroke-opacity=".7" stroke-width="1.8"/>', 0, sg.g3, true);
  sg.s4 = sigilLayer('<circle r="44" fill="none" stroke="#8FA3B2" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="2 4"/>', 0.005, sigil, true);
  sg.tri = sigilLayer('<polygon points="0,-62 53.7,31 -53.7,31" fill="rgba(77,163,255,.06)" stroke="url(#t)" stroke-width="3"/><line x1="0" y1="-62" x2="0" y2="0" stroke="#FFB547" stroke-opacity=".35"/><line x1="53.7" y1="31" x2="0" y2="0" stroke="#B98CFF" stroke-opacity=".35"/><line x1="-53.7" y1="31" x2="0" y2="0" stroke="#4DA3FF" stroke-opacity=".35"/><circle cx="0" cy="-62" r="5" fill="#FFB547"/><circle cx="-53.7" cy="31" r="5" fill="#4DA3FF"/><circle cx="53.7" cy="31" r="5" fill="#B98CFF"/>', 0.008, sigil, true);
  sg.heart = sigilLayer('<circle r="20" fill="#05080C" stroke="#4DA3FF" stroke-width="1.4"/>', 0.01);
  sg.pl = sigilLayer('<circle r="8" fill="#4DA3FF"/>', 0.012, sigil, true);
  sg.dot = sigilLayer('<circle r="4" fill="#DCE7EE"/>', 0.014, sigil, true);
  const spin = (t, s) => (t / s) * Math.PI * 2; // one turn every s seconds
  // ---------- inside, rising up: the 10118 video (owner, 2026-10-18; its booths with people and its stars left out) ----------
  // Rings of glass chart screens, a glass ramp spiralling up, floating code and
  // maths for the chart scripts near the top, and the people online as little lights in the stands.
  const tower = new THREE.Group();
  scene.add(tower);
  const fades = []; // [material, full opacity], faded in with the inside
  const fadeMat = (m, o) => { m.opacity = 0; fades.push([m, o]); return m; };
  const add = (m, o) => fadeMat(m, o);
  const inr = y => 1.55 * (1 - y / H); // the room inside the walls at height y
  const glassLine = (color, o) => add(new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), o);
  // Screens face outward, toward the path the camera travels (and the glass we look in through); text is
  // one-sided so it never reads mirrored.
  function panel(tex, w, h, color, at, r, y, o = 1, text = false, parent = tower) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), add(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: text ? THREE.FrontSide : THREE.DoubleSide, blending: text ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false }), o))); // text screens hide what's behind them, so they stay readable
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), glassLine(color, 0.9)));
    g.position.set(Math.cos(at) * r, y, Math.sin(at) * r);
    g.lookAt(Math.cos(at) * r * 2, y, Math.sin(at) * r * 2);
    g.userData.y = y;
    parent.add(g);
    return g;
  }
  const screens = [];
  // Each level's screens sit on a ring that turns, so a visitor stopped at that level can bring each one round
  // to face them (the ◀ ▶ controls); the camera itself never turns.
  const ring1 = new THREE.Group(), ring2 = new THREE.Group(), ring3 = new THREE.Group();
  tower.add(ring1, ring2, ring3);
  // Chart screens in two rings, and code and maths for the chart scripts higher up: all kept well inside the
  // ramp, so nothing crosses it.
  // The lower ring is the Grand Hall's live screens (below); the rest are charts.
  screens.push(panel(chartTex(10, C.bots), 0.46, 0.28, C.bots, Math.PI / 2, inr(1.6) * 0.64, 1.6, 1, false, ring2)); // the rest of this level is below, with the live screens
  // ---------- the Grand Hall's live screens: the everyday trading room (docs/world/SITEMAP.md) ----------
  // This round with its clock and every call as it arrives, the tournament standings, the last round's result,
  // and the place kept for the D3MON Discord, which becomes the hall's chat and voice. world.js hands the data
  // in with hall(); the ring of ticks is the round clock and the spokes are this round's calls.
  const live = { calls: null, prev: null, standings: null, rounds: [], serverNow: () => Date.now() };
  const Q = 15 * 60000, hhmm = ms => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const hex = c => "#" + c.toString(16).padStart(6, "0"), KIND = { caller: C.callers, bot: C.bots, script: C.scripts };
  const UP = "#37e08a", DOWN = "#ff4d5e", INK = "#dce7ee", DIM = "#8aa0b4";
  const FONT = '"Share Tech Mono", ui-monospace, monospace', HEAD = 'Orbitron, "Share Tech Mono", sans-serif';
  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  function liveScreen(color, at, draw, { ring = ring1, y = 0.85, r = inr(0.85) * 0.68, w = 0.5 } = {}) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 320;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const grp = panel(tex, w, w * 0.625, color, at, r, y, 1, true, ring);
    const sc = { redraw() {
      const g = cv.getContext("2d");
      g.clearRect(0, 0, 512, 320); g.fillStyle = "rgba(14,30,48,0.9)"; g.fillRect(0, 0, 512, 320);
      g.fillStyle = hex(color); g.fillRect(0, 0, 512, 4);
      draw(g); tex.needsUpdate = true;
    } };
    sc.mesh = grp.children[0];
    sc.redraw();
    return sc;
  }
  const title = (g, text, sub) => { g.fillStyle = INK; g.font = `700 24px ${HEAD}`; g.fillText(text, 22, 42); if (sub) { g.fillStyle = DIM; g.font = `18px ${FONT}`; g.fillText(sub, 22, 68); } };
  const arrow = d => (d === "up" ? "▲" : "▼");
  const FRONT = Math.PI / 2; // facing the way in, so the first ones are read on the way in
  // The lock moment, every 15 minutes (BLUEPRINT section 5): the hall dims in the last 10 seconds while the
  // round screen counts down; at the close the emblem flashes and the round's calls flip from sealed to green or
  // red on the spokes for a few seconds; Kalshi's result follows with its pulse up the beam.
  const LOCK_DIM = 10000, LOCK_SHOW = 6000;
  const S1 = (2 * Math.PI) / 10, at1 = k => FRONT + (k + 0.5) * S1; // ten screens all the way round the hall
  const roundScreen = liveScreen(C.callers, at1(0), g => {
    const now = live.serverNow(), cur = Math.floor(now / Q) * Q, left = Math.max(0, cur + Q - now);
    title(g, "THIS ROUND", `${hhmm(cur)}–${hhmm(cur + Q)} · Bitcoin up or down`);
    if (left < LOCK_DIM) { // the lock moment: the last seconds count down big
      g.fillStyle = INK; g.font = `700 150px ${HEAD}`; g.textAlign = "center"; g.fillText(String(Math.ceil(left / 1000)), 256, 240);
      g.fillStyle = DIM; g.font = `20px ${FONT}`; g.fillText("Calls close", 256, 292); g.textAlign = "left"; return;
    }
    g.fillStyle = INK; g.font = `700 40px ${FONT}`; g.textAlign = "right";
    g.fillText(`${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`, 490, 50); g.textAlign = "left";
    const calls = (live.calls?.round === cur ? live.calls.calls : []).slice(0, 6);
    g.font = `22px ${FONT}`;
    if (!calls.length) { g.fillStyle = DIM; g.fillText("No calls yet this round.", 22, 120); return; }
    calls.forEach((c, i) => {
      const y = 112 + i * 34;
      g.fillStyle = c.sealed ? INK : c.direction === "up" ? UP : DOWN; g.fillText(c.sealed ? "●" : arrow(c.direction), 22, y);
      g.fillStyle = hex(KIND[c.kind] || C.bots); g.fillText(clip(c.name || "?", 18), 56, y);
      g.fillStyle = DIM; g.textAlign = "right";
      g.fillText(c.sealed ? "sealed" : c.price ? `@${Math.round(c.price.paid * 100)}¢` : "", 490, y); g.textAlign = "left";
    });
  });
  const standingsScreen = liveScreen(C.bots, at1(-1), g => {
    const t = live.standings;
    title(g, "TOURNAMENT", t ? clip(t.title, 34) : "Loading…");
    const rows = (t?.standings || []).slice(0, 6);
    g.font = `22px ${FONT}`;
    if (t && !rows.length) { g.fillStyle = DIM; g.fillText("No bots in it yet.", 22, 120); }
    rows.forEach((r, i) => {
      const y = 112 + i * 32;
      g.fillStyle = r.rank === 1 ? hex(C.callers) : DIM; g.fillText(String(r.rank).padStart(2, " "), 22, y);
      g.fillStyle = INK; g.fillText(clip(r.entrant.name, 17), 66, y);
      g.textAlign = "right"; g.fillStyle = INK; g.fillText(`${r.correct} right`, 400, y);
      g.fillStyle = DIM; g.fillText(r.accuracy === null ? "–" : `${Math.round(r.accuracy * 100)}%`, 490, y); g.textAlign = "left";
    });
    g.fillStyle = DIM; g.font = `15px ${FONT}`; g.fillText("Not financial advice. D3MON never trades.", 22, 306);
  });
  const lastScreen = liveScreen(C.scripts, at1(1), g => {
    const p = live.prev;
    title(g, "LAST ROUND", p ? `${hhmm(p.round)}–${hhmm(p.round + Q)}` : "");
    if (!p) return;
    if (!p.result) { g.fillStyle = DIM; g.font = `24px ${FONT}`; g.fillText("Waiting for Kalshi's result…", 22, 130); return; }
    g.fillStyle = p.result === "up" ? UP : DOWN; g.font = `700 46px ${HEAD}`; g.fillText(`${arrow(p.result)} ${p.result.toUpperCase()}`, 22, 140);
    const right = p.calls.filter(c => c.correct === true).length, wrong = p.calls.filter(c => c.correct === false).length;
    g.fillStyle = INK; g.font = `24px ${FONT}`; g.fillText(`${right} right · ${wrong} wrong`, 22, 190);
    const best = p.calls.filter(c => c.paperPerContract !== undefined).sort((a, b) => b.paperPerContract - a.paperPerContract)[0];
    if (best && best.paperPerContract > 0) { g.fillStyle = DIM; g.font = `19px ${FONT}`; g.fillText(`Best on paper: ${clip(best.name, 16)} +${Math.round(best.paperPerContract * 100)}¢ per $1`, 22, 236); }
    g.fillStyle = DIM; g.font = `15px ${FONT}`; g.fillText("Settled by Kalshi. Paper results only.", 22, 306);
  });
  liveScreen(0x5865f2, at1(-2), g => {
    title(g, "D3MON DISCORD", "The Grand Hall's chat and voice");
    g.fillStyle = INK; g.font = `24px ${FONT}`; g.fillText("Talk with everyone trading", 22, 140); g.fillText("the rounds, right here.", 22, 172);
    g.fillStyle = DIM; g.font = `19px ${FONT}`; g.fillText("Coming soon, mirrored with the Discord.", 22, 236);
  });
  // The rest of the hall's circle: two spotlights on the bots and scripts (each cycles through them), a
  // special event and its stream, Kalshi's prices now (the crowd's odds), the hourly tournament and the callers.
  const spot = (g, e, label) => {
    title(g, label, e ? `${e.kind === "script" ? "Chart script" : "Bot"} · by ${clip(e.creatorName || "?", 22)}` : "");
    if (!e) { g.fillStyle = DIM; g.font = `22px ${FONT}`; g.fillText("No bots or scripts yet.", 22, 120); return; }
    g.fillStyle = hex(KIND[e.kind] || C.bots); g.font = `700 34px ${HEAD}`; g.fillText(clip(e.name, 18), 22, 122);
    const row = (live.standings?.standings || []).find(r => r.entrant.id === e.id);
    g.fillStyle = INK; g.font = `22px ${FONT}`;
    g.fillText(row ? `Today: ${row.correct} right of ${row.calls} · ${row.accuracy === null ? "–" : Math.round(row.accuracy * 100) + "%"}` : "Not in today's tournament yet", 22, 172);
    const c = (live.calls?.calls || []).find(x => x.entrantId === e.id);
    g.fillText(c ? `This round: ${c.sealed ? "sealed" : `${arrow(c.direction)} ${c.direction}`}${c.price ? ` @${Math.round(c.price.paid * 100)}¢` : ""}` : "This round: no call yet", 22, 212);
    const pc = (live.prev?.calls || []).find(x => x.entrantId === e.id);
    if (pc && pc.correct !== undefined) { g.fillStyle = pc.correct ? UP : DOWN; g.fillText(`Last round: ${pc.correct ? "right" : "wrong"}${pc.paperPerContract !== undefined ? ` (${pc.paperPerContract >= 0 ? "+" : "−"}${Math.abs(Math.round(pc.paperPerContract * 100))}¢)` : ""}`, 22, 252); }
    g.fillStyle = DIM; g.font = `15px ${FONT}`; g.fillText(`d3mon.co/card?e=${clip(e.slug || "", 30)}`, 22, 306);
  };
  const spotlit = offset => { const list = (live.entrants || []).filter(e => e.kind !== "caller"); return list.length ? list[(Math.floor(live.serverNow() / 12000) + offset) % list.length] : null; };
  const spotA = liveScreen(C.bots, at1(2), g => spot(g, spotlit(0), "BOT SPOTLIGHT"));
  const spotB = liveScreen(C.scripts, at1(4), g => spot(g, spotlit(Math.max(1, Math.floor((live.entrants || []).length / 2))), "SPOTLIGHT"));
  const eventScreen = liveScreen(0xff7a45, at1(-3), g => {
    const now = live.serverNow(), bs = (live.battles || []).filter(b => b.status !== "draft");
    const on = bs.find(b => b.startsAt <= now && now < b.startsAt + b.rounds * Q && !b.over), next = bs.filter(b => b.startsAt > now).sort((a, b) => a.startsAt - b.startsAt)[0];
    title(g, on ? "LIVE EVENT" : "SPECIAL EVENTS", on ? "Happening now in the Grand Hall" : "Battles with a host and a stream");
    g.font = `22px ${FONT}`;
    if (on) {
      g.fillStyle = INK; g.font = `700 30px ${HEAD}`; g.fillText(clip(on.title, 22), 22, 124);
      g.font = `22px ${FONT}`; g.fillText(`Round ${Math.min(on.rounds, Math.floor((now - on.startsAt) / Q) + 1)} of ${on.rounds}`, 22, 172);
      g.fillText(`${(on.entrants || []).length} in the lineup`, 22, 208);
      g.fillStyle = DIM; g.fillText("Its live stream plays here", 22, 256);
    } else if (next) {
      g.fillStyle = INK; g.fillText(`Next: ${clip(next.title, 26)}`, 22, 124);
      g.fillStyle = DIM; g.fillText(new Date(next.startsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }), 22, 162);
    } else { g.fillStyle = DIM; g.fillText("No event right now.", 22, 124); g.fillText("When one is on, its stream", 22, 172); g.fillText("plays on this screen.", 22, 204); }
  });
  const marketScreen = liveScreen(0x37e08a, at1(3), g => {
    const m = live.market;
    title(g, "KALSHI NOW", "What Up and Down cost this round");
    if (!m?.price) { g.fillStyle = DIM; g.font = `22px ${FONT}`; g.fillText("Waiting for Kalshi's prices…", 22, 130); return; }
    g.font = `700 54px ${HEAD}`;
    g.fillStyle = UP; g.fillText(`▲ ${m.price.up === null ? "–" : Math.round(m.price.up * 100) + "¢"}`, 22, 150);
    g.fillStyle = DOWN; g.fillText(`▼ ${m.price.down === null ? "–" : Math.round(m.price.down * 100) + "¢"}`, 270, 150);
    g.fillStyle = INK; g.font = `21px ${FONT}`;
    if (m.price.up !== null) g.fillText(`The crowd gives Up a ${Math.round(m.price.up * 100)}% chance`, 22, 212);
    g.fillStyle = DIM; g.font = `15px ${FONT}`; g.fillText("Kalshi's prices. Not financial advice.", 22, 306);
  });
  const hourlyScreen = liveScreen(C.bots, at1(-4), g => {
    const t = live.hourly, rows = (t?.standings || []).slice(0, 5);
    title(g, "THIS HOUR", t ? clip(t.title, 34) : "Hourly tournament");
    g.font = `22px ${FONT}`;
    if (t && !rows.length) { g.fillStyle = DIM; g.fillText("No bots in it yet.", 22, 120); }
    rows.forEach((r, i) => {
      const y = 112 + i * 34;
      g.fillStyle = r.rank === 1 ? hex(C.callers) : DIM; g.fillText(String(r.rank).padStart(2, " "), 22, y);
      g.fillStyle = INK; g.fillText(clip(r.entrant.name, 18), 66, y);
      g.textAlign = "right"; g.fillText(`${r.correct} right`, 490, y); g.textAlign = "left";
    });
    g.fillStyle = DIM; g.font = `15px ${FONT}`; g.fillText("Not financial advice. D3MON never trades.", 22, 306);
  });
  const callersScreen = liveScreen(C.callers, at1(-5), g => {
    title(g, "CALLERS", "The people who read the charts");
    const now = (live.calls?.calls || []).filter(c => c.kind === "caller"), last = (live.prev?.calls || []).filter(c => c.kind === "caller");
    g.fillStyle = INK; g.font = `24px ${FONT}`;
    g.fillText(`${now.length} called this round`, 22, 124);
    g.fillStyle = DIM; g.font = `19px ${FONT}`; g.fillText("Their calls stay sealed until the close", 22, 158);
    const right = last.filter(c => c.correct === true).length, wrong = last.filter(c => c.correct === false).length;
    g.fillStyle = INK; g.font = `22px ${FONT}`; g.fillText(last.length ? `Last round: ${right} right, ${wrong} wrong` : "Last round: no callers", 22, 214);
    g.fillStyle = DIM; g.font = `17px ${FONT}`; g.fillText("Callers make their calls on My bots", 22, 290);
  });

  // The second level is also the chart scripts' (the strand of the three that reads the charts): the top scripts
  // in the tournament, how to bring one, and a script's code, round the chart. It turns round like the level below.
  const L2 = { ring: ring2, y: 1.6, r: inr(1.6) * 0.64, w: 0.46 }; // eight screens, the circle complete like the hall's
  const scriptsScreen = liveScreen(C.scripts, FRONT + Math.PI / 2, g => {
    const t = live.standings, rows = (t?.standings || []).filter(r => r.entrant.kind === "script").slice(0, 5);
    title(g, "CHART SCRIPTS", t ? `Top scripts · ${clip(t.title, 24)}` : "Loading…");
    g.font = `22px ${FONT}`;
    if (t && !rows.length) { g.fillStyle = DIM; g.fillText("No chart scripts in it yet.", 22, 120); }
    rows.forEach((r, i) => {
      const y = 112 + i * 34;
      g.fillStyle = r.rank === 1 ? hex(C.callers) : DIM; g.fillText(String(r.rank).padStart(2, " "), 22, y);
      g.fillStyle = INK; g.fillText(clip(r.entrant.name, 17), 66, y);
      g.textAlign = "right"; g.fillText(`${r.correct} right`, 490, y); g.textAlign = "left";
    });
    g.fillStyle = DIM; g.font = `15px ${FONT}`; g.fillText("Not financial advice. D3MON never trades.", 22, 306);
  }, L2);
  liveScreen(C.scripts, FRONT - Math.PI / 2, g => {
    title(g, "BRING YOUR SCRIPT", "Chart scripts call Up or Down too");
    g.fillStyle = INK; g.font = `22px ${FONT}`;
    ["1. Join D3MON with your script", "2. Make its key on My bots", "3. Send its call each round"].forEach((l, i) => g.fillText(l, 22, 124 + i * 40));
    g.fillStyle = DIM; g.font = `18px ${FONT}`; g.fillText("Start at d3mon.co/apply", 22, 290);
  }, L2);
  screens.push(panel(codeTex(0), 0.46, 0.3, C.scripts, FRONT + Math.PI, L2.r, L2.y, 0.95, true, ring2));
  // Between them (owner, 2026-10-19: complete the circle): the scripts' calls this round and how they did last
  // round, another chart and the maths behind a script.
  const scriptRoundScreen = liveScreen(C.scripts, FRONT + Math.PI / 4, g => {
    const now = live.serverNow(), cur = Math.floor(now / Q) * Q;
    title(g, "SCRIPTS THIS ROUND", `${hhmm(cur)}–${hhmm(cur + Q)} · shown as they call`);
    const calls = (live.calls?.round === cur ? live.calls.calls : []).filter(c => c.kind === "script").slice(0, 6);
    g.font = `22px ${FONT}`;
    if (!calls.length) { g.fillStyle = DIM; g.fillText("No script has called yet.", 22, 120); return; }
    calls.forEach((c, i) => {
      const y = 112 + i * 34;
      g.fillStyle = c.direction === "up" ? UP : DOWN; g.fillText(arrow(c.direction), 22, y);
      g.fillStyle = INK; g.fillText(clip(c.name || "?", 18), 56, y);
      g.fillStyle = DIM; g.textAlign = "right"; g.fillText(c.price ? `@${Math.round(c.price.paid * 100)}¢` : "", 490, y); g.textAlign = "left";
    });
  }, L2);
  const scriptLastScreen = liveScreen(C.scripts, FRONT - Math.PI / 4, g => {
    const p = live.prev;
    title(g, "SCRIPTS LAST ROUND", p ? `${hhmm(p.round)}–${hhmm(p.round + Q)}` : "");
    if (!p) return;
    g.font = `22px ${FONT}`;
    if (!p.result) { g.fillStyle = DIM; g.fillText("Waiting for Kalshi's result…", 22, 120); return; }
    const calls = p.calls.filter(c => c.kind === "script").slice(0, 6);
    if (!calls.length) { g.fillStyle = DIM; g.fillText("No script called last round.", 22, 120); return; }
    calls.forEach((c, i) => {
      const y = 112 + i * 34;
      g.fillStyle = c.correct ? UP : DOWN; g.fillText(c.correct ? "✓" : "✗", 22, y);
      g.fillStyle = INK; g.fillText(clip(c.name || "?", 18), 56, y);
      g.fillStyle = DIM; g.textAlign = "right";
      g.fillText(c.paperPerContract === undefined ? "" : `${c.paperPerContract >= 0 ? "+" : "−"}${Math.round(Math.abs(c.paperPerContract) * 100)}¢`, 490, y); g.textAlign = "left";
    });
    g.fillStyle = DIM; g.font = `15px ${FONT}`; g.fillText("Paper results per $1. Not financial advice.", 22, 306);
  }, L2);
  screens.push(panel(chartTex(7, C.scripts), 0.46, 0.28, C.scripts, FRONT + (3 * Math.PI) / 4, L2.r, L2.y, 1, false, ring2));
  screens.push(panel(mathTex(1), 0.46, 0.23, C.scripts, FRONT - (3 * Math.PI) / 4, L2.r, L2.y, 0.95, true, ring2));

  // The very top level is one screen that comes up in front of you to choose where to go next (owner,
  // 2026-10-19): the start of moving through the whole site from inside the world. Click a line on the screen.
  const outsideEl = document.getElementById("outside");
  const go = where => {
    if (where === "vip") { const r = outsideEl.getBoundingClientRect(); scrollTo({ top: scrollY + r.top + r.height - innerHeight, behavior: reducedMotion ? "auto" : "smooth" }); }
    else if (where.startsWith("#")) document.querySelector(where)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    else location.href = where;
  };
  const MENU = [["▲  VIP Room", "vip"], ["Tournaments", "tournaments"], ["Every bot, script and caller", "#helix"], ["My bots", "my"], ["Join D3MON", "apply"]];
  const MENU_TOP = 78, MENU_ROW = 44;
  let menuHover = -1;
  const menuScreen = liveScreen(0xffd166, FRONT, g => {
    title(g, "WHERE TO NEXT?");
    MENU.forEach(([label], i) => {
      const top = MENU_TOP + i * MENU_ROW;
      if (i === menuHover) { g.fillStyle = "rgba(255,209,102,0.2)"; g.fillRect(12, top + 2, 488, MENU_ROW - 6); }
      g.fillStyle = i === 0 ? "#ffd166" : INK; g.font = `24px ${FONT}`; g.fillText(label, 26, top + 30);
      g.fillStyle = DIM; g.textAlign = "right"; g.fillText("→", 486, top + 30); g.textAlign = "left";
    });
  }, { ring: ring3, y: 2.3, r: inr(2.3) * 0.62, w: 0.6 });
  const liveScreens = [roundScreen, standingsScreen, lastScreen, scriptsScreen, scriptRoundScreen, scriptLastScreen, menuScreen, spotA, spotB, eventScreen, marketScreen, hourlyScreen, callersScreen];
  try { document.fonts?.ready.then(() => liveScreens.forEach(x => x.redraw())); } catch (e) {}
  const GREY = new THREE.Color(0x2a3a4c), WHITE = new THREE.Color(0xffffff), GREEN = new THREE.Color(0x37e08a), RED = new THREE.Color(0xff4d5e);
  // The hall reacts to what really happens (owner, 2026-10-19): every new call flies in as a comet in its
  // entrant's colour to its corner of the triangle, and when a round's result arrives a wave of green (up) or
  // red (down) runs out across the floor and up the beam.
  const seenCalls = new Set(), callQueue = [];
  let firstData = true, resultRound = null, resultPending = null;
  function hallData(d) {
    Object.assign(live, d);
    for (const c of live.calls?.calls || []) {
      if (seenCalls.has(c.id)) continue;
      seenCalls.add(c.id);
      if (!firstData || callQueue.length < 3) callQueue.push({ kind: c.kind, sealed: !!c.sealed }); // on arrival, the last few calls fly in too
    }
    const p = live.prev;
    if (p?.result && p.round !== resultRound) {
      if (!firstData) resultPending = p.result; // a result that was already in when the page opened isn't replayed
      resultRound = p.round;
    }
    firstData = false;
    liveScreens.forEach(x => x.redraw());
    // The ring of ticks is the round clock: the last 72 rounds (18 hours), green up and red down, the round now in white.
    const cur = Math.floor(live.serverNow() / Q) * Q, by = new Map((live.rounds || []).map(r => [r.round, r.result]));
    ticks.forEach((t, i) => {
      const round = cur - (ticks.length - 1 - i) * Q, res = round === cur ? "now" : by.get(round);
      t.material.color.copy(res === "now" ? WHITE : res === "up" ? GREEN : res === "down" ? RED : GREY);
      t.userData.on = res ? 1 : 0.35;
    });
    paintSpokes();
  }
  // The spokes are this round's calls streaming into the core: the caller, bot or script's colour at the end,
  // the line green or red by the call (white while a caller's is sealed). Unused ones go dim. For a few seconds
  // after the lock they hold the round that just closed, its sealed calls flipped to their direction.
  function paintSpokes() {
    const now = live.serverNow(), cur = Math.floor(now / Q) * Q, just = cur - Q;
    const calls = now - cur < LOCK_SHOW
      ? (live.prev?.round === just ? live.prev.calls : live.calls?.round === just ? live.calls.calls : [])
      : live.calls?.round === cur ? live.calls.calls : [];
    nodes.forEach((n, i) => {
      const c = calls[i];
      n.userData.on = c ? 1 : 0.12; spokes[i].userData.on = c ? 1 : 0.1;
      if (c) { n.material.color.set(KIND[c.kind] || C.bots); spokes[i].material.color.copy(c.sealed ? WHITE : c.direction === "up" ? GREEN : RED); }
    });
  }

  // The helix: one clean glass ramp, two turns, narrowing with the walls. It levels off near the top and runs
  // onto a full landing ring around the foot of the crystal capstone, so it finishes, not stops. The ring is
  // the helix's own blue, so the colour carries right through (owner, 2026-10-19).
  const VIP_Y = 3.0, VIP_R = 0.38, TURNS = 2, RAMP_Y0 = 0.35;
  const rampW = y => 0.05 + 0.07 * (inr(y) / 1.4);
  const rampAt = (t, side = 0) => {
    const y = RAMP_Y0 + (VIP_Y - RAMP_Y0) * (1 - (1 - t) ** 1.6), a = t * TURNS * Math.PI * 2; // level at the top
    const r = VIP_R + (inr(y) * 0.94 - VIP_R) * (1 - t) ** 0.9 + side * rampW(y); // its middle meets the landing ring
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  {
    const N = 260, pos = [], idx = [], edgeIn = [], edgeOut = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N, A = rampAt(t, -0.5), B = rampAt(t, 0.5);
      pos.push(...A.toArray(), ...B.toArray()); edgeIn.push(A); edgeOut.push(B);
      if (k) { const q = k * 2; idx.push(q - 2, q - 1, q, q - 1, q + 1, q); }
    }
    const deck = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); deck.setIndex(idx);
    tower.add(new THREE.Mesh(deck, add(new THREE.MeshBasicMaterial({ color: 0x8fc4ff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), 0.1)));
    for (const e of [edgeIn, edgeOut]) tower.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(e), glassLine(0x9fd0ff, 0.75)));
  }
  {
    const w = rampW(VIP_Y), land = new THREE.Mesh(new THREE.RingGeometry(VIP_R - w / 2, VIP_R + w / 2, 96), add(new THREE.MeshBasicMaterial({ color: 0x8fc4ff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), 0.1));
    land.rotation.x = -Math.PI / 2; land.position.y = VIP_Y; tower.add(land);
    for (const r of [VIP_R - w / 2, VIP_R + w / 2]) { const e = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 128), add(edgeMat(0x9fd0ff, 1), 0.75)); e.rotation.x = Math.PI / 2; e.position.y = VIP_Y; tower.add(e); }
  }
  // Lights walking up the helix: the people rising toward the VIP Room.
  const walkN = full ? 40 : phone ? 12 : 24, walkPos = new Float32Array(walkN * 3), walkT = Array.from({ length: walkN }, () => Math.random());
  const walkers = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(walkPos, 3)),
    add(new THREE.PointsMaterial({ color: 0xe8f0ff, size: 0.05, map: radial(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.9));
  tower.add(walkers);
  // The hexagon pods that stood on the ramp were taken out (owner, 2026-10-19: cleaner); stops for moving
  // through the site can go here once those places are rooms in the world.
  // The VIP Room is the crystal capstone: the whole tip of the pyramid above the landing, built from the
  // pyramid's own corners so it's perfectly straight, glowing brighter toward the top, with the featured
  // callers as three gold lights inside. No screens up here: it stays clean (owner, 2026-10-18).
  const GOLD = 0xffd166;
  const vip = new THREE.Group();
  vip.position.y = VIP_Y;
  tower.add(vip);
  const slice = y => keys.map(k => CORNERS[k].clone().multiplyScalar(1 - y / H).setY(y)); // the walls' triangle at height y
  const capstone = new THREE.Group(); // in world space, stretched with the rise like the walls
  scene.add(capstone);
  {
    const T = slice(VIP_Y), top = apex.clone(), pos = [], col = [], low = new THREE.Color(0x3d6a9a), high = new THREE.Color(0xf2f8ff);
    for (let i = 0; i < 3; i++) { const A = T[i], B = T[(i + 1) % 3]; pos.push(...A.toArray(), ...B.toArray(), ...top.toArray()); col.push(low.r, low.g, low.b, low.r, low.g, low.b, high.r, high.g, high.b); }
    pos.push(...T[0].toArray(), ...T[1].toArray(), ...T[2].toArray()); col.push(...Array(3).fill([0.35, 0.3, 0.12]).flat()); // its gold base, the room's floor
    const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)).setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    capstone.add(new THREE.Mesh(geo, add(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }), 0.28)));
    const lines = [];
    for (let i = 0; i < 3; i++) {
      const A = T[i], B = T[(i + 1) % 3], M = A.clone().lerp(B, 0.5);
      lines.push(...A.toArray(), ...B.toArray(), ...A.toArray(), ...top.toArray()); // its base and edges
      lines.push(...M.toArray(), ...top.toArray()); // a facet line up the middle of each face
    }
    capstone.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(lines, 3)), glassLine(0xffffff, 0.9)));
    const heart = new THREE.Sprite(add(new THREE.SpriteMaterial({ map: radial(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.55));
    heart.position.set(0, VIP_Y + (H - VIP_Y) * 0.4, 0); heart.scale.setScalar(0.5);
    capstone.add(heart);
  }
  const featured = [0, 1, 2].map(i => {
    const f = new THREE.Sprite(add(new THREE.SpriteMaterial({ map: radial(), color: GOLD, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.95));
    const a = (i / 3) * Math.PI * 2 + 0.5; f.position.set(Math.cos(a) * 0.22, 0.07, Math.sin(a) * 0.22); f.scale.setScalar(0.12);
    vip.add(f); return f;
  });
  const vipGlow = new THREE.Sprite(add(new THREE.SpriteMaterial({ map: radial(), color: GOLD, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.22));
  vipGlow.position.y = 0.1; vipGlow.scale.setScalar(0.75);
  vip.add(vipGlow);
  // The people online: little lights in the stands around the floor (later from the live count).
  {
    const n = full ? 700 : phone ? 160 : 380, pp = new Float32Array(n * 3), pc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, tier = Math.floor(Math.random() * 3), r = 1.22 + tier * 0.09 + Math.random() * 0.05;
      pp.set([Math.cos(a) * r, 0.16 + tier * 0.07, Math.sin(a) * r], i * 3);
      const c = new THREE.Color(Math.random() < 0.6 ? 0xdce7ee : palette[Math.floor(Math.random() * 3)]); pc.set([c.r, c.g, c.b], i * 3);
    }
    tower.add(new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pp, 3)).setAttribute("color", new THREE.BufferAttribute(pc, 3)),
      add(new THREE.PointsMaterial({ size: 0.035, vertexColors: true, map: radial(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0.9)));
  }
  // A violet beam beside the golden one, as in the video.
  const beam2 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8, 1, true), add(edgeMat(C.scripts, 0.9), 0.9));
  scene.add(beam2);

  // ---------- the three corner landmarks: Callers spire, Bots crystal, Scripts dome ----------
  const marks = new THREE.Group();
  scene.add(marks);
  const out = k => CORNERS[k].clone().multiplyScalar(1.28);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.3, 6), new THREE.MeshBasicMaterial({ color: C.callers, wireframe: true }));
  spire.position.copy(out("callers")).setY(0.65);
  const rings = [0.35, 0.55].map((r, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 48), edgeMat(C.callers, 0.7)); m.rotation.x = Math.PI / 2; m.position.copy(out("callers")).setY(0.3 + i * 0.5); return m; });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: C.bots, wireframe: true }));
  crystal.position.copy(out("bots")).setY(0.7);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.scripts, wireframe: true }));
  dome.position.copy(out("scripts"));
  marks.add(spire, ...rings, crystal, dome);
  for (const k of keys) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: C[k], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(2.4); s.position.copy(out(k)).setY(0.4);
    marks.add(s);
  }

  // ---------- particles flowing along the edges, and lifting during the rise ----------
  const flowN = full ? 220 : phone ? 50 : 110; // fewer and softer (owner, 2026-10-19: subtle)
  const flowPos = new Float32Array(flowN * 3), flowCol = new Float32Array(flowN * 3), flowT = new Float32Array(flowN), flowE = new Uint8Array(flowN);
  for (let i = 0; i < flowN; i++) {
    flowE[i] = i % edges.length; flowT[i] = Math.random();
    const c = new THREE.Color(edges[flowE[i]].color);
    flowCol.set([c.r, c.g, c.b], i * 3);
  }
  const flowGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(flowPos, 3)).setAttribute("color", new THREE.BufferAttribute(flowCol, 3));
  const flow = new THREE.Points(flowGeo, new THREE.PointsMaterial({ size: full ? 0.07 : 0.09, vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, map: radial(), alphaTest: 0.01 }));
  scene.add(flow);

  // ---------- moving light: random beams rising in the dark, and comets flying around ----------
  // (owner, 2026-10-18: "random light beams and some random sized dots with trails flying around like comets")
  const pick = () => palette[Math.floor(Math.random() * palette.length)];
  const beams = [];
  for (let i = 0; i < (full ? 7 : phone ? 3 : 5); i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30, 10, 1, true), movingLight(pick(), 0.6));
    m.userData = { born: 0, life: 0 };
    scene.add(m); beams.push(m);
  }
  function respawnBeam(m, time) {
    let a, d; // never right in front of the camera, where a beam would fill the screen
    do { a = Math.random() * Math.PI * 2; d = 7 + Math.random() * 8; } while (Math.hypot(Math.cos(a) * d, Math.sin(a) * d - 10) < 5);
    const w = 0.012 + Math.random() * 0.05;
    m.position.set(Math.cos(a) * d, 15, Math.sin(a) * d);
    m.scale.set(w, 1, w);
    m.material.uniforms.uColor.value.set(pick());
    m.material.uniforms.uSpeed.value = 0.25 + Math.random() * 0.5;
    Object.assign(m.userData, { born: time, life: 4 + Math.random() * 6 });
  }
  const cometN = full ? 10 : phone ? 4 : 8, TRAIL = full ? 48 : phone ? 24 : 36;
  const comets = [];
  const cPos = new Float32Array(cometN * TRAIL * 3), cCol = new Float32Array(cometN * TRAIL * 3), cSize = new Float32Array(cometN * TRAIL);
  const cGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(cPos, 3)).setAttribute("color", new THREE.BufferAttribute(cCol, 3)).setAttribute("size", new THREE.BufferAttribute(cSize, 1));
  const cometPoints = new THREE.Points(cGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { uScale: { value: 300 } },
    vertexShader: `attribute float size; varying vec3 vColor; uniform float uScale;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vColor = color * smoothstep(0.25, 1.4, -mv.z); gl_PointSize = min(size * uScale / -mv.z, 30.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vColor * (a * a + a * 0.3), 1.0); }`,
  }));
  cometPoints.frustumCulled = false;
  scene.add(cometPoints);
  for (let i = 0; i < cometN; i++) comets.push({ born: 0 });
  // Each comet flies in from far out to one of the triangle's three corners, runs along the floor from that
  // corner to the centre, climbs the golden beam through the capstone and shoots out along the laser into
  // the sky, where it sends a pulse that lights up the dark (owner, 2026-10-18). It takes its corner's colour.
  const BASE_Y = 0.15; // the floor line from each corner to the centre, where the core sits
  function respawnComet(c, time, call = null) {
    if (!call && Math.random() < 0.4) { // some just circle the pyramid on a slow, tilted orbit and fade away
      const tilt = (Math.random() - 0.5) * 0.9, spin = Math.random() * Math.PI * 2;
      const u = new THREE.Vector3(Math.cos(spin), 0, Math.sin(spin)), v = new THREE.Vector3(-Math.sin(spin), 0, Math.cos(spin)).applyAxisAngle(u, tilt);
      Object.assign(c, { orbit: true, live: false, born: time, life: 5 + Math.random() * 5, u, v, r: 4.5 + Math.random() * 5, y: 1 + Math.random() * 4, a0: Math.random() * Math.PI * 2,
        speed: (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.25), start: true, fired: true, size: 0.04 + Math.random() ** 2 * 0.16, color: new THREE.Color(pick()).multiplyScalar(0.6) });
      c.born += 2 + Math.random() * 6; // a rest before it shows, so only a few are out at once
      return;
    }
    c.orbit = false;
    // It circles the pyramid on a spiral, round and in, and lands on its corner (the circling the owner liked).
    const k = call ? Math.max(0, keys.indexOf(call.kind === "caller" ? "callers" : call.kind === "script" ? "scripts" : "bots")) : Math.floor(Math.random() * 3);
    const corner = CORNERS[keys[k]].clone().setY(0.08);
    const aK = Math.atan2(corner.z, corner.x), dir = Math.random() < 0.5 ? -1 : 1, turns = 0.6 + Math.random() * 1.2;
    const start = { a: aK - dir * turns * Math.PI * 2, r: 5 + Math.random() * 7, y: 0.8 + Math.random() * 4.5 };
    Object.assign(c, {
      born: time, tIn: call ? 2.4 + Math.random() : 3.5 + Math.random() * 3.5, aK, tBase: 0.9 + Math.random() * 0.6, vUp: 2.2 + Math.random() * 1.8, fired: false,
      start, corner, size: call ? 0.34 : 0.05 + Math.random() ** 2 * 0.2, live: !!call, // a real call: bigger, brighter and quicker
      color: new THREE.Color(call ? (call.sealed ? 0xffffff : C[keys[k]]) : Math.random() < 0.25 ? 0xffffff : C[keys[k]]).multiplyScalar(call ? 1 : 0.6),
    });
    if (!call) c.born += 2 + Math.random() * 6; // the ambient ones rest between flights, so the sky stays calm
  }
  const SKY = 40; // how far the laser reaches into the sky
  const centre = new THREE.Vector3(0, BASE_Y, 0);
  function cometAt(c, t, apexY, out) { // where comet c is t seconds after it was born
    if (c.orbit) { const a = c.a0 + t * c.speed; return out.copy(c.u).multiplyScalar(Math.cos(a) * c.r).addScaledVector(c.v, Math.sin(a) * c.r).setY(out.y + c.y); }
    if (t < c.tIn) { // round and in, faster as it gets close, ending on the corner
      const u = t / c.tIn, e = 1 - (1 - u) ** 1.6, a = c.start.a + (c.aK - c.start.a) * e, r = c.start.r + (R - c.start.r) * smooth(u);
      return out.set(Math.cos(a) * r, c.start.y + (c.corner.y - c.start.y) * smooth(u), Math.sin(a) * r);
    }
    const tb = t - c.tIn;
    if (tb < c.tBase) return out.copy(c.corner).lerp(centre, smooth(tb / c.tBase)).setY(0.08 + (BASE_Y - 0.08) * (tb / c.tBase)); // along the floor to the centre
    const t2 = tb - c.tBase, climb = Math.max(0.1, apexY - BASE_Y), tUp = Math.sqrt((2 * climb) / c.vUp); // speeding up the beam
    if (t2 < tUp) { const w = 0.05 * (1 - t2 / tUp); return out.set(Math.cos(t2 * 9) * w, BASE_Y + 0.5 * c.vUp * t2 * t2, Math.sin(t2 * 9) * w); }
    const t3 = t2 - tUp; // out of the capstone and up the laser
    return out.set(0, apexY + c.vUp * tUp * t3 + 10 * t3 * t3, 0);
  }
  const lifeOf = (c, apexY) => c.orbit ? c.life : c.tIn + c.tBase + Math.sqrt((2 * Math.max(0.1, apexY - BASE_Y)) / c.vUp) + 1.6;
  const cTmp = new THREE.Vector3();
  const pulses = new Array(8).fill(-100); let nextPulse = 0; // when each recent pulse left the capstone
  function moveLights(time, apexY) {
    // A new call takes over the comet furthest from doing anything of its own (an orbiting one, or the oldest).
    while (callQueue.length && !reducedMotion) {
      const free = comets.filter(c => !c.live).sort((a, b) => (b.orbit - a.orbit) || (a.born - b.born))[0] || comets[0];
      respawnComet(free, time, callQueue.shift());
    }
    for (const m of beams) {
      const d = m.userData, age = time - d.born;
      if (age > d.life) { const first = !d.life; respawnBeam(m, time); if (first) d.born -= Math.random() * d.life; continue; } // the first ones start part-way, so they don't all appear at once
      const fade = smooth(clamp01(age / 1.2)) * smooth(clamp01((d.life - age) / 1.2));
      m.material.uniforms.uOn.value = d.life ? fade : 0;
      m.material.uniforms.uTime.value = time;
    }
    comets.forEach((c, i) => {
      if (!c.start || time - c.born > lifeOf(c, apexY)) { const first = !c.start; respawnComet(c, time); if (first) c.born -= Math.random() * (c.orbit ? c.life : c.tIn); }
      const t = time - c.born, life = lifeOf(c, apexY);
      if (!c.fired && !c.orbit && t > life - 1.6) { c.fired = true; pulses[nextPulse] = time; nextPulse = (nextPulse + 1) % pulses.length; }
      const fade = smooth(clamp01(t / 0.8)) * smooth(clamp01((life - t) / 0.8));
      for (let j = 0; j < TRAIL; j++) {
        const k = i * TRAIL + j;
        cometAt(c, Math.max(0, t - j * 0.03), apexY, cTmp);
        cPos.set([cTmp.x, cTmp.y, cTmp.z], k * 3);
        const f = 1 - j / TRAIL, glow = (t - j * 0.03 < 0 ? 0 : 1) * fade * f * f * (j === 0 ? 1.6 : 1);
        cCol.set([c.color.r * glow, c.color.g * glow, c.color.b * glow], k * 3);
        cSize[k] = c.size * (j === 0 ? 1 : 0.25 + 0.6 * f);
      }
    });
    cGeo.attributes.position.needsUpdate = cGeo.attributes.color.needsUpdate = cGeo.attributes.size.needsUpdate = true;
    // The laser out of the capstone carries the pulses up; the sky brightens as each one goes high.
    for (const m of [laser, laserGlow]) { m.position.set(0, apexY + SKY / 2, 0); m.material.uniforms.uTime.value = time; m.material.uniforms.uPulse.value = pulses; }
    let sky = 0;
    for (const t0 of pulses) { const a = time - t0; if (a > 0) sky += Math.exp(-((a - 1.3) ** 2) / 0.18) * 0.45; } // a short flash as each pulse reaches high
    sky = Math.min(1, sky);
    skyGlow.position.set(0, apexY + 16, 0);
    skyGlow.material.opacity = 0.03 + 0.35 * sky;
    bgNow.copy(bg0).lerp(bgLit, sky * 0.35);
    renderer.setClearColor(bgNow, 1); scene.fog.color.copy(bgNow);
  }
  const laserMat = (r, o) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, SKY, 10, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPulse: { value: pulses } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; uniform float uPulse[8]; varying vec2 vUv;
      void main(){
        float y = vUv.y, p = 0.0;
        for (int i = 0; i < 8; i++) { float f = (uTime - uPulse[i]) * 0.55; if (f > 0.0 && f < 1.2) p += exp(-pow((y - f) * 14.0, 2.0)) * (1.2 - f); }
        float a = ${o.toFixed(3)} * (0.35 + 1.6 * p) * smoothstep(1.0, 0.2, y);
        gl_FragColor = vec4(mix(vec3(1.0, 0.82, 0.5), vec3(1.0), clamp(p, 0.0, 1.0)), a);
      }`,
  }));
  const laser = laserMat(0.03, 1), laserGlow = laserMat(0.16, 0.22);
  scene.add(laser, laserGlow);
  const skyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: 0x6fa8ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  skyGlow.scale.set(70, 40, 1);
  scene.add(skyGlow);
  const bg0 = new THREE.Color(C.bg), bgLit = new THREE.Color(0x0c1a2c), bgNow = new THREE.Color();
  if (reducedMotion) cometPoints.visible = false; // still beams only, no flying lights

  // ---------- the way in: through the front glass, down to the core ----------
  const front = { a: CORNERS.bots, b: CORNERS.scripts };
  const faceNormal = new THREE.Vector3().subVectors(front.b, front.a).cross(new THREE.Vector3().subVectors(apex, front.a)).setY(0).normalize();
  // The levels the camera holds at (see the camera path), each with its ring of screens.
  const LEVELS = [{ from: 0.7, to: 0.77, ring: ring1 }, { from: 0.81, to: 0.86, ring: ring2 }, { from: 0.89, to: 0.93, ring: ring3, menu: true }];
  // ◀ ▶ while stopped at a level: turn its ring of screens one screen at a time (keys and swipes too).
  const nav = document.createElement("div");
  nav.className = "w3d-nav"; nav.hidden = true;
  nav.innerHTML = '<button type="button" data-d="-1" aria-label="Previous screen">◀</button><span>Look around</span><button type="button" data-d="1" aria-label="Next screen">▶</button>';
  document.body.append(nav);
  const stepsOf = ring => {
    const angles = ring.children.map(g => Math.atan2(g.position.z, g.position.x)), front = Math.PI / 2;
    return angles.map(a => a - front).sort((x, y) => y - x); // left to right, as the turn that brings each to the front
  };
  for (const L of LEVELS) { L.turn = 0; L.steps = stepsOf(L.ring); L.wrap = true; L.step = (2 * Math.PI) / L.steps.length; L.base = ((L.steps[0] % L.step) + L.step) % L.step; } // even rings: round and round
  let atLevel = null;
  function turn(dir) {
    const L = atLevel;
    if (!L || L.menu) return;
    if (L.wrap) { // ▶ brings the screen on the right round to the front, ◀ the one on the left
      const k = (L.turn - L.base) / L.step;
      L.turn = L.base + L.step * (dir > 0 ? Math.ceil(k - 1e-6) - 1 : Math.floor(k + 1e-6) + 1);
      return;
    }
    const i = L.steps.findIndex(a => Math.abs(a - L.turn) < 1e-3);
    const next = i < 0 ? (dir > 0 ? L.steps.findIndex(a => a < L.turn) : L.steps.findLastIndex(a => a > L.turn)) : i + dir;
    if (next >= 0 && next < L.steps.length) L.turn = L.steps[next];
  }
  nav.addEventListener("click", e => { const b = e.target.closest("button"); if (b) turn(+b.dataset.d); });
  const onKey = e => { if (atLevel && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); turn(e.key === "ArrowLeft" ? -1 : 1); } };
  addEventListener("keydown", onKey);
  let touchX = null, touchY = null;
  const onTouchStart = e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; };
  const onTouchEnd = e => {
    if (touchX === null || !atLevel) return;
    const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
    touchX = null;
  };
  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchend", onTouchEnd, { passive: true });
  // Drag with the mouse to turn the ring by hand; let go and it settles on the nearest screen.
  let drag = null;
  const snap = L => {
    if (L.wrap) { L.turn = L.base + L.step * Math.round((L.turn - L.base) / L.step); return; }
    L.turn = L.steps.reduce((a, b) => (Math.abs(b - L.turn) < Math.abs(a - L.turn) ? b : a));
  };
  const onDown = e => {
    if (!atLevel || atLevel.menu || e.button !== 0 || e.pointerType === "touch" || e.target.closest("a, button, input, select, textarea, label, .w-panel")) return;
    drag = { L: atLevel, x: e.clientX, turn: atLevel.turn, moved: false };
  };
  const onMove = e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true; document.body.classList.add("w3d-dragging");
    const L = drag.L, lo = Math.min(...L.steps) - 0.15, hi = Math.max(...L.steps) + 0.15;
    L.turn = drag.turn + (dx / innerWidth) * Math.PI * 1.2; // dragging right brings the screens on the left round
    if (!L.wrap) L.turn = Math.min(hi, Math.max(lo, L.turn));
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.moved) snap(drag.L);
    drag = null; document.body.classList.remove("w3d-dragging");
  };
  // Pointing at the menu screen: a ray from the camera through the pointer finds the line under it.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const menuAt = e => {
    if (!atLevel?.menu) return -1;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(menuScreen.mesh)[0];
    if (!hit?.uv) return -1;
    const i = Math.floor(((1 - hit.uv.y) * 320 - MENU_TOP) / MENU_ROW);
    return i >= 0 && i < MENU.length ? i : -1;
  };
  const setHover = i => { if (i !== menuHover) { menuHover = i; menuScreen.redraw(); } document.body.classList.toggle("w3d-pick", i >= 0); };
  const onMenuMove = e => { if (atLevel?.menu) setHover(menuAt(e)); else if (menuHover >= 0) setHover(-1); };
  const onMenuClick = e => { if (e.target.closest("a, button, input, .w-panel")) return; const i = menuAt(e); if (i >= 0) go(MENU[i][1]); };
  const onMenuKey = e => {
    if (!atLevel?.menu) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setHover((Math.max(0, menuHover) + (e.key === "ArrowDown" ? 1 : MENU.length - 1)) % MENU.length); }
    else if (e.key === "Enter" && menuHover >= 0) go(MENU[menuHover][1]);
  };
  addEventListener("pointermove", onMenuMove);
  addEventListener("click", onMenuClick);
  addEventListener("keydown", onMenuKey);
  addEventListener("pointerdown", onDown);
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);

  const flash = document.createElement("div");
  flash.className = "w3d-flash";
  document.body.append(flash);

  const side = new THREE.Vector3().crossVectors(faceNormal, new THREE.Vector3(0, 1, 0)); // across the front, so the beam sits to one side
  // ---------- the camera path ----------
  const hold = (from, to, pos, look) => [from, to].map(at => ({ at, pos: pos.clone(), look: look.clone(), up: new THREE.Vector3(0, 1, 0) }));
  const shots = [
    { at: 0, pos: new THREE.Vector3(0, 15.5, 0.001), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 0, -1) },
    { at: 0.3, pos: new THREE.Vector3(0, 10.5, 9.5), look: new THREE.Vector3(0, 1.4, 0), up: new THREE.Vector3(0, 1, 0) },
    { at: 0.56, pos: new THREE.Vector3(0, 2.0, 10.5), look: new THREE.Vector3(0, 1.8, 0), up: new THREE.Vector3(0, 1, 0) },
    // the camera holds at each level of screens, so a visitor can stop and look around them (◀ ▶)
    ...hold(0.7, 0.77, new THREE.Vector3(0, 0.95, 0).addScaledVector(faceNormal, 2.0), new THREE.Vector3(0, 0.85, 0)), // the hall's live screens
    ...hold(0.81, 0.86, new THREE.Vector3(0, 1.68, 0).addScaledVector(faceNormal, 1.55), new THREE.Vector3(0, 1.6, 0)), // the level above
    ...hold(0.89, 0.93, new THREE.Vector3(0, 2.35, 0).addScaledVector(faceNormal, 1.35), new THREE.Vector3(0, 2.25, 0)), // the chart scripts' level
    // at the top of the helix, into the centre beam and up it like a lift, under the crystal...
    { at: 0.965, pos: new THREE.Vector3(0, VIP_Y - 0.5, 0).addScaledVector(faceNormal, 0.16), look: new THREE.Vector3(0, VIP_Y + 0.4, 0).addScaledVector(faceNormal, -0.4), up: new THREE.Vector3(0, 1, 0) },
    // ...then out through the glass to the end: the crystal capstone, the VIP Room, whole and glowing
    { at: 1, pos: new THREE.Vector3(0, VIP_Y + 0.35, 0).addScaledVector(faceNormal, 2.7).addScaledVector(side, 0.6), look: new THREE.Vector3(0, VIP_Y + 0.6, 0), up: new THREE.Vector3(0, 1, 0) },
  ];
  function shotAt(p) {
    let i = 0;
    while (i < shots.length - 2 && p > shots[i + 1].at) i++;
    const s0 = shots[i], s1 = shots[i + 1], t = smooth(clamp01((p - s0.at) / (s1.at - s0.at)));
    return { pos: s0.pos.clone().lerp(s1.pos, t), look: s0.look.clone().lerp(s1.look, t), up: s0.up.clone().lerp(s1.up, t).normalize() };
  }

  // ---------- scroll ----------
  const outside = document.getElementById("outside");
  let target = 0, shown = 0;
  function readScroll() {
    const r = outside.getBoundingClientRect(), span = Math.max(1, r.height - innerHeight);
    target = clamp01(-r.top / span);
    if (reducedMotion) target = [0, 0.56, 0.735, 0.835, 0.91, 1].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)); // cut between shots, no flying
    document.body.style.setProperty("--w3d-p", String(clamp01(-r.top / span)));
    const past = r.bottom < innerHeight * 0.6;
    document.body.classList.toggle("w3d-past", past);
  }
  addEventListener("scroll", readScroll, { passive: true });
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 60 : 45; // portrait screens see the same pyramid
    camera.updateProjectionMatrix();
    cometPoints.material.uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360)) * renderer.getPixelRatio();
  }
  addEventListener("resize", resize);
  resize(); readScroll(); shown = target;

  // ---------- frames ----------
  let fpsEl = null;
  if (showFps) { fpsEl = document.createElement("div"); fpsEl.className = "w3d-fps"; document.body.append(fpsEl); }
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), clock = new THREE.Clock();
  let raf = 0, last = performance.now(), frames = [], judged = false, started = performance.now(), fpsAcc = 0, fpsN = 0, fpsAt = last;
  let clockAt = 0, clockRound = 0, spotAt = 0, resultFx = null;
  const minFrame = full ? 0 : 1000 / 40; // Lite caps at about 40 frames a second
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const past = document.body.classList.contains("w3d-past");
    if (now - last < (past ? 1000 / 15 : minFrame)) return; // behind the other places it only needs a slow idle
    const dt = Math.min(0.1, (now - last) / 1000);
    frames.push(now - last); last = now;
    const time = clock.getElapsedTime();
    shown += (target - shown) * (reducedMotion ? 1 : Math.min(1, dt * 3.2));
    const p = shown;

    // The rise: from the flat logo triangle into the pyramid.
    const rise = 0.04 + 0.96 * smooth(clamp01(p / 0.33));
    for (const m of edgeMeshes) {
      const { a, b } = m.userData, A = a.clone(), B = b.clone();
      A.y *= rise; B.y *= rise;
      m.position.copy(A).lerp(B, 0.5);
      m.scale.set(1, A.distanceTo(B) / a.distanceTo(b), 1);
      m.quaternion.setFromUnitVectors(up, tmp.subVectors(B, A).normalize());
    }
    faces.scale.set(1, rise, 1); // edges are placed one by one, so they stay round while the faces stretch
    capGlow.position.set(0, H * rise, 0); capGlow.material.opacity = 0.35 + 0.25 * Math.sin(time * 1.6) ** 2;
    // The floor inside comes up with the walls; the beam rises to the capstone.
    const inside = smooth(clamp01((p - 0.12) / 0.25));
    hall.scale.set(1, Math.max(0.001, rise), 1);
    hall.visible = inside > 0.01;
    tower.visible = inside > 0.01;
    tower.scale.set(1, Math.max(0.001, rise), 1);
    capstone.scale.set(1, Math.max(0.001, rise), 1); capstone.visible = inside > 0.01;
    for (const [m, o] of fades) m.opacity = o * inside;
    const bob = reducedMotion ? 0 : 1;
    screens.forEach((g, i) => { g.position.y = g.userData.y + Math.sin(time * 0.6 + i) * 0.02 * bob; });
    for (let i = 0; i < walkN; i++) { walkT[i] = (walkT[i] + dt * 0.035 * bob) % 1; walkPos.set(rampAt(walkT[i]).toArray().map((v, k) => (k === 1 ? v + 0.03 : v)), i * 3); }
    walkers.geometry.attributes.position.needsUpdate = true;
    featured.forEach((f, i) => { f.material.opacity = inside * (0.7 + 0.3 * Math.sin(time * 1.8 + i * 2.1)); });
    core.material.opacity = inside * (0.8 + 0.2 * Math.sin(time * 3));
    ticks.forEach((t, i) => { t.material.opacity = inside * (t.userData.on ?? 1) * (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(time * 1.4 - i * 0.35))); });
    spokes.forEach((l, i) => { l.material.opacity = inside * (l.userData.on ?? 1) * (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 2 + i * 1.3))); });
    nodes.forEach((n, i) => { n.material.opacity = inside * (n.userData.on ?? 1) * (0.6 + 0.4 * Math.sin(time * 2 + i * 1.3)); });
    if (inside > 0.01 && time - clockAt >= 1) { clockAt = time; roundScreen.redraw(); paintSpokes(); if (Math.floor(live.serverNow() / Q) !== clockRound) { clockRound = Math.floor(live.serverNow() / Q); scriptRoundScreen.redraw(); } if (Math.floor(live.serverNow() / 12000) !== spotAt) { spotAt = Math.floor(live.serverNow() / 12000); spotA.redraw(); spotB.redraw(); eventScreen.redraw(); } } // the round clock ticks
    const top = H * rise - 0.2, beamLen = Math.max(0.001, (top - 0.15) * inside);
    for (const m of [beam, beamGlow, beam2]) { m.scale.set(1, beamLen, 1); m.position.set(m === beam2 ? 0.05 : 0, 0.15 + beamLen / 2, m === beam2 ? 0.03 : 0); }
    beam.material.opacity = 0.95 * inside; beamGlow.material.opacity = 0.18 * inside;
    if (resultPending) { resultFx = { start: time, color: new THREE.Color(resultPending === "up" ? 0x37e08a : 0xff4d5e), fired: false }; resultPending = null; }
    if (resultFx) {
      const t = time - resultFx.start, IN = 1.3, UP = 1.4, OUT = 1.2; // in to the core, up the beam, out into the sky
      wave.material.color.copy(resultFx.color); orb.material.color.copy(resultFx.color);
      if (t < IN) { const u = smooth(t / IN); wave.scale.setScalar(1.45 * (1 - u) + 0.05); wave.material.opacity = inside * (0.4 + 0.5 * u); }
      else wave.material.opacity = 0;
      const apexY = H * rise;
      if (t >= IN && t < IN + UP + OUT) {
        const u = t - IN, y = u < UP ? 0.15 + (apexY - 0.15) * smooth(u / UP) : apexY + 14 * ((u - UP) / OUT) ** 1.5;
        orb.position.set(0, y, 0); orb.material.opacity = inside * (u < UP ? 1 : 1 - (u - UP) / OUT);
        if (u >= UP && !resultFx.fired) { resultFx.fired = true; pulses[nextPulse] = time; nextPulse = (nextPulse + 1) % pulses.length; } // and the laser carries it on up
      } else orb.material.opacity = 0;
      if (t >= IN + UP + OUT) { resultFx = null; wave.material.opacity = 0; orb.material.opacity = 0; }
    }
    { // the emblem: CSS rotate() is clockwise and its rotateX tips the top away, so both are negative here
      const t = reducedMotion ? 0 : time, k = (1 - Math.cos(spin(t, 2.4))) / 2;
      sg.g1.rotation.x = -spin(t, 14); sg.g2.rotation.y = spin(t, 11); sg.g3.rotation.x = spin(t, 8);
      sg.s3.rotation.z = -spin(t, 30); sg.s1.rotation.z = spin(t, 16); sg.s2.rotation.z = -spin(t, 10);
      sg.s4.rotation.z = spin(t, 22); sg.tri.rotation.z = -spin(t, 40);
      sg.pl.scale.setScalar(1 + 0.35 * k);
    }
    marks.children.forEach((m, i) => { if (m.isMesh) m.rotation.y = time * (0.15 + i * 0.03); });

    // Particles flow from the corners to the apex and along the base; during the rise they lift too.
    const lift = (1 - rise) * 2.5;
    for (let i = 0; i < flowN; i++) {
      flowT[i] = (flowT[i] + dt * (reducedMotion ? 0.02 : 0.09)) % 1;
      const e = edges[flowE[i]];
      tmp.copy(e.a).lerp(e.b, flowT[i]);
      tmp.y = tmp.y * rise + lift * Math.sin(flowT[i] * Math.PI);
      flowPos.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    flowGeo.attributes.position.needsUpdate = true;

    // A short burst of light as we pass through, gone again once we're in.
    const through = clamp01((p - 0.93) / 0.04), burst = through < 0.7 ? smooth(through / 0.7) : 1 - smooth((through - 0.7) / 0.3);
    flash.style.opacity = String(past ? 0 : burst * 0.85);

    moveLights(time, H * rise);
    atLevel = past ? null : LEVELS.find(L => p >= L.from - 0.005 && p <= L.to + 0.005) || null;
    nav.hidden = !atLevel || !!atLevel.menu; document.body.classList.toggle("w3d-at-level", !!atLevel && !atLevel.menu);
    for (const L of LEVELS) L.ring.rotation.y += (L.turn - L.ring.rotation.y) * (reducedMotion ? 1 : Math.min(1, dt * (drag ? 14 : 4)));
    formFloor(time);
    const s = shotAt(p);
    camera.position.copy(s.pos);
    camera.up.copy(s.up);
    camera.lookAt(s.look);
    // Up close inside, the core's glow and the beams' haze would fill the screen: dim them as the camera nears.
    const near = clamp01((Math.hypot(camera.position.x, camera.position.z) - 0.35) / 1.6);
    core.material.opacity *= 0.25 + 0.75 * near; beamGlow.material.opacity *= near;
    for (const m of [beam, beam2]) { const w = 0.2 + 0.8 * near; m.scale.x = m.scale.z = w; }
    sigil.scale.setScalar(1.12 - 0.22 * smooth(clamp01(p / 0.33))); // the main page's size, then just inside the ring of ticks
    { // the lock moment: dim in the last seconds, back up over a second and a half after; the emblem flashes at the close
      const since = live.serverNow() % Q, toLock = Q - since;
      const dim = reducedMotion ? 0 : Math.max(toLock < LOCK_DIM ? smooth(1 - toLock / LOCK_DIM) : 0, since < 1500 ? 1 - since / 1500 : 0);
      const flash = reducedMotion || since > 1800 ? 0 : (1 - since / 1800) ** 2, k = 1 - 0.5 * dim;
      core.material.opacity *= k * (1 + 1.5 * flash); glow.material.opacity = 0.32 * k;
      for (const m of [...ticks, ...nodes]) m.material.opacity *= k;
      for (const l of spokes) l.material.opacity *= k;
      sg.halo.scale.setScalar(1 + 0.8 * flash);
    }
    sg.pl.material.opacity = 1 - 0.45 * ((1 - Math.cos(spin(reducedMotion ? 0 : time, 2.4))) / 2);
    renderer.render(scene, camera);

    if (fpsEl) { fpsAcc += dt; fpsN++; if (now - fpsAt > 500) { fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps · ${level}`; fpsAcc = 0; fpsN = 0; fpsAt = now; } }
    // Judge smoothness once, over the first few seconds: too slow and Auto steps down to 2D.
    if (!judged && now - started > 3500 && frames.length > 20) {
      judged = true;
      const sorted = frames.slice(5).sort((x, y) => x - y), median = sorted[Math.floor(sorted.length / 2)];
      if (median > 1000 / 22) onSlow(Math.round(1000 / median));
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    hall: hallData,
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", readScroll);
      removeEventListener("resize", resize);
      renderer.dispose();
      scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose(); }); });
      removeEventListener("keydown", onKey); removeEventListener("touchstart", onTouchStart); removeEventListener("touchend", onTouchEnd);
      removeEventListener("pointerdown", onDown); removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp);
      removeEventListener("pointermove", onMenuMove); removeEventListener("click", onMenuClick); removeEventListener("keydown", onMenuKey);
      document.body.classList.remove("w3d-at-level", "w3d-dragging", "w3d-pick");
      canvas.remove(); flash.remove(); nav.remove(); fpsEl?.remove();
      delete document.body.dataset.three;
      document.body.style.removeProperty("--w3d-p");
      document.body.classList.remove("w3d-past");
    },
  };
}

// A glass screen's picture: a candlestick chart with a line and a few figures, in the panel's colour.
function chartTex(seed, color) {
  const w = 256, h = 160, cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d"), hex = "#" + color.toString(16).padStart(6, "0");
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = "rgba(40,80,120,0.5)"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(160,200,240,0.18)"; g.lineWidth = 1;
  for (let y = 30; y < h; y += 26) { g.beginPath(); g.moveTo(8, y); g.lineTo(w - 8, y); g.stroke(); }
  g.fillStyle = hex; g.fillRect(10, 10, 70, 6); g.globalAlpha = 0.5; g.fillRect(90, 10, 40, 6); g.globalAlpha = 1;
  let v = 90;
  const pts = [];
  for (let x = 14; x < w - 10; x += 9) {
    const o = v, c = Math.max(35, Math.min(h - 18, v + (rnd() - 0.48) * 22)), hi = Math.min(o, c) - rnd() * 8, lo = Math.max(o, c) + rnd() * 8;
    g.strokeStyle = g.fillStyle = c < o ? "#37e08a" : "#ff4d5e";
    g.beginPath(); g.moveTo(x + 2, hi); g.lineTo(x + 2, lo); g.stroke();
    g.fillRect(x, Math.min(o, c), 5, Math.max(1.5, Math.abs(c - o)));
    pts.push([x + 2, (o + c) / 2]); v = c;
  }
  g.strokeStyle = hex; g.lineWidth = 1.6; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y - 6) : g.moveTo(x, y - 6))); g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A rising beam of light with bright pulses climbing it (from the end of the 10118 video).
function movingLight(color, opacity) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uSpeed: { value: 0.4 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; uniform float uOn; uniform float uSpeed; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float y = vUv.y;
        float pulse = pow(fract(y * 3.0 - uTime * uSpeed), 10.0);
        float a = uOn * ${opacity.toFixed(3)} * (0.22 + 0.9 * pulse) * smoothstep(1.0, 0.3, y) * smoothstep(0.0, 0.05, y);
        gl_FragColor = vec4(uColor * (1.0 + pulse), a);
      }`,
  });
}

// A chart script's code on a glass panel, and maths floating free (the video's look; made-up text).
function codeTex(seed) {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 166;
  const g = cv.getContext("2d");
  g.fillStyle = "rgba(30,50,80,0.45)"; g.fillRect(0, 0, 256, 166);
  const lines = ["fn signal(round) {", "  let ema = avg(close, 21)", "  if close > ema && rsi < 70", "    return UP", "  else if close < ema", "    return DOWN", "  hold()", "}", "// next round: 15m", "send(call, key)"];
  g.font = "12px monospace";
  lines.forEach((l, i) => { g.fillStyle = i % 4 === 3 ? "#b98cff" : i % 3 ? "#5be3a6" : "#9fd0ff"; g.fillText(l.slice(0, 26 - (seed * 3 + i) % 6), 10, 18 + i * 15); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function mathTex(seed) {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
  const g = cv.getContext("2d");
  const f = ["σ = √(Σ(x−μ)² / n)", "EMA = α·x + (1−α)·EMA", "P(up) = e^z / (1+e^z)"][seed % 3];
  g.font = "italic 22px serif"; g.fillStyle = "#e8f0ff"; g.fillText(f, 12, 56);
  g.strokeStyle = "rgba(232,240,255,0.5)"; g.beginPath(); g.moveTo(12, 78); g.lineTo(230, 78); g.stroke();
  g.font = "14px serif"; g.fillText(["n = 96 rounds", "α = 2/(21+1)", "z = w·x + b"][seed % 3], 12, 104);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// A soft round glow, drawn once.
let radialTex = null;
function radial() {
  if (radialTex) return radialTex;
  const s = 64, cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d"), grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,0.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  return (radialTex = new THREE.CanvasTexture(cv));
}

