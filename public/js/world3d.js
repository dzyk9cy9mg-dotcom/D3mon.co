// /world in 3D: the outside (docs/world/BLUEPRINT.md, step 3). Loaded by world.js only on devices that get
// the 3D version; the 2D version never downloads it. Scrolling through the Outside place drives the camera:
//   0.00  overhead, the pyramid flat on the floor: seen from above it's the D3MON logo
//   0.35  the triangle has risen into the pyramid, particles lifting with it
//   0.70  the opening shot, low and in front
//   1.00  at the stargate on the front face: its rings lock, the event horizon fills, and we pass through
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

  // ---------- floor: the flower of life, fading out into the dark ----------
  const floorTex = (() => {
    const s = 512, cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g = cv.getContext("2d");
    g.strokeStyle = "rgba(77,163,255,0.55)";
    g.lineWidth = 1.2;
    const r = s / 4;
    for (let row = -1; row <= 5; row++) for (let col = -1; col <= 5; col++) {
      const x = col * r + (row % 2 ? r / 2 : 0), y = row * r * Math.sqrt(3) / 2;
      g.beginPath(); g.arc(x, y, r / 2, 0, Math.PI * 2); g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(36, 36);
    t.anisotropy = 4;
    return t;
  })();
  const floorFade = (() => {
    const s = 256, cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g = cv.getContext("2d"), grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "#fff"); grd.addColorStop(0.35, "#888"); grd.addColorStop(1, "#000");
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  })();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(100, 96), new THREE.MeshBasicMaterial({ map: floorTex, alphaMap: floorFade, transparent: true, opacity: 0.3, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: C.bots, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01;
  scene.add(glow);

  // ---------- stars ----------
  const starN = full ? 2200 : phone ? 500 : 1100;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60, s = Math.sqrt(1 - u * u);
    starPos.set([Math.cos(a) * s * d, Math.abs(u) * d * 0.7 + 2, Math.sin(a) * s * d], i * 3);
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: 0x9fb8cc, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false }));
  scene.add(stars);

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
  const faces = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ color: 0x0b1824, metalness: 0.4, roughness: 0.25, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
  pyr.add(faces);
  // The crystal capstone.
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xcfe6ff }));
  const capGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial(), color: 0x9fd0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  capGlow.scale.setScalar(2.2);
  scene.add(cap, capGlow);

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

  // ---------- the stargate on the front face ----------
  const front = { a: CORNERS.bots, b: CORNERS.scripts };
  const gateCentre = new THREE.Vector3(0, H * 0.3, 0).add(front.a.clone().add(front.b).multiplyScalar(0.5 * 0.7));
  const faceNormal = new THREE.Vector3().subVectors(front.b, front.a).cross(new THREE.Vector3().subVectors(apex, front.a)).normalize();
  const gate = new THREE.Group();
  gate.position.copy(gateCentre).addScaledVector(faceNormal, 0.04);
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
    { at: 1, pos: gateCentre.clone().addScaledVector(faceNormal, 1.3), look: gateCentre.clone(), up: new THREE.Vector3(0, 1, 0) },
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
    stars.rotation.y = time * 0.004;

    // The stargate: its rings turn slowly in opposite directions, then lock and open as we arrive.
    const open = smooth(clamp01((p - 0.78) / 0.17));
    gate.scale.setScalar(rise);
    gate.position.copy(gateCentre).setY(gateCentre.y * rise).addScaledVector(faceNormal, 0.04);
    gateRings.forEach((g, i) => {
      const spin = (i % 2 ? -1 : 1) * (0.12 + i * 0.05) * (reducedMotion ? 0 : 1);
      g.ring.rotation.z = g.lock + (time * spin) * (1 - open);
      g.ring.children.forEach(c => { c.material.opacity = c.userData.o * (0.5 + 0.5 * clamp01((p - 0.5) / 0.3)) * (1 + open * 0.6); });
    });
    horizon.material.uniforms.uTime.value = time;
    horizon.material.uniforms.uOpen.value = open;
    // A short burst of light as we pass through, gone again once we're in.
    const through = clamp01((p - 0.9) / 0.1), burst = through < 0.7 ? smooth(through / 0.7) : 1 - smooth((through - 0.7) / 0.3);
    flash.style.opacity = String(past ? 0 : burst * 0.85);

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
