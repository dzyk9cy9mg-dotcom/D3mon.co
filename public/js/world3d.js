// /world in 3D: the outside (docs/world/BLUEPRINT.md, step 3). Loaded by world.js only on devices that get
// the 3D version; the 2D version never downloads it. Scrolling through the Outside place drives the camera:
//   0.00  overhead, the pyramid flat on the floor: seen from above it's the D3MON logo
//   0.35  the triangle has risen into the pyramid, particles lifting with it
//   0.70  the opening shot, low and in front
//   1.00  at the stargate in the centre of the pyramid, around the golden beam: its rings lock, the event
//         horizon fills, and we pass through
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
  // The crystal capstone.
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xcfe6ff }));
  const capGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: 0x9fd0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  capGlow.scale.setScalar(2.2);
  scene.add(cap, capGlow);

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
  // The golden beam from the core up to the capstone.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 8, 1, true), edgeMat(C.callers, 0.95));
  const beamGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 12, 1, true), edgeMat(C.callers, 0.18));
  scene.add(beam, beamGlow);
  // Glass screens with charts, standing around the walkway and facing the core.
  const screens = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, color = C[keys[i % 3]];
    const panel = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshBasicMaterial({ map: chartTex(i, color), transparent: true, opacity: 1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    panel.add(face);
    const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.56));
    panel.add(new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    panel.position.set(Math.cos(a) * 1.8, 0.85, Math.sin(a) * 1.8);
    panel.lookAt(0, 0.85, 0);
    hall.add(panel); screens.push(panel);
  }

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
  const flowN = full ? 420 : phone ? 90 : 200;
  const flowPos = new Float32Array(flowN * 3), flowCol = new Float32Array(flowN * 3), flowT = new Float32Array(flowN), flowE = new Uint8Array(flowN);
  for (let i = 0; i < flowN; i++) {
    flowE[i] = i % edges.length; flowT[i] = Math.random();
    const c = new THREE.Color(edges[flowE[i]].color);
    flowCol.set([c.r, c.g, c.b], i * 3);
  }
  const flowGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(flowPos, 3)).setAttribute("color", new THREE.BufferAttribute(flowCol, 3));
  const flow = new THREE.Points(flowGeo, new THREE.PointsMaterial({ size: full ? 0.07 : 0.09, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, map: radial(), alphaTest: 0.01 }));
  scene.add(flow);

  // ---------- moving light: random beams rising in the dark, and comets flying around ----------
  // (owner, 2026-10-18: "random light beams and some random sized dots with trails flying around like comets")
  const palette = [C.callers, C.bots, C.scripts, 0xffffff];
  const pick = () => palette[Math.floor(Math.random() * palette.length)];
  const beams = [];
  for (let i = 0; i < (full ? 12 : phone ? 4 : 8); i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30, 10, 1, true), movingLight(pick(), 0.75));
    m.userData = { born: 0, life: 0 };
    scene.add(m); beams.push(m);
  }
  function respawnBeam(m, time) {
    const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 9, w = 0.012 + Math.random() * 0.05;
    m.position.set(Math.cos(a) * d, 15, Math.sin(a) * d);
    m.scale.set(w, 1, w);
    m.material.uniforms.uColor.value.set(pick());
    m.material.uniforms.uSpeed.value = 0.25 + Math.random() * 0.5;
    Object.assign(m.userData, { born: time, life: 4 + Math.random() * 6 });
  }
  const cometN = full ? 22 : phone ? 6 : 14, TRAIL = full ? 48 : phone ? 24 : 36;
  const comets = [];
  const cPos = new Float32Array(cometN * TRAIL * 3), cCol = new Float32Array(cometN * TRAIL * 3), cSize = new Float32Array(cometN * TRAIL);
  const cGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(cPos, 3)).setAttribute("color", new THREE.BufferAttribute(cCol, 3)).setAttribute("size", new THREE.BufferAttribute(cSize, 1));
  const cometPoints = new THREE.Points(cGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { uScale: { value: 300 } },
    vertexShader: `attribute float size; varying vec3 vColor; uniform float uScale;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vColor * (a * a + a * 0.3), 1.0); }`,
  }));
  cometPoints.frustumCulled = false;
  scene.add(cometPoints);
  for (let i = 0; i < cometN; i++) comets.push({ born: 0, life: 0 });
  function respawnComet(c, time) {
    // An orbit around the pyramid, tilted at random, travelled for part of a turn.
    const tilt = (Math.random() - 0.5) * 1.1, spin = Math.random() * Math.PI * 2;
    const u = new THREE.Vector3(Math.cos(spin), 0, Math.sin(spin));
    const v = new THREE.Vector3(-Math.sin(spin), 0, Math.cos(spin)).applyAxisAngle(u, tilt);
    Object.assign(c, {
      born: time, life: 3 + Math.random() * 5, u, v,
      r: 3.6 + Math.random() * 6, y: 0.8 + Math.random() * 4.5, a0: Math.random() * Math.PI * 2,
      speed: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.45),
      size: 0.06 + Math.random() ** 2 * 0.34, color: new THREE.Color(pick()),
    });
  }
  const cTmp = new THREE.Vector3();
  function moveLights(time) {
    for (const m of beams) {
      const d = m.userData, age = time - d.born;
      if (age > d.life) { const first = !d.life; respawnBeam(m, time); if (first) d.born -= Math.random() * d.life; continue; } // the first ones start part-way, so they don't all appear at once
      const fade = smooth(clamp01(age / 1.2)) * smooth(clamp01((d.life - age) / 1.2));
      m.material.uniforms.uOn.value = d.life ? fade : 0;
      m.material.uniforms.uTime.value = time;
    }
    comets.forEach((c, i) => {
      const age = time - c.born;
      if (age > c.life || !c.u) { const first = !c.u; respawnComet(c, time); if (first) c.born -= Math.random() * c.life; }
      const ageNow = time - c.born;
      const fade = smooth(clamp01(ageNow / 0.8)) * smooth(clamp01((c.life - ageNow) / 0.8));
      for (let j = 0; j < TRAIL; j++) {
        const a = c.a0 + (ageNow - j * 0.02) * c.speed, k = (i * TRAIL + j);
        cTmp.copy(c.u).multiplyScalar(Math.cos(a) * c.r).addScaledVector(c.v, Math.sin(a) * c.r);
        cPos.set([cTmp.x, cTmp.y + c.y, cTmp.z], k * 3);
        const f = 1 - j / TRAIL, glow = fade * f * f * (j === 0 ? 1.6 : 1);
        cCol.set([c.color.r * glow, c.color.g * glow, c.color.b * glow], k * 3);
        cSize[k] = c.size * (j === 0 ? 1 : 0.25 + 0.6 * f);
      }
    });
    cGeo.attributes.position.needsUpdate = cGeo.attributes.color.needsUpdate = cGeo.attributes.size.needsUpdate = true;
  }
  if (reducedMotion) cometPoints.visible = false; // still beams only, no flying lights

  // ---------- the stargate on the front face ----------
  const front = { a: CORNERS.bots, b: CORNERS.scripts };
  // In the centre of the pyramid, around the golden beam, facing the front (owner, 2026-10-18).
  const GATE = 0.68; // its size: it fits inside the walls at this height
  const gateCentre = new THREE.Vector3(0, H * 0.38, 0);
  const faceNormal = new THREE.Vector3().subVectors(front.b, front.a).cross(new THREE.Vector3().subVectors(apex, front.a)).setY(0).normalize();
  const gate = new THREE.Group();
  gate.position.copy(gateCentre);
  gate.lookAt(gateCentre.clone().add(faceNormal));
  scene.add(gate);
  const gateRings = buildGate(gate, full);
  const horizon = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; uniform float uOpen; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float w = sin(r * 18.0 - uTime * 2.2 + sin(a * 3.0 + uTime) * 0.6) * 0.5 + 0.5;
        vec3 amber = vec3(1.0, 0.71, 0.28), blue = vec3(0.30, 0.64, 1.0), violet = vec3(0.73, 0.55, 1.0);
        vec3 col = mix(mix(blue, violet, 0.5 + 0.5 * sin(a + uTime * 0.3)), amber, w * 0.35);
        float edge = smoothstep(1.0, 0.82, r);
        float alpha = edge * uOpen * (0.35 + 0.65 * w * (1.0 - r * 0.5));
        gl_FragColor = vec4(col * (0.6 + 0.8 * (1.0 - r)), alpha);
      }`,
  }));
  gate.add(horizon);
  const flash = document.createElement("div");
  flash.className = "w3d-flash";
  document.body.append(flash);

  // ---------- the camera path ----------
  const shots = [
    { at: 0, pos: new THREE.Vector3(0, 15.5, 0.001), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 0, -1) },
    { at: 0.35, pos: new THREE.Vector3(0, 10.5, 9.5), look: new THREE.Vector3(0, 1.4, 0), up: new THREE.Vector3(0, 1, 0) },
    { at: 0.7, pos: new THREE.Vector3(0, 2.0, 10.5), look: new THREE.Vector3(0, 1.8, 0), up: new THREE.Vector3(0, 1, 0) },
    { at: 1, pos: gateCentre.clone().addScaledVector(faceNormal, 1.5), look: gateCentre.clone(), up: new THREE.Vector3(0, 1, 0) },
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
    if (reducedMotion) target = target < 0.2 ? 0 : target < 0.85 ? 0.7 : 1; // cut between shots, no flying
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
    cap.position.set(0, H * rise, 0); cap.rotation.y = time * 0.4;
    capGlow.position.copy(cap.position); capGlow.material.opacity = 0.5 + 0.4 * Math.sin(time * 1.6) ** 2;
    // The floor inside comes up with the walls; the beam rises to the capstone.
    const inside = smooth(clamp01((p - 0.12) / 0.25));
    hall.scale.set(1, Math.max(0.001, rise), 1);
    hall.visible = inside > 0.01;
    screens.forEach((s, i) => { s.position.y = 0.85 * rise + Math.sin(time * 0.6 + i) * 0.03 * (reducedMotion ? 0 : 1); s.scale.set(inside, inside / Math.max(0.001, rise), inside); });
    core.material.opacity = inside * (0.8 + 0.2 * Math.sin(time * 3));
    ticks.forEach((t, i) => { t.material.opacity = inside * (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(time * 1.4 - i * 0.35))); });
    spokes.forEach((l, i) => { l.material.opacity = inside * (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * 2 + i * 1.3))); });
    nodes.forEach((n, i) => { n.material.opacity = inside * (0.6 + 0.4 * Math.sin(time * 2 + i * 1.3)); });
    const top = H * rise - 0.2, beamLen = Math.max(0.001, (top - 0.15) * inside);
    for (const m of [beam, beamGlow]) { m.scale.set(1, beamLen, 1); m.position.set(0, 0.15 + beamLen / 2, 0); }
    beam.material.opacity = 0.95 * inside; beamGlow.material.opacity = 0.18 * inside;
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

    // The stargate: its rings turn slowly in opposite directions, then lock and open as we arrive.
    const open = smooth(clamp01((p - 0.78) / 0.17));
    gate.scale.setScalar(rise * GATE);
    gate.position.copy(gateCentre).setY(gateCentre.y * rise);
    gateRings.forEach((g, i) => {
      const spin = (i % 2 ? -1 : 1) * (0.12 + i * 0.05) * (reducedMotion ? 0 : 1);
      g.ring.rotation.z = g.lock + (time * spin) * (1 - open);
      // Until they lock, the rings tilt slowly like a gyroscope, so the gate reads as a real 3D object.
      const free = (1 - open) * (reducedMotion ? 0 : 1);
      g.ring.rotation.x = Math.sin(time * 0.45 + i * 1.7) * 0.5 * free;
      g.ring.rotation.y = Math.cos(time * 0.37 + i * 1.1) * 0.5 * free;
      g.ring.children.forEach(c => { c.material.opacity = c.userData.o * (0.5 + 0.5 * clamp01((p - 0.5) / 0.3)) * (1 + open * 0.6); });
    });
    horizon.material.uniforms.uTime.value = time;
    horizon.material.uniforms.uOpen.value = open;
    // A short burst of light as we pass through, gone again once we're in.
    const through = clamp01((p - 0.9) / 0.1), burst = through < 0.7 ? smooth(through / 0.7) : 1 - smooth((through - 0.7) / 0.3);
    flash.style.opacity = String(past ? 0 : burst * 0.85);

    moveLights(time);
    formFloor(time);
    const s = shotAt(p);
    camera.position.copy(s.pos);
    camera.up.copy(s.up);
    camera.lookAt(s.look);
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
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", readScroll);
      removeEventListener("resize", resize);
      renderer.dispose();
      scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose(); }); });
      canvas.remove(); flash.remove(); fpsEl?.remove();
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

// The stargate in engraved line art: concentric bands of fine ornament (from the skull mandala we were
// shown, with D3MON's own motifs: ticks, triangles, flower-of-life petals), each band its own ring.
function buildGate(parent, full) {
  const bands = [
    { r: 1.0, color: C.callers, make: r => ticks(r, full ? 120 : 72, 0.06) },
    { r: 0.9, color: C.bots, make: r => circle(r).concat(circle(r - 0.025)) },
    { r: 0.84, color: C.scripts, make: r => triangles(r, 9) },
    { r: 0.74, color: C.callers, make: r => petals(r, 12) },
    { r: 0.66, color: C.bots, make: r => ticks(r, 36, 0.03).concat(circle(r)) },
  ];
  return bands.map((b, i) => {
    const ring = new THREE.Group();
    const seg = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(b.make(b.r), 3)),
      new THREE.LineBasicMaterial({ color: b.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    seg.userData.o = 0.9;
    ring.add(seg);
    // A glowing tube under each band's engraving, and each band at its own depth: a real ring, not a drawing.
    const tube = new THREE.Mesh(new THREE.TorusGeometry(b.r, i === 0 ? 0.022 : 0.013, 10, 128), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    tube.userData.o = 0.6;
    ring.add(tube);
    ring.position.z = (2 - i) * 0.06;
    parent.add(ring);
    return { ring, lock: (i * Math.PI) / 9 };
  });
  function circle(r, n = 96) { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; out.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(b) * r, Math.sin(b) * r, 0); } return out; }
  function ticks(r, n, len) { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, l = i % 6 ? len : len * 2; out.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * (r - l), Math.sin(a) * (r - l), 0); } return out; }
  function triangles(r, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, s = 0.06, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      const pts = [0, 1, 2].map(k => { const t = a + (k * Math.PI * 2) / 3; return [cx + Math.cos(t) * s, cy + Math.sin(t) * s]; });
      for (let k = 0; k < 3; k++) out.push(...pts[k], 0, ...pts[(k + 1) % 3], 0);
    }
    return out;
  }
  function petals(r, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, cx = Math.cos(a) * (r - 0.06), cy = Math.sin(a) * (r - 0.06), pr = 0.065;
      for (let k = 0; k < 16; k++) { const t0 = (k / 16) * Math.PI * 2, t1 = ((k + 1) / 16) * Math.PI * 2; out.push(cx + Math.cos(t0) * pr, cy + Math.sin(t0) * pr, 0, cx + Math.cos(t1) * pr, cy + Math.sin(t1) * pr, 0); }
    }
    return out;
  }
}
