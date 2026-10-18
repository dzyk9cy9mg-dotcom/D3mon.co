// /world in 3D: the outside (docs/world/BLUEPRINT.md, step 3). Loaded by world.js only on devices that get
// the 3D version; the 2D version never downloads it. Scrolling through the Outside place drives the whole
// opening, like the award sites we studied (docs/world/INSPIRATION.md):
//   0.00  arrival: the D3MON skull in engraved line art, inside a mandala of turning rings (from 08)
//   0.10  the skull dissolves into particles that swirl out into the rings (the particle morph, from 07)
//   0.20  the rings lock into a stargate and its swirl opens; the particles are pulled in (the Lusion portal, 05)
//   0.27  we dive through the gate, and the pyramid is revealed below: from above it's the D3MON logo
//   0.36  the triangle rises into the glowing pyramid; a beam of light climbs from its capstone (from 04)
//   0.56  the opening shot, with "CALLERS · BOTS · CHART SCRIPTS" sliding past (kinetic type, from 09)
//   0.78  the smaller stargate on the front face opens, and takes us into the Grand Hall
// Comfort: the camera never spins or rolls; it only glides and tilts. Reduce motion cuts between the shots.
import * as THREE from "../vendor/three-0.169.0.module.min.js";
import { EffectComposer } from "../vendor/three-addons-0.169.0/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/three-addons-0.169.0/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/three-addons-0.169.0/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/three-addons-0.169.0/postprocessing/OutputPass.js";

