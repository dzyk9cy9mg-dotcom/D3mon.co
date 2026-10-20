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

// ===== THE PYRAMID'S SETTINGS =====
// The owner may revise the triangle at any time (2026-10-20): change it here first. Each line is one thing you can
// see; the code below reads these and nothing else decides them.
const LOOK = {
  colors: { callers: 0xffb547, bots: 0x4da3ff, scripts: 0xb98cff, capstone: 0xffe2a8, tip: 0xfff1cf },
  shape: { height: 1.72, capstone: 0.8 },        // height against a base corner 1 away; where the Capstone's seam sits (share of the height)
  turnSeconds: 40,                                // one full turn when left alone
  glass: { clarity: 0.13, tint: 0.016, bend: 1.3, rainbow: 0.6 }, // sheen at the edges, body tint, refraction, colour split
  edgeWidth: 0.0075,                              // the glowing edges
  glow: 0.5,                                      // the bloom over everything bright
  flowSpeed: 0.12,                                // the little lights from the corners to the heart and up (loops per second)
  synergyEvery: 6.4,                              // seconds between the three lights meeting and hitting the Capstone
  chargeSeconds: 1.6,                             // how long a press-and-hold takes to charge fully
  symbolSeconds: 0.45,                            // how fast a corner's symbol draws in when pointed at
};
const COL = [LOOK.colors.callers, LOOK.colors.bots, LOOK.colors.scripts].map(c => new THREE.Color(c)); // callers, bots, chart scripts
const GOLD = new THREE.Color(LOOK.colors.capstone), TIPC = new THREE.Color(LOOK.colors.tip);
const R = 1, HT = LOOK.shape.height; // base corner radius and height, in world units
let sheen = null;
const SEAM = LOOK.shape.capstone; // the Capstone's gold seam, as a share of the height
const BASE = (2 * Math.PI) / LOOK.turnSeconds;

// a round soft light, for glows (drawn on a canvas once)
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,.55)"); r.addColorStop(0.45, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// the floor under the pyramid: a soft pool of blue light that fades out with no edge (owner: no circles)
function floorTex() {
  const N = 1024, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), m = N / 2;
  g.fillStyle = "#000"; g.fillRect(0, 0, N, N);
  const pool = g.createRadialGradient(m, m, 0, m, m, m * 0.9);
  pool.addColorStop(0, "rgba(77,163,255,.34)"); pool.addColorStop(0.45, "rgba(60,120,210,.12)"); pool.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = pool; g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// a glowing line between two points: a thin tube whose colour runs from one end's to the other's (k > 1 blooms)