const C = { callers: 0xffb547, bots: 0x4da3ff, scripts: 0xb98cff, ink: 0xdce7ee, bg: 0x05080c };
const R = 3.1, H = 4.3; // base radius and height of the pyramid
const GATE_Y = 19; // the arrival stargate floats high above the pyramid, facing up
const CORNERS = { callers: new THREE.Vector3(0, 0, -R), bots: new THREE.Vector3(-R * Math.sin(Math.PI / 3), 0, R / 2), scripts: new THREE.Vector3(R * Math.sin(Math.PI / 3), 0, R / 2) };
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = v => Math.min(1, Math.max(0, v));
const span = (p, a, b) => clamp01((p - a) / (b - a));
const bell = (p, a, b, c, d) => (p < b ? smooth(span(p, a, b)) : 1 - smooth(span(p, c, d)));

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
  scene.background = new THREE.Color(C.bg); // drawn by the scene, so the glow pass keeps it the true D3MON black
  scene.fog = new THREE.FogExp2(C.bg, 0.045);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

  // The glow that makes lines of light look like light. Phones skip it to stay smooth.
  let composer = null, bloom = null;
  if (!phone) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), full ? 0.75 : 0.65, 0.32, 0.42);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---------- light ----------
  scene.add(new THREE.AmbientLight(0x223344, 1.2));
  for (const [k, v] of Object.entries(CORNERS)) {
    const l = new THREE.PointLight(C[k], 14, 14, 2);
    l.position.copy(v).setY(1.2);
    scene.add(l);
  }

  // ---------- floor: the flower of life, fading out into the dark ----------
  const floorTex = canvasTex(512, g => {
    g.strokeStyle = "rgba(77,163,255,0.55)"; g.lineWidth = 1.2;
    const r = 128;
    for (let row = -1; row <= 5; row++) for (let col = -1; col <= 5; col++) {
      const x = col * r + (row % 2 ? r / 2 : 0), y = (row * r * Math.sqrt(3)) / 2;
      g.beginPath(); g.arc(x, y, r / 2, 0, Math.PI * 2); g.stroke();
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(36, 36); floorTex.anisotropy = 4;
  const floorFade = canvasTex(256, g => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "#fff"); grd.addColorStop(0.35, "#888"); grd.addColorStop(1, "#000");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(100, 96), new THREE.MeshBasicMaterial({ map: floorTex, alphaMap: floorFade, transparent: true, opacity: 0.3, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // No stars: the owner doesn't like them (2026-10-18). The sky is the plain D3MON black.

  // ---------- the pyramid ----------
  const apex = new THREE.Vector3(0, H, 0), keys = Object.keys(CORNERS);
  const edges = [];
  keys.forEach((k, i) => {
    edges.push({ a: CORNERS[k], b: apex, color: C[k] });
    const k2 = keys[(i + 1) % 3], mid = CORNERS[k].clone().lerp(CORNERS[k2], 0.5);
    edges.push({ a: CORNERS[k], b: mid, color: C[k] }, { a: mid, b: CORNERS[k2], color: C[k2] });
  });
  const edgeMeshes = [];
  for (const e of edges) for (const [r, o] of [[0.022, 1], [0.09, 0.14]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8, 1, true), glowMat(e.color, o));
    m.userData = e;
    scene.add(m);
    edgeMeshes.push(m);
  }
  const fv = [];
  keys.forEach((k, i) => fv.push(...CORNERS[k].toArray(), ...CORNERS[keys[(i + 1) % 3]].toArray(), ...apex.toArray()));
  const faceGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(fv, 3));
  faceGeo.computeVertexNormals();
  const faces = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: 0x0b1824, metalness: 0.4, roughness: 0.25, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
  scene.add(faces);
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xcfe6ff }));
  const capGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: 0x9fd0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  capGlow.scale.setScalar(2.2);
  scene.add(cap, capGlow);
  // The beam of light from the capstone into the sky (from the 10118 video).
  const beam = new THREE.Group();
  for (const [r, o] of [[0.03, 0.9], [0.16, 0.18], [0.45, 0.05]]) beam.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 40, 12, 1, true), glowMat(0xbfdcff, o)));
  scene.add(beam);
  // Moving light (the end of the 10118 video, owner 2026-10-18): a beam in each colour rising from its corner,
  // with pulses of light running up it, and thin arcs that sweep up and around the pyramid like comets.
  const lights = [];
  keys.forEach((k, i) => {
    const pos = CORNERS[k].clone().multiplyScalar(1.28);
    for (const [r, o] of [[0.025, 1], [0.14, 0.22]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 34, 10, 1, true), movingLight(C[k], o, "beam", 0.5 + i * 0.17));
      m.position.copy(pos).setY(17);
      scene.add(m);
      lights.push(m);
    }
    const pts = [];
    for (let s = 0; s <= 80; s++) {
      const t = s / 80, a = (i / 3) * Math.PI * 2 + t * Math.PI * 3, rad = R * 1.35 * (1 - t * 0.85);
      pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.2 + t * 11, Math.sin(a) * rad));
    }
    const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.018, 5, false), movingLight(C[k], 1, "arc", i / 3));
    scene.add(arc);
    lights.push(arc);
    // The three feeding the centre (owner, 2026-10-18): a stream from each corner along the floor to the
    // middle, all three in step, so their light meets there and rises up the core together.
    const from = CORNERS[k].clone().multiplyScalar(1.28), side = new THREE.Vector3(-from.z, 0, from.x).normalize().multiplyScalar(0.6);
    const feed = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from.clone().setY(0.06), from.clone().multiplyScalar(0.5).add(side).setY(0.06), new THREE.Vector3(0, 0.06, 0)]), 64, 0.022, 5, false),
      movingLight(C[k], 1, "arc", 0));
    scene.add(feed);
    lights.push(feed);
  });
  // The core: energy rising from the floor's centre up through the pyramid into the capstone.
  for (const [r, o] of [[0.03, 1], [0.12, 0.3]]) {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 10, 1, true), movingLight(0xdfeaff, o, "beam", 0.9));
    core.userData.core = true;
    scene.add(core);
    lights.push(core);
  }

  // ---------- the corner landmarks: Callers spire, Bots crystal, Scripts dome ----------
  const marks = new THREE.Group();
  scene.add(marks);
  const out = k => CORNERS[k].clone().multiplyScalar(1.28);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.3, 6), new THREE.MeshBasicMaterial({ color: C.callers, wireframe: true }));
  spire.position.copy(out("callers")).setY(0.65);
  const spireRings = [0.35, 0.55].map((r, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 48), glowMat(C.callers, 0.7)); m.rotation.x = Math.PI / 2; m.position.copy(out("callers")).setY(0.3 + i * 0.5); return m; });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: C.bots, wireframe: true }));
  crystal.position.copy(out("bots")).setY(0.7);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.scripts, wireframe: true }));
  dome.position.copy(out("scripts"));
  marks.add(spire, ...spireRings, crystal, dome);
  for (const k of keys) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: C[k], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(2.4); s.position.copy(out(k)).setY(0.4);
    marks.add(s);
  }

  // ---------- particles flowing along the edges ----------
  const flowN = full ? 420 : phone ? 90 : 220;
  const flowPos = new Float32Array(flowN * 3), flowCol = new Float32Array(flowN * 3), flowT = new Float32Array(flowN), flowE = new Uint8Array(flowN);
  for (let i = 0; i < flowN; i++) {
    flowE[i] = i % edges.length; flowT[i] = Math.random();
    const c = new THREE.Color(edges[flowE[i]].color);
    flowCol.set([c.r, c.g, c.b], i * 3);
  }
  const flowGeo = geo(flowPos).setAttribute("color", new THREE.BufferAttribute(flowCol, 3));
  scene.add(new THREE.Points(flowGeo, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: radial() })));

  // ---------- the arrival: the skull mandala that becomes a stargate ----------
  const arrival = new THREE.Group();
  arrival.position.set(0, GATE_Y, 0);
  arrival.rotation.x = -Math.PI / 2; // faces up, at the camera; its top points away from the pyramid's front
  scene.add(arrival);
  const skullSegs = skull();
  const skullLines = new THREE.LineSegments(geo(new Float32Array(skullSegs.lines)), lineMat(C.ink, 0.95));
  const skullEngr = new THREE.LineSegments(geo(new Float32Array(skullSegs.engraving)), lineMat(0x9fc4e6, 0.5));
  const skullAccent = new THREE.LineSegments(geo(new Float32Array(skullSegs.accent)), lineMat(C.bots, 0.95));
  const web = new THREE.LineSegments(geo(new Float32Array(skullSegs.web)), lineMat(C.scripts, 0.55));
  const skullG = new THREE.Group();
  skullG.add(skullLines, skullEngr, skullAccent, web);
  arrival.add(skullG);
  const eyes = [-1, 1].map(s => { const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: C.callers, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); e.position.set(s * 0.27, 0.07, 0.01); e.scale.setScalar(0.32); skullG.add(e); return e; });
  const arrivalRings = buildGate(arrival, full, 2.45);
  const arrivalBack = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshBasicMaterial({ color: C.bg, transparent: true, opacity: 1, depthWrite: false }));
  arrivalBack.position.z = -0.02; // hides the pyramid below until the gate opens
  arrival.add(arrivalBack);
  const arrivalSwirl = new THREE.Mesh(new THREE.CircleGeometry(1.75, 96), swirlMat());
  arrivalSwirl.position.z = -0.01;
  arrival.add(arrivalSwirl);
  // The particle morph: points sampled along the skull fly out on a spiral to the rings, then are pulled into the swirl.
  const morphN = full ? 1600 : phone ? 500 : 900;
  const mStart = sampleSegments(skullSegs.lines.concat(skullSegs.accent), morphN);
  const mPos = new Float32Array(morphN * 3), mCol = new Float32Array(morphN * 3), mRing = new Float32Array(morphN), mAng = new Float32Array(morphN), mDelay = new Float32Array(morphN);
  const ringRadii = [1.82, 2.0, 2.2], ringCols = [C.callers, C.bots, C.scripts].map(c => new THREE.Color(c));
  for (let i = 0; i < morphN; i++) {
    const k = i % 3; mRing[i] = ringRadii[k] + (Math.random() - 0.5) * 0.05; mAng[i] = Math.random() * Math.PI * 2; mDelay[i] = Math.random() * 0.35;
    const c = new THREE.Color(C.ink).lerp(ringCols[k], 0.6); mCol.set([c.r, c.g, c.b], i * 3);
  }
  const morphGeo = geo(mPos).setAttribute("color", new THREE.BufferAttribute(mCol, 3));
  const morph = new THREE.Points(morphGeo, new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: radial() }));
  arrival.add(morph);

  // ---------- the smaller stargate on the front face, into the Grand Hall ----------
  const front = { a: CORNERS.bots, b: CORNERS.scripts };
  const gateCentre = new THREE.Vector3(0, H * 0.3, 0).add(front.a.clone().add(front.b).multiplyScalar(0.35));
  const faceNormal = new THREE.Vector3().subVectors(front.b, front.a).cross(new THREE.Vector3().subVectors(apex, front.a)).normalize();
  const gate = new THREE.Group();
  gate.position.copy(gateCentre).addScaledVector(faceNormal, 0.04);
  gate.lookAt(gateCentre.clone().add(faceNormal));
  scene.add(gate);
  const gateRings = buildGate(gate, full, 1);
  const gateSwirl = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), swirlMat());
  gate.add(gateSwirl);

  // ---------- page overlays: the burst of light, and the sliding words ----------
  const flash = document.createElement("div");
  flash.className = "w3d-flash";
  const words = document.createElement("div");
  words.className = "w3d-words";
  words.setAttribute("aria-hidden", "true");
  words.innerHTML = `<span class="c-cal">Callers</span><i>·</i><span class="c-bot">Bots</span><i>·</i><span class="c-scr">Chart Scripts</span>`;
  document.body.append(flash, words);

  // ---------- the camera path ----------
  const shots = [
    { at: 0, pos: new THREE.Vector3(0, GATE_Y + 7, 0.001), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 0, -1) },
    { at: 0.22, pos: new THREE.Vector3(0, GATE_Y + 4.2, 0.001), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 0, -1) },
    { at: 0.36, pos: new THREE.Vector3(0, 15.5, 0.001), look: new THREE.Vector3(0, 0, 0), up: new THREE.Vector3(0, 0, -1) },
    { at: 0.56, pos: new THREE.Vector3(0, 10.5, 9.5), look: new THREE.Vector3(0, 1.4, 0), up: new THREE.Vector3(0, 1, 0) },
    { at: 0.78, pos: new THREE.Vector3(0, 2.0, 10.5), look: new THREE.Vector3(0, 1.8, 0), up: new THREE.Vector3(0, 1, 0) },
    { at: 1, pos: gateCentre.clone().addScaledVector(faceNormal, 1.3), look: gateCentre.clone(), up: new THREE.Vector3(0, 1, 0) },
  ];
  const STOPS = shots.map(s => s.at);
  function shotAt(p) {
    let i = 0;
    while (i < shots.length - 2 && p > shots[i + 1].at) i++;
    const s0 = shots[i], s1 = shots[i + 1], t = smooth(span(p, s0.at, s1.at));
    return { pos: s0.pos.clone().lerp(s1.pos, t), look: s0.look.clone().lerp(s1.look, t), up: s0.up.clone().lerp(s1.up, t).normalize() };
  }

  // ---------- scroll ----------
  const outside = document.getElementById("outside");
  let target = 0, shown = 0, past = false;
  function readScroll() {
    const r = outside.getBoundingClientRect(), len = Math.max(1, r.height - innerHeight);
    const raw = clamp01(-r.top / len);
    document.body.style.setProperty("--w3d-p", String(raw));
    // Reduce motion cuts between the shots instead of flying.
    target = reducedMotion ? STOPS.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a)) : raw;
    past = r.bottom < innerHeight * 0.6;
    document.body.classList.toggle("w3d-past", past);
  }
  addEventListener("scroll", readScroll, { passive: true });
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    bloom?.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.fov = w < h ? 60 : 45; // portrait screens see the same pyramid
    camera.updateProjectionMatrix();
    // The arrival mandala always fits the screen's narrow side.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 7 * Math.min(1, camera.aspect);
    arrival.scale.setScalar(Math.min(1.15, (half * 0.92) / 2.5));
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
    if (now - last < (past ? 1000 / 15 : minFrame)) return; // behind the other places it only needs a slow idle
    const dt = Math.min(0.1, (now - last) / 1000);
    frames.push(now - last); last = now;
    const time = clock.getElapsedTime();
    shown += (target - shown) * (reducedMotion ? 1 : Math.min(1, dt * 2.4)); // weighted, like the award sites' smooth scroll
    const p = shown;

    // --- the arrival: the skull, the morph, the gate ---
    const dissolve = smooth(span(p, 0.1, 0.16)), fly = span(p, 0.1, 0.22), suck = smooth(span(p, 0.22, 0.31));
    const lockA = smooth(span(p, 0.17, 0.24)), openA = smooth(span(p, 0.2, 0.28));
    skullG.visible = dissolve < 1;
    for (const m of [skullLines, skullEngr, skullAccent, web]) m.material.opacity = m.material.userData.o0 * (1 - dissolve);
    skullG.scale.setScalar(1 + 0.012 * Math.sin(time * 1.3) + dissolve * 0.15);
    eyes.forEach(e => { e.material.opacity = (0.55 + 0.4 * Math.sin(time * 2.2) ** 2) * (1 - dissolve); });
    morph.visible = fly > 0 && suck < 1;
    if (morph.visible) {
      morph.material.opacity = Math.min(1, fly * 4) * (1 - suck);
      for (let i = 0; i < morphN; i++) {
        // Out from the skull on a bowed spiral to its ring, then pulled spinning into the swirl.
        const t = smooth(clamp01((fly - mDelay[i]) / (1 - mDelay[i]))), sx = mStart[i * 2], sy = mStart[i * 2 + 1];
        const a = mAng[i] + t * 2.4 + time * 0.25 * t, bow = Math.sin(t * Math.PI) * 0.6, r = mRing[i] + bow;
        let x = THREE.MathUtils.lerp(sx, Math.cos(a) * r, t), y = THREE.MathUtils.lerp(sy, Math.sin(a) * r, t), z = 0;
        if (suck > 0) { const ia = a + suck * 6, ir = mRing[i] * (1 - suck); x = Math.cos(ia) * ir; y = Math.sin(ia) * ir; z = -suck * 0.8; }
        mPos[i * 3] = x; mPos[i * 3 + 1] = y; mPos[i * 3 + 2] = z;
      }
      morphGeo.attributes.position.needsUpdate = true;
    }
    spinRings(arrivalRings, time, lockA, 0.85 + 0.15 * smooth(fly), 0.6 + 0.6 * lockA);
    arrivalSwirl.material.uniforms.uTime.value = time;
    arrivalSwirl.material.uniforms.uOpen.value = openA * (1 - smooth(span(p, 0.3, 0.36)));
    arrivalBack.material.opacity = 1 - smooth(span(p, 0.24, 0.3)); // the pyramid shows through as the gate opens
    arrival.visible = p < 0.37;

    // --- the rise ---
    const rise = 0.04 + 0.96 * smooth(span(p, 0.36, 0.55));
    for (const m of edgeMeshes) {
      const { a, b } = m.userData, A = a.clone(), B = b.clone();
      A.y *= rise; B.y *= rise;
      m.position.copy(A).lerp(B, 0.5);
      m.scale.set(1, A.distanceTo(B), 1);
      m.quaternion.setFromUnitVectors(up, tmp.subVectors(B, A).normalize());
    }
    faces.scale.set(1, rise, 1);
    cap.position.set(0, H * rise, 0); cap.rotation.y = time * 0.4;
    capGlow.position.copy(cap.position); capGlow.material.opacity = 0.5 + 0.4 * Math.sin(time * 1.6) ** 2;
    // The energy gathers in the middle, climbs the core, then launches from the capstone into the dark sky.
    const beamOn = smooth(span(p, 0.56, 0.66));
    beam.visible = beamOn > 0;
    beam.scale.set(1, Math.max(0.001, beamOn), 1);
    beam.position.set(0, H * rise + 20 * beamOn, 0);
    beam.children.forEach((b, i) => { b.material.opacity = [0.9, 0.18, 0.05][i] * beamOn * (0.85 + 0.15 * Math.sin(time * 3 + i)); });
    const lightOn = smooth(span(p, 0.46, 0.56)), coreOn = smooth(span(p, 0.52, 0.6));
    for (const l of lights) {
      const on = l.userData.core ? coreOn : lightOn;
      l.visible = on > 0; l.material.uniforms.uTime.value = reducedMotion ? 0 : time; l.material.uniforms.uOn.value = on;
      if (l.userData.core) { l.scale.y = Math.max(0.001, rise * coreOn); l.position.set(0, (H * rise * coreOn) / 2, 0); } // the core fills from the floor up
    }
    marks.children.forEach((m, i) => { if (m.isMesh) m.rotation.y = time * (0.15 + i * 0.03); });
    const lift = (1 - rise) * 2.5;
    for (let i = 0; i < flowN; i++) {
      flowT[i] = (flowT[i] + dt * (reducedMotion ? 0.02 : 0.09)) % 1;
      const e = edges[flowE[i]];
      tmp.copy(e.a).lerp(e.b, flowT[i]);
      tmp.y = tmp.y * rise + lift * Math.sin(flowT[i] * Math.PI);
      flowPos[i * 3] = tmp.x; flowPos[i * 3 + 1] = tmp.y; flowPos[i * 3 + 2] = tmp.z;
    }
    flowGeo.attributes.position.needsUpdate = true;

    // --- the front gate ---
    const openF = smooth(span(p, 0.86, 0.97));
    gate.scale.setScalar(rise);
    gate.position.copy(gateCentre).setY(gateCentre.y * rise).addScaledVector(faceNormal, 0.04);
    spinRings(gateRings, time, openF, 1, (0.5 + 0.5 * span(p, 0.6, 0.8)) * (1 + openF * 0.6));
    gateSwirl.material.uniforms.uTime.value = time;
    gateSwirl.material.uniforms.uOpen.value = openF;

    // --- overlays: a burst as we pass through each gate, and the kinetic words during the opening shot ---
    const burst = Math.max(bell(p, 0.27, 0.3, 0.31, 0.34), bell(p, 0.93, 0.97, 0.98, 1.001));
    flash.style.opacity = String(past ? 0 : burst * 0.55);
    const w = bell(p, 0.42, 0.5, 0.66, 0.74);
    words.style.opacity = String(past ? 0 : w);
    words.style.transform = `translate3d(${(0.5 - span(p, 0.42, 0.74)) * 60}vw, 0, 0)`;

    const s = shotAt(p);
    camera.position.copy(s.pos);
    camera.up.copy(s.up);
    camera.lookAt(s.look);
    if (composer) composer.render(); else renderer.render(scene, camera);

    if (fpsEl) { fpsAcc += dt; fpsN++; if (now - fpsAt > 500) { fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps · ${level}`; fpsAcc = 0; fpsN = 0; fpsAt = now; } }
    // Judge smoothness once, over the first few seconds: too slow and Auto steps down to 2D.
    if (!judged && now - started > 3500 && frames.length > 20) {
      judged = true;
      const sorted = frames.slice(5).sort((x, y) => x - y), median = sorted[Math.floor(sorted.length / 2)];
      if (median > 1000 / 22) onSlow(Math.round(1000 / median));
    }
  }
  raf = requestAnimationFrame(frame);

  // The rings turn slowly, each the opposite way to the one beside it, and settle into place as they lock.
  function spinRings(rings, time, lock, scale, glow) {
    rings.forEach((g, i) => {
      const spin = (i % 2 ? -1 : 1) * (0.12 + i * 0.05) * (reducedMotion ? 0 : 1);
      g.ring.rotation.z = g.lock + time * spin * (1 - lock);
      g.ring.scale.setScalar(scale);
      g.ring.children.forEach(c => { c.material.opacity = c.material.userData.o0 * glow; });
    });
  }

  return {
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", readScroll);
      removeEventListener("resize", resize);
      composer?.dispose?.();
      renderer.dispose();
      scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose(); }); });
      canvas.remove(); flash.remove(); words.remove(); fpsEl?.remove();
      delete document.body.dataset.three;
      document.body.style.removeProperty("--w3d-p");
      document.body.classList.remove("w3d-past");
    },
  };
}

// ---------- helpers ----------
// Light that moves. "beam": pulses running up a beam, fading out high up. "arc": one bright head racing
// along a tube with a fading tail behind it, then starting again. `offset` staggers them.
function movingLight(color, opacity, kind, offset) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: kind === "beam"
      ? `uniform float uTime; uniform float uOn; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float y = vUv.y;
          float pulse = pow(fract(y * 3.0 - uTime * ${(0.35 + offset * 0.2).toFixed(3)}), 10.0);
          float a = uOn * ${opacity.toFixed(3)} * (0.28 + 0.9 * pulse) * smoothstep(1.0, 0.25, y) * smoothstep(0.0, 0.04, y);
          gl_FragColor = vec4(uColor * (1.0 + pulse), a);
        }`
      : `uniform float uTime; uniform float uOn; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float head = fract(uTime * 0.11 + ${offset.toFixed(3)}) * 1.3;
          float d = head - vUv.x;
          float tail = d >= 0.0 ? exp(-d * 9.0) : 0.0;
          float a = uOn * ${opacity.toFixed(3)} * (0.012 + tail);
          gl_FragColor = vec4(mix(uColor, vec3(1.0), tail * tail * 0.6), a);
        }`,
  });
}
const geo = arr => new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(arr, 3));
const glowMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
function lineMat(color, opacity) {
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  m.userData.o0 = opacity; // its full opacity, for fading
  return m;
}
function canvasTex(size, draw) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d"));
  return new THREE.CanvasTexture(cv);
}
let radialTex = null;
function radial() {
  return radialTex || (radialTex = canvasTex(64, g => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,0.5)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }));
}

// The swirl inside a stargate: a three-colour vortex that turns inward (after the Lusion portal).
function swirlMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; uniform float uOpen; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float s = a * 3.0 + log(r + 0.02) * 5.0 + uTime * 1.6;
        float arms = 0.5 + 0.5 * sin(s);
        float rings = 0.5 + 0.5 * sin(r * 22.0 - uTime * 3.0);
        vec3 amber = vec3(1.0, 0.71, 0.28), blue = vec3(0.30, 0.64, 1.0), violet = vec3(0.73, 0.55, 1.0), pink = vec3(1.0, 0.45, 0.8);
        vec3 col = mix(mix(blue, violet, arms), mix(pink, amber, rings), 0.35 + 0.25 * sin(a + uTime * 0.4));
        col *= 0.75; col += vec3(0.9, 0.95, 1.0) * pow(1.0 - r, 4.0) * 0.55;
        float edge = smoothstep(1.0, 0.85, r);
        float alpha = edge * uOpen * (0.15 + 0.6 * arms * (0.55 + 0.45 * rings));
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

// Points spread evenly along line segments (x, y, z pairs of ends), for the particle morph.
function sampleSegments(segs, n) {
  const lens = [], out = new Float32Array(n * 2);
  let total = 0;
  for (let i = 0; i < segs.length; i += 6) { const l = Math.hypot(segs[i + 3] - segs[i], segs[i + 4] - segs[i + 1]); lens.push(l); total += l; }
  for (let k = 0; k < n; k++) {
    let d = Math.random() * total, i = 0;
    while (d > lens[i] && i < lens.length - 1) { d -= lens[i]; i++; }
    const t = lens[i] ? d / lens[i] : 0, s = i * 6;
    out[k * 2] = segs[s] + (segs[s + 3] - segs[s]) * t;
    out[k * 2 + 1] = segs[s + 1] + (segs[s + 4] - segs[s + 1]) * t;
  }
  return out;
}

// The stargate in engraved line art: concentric bands of fine ornament, each band its own ring.
function buildGate(parent, full, size) {
  const bands = [
    { r: 1.0, color: C.callers, make: r => ticks(r, full ? 144 : 96, 0.06) },
    { r: 0.92, color: C.bots, make: r => circle(r).concat(circle(r - 0.02 * size)) },
    { r: 0.86, color: C.scripts, make: r => triangles(r, 12) },
    { r: 0.77, color: C.callers, make: r => petals(r, 16) },
    { r: 0.69, color: C.bots, make: r => ticks(r, 48, 0.03).concat(circle(r)) },
  ];
  return bands.map((b, i) => {
    const ring = new THREE.Group();
    ring.add(new THREE.LineSegments(geo(new Float32Array(b.make(b.r * size))), lineMat(b.color, 0.9)));
    parent.add(ring);
    return { ring, lock: (i * Math.PI) / 9 };
  });
  function ticks(r, n, len) { const o = []; len *= size; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, l = i % 6 ? len : len * 2; o.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * (r - l), Math.sin(a) * (r - l), 0); } return o; }
  function triangles(r, n) {
    const o = [], s = 0.06 * size;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      const pts = [0, 1, 2].map(k => { const t = a + (k * Math.PI * 2) / 3; return [cx + Math.cos(t) * s, cy + Math.sin(t) * s]; });
      for (let k = 0; k < 3; k++) o.push(...pts[k], 0, ...pts[(k + 1) % 3], 0);
    }
    return o;
  }
  function petals(r, n) {
    const o = [], pr = 0.065 * size;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; o.push(...circle(pr, 16, Math.cos(a) * (r - pr), Math.sin(a) * (r - pr))); }
    return o;
  }
}
function circle(r, n = 96, cx = 0, cy = 0) {
  const o = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0, cx + Math.cos(b) * r, cy + Math.sin(b) * r, 0); }
  return o;
}

// The D3MON skull in engraved line art: our own drawing in the spirit of the skull mandala (inspiration 08),
// with the D3MON triangle as its nose and the flower of life on its brow. Drawn as line segments in a
// 2-unit box, mirrored left to right. Returns { lines, engraving, accent, web }.
function skull() {
  const lines = [], engraving = [], accent = [], webL = [];
  const seg = (arr, a, b) => arr.push(a[0], a[1], 0, b[0], b[1], 0);
  const poly = (arr, pts, closed) => { for (let i = 0; i < pts.length - 1; i++) seg(arr, pts[i], pts[i + 1]); if (closed) seg(arr, pts[pts.length - 1], pts[0]); };
  const both = (arr, pts, closed) => { poly(arr, pts, closed); poly(arr, pts.map(([x, y]) => [-x, y]), closed); };
  const scaleAbout = (pts, k, cx, cy) => pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);

  // Cranium, temples, cheekbones and the upper jaw.
  const head = [[0, 0.98], [-0.2, 0.96], [-0.4, 0.88], [-0.56, 0.72], [-0.66, 0.5], [-0.69, 0.28], [-0.66, 0.08], [-0.6, -0.05], [-0.63, -0.17], [-0.56, -0.3], [-0.45, -0.37], [-0.37, -0.48], [-0.3, -0.56], [-0.27, -0.6]];
  both(lines, head);
  seg(lines, [-0.27, -0.6], [0.27, -0.6]);
  // The jaw and the teeth.
  both(lines, [[-0.29, -0.63], [-0.34, -0.72], [-0.31, -0.84], [-0.22, -0.95], [-0.1, -1.0], [0, -1.01]]);
  seg(lines, [-0.25, -0.67], [0.25, -0.67]);
  for (let x = -0.24; x <= 0.241; x += 0.06) { seg(lines, [x, -0.5], [x, -0.6]); seg(lines, [x, -0.67], [x + 0.005, -0.77]); }
  // Eye sockets, with inner contours.
  const eye = [[-0.47, 0.12], [-0.41, 0.22], [-0.28, 0.25], [-0.14, 0.2], [-0.1, 0.08], [-0.14, -0.06], [-0.26, -0.1], [-0.4, -0.05]];
  both(lines, eye, true);
  both(engraving, scaleAbout(eye, 0.72, -0.28, 0.07), true);
  both(engraving, scaleAbout(eye, 0.45, -0.28, 0.07), true);
  // Brow ridges and cheek lines.
  both(engraving, [[-0.52, 0.27], [-0.31, 0.34], [-0.08, 0.29]]);
  both(engraving, [[-0.5, -0.12], [-0.36, -0.2], [-0.2, -0.22]]);
  both(engraving, [[-0.56, -0.24], [-0.42, -0.32], [-0.33, -0.42]]);
  both(engraving, [[-0.6, 0.0], [-0.52, -0.08], [-0.46, -0.06]]);
  // The engraved bands across the cranium, and the hatching on the temples.
  for (const k of [0.86, 0.73, 0.6]) both(engraving, scaleAbout(head.slice(0, 7), k, 0, 0.32));
  for (let i = 0; i < 7; i++) { const y = 0.5 - i * 0.07; both(engraving, [[-0.66 + i * 0.004, y], [-0.58 + i * 0.01, y - 0.03]]); }
  // The nose: the D3MON triangle, doubled.
  const tri = [[0, -0.07], [-0.1, -0.33], [0.1, -0.33]];
  poly(accent, tri, true);
  poly(accent, scaleAbout(tri, 0.55, 0, -0.24), true);
  // The flower of life on the brow.
  accent.push(...circle(0.075, 32, 0, 0.56));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; accent.push(...circle(0.075, 24, Math.cos(a) * 0.075, 0.56 + Math.sin(a) * 0.075)); }
  // The web of the mandala around the skull: spokes, and rings of sagging chords.
  const spokes = 24;
  for (let i = 0; i < spokes; i++) { const a = (i / spokes) * Math.PI * 2; seg(webL, [Math.cos(a) * 1.12, Math.sin(a) * 1.12], [Math.cos(a) * 1.62, Math.sin(a) * 1.62]); }
  for (const r of [1.22, 1.36, 1.5, 1.62]) for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2, b = ((i + 1) / spokes) * Math.PI * 2, m = (a + b) / 2, sag = r - 0.03;
    seg(webL, [Math.cos(a) * r, Math.sin(a) * r], [Math.cos(m) * sag, Math.sin(m) * sag]);
    seg(webL, [Math.cos(m) * sag, Math.sin(m) * sag], [Math.cos(b) * r, Math.sin(b) * r]);
  }
  return { lines, engraving, accent, web: webL };
}