function tube(A, B, ca, cb, r, k = 1, fadeB = false, over = false) {
  const d = new THREE.Vector3().subVectors(B, A), len = d.length();
  const geo = new THREE.CylinderGeometry(r, r, len, 8, 12, true), pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const f = Math.min(1, Math.max(0, pos.getY(i) / len + 0.5)), c = ca.clone().lerp(cb, f).multiplyScalar(k * (fadeB ? (1 - f) ** 1.6 : 1));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: over, depthWrite: !over }));
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
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
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
      const tint = f[2] === 3 ? COL[f[0]].clone().lerp(COL[f[1]], 0.5).lerp(new THREE.Color(1, 1, 1), 0.4) : new THREE.Color(0.85, 0.9, 1);
      for (const n of f) { pos.push(V[n].x, V[n].y, V[n].z); col.push(tint.r, tint.g, tint.b); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const glass = new THREE.MeshPhysicalMaterial({
      vertexColors: true, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.35, ior: LOOK.glass.bend, dispersion: LOOK.glass.rainbow, depthWrite: false,
      specularIntensity: 1, envMapIntensity: 1.3, clearcoat: 1, clearcoatRoughness: 0.05, attenuationColor: new THREE.Color(0.75, 0.82, 1), attenuationDistance: 3,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    turn.add(new THREE.Mesh(geo, glass));
    // the sheen: each face glows faintly in its tint, more as it turns edge-on to us, and a soft band of light
    // sweeps up the glass every few seconds; brighter toward the base, back faces fainter
    sheen = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uF: { value: 0 } }, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `varying vec3 vC; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ vC = color; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = position.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uT; uniform float uF; varying vec3 vC; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ float d = dot(normalize(vN), vV); float front = gl_FrontFacing ? 1.0 : 0.45;
          float fres = pow(1.0 - abs(d), 2.0); float lift = mix(1.0, 0.45, clamp(vY / ${HT.toFixed(2)}, 0.0, 1.0));
          float band = exp(-pow((vY - mod(uT * 0.42, 3.4) + 0.6) * 5.0, 2.0));
          vec3 c = vC * (${LOOK.glass.tint.toFixed(4)} + ${LOOK.glass.clarity.toFixed(4)} * fres) * lift + mix(vC, vec3(1.0), 0.35) * band * 0.06;
          gl_FragColor = vec4(c * front * uF, 1.0); }`,
    });
    turn.add(new THREE.Mesh(geo, sheen));
  }
  // the edges: base corner to corner, each corner up to the tip
  const EDGE = LOOK.edgeWidth, edges = [];
  const edge = (A, B, ca, cb, r, k, at, dur) => { const m = tube(A, B, ca, cb, r, k, false, true); Object.assign(m.userData, { mid: A.clone().add(B).multiplyScalar(0.5), A: A.clone(), d: B.clone().sub(A), at, dur }); edges.push(m); turn.add(m); };
  // on arrival the base triangle draws itself corner to corner, then each corner's edge climbs to the tip
  [[0, 1], [1, 2], [2, 0]].forEach(([i, j], n) => edge(V[i], V[j], COL[i], COL[j], EDGE, 1.25, 0.15 + n * 0.22, 0.6));
  for (let k = 0; k < 3; k++) edge(V[k], tip, COL[k], TIPC, EDGE, 1.25, 0.95 + k * 0.12, 0.75);
  // the Capstone's seam: a fine gold triangle round the glass near the tip
  const seam = V.slice(0, 3).map(c => c.clone().lerp(tip, SEAM));
  for (let k = 0; k < 3; k++) edge(seam[k], seam[(k + 1) % 3], GOLD, GOLD, EDGE * 0.6, 1.1, 1.85 + k * 0.08, 0.35);
  // the Capstone itself (owner, 2026-10-20: "the capstone symbol is the actual top of the triangle"): the tip above
  // the seam is a crystal of gold light. It glows brighter toward its point, lights up when pointed at, and flares
  // when the three streams of light hit it together (the synergy). It's the way into the Capstone.
  const capC = seam.reduce((a, c) => a.add(c), tip.clone()).multiplyScalar(0.25);
  const capMat = new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: 0 }, uF: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = position.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uGlow; uniform float uF; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float fres = pow(1.0 - abs(dot(normalize(vN), vV)), 1.6); float up = smoothstep(${(HT * SEAM).toFixed(3)}, ${HT.toFixed(3)}, vY);
        float front = gl_FrontFacing ? 1.0 : 0.6;
        vec3 gold = vec3(1.0, 0.78, 0.42), white = vec3(1.0, 0.96, 0.86);
        vec3 c = mix(gold, white, up * 0.7 + uGlow * 0.3) * (0.07 + 0.22 * fres + 0.25 * up) * (1.0 + 2.6 * uGlow);
        gl_FragColor = vec4(c * front * uF, 1.0); }`,
  });
  {
    const pos = [], faces = [[0, 1], [1, 2], [2, 0]];
    for (const [i, j] of faces) pos.push(...seam[i].toArray(), ...seam[j].toArray(), ...tip.toArray());
    pos.push(...seam[0].toArray(), ...seam[2].toArray(), ...seam[1].toArray());
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    const cap = new THREE.Mesh(geo, capMat); cap.scale.setScalar(1.004); turn.add(cap);
  }

  // the gems at the corners and the tip, each with a soft glow
  const sprite = (c, s, o = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false })); m.scale.setScalar(s); return m; };
  const gems = V.map((p, k) => {
    const c = k === 3 ? TIPC : COL[k];
    const g = new THREE.Group(); g.position.copy(p);
    const stone = new THREE.Mesh(new THREE.OctahedronGeometry(k === 3 ? 0.05 : 0.042), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.5), toneMapped: false, transparent: true }));
    const halo = sprite(c, k === 3 ? 0.34 : 0.3, 0.5);
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
  const beam = tube(new THREE.Vector3(0, HEART, 0), tip, new THREE.Color(0xbfe0ff), TIPC, 0.005, 1.5); rig.add(beam);
  const beamUp = tube(tip, new THREE.Vector3(0, HT + 0.5, 0), TIPC, TIPC, 0.0045, 1.3, true);
  beamUp.material.transparent = true; beamUp.material.blending = THREE.AdditiveBlending; beamUp.material.depthWrite = false;
  rig.add(beamUp);
  // the floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), new THREE.MeshBasicMaterial({ map: floorTex(), toneMapped: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.006; rig.add(floor);

  // the light flow (owner, 2026-10-20: "dots of light go in from the corners toward the centre of the base and out
  // the top like the Luxor light"): small lights run from each corner across the floor to the heart, rise up the
  // beam through the Capstone and out into the sky. Every few seconds the synergy: one big light from each corner,
  // all three meeting at the heart at once, merge into one that rises and hits the Capstone, which flares; the
  // beam above surges. A click on the glass sets one off now.
  const BC = new THREE.Vector3(0, 0.02, 0), cornerF = corner.map(c => c.clone().setY(0.02));
  function along(k, u, out) { // a point on corner k's path: floor (0..0.42), up the beam (..0.8), out the top (..1)
    if (u < 0.42) { const f = u / 0.42; return out.copy(cornerF[k]).lerp(BC, f * f * (3 - 2 * f)); }
    if (u < 0.8) { const f = (u - 0.42) / 0.38; return out.set(0, 0.02 + (HT - 0.02) * f ** 1.25, 0); }
    return out.set(0, HT + ((u - 0.8) / 0.2) * 0.75, 0);
  }
  const flow = [];
  for (let k = 0; k < 3; k++) for (let n = 0; n < 3; n++) { const s = sprite(COL[k], 0.1, 0.6); turn.add(s); flow.push({ s, k, off: n / 3 + k * 0.137 + Math.random() * 0.05 }); }
  const SYN = LOOK.synergyEvery; let synAt = 3.4; // when the next synergy starts
  const big = [0, 1, 2].map(k => { const s = sprite(COL[k], 0.26, 1); s.visible = false; turn.add(s); return s; });
  // the charge (owner, 2026-10-20: "hold the mouse down and it charges up the centre; let go and it shoots a pulse up
  // and out"): while held, the heart swells and brightens, the rings spin up, the lights rush in from the corners and
  // the pyramid trembles; on release a bolt shoots up the beam, hits the Capstone and blasts out of the top, bigger
  // the longer it was held (full after about 1.6 s)
  let charging = false, charge = 0, chargeAt = 0, ringT = 0, flowT = 0, shot = null;
  const bolt = sprite(new THREE.Color(1, 0.97, 0.9), 0.5, 1), boltSky = sprite(TIPC, 0.5, 0); bolt.visible = boltSky.visible = false;
  turn.add(bolt, boltSky);
  const fire = p => { shot = { t: clock, p: Math.max(0.25, p) }; };
  const merged = sprite(TIPC, 0.34, 1), flare = sprite(GOLD, 1, 0), sky = sprite(TIPC, 0.3, 0), heartFlash = sprite(new THREE.Color(1, 1, 1), 0.5, 0);
  merged.visible = false; heartFlash.position.set(0, 0.03, 0); turn.add(merged, flare, sky, heartFlash);
  flare.position.copy(capC); let surge = 0, capHot = 0;
  const pulse = () => { if (clock > 2.4) synAt = Math.min(synAt, clock); };

  // ---------- post: a gentle bloom so the gems, edges and beam glow without blowing out
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), LOOK.glow, 0.5, 0.8);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  // ---------- placing it: the pyramid's middle sits where the 2D one did (stageAt), about the same size
  let W = 1, H = 1, st = { x: 0, y: 0, s: 1 }, camDist = 10;
  const AIM = new THREE.Vector3(0, HT * 0.42, 0), ELEV = 0.3; // where the camera looks
  function size() {
    W = hero.clientWidth; H = hero.clientHeight; st = stageAt(W, H);
    renderer.setSize(W, H, false); composer.setSize(W, H);
    bloom.resolution.set(Math.round(W / 2), Math.round(H / 2));
    const px = (st.s * 0.78) / (HT + 0.5); // pixels per world unit: the pyramid about 0.78 s tall with its floor
    const dist = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * px);
    camera.position.set(0, AIM.y + Math.sin(ELEV) * dist, Math.cos(ELEV) * dist); camera.lookAt(AIM); camDist = dist;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, W / 2 - st.x, H / 2 - st.y, W, H);
    camera.updateProjectionMatrix();
    labels.width = W * dpr; labels.height = H * dpr; lg.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const lg = labels.getContext("2d");

  // ---------- motion and the ways in (as in the 2D version)
  const SIG = window.D3Sigils, KIND = SIG ? SIG.kinds : [], NAMES = KIND.map(k => SIG.S[k].name);
  let sym = [], shown = [0, 0, 0, 0]; // where each symbol sits on screen, and how far each is drawn in (0..1)
  let theta = 0.35, omega = 0, tiltX = 0, tiltY = 0, mx = -1e4, my = -1e4, drag = null, fast = false, hot = -1;
  let clock = 0, last = performance.now(), running = true, seen = true, raf = 0, scr = [];
  const tmp = new THREE.Vector3();
  const project = p => { tmp.copy(p).applyMatrix4(turn.matrixWorld).project(camera); return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H }; };
  const onIt = (x, y) => Math.hypot(x - st.x, y - st.y) < st.s * 0.48;
  // the corner (or its symbol) under a point, generous enough to catch while it turns
  const cornerAt = (x, y) => { let best = -1, bd = st.s * 0.09; [...scr, ...sym.map((P, k) => (shown[k] > 0.3 || k === 3 ? P : null))].forEach((A, n) => { if (!A) return; const d = Math.hypot(x - A.x, y - A.y); if (d < bd) { bd = d; best = n % 4; } }); return best; };
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
    // the arrival (the loading story): the base triangle draws itself, its edges climb to the tip, the glass fills
    // in and the Cortex rises at the heart, while the whole turns into place
    const io = Math.min(1, clock / 2.4), e = 1 - (1 - io) ** 3, ss = (a, b) => { const x = Math.min(1, Math.max(0, (clock - a) / b)); return x * x * (3 - 2 * x); };
    turn.rotation.y = -(theta + tiltX) + (1 - e) * 0.7;
    rig.rotation.x = tiltY * 0.9; rig.position.y = -(1 - e) * 0.1;
    if (clock < 3) {
      for (const m of edges) { const { A, d, at, dur } = m.userData, g = Math.max(1e-3, ss(at, dur)); m.scale.y = g; m.position.copy(A).addScaledVector(d, g / 2); m.visible = g > 2e-3; }
      gems.forEach((G, k) => G.g.scale.setScalar(k < 3 ? ss(0.1 + k * 0.22, 0.4) : ss(1.6, 0.4)));
      cortex.scale.setScalar(Math.max(1e-3, ss(1.3, 0.9))); beam.scale.y = Math.max(1e-3, ss(1.7, 0.5)); beam.position.y = HEART + (HT - HEART) * beam.scale.y / 2;
      beamUp.visible = clock > 2.1; flow.forEach(f => (f.s.visible = clock > 2.2));
    }
    sheen.uniforms.uF.value = ss(1.2, 1.2);
    floor.rotation.z = clock * 0.03; sheen.uniforms.uT.value = clock;
    // the Cortex's rings and heart
    charge = charging ? Math.min(1, charge + dt / LOOK.chargeSeconds) : Math.max(0, charge - dt * 3);
    const sp = (fast ? 2.6 : 1) * (1 + 5 * charge * charge), T = Math.PI * 2; ringT += dt * sp;
    rings[0].tumble.rotation.x = (ringT / 14) * T; rings[0].spin.rotation.z = (ringT / 30) * T;
    rings[1].tumble.rotation.y = (ringT / 11) * T; rings[1].spin.rotation.z = -(ringT / 16) * T;
    rings[2].tumble.rotation.x = -(ringT / 8) * T; rings[2].spin.rotation.z = (ringT / 10) * T;
    const beat = 0.5 + 0.5 * Math.sin((clock / 2.4) * T);
    heart.scale.setScalar(1 + beat * 0.25); heartGlow.material.opacity = 0.55 + beat * 0.4;
    // the gems breathe; the one under the pointer swells
    gems.forEach((G, k) => { const on = k === hot, s = G.base * (on ? 1.9 : 1 + 0.08 * Math.sin(clock * 2 + k * 2)); G.halo.scale.x += (s - G.halo.scale.x) * 0.15; G.halo.scale.y = G.halo.scale.x; G.stone.rotation.y = clock * 0.8 + k; });
    // the light flow
    flowT += dt * LOOK.flowSpeed * (1 + 4 * charge);
    for (const f of flow) { const u = (flowT + f.off) % 1; along(f.k, u, f.s.position); f.s.material.color.copy(COL[f.k]).lerp(TIPC, Math.max(0, (u - 0.42) / 0.4)); f.s.material.opacity = 0.65 * Math.min(1, u * 12) * (u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1); }
    // the synergy: 0..1 s the three run in to the heart; 1..1.7 s the merged light rises; at 1.7 s it hits the Capstone
    if (clock >= synAt + SYN) synAt += SYN * Math.ceil((clock - synAt - SYN) / SYN + 1e-9);
    const tau = clock - synAt;
    big.forEach((b, k) => { b.visible = tau >= 0 && tau < 1; if (b.visible) { along(k, (tau / 1) * 0.42, b.position); b.material.opacity = Math.min(1, tau * 5); } });
    merged.visible = tau >= 1 && tau < 1.7;
    if (merged.visible) { const f = (tau - 1) / 0.7; merged.position.set(0, 0.02 + (HT * SEAM - 0.02) * f * f, 0); merged.material.opacity = 1; merged.scale.setScalar(0.34 + 0.1 * f); }
    heartFlash.material.opacity = tau >= 1 && tau < 1.5 ? 1 - (tau - 1) / 0.5 : 0; heartFlash.scale.setScalar(0.5 + (tau - 1) * 1.4);
    if (tau >= 1.7 && tau - dt < 1.7) surge = 1; // the hit
    surge = Math.max(0, surge - dt * 0.9);
    flare.material.opacity = 0.85 * surge ** 1.5; flare.scale.setScalar(0.4 + (1 - surge) * 0.75);
    sky.visible = surge > 0; sky.position.set(0, HT + (1 - surge) * 1.6, 0); sky.material.opacity = surge; sky.scale.setScalar(0.24 + 0.2 * surge);
    beamUp.scale.set(1 + 3 * surge, 1, 1 + 3 * surge); bloom.strength = LOOK.glow + 0.55 * surge;
    capHot += ((hot === 3 ? 0.7 : 0) - capHot) * 0.12;
    capMat.uniforms.uGlow.value = Math.max(surge, capHot); capMat.uniforms.uF.value = ss(1.8, 0.6);
    heart.scale.multiplyScalar(1 + surge * 0.4);
    // the charge, and the shot when it's let go
    if (charge > 0) {
      heart.scale.multiplyScalar(1 + 1.2 * charge); heartGlow.scale.setScalar(0.55 * (1 + 1.5 * charge)); heartGlow.material.opacity = Math.min(1, heartGlow.material.opacity + charge);
      beam.scale.x = beam.scale.z = 1 + 2 * charge; bloom.strength += 0.3 * charge;
      capMat.uniforms.uGlow.value = Math.max(capMat.uniforms.uGlow.value, 0.35 * charge);
      const q = 0.012 * charge * charge; rig.position.x = (Math.random() - 0.5) * q; rig.position.z = (Math.random() - 0.5) * q;
    } else { heartGlow.scale.setScalar(0.55); rig.position.x = rig.position.z = 0; }
    if (shot) {
      const e2 = clock - shot.t, P = shot.p, rise = 0.32;
      bolt.visible = e2 < rise;
      if (bolt.visible) { const f = e2 / rise; bolt.position.set(0, HEART + (HT - HEART) * f * f, 0); bolt.scale.setScalar(0.4 + 0.5 * P); }
      if (e2 >= rise && e2 - dt < rise) { surge = Math.max(surge, 0.7 + 0.3 * P); heartFlash.material.opacity = 0; }
      if (e2 < 0.25) { heartFlash.material.opacity = Math.max(heartFlash.material.opacity, 1 - e2 / 0.25); heartFlash.scale.setScalar(0.6 + 1.6 * P * (e2 / 0.25)); }
      const out = (e2 - rise) / (0.6 + 0.5 * P); boltSky.visible = out >= 0 && out < 1;
      if (boltSky.visible) { boltSky.position.set(0, HT + (1 - (1 - out) ** 2) * (1.2 + 2.2 * P), 0); boltSky.material.opacity = 1 - out; boltSky.scale.setScalar((0.35 + 0.5 * P) * (1 - 0.5 * out)); }
      beamUp.scale.set(1 + 6 * P * Math.max(0, 1 - Math.abs(out - 0.15) * 2), 1 + 0.8 * P * Math.max(0, 1 - out), 1 + 6 * P * Math.max(0, 1 - Math.abs(out - 0.15) * 2));
      flare.material.opacity = Math.min(1, flare.material.opacity * (1 + P)); flare.scale.multiplyScalar(1 + 0.6 * P);
      if (out >= 1) { shot = null; bolt.visible = boltSky.visible = false; }
    }
    // the edges at the back read dimmer, as if seen through the glass
    rig.updateMatrixWorld();
    for (const m of edges) { tmp.copy(m.userData.mid).applyMatrix4(turn.matrixWorld).applyMatrix4(camera.matrixWorldInverse); m.material.opacity = THREE.MathUtils.clamp(0.95 + (tmp.z + camDist) * 0.9, 0.35, 1); }
    canvas.style.opacity = String(Math.min(1, clock / 0.4));
    composer.render(dt);

    // the symbols: each corner's own (js/sigils.js), floating just outside it with a hairline back to its gem.
    // They draw themselves in turn on arrival and stay; the one under the pointer lights up and names itself
    rig.updateMatrixWorld(); scr = V.map(project);
    lg.clearRect(0, 0, W, H);
    if (SIG) {
      const bx = (scr[0].x + scr[1].x + scr[2].x) / 3, by = (scr[0].y + scr[1].y + scr[2].y) / 3, size = Math.max(40, st.s * 0.1), off = st.s * 0.15;
      sym = scr.map((A, k) => {
        if (k === 3) return project(capC);
        let dx = A.x - bx, dy = A.y - by; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        return { x: Math.min(W - size * 0.7, Math.max(size * 0.7, A.x + dx * off)), y: A.y + dy * off * 0.8 + off * 0.12 };
      });
      for (let k = 0; k < 4; k++) {
        const A = scr[k], P = sym[k], on = k === hot, c = SIG.S[KIND[k]].color;
        shown[k] = Math.max(0, Math.min(1, shown[k] + (on ? dt / LOOK.symbolSeconds : -dt / 0.25))); const t = shown[k]; // only while pointed at (owner: keep it clean)
        if (!t || k === 3) continue; // the Capstone is the crystal tip itself
        const a = Math.min(1, t * 1.6);
        // the hairline from the gem to the symbol
        const hx = P.x - A.x, hy = P.y - A.y, hl = Math.hypot(hx, hy) || 1, g0 = st.s * 0.035, g1 = hl - size * 0.62;
        if (g1 > g0) { lg.save(); lg.globalAlpha = 0.5 * t; lg.strokeStyle = c; lg.lineWidth = 1; lg.setLineDash([2, 4]); lg.beginPath(); lg.moveTo(A.x + (hx / hl) * g0, A.y + (hy / hl) * g0); lg.lineTo(A.x + (hx / hl) * (g0 + (g1 - g0) * t), A.y + (hy / hl) * (g0 + (g1 - g0) * t)); lg.stroke(); lg.restore(); }
        SIG.draw(lg, KIND[k], P.x, P.y, size, { t, a, lit: 0.6 });
        if (t > 0.6) { // its name, small, under it
          lg.save(); lg.globalAlpha = (t - 0.6) / 0.4; lg.font = '500 10px "IBM Plex Mono", monospace'; lg.letterSpacing = "2px"; lg.fillStyle = c; lg.textAlign = "center"; lg.textBaseline = "top";
          lg.shadowColor = "rgba(0,0,0,.9)"; lg.shadowBlur = 6; lg.fillText(NAMES[k].toUpperCase(), P.x, P.y + size * 0.72); lg.restore();
        }
      }
    }
    if (SIG && hot === 3 && sym[3]) { // pointing at the crystal tip: its name beside it
      const P = sym[3]; lg.save(); lg.font = '500 10px "IBM Plex Mono", monospace'; lg.letterSpacing = "2px"; lg.fillStyle = SIG.S.capstone.color;
      lg.textBaseline = "middle"; lg.shadowColor = "rgba(0,0,0,.9)"; lg.shadowBlur = 6; lg.fillText("CAPSTONE", P.x + st.s * 0.07, P.y); lg.restore();
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
    if (e.button > 0 || e.target.closest("a,button,input,textarea")) return;
    if (k < 0 && (onIt(x, y) || !e.target.closest(".n-hero-in"))) { charging = true; chargeAt = clock; }
    if (k < 0 && !onIt(x, y)) return;
    drag = { x: e.clientX, t: e.timeStamp, moved: 0, k };
  };
  const onUp = e => {
    const held = charging ? clock - chargeAt : 0, power = charge; charging = false;
    if (!drag) { if (held > 0.25) fire(power); return; }
    if (drag.moved < 6 && drag.k >= 0) { const k = drag.k, r = hero.getBoundingClientRect(), P = sym[k] || scr[k]; drag = null; omega = BASE; onGo(k, e, P ? { x: r.left + P.x, y: r.top + P.y } : { x: e.clientX, y: e.clientY }); return; }
    if (held > 0.25) fire(power); else if (drag.moved < 6) pulse();
    omega = Math.max(-6, Math.min(6, omega)); drag = null;
  };
  const onLeave = () => { mx = my = -1e4; hot = -1; fast = false; };
  const onCancel = () => { charging = false; drag = null; }; // a scroll or a lost pointer ends the charge without a shot
  const io2 = new IntersectionObserver(([en]) => { seen = en.isIntersecting; wake(); });
  addEventListener("pointermove", onMove, { passive: true }); hero.addEventListener("pointerdown", onDown); addEventListener("pointerup", onUp); addEventListener("pointercancel", onCancel);
  document.documentElement.addEventListener("pointerleave", onLeave);
  addEventListener("resize", size); document.addEventListener("visibilitychange", wake); io2.observe(hero);

  { const m = /[?&]t=([\d.]+)/.exec(location.search); if (m) clock = +m[1]; } // testing: start partway in
  size(); raf = requestAnimationFrame(frame);
  if (/[?&]fps\b/.test(location.search)) window.__prism = { get clock() { return clock; }, get charge() { return charge; }, set charge(v) { charge = v; charging = v > 0; }, fire: p => { charging = false; charge = 0; fire(p); }, get sym() { return sym; }, corner: k => scr[k], get opacity() { return canvas.style.opacity; }, renderer, scene, camera, composer, rig };

  return {
    // average frame time over the first frames, so next.js can fall back to 2D on slow devices
    fps() { if (frames.length < 60) return null; const s = frames.slice(15); return s.length / s.reduce((a, b) => a + b, 0); },
    stop() {
      running = false; cancelAnimationFrame(raf); io2.disconnect();
      removeEventListener("pointermove", onMove); hero.removeEventListener("pointerdown", onDown); removeEventListener("pointerup", onUp); removeEventListener("pointercancel", onCancel);
      document.documentElement.removeEventListener("pointerleave", onLeave); removeEventListener("resize", size);
      lg.clearRect(0, 0, W, H); hero.style.cursor = "";
      scene.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      composer.dispose(); pmrem.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
