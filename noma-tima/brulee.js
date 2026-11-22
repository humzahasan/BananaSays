// Interactive crème brûlée: drag to torch the sugar, tap the golden crust to crack it.
import * as THREE from "three";
import {
  rng, makeNoise, smoothstep, canvas, stadiumShape, stadiumSD, ringStrip, studioEnvironment,
  foilNormalMap, stoneTextures, boardGeometry, blobShadowTexture, vanillaPodGeometry, flower,
  flameMaterial, radialTexture, smokeTexture,
} from "./brulee-assets.js";

const stage = document.getElementById("stage");
const statusEl = document.getElementById("status");
const meterFill = document.getElementById("meter-fill");
const resetBtn = document.getElementById("reset");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = Math.min(innerWidth, innerHeight) < 600 || matchMedia("(pointer: coarse)").matches;

const TEXT = {
  idle: "Drag across the custard to torch it.",
  going: "Keep going. It turns amber, then gold.",
  pct: (p) => `Keep going. ${p}% torched.`,
  golden: "Golden. Tap to crack it.",
  cracked: "That’s the sound. Order one for real.",
  fail: "A sugar crust, torched to order and cracked with a spoon.",
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  statusEl.textContent = TEXT.fail;
  throw e;
}
const MAX_DPR = small ? 1.5 : 1.75;
let pixelRatio = Math.min(devicePixelRatio || 1, MAX_DPR);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  stage.classList.remove("ready");
  statusEl.textContent = TEXT.fail;
});

const rand = rng(20251122);
const noise = makeNoise(rand);
const scene = new THREE.Scene();
scene.environment = studioEnvironment(renderer);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
const REST_POS = new THREE.Vector3(0, 5.4, 4.6), REST_AIM = new THREE.Vector3(0, 0.1, 0);
const INTRO_POS = new THREE.Vector3(1.7, 0.95, 2.6), INTRO_AIM = new THREE.Vector3(0.15, 0.3, 0);
let fit = 1;

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xfff1d6, 0x8a2016, 0.45));
const sun = new THREE.DirectionalLight(0xfff0da, 2.0);
sun.position.set(-3, 6, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.01;
scene.add(sun);
const glint = new THREE.DirectionalLight(0xfff4e0, 0); // sweeps across the crust when it turns golden
scene.add(glint);
const torchLight = new THREE.PointLight(0xff8a2a, 0, 2.2, 2);
scene.add(torchLight);

// ---------- Foil tray ----------
const TRAY_W = 3.1, TRAY_H = 1.2, WALL = 0.42;
const TS = TRAY_W / 2 - TRAY_H / 2, TR = TRAY_H / 2; // stadium straight half-length and end radius
const tray = new THREE.Group();
scene.add(tray);

const foil = new THREE.MeshStandardMaterial({
  color: 0xe4e4e8, metalness: 1, roughness: 0.27, side: THREE.DoubleSide,
  normalMap: foilNormalMap(rand, small ? 256 : 512), normalScale: new THREE.Vector2(0.55, 0.55),
});
// One continuous shell: flared pleated wall, flat flange, rolled bead.
const shellRows = [];
for (let i = 0; i <= 6; i++) {
  const t = i / 6;
  shellRows.push({ off: -0.14 * (1 - t) - 0.012 * Math.sin(Math.PI * t), y: WALL * t, pleat: 0.007 + 0.009 * t });
}
shellRows.push({ off: 0.025, y: WALL + 0.007, pleat: 0.008 });
shellRows.push({ off: 0.07, y: WALL + 0.009, pleat: 0.006 });
shellRows.push({ off: 0.1, y: WALL + 0.006, pleat: 0.004 });
for (let i = 0; i <= 8; i++) { // bead rolled under the flange edge
  const a = Math.PI / 2 - (i / 8) * Math.PI * 1.4;
  shellRows.push({ off: 0.112 + 0.016 * Math.cos(a), y: WALL - 0.009 + 0.016 * Math.sin(a), pleat: 0.003 });
}
const shell = new THREE.Mesh(
  ringStrip({ s: TS, r: TR, rows: shellRows, segs: small ? 420 : 640, pleats: 150, rand, uvScale: 0.5, seamU: 0.5 + 0.11 }),
  foil
);
shell.castShadow = true; shell.receiveShadow = true;
tray.add(shell);
const base = new THREE.Mesh(new THREE.ShapeGeometry(stadiumShape(TRAY_W - 0.28, TRAY_H - 0.28), 32), foil);
base.rotation.x = -Math.PI / 2;
base.position.y = 0.004;
tray.add(base);

// ---------- The sugar top ----------
const TOP_W = TRAY_W - 0.03, TOP_H = TRAY_H - 0.03, TOP_Y = WALL - 0.05;
const SS = TOP_W / 2 - TOP_H / 2, SR = TOP_H / 2;
// Custard surface height: a soft dome plus a meniscus where it meets the foil.
function surfaceY(x, z) {
  const d = Math.max(0, -stadiumSD(x, z, SS, SR));
  return TOP_Y + 0.024 * smoothstep(0, SR, d) + 0.012 * Math.exp(-d / 0.014);
}
const topRows = [];
for (let i = 0; i <= 22; i++) {
  const d = SR * Math.pow(i / 22, 1.6);
  topRows.push({ off: -d, y: 0 });
}
const topGeo = ringStrip({ s: SS, r: SR, rows: topRows, segs: small ? 160 : 224, seamU: 0.5 + 0.11 });
{
  const p = topGeo.attributes.position, uv = topGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, surfaceY(x, z));
    uv.setXY(i, x / TOP_W + 0.5, z / TOP_H + 0.5);
  }
  topGeo.computeVertexNormals();
}

// Heat grid drives colour, gloss and texture.
const GW = small ? 224 : 320, GH = Math.round((GW * TOP_H) / TOP_W);
const heat = new Float32Array(GW * GH);
const grain = new Float32Array(GW * GH), patch = new Float32Array(GW * GH), speck = new Float32Array(GW * GH);
for (let i = 0; i < grain.length; i++) grain[i] = rand() * 2 - 1;
for (let pass = 0; pass < 2; pass++)
  for (let y = 1; y < GH - 1; y++)
    for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      grain[i] = grain[i] * 0.5 + (grain[i - 1] + grain[i + 1] + grain[i - GW] + grain[i + GW]) * 0.125;
    }
for (let y = 0; y < GH; y++)
  for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    patch[i] = (noise(x / 26, y / 26) * 0.65 + noise(x / 9 + 40, y / 9) * 0.35) * 2 - 1;
    speck[i] = rand();
  }
const inside = new Uint8Array(GW * GH);
let insideCount = 0;
for (let y = 0; y < GH; y++)
  for (let x = 0; x < GW; x++) {
    const px = ((x + 0.5) / GW - 0.5) * TOP_W, pz = ((y + 0.5) / GH - 0.5) * TOP_H;
    if (stadiumSD(px, pz, SS, SR) < -0.03) { inside[y * GW + x] = 1; insideCount++; }
  }

const TEX_W = small ? 768 : 1024, TEX_H = Math.round((TEX_W * TOP_H) / TOP_W);
const PX = TEX_W / TOP_W; // texture pixels per world unit
const gridCanvas = canvas(GW, GH), gctx = gridCanvas.getContext("2d");
const gridImg = gctx.createImageData(GW, GH);
const maskCanvas = canvas(GW, GH), mctx = maskCanvas.getContext("2d");
const maskImg = mctx.createImageData(GW, GH);
const texCanvas = canvas(TEX_W, TEX_H), tctx = texCanvas.getContext("2d");
const bumpCanvas = canvas(TEX_W, TEX_H), bctx = bumpCanvas.getContext("2d");
const tmpCanvas = canvas(TEX_W, TEX_H), tmpctx = tmpCanvas.getContext("2d");
const crackCanvas = canvas(TEX_W, TEX_H), cctx = crackCanvas.getContext("2d");
const crackBump = canvas(TEX_W, TEX_H), cbctx = crackBump.getContext("2d");
const pockCanvas = canvas(TEX_W, TEX_H), pctx = pockCanvas.getContext("2d");

// Static bump layers: loose sugar granules, and smooth set caramel with blisters.
const granule = canvas(TEX_W, TEX_H);
{
  const g = granule.getContext("2d");
  g.fillStyle = "#7a7a7a"; g.fillRect(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < TEX_W * 9; i++) {
    const v = rand() > 0.3 ? 170 + rand() * 85 : 40 + rand() * 50;
    g.fillStyle = `rgba(${v},${v},${v},0.85)`;
    const s = 0.8 + rand() * 1.8;
    g.fillRect(rand() * TEX_W, rand() * TEX_H, s, s);
  }
}
const caramelBump = canvas(TEX_W, TEX_H);
{
  const g = caramelBump.getContext("2d");
  g.fillStyle = "#808080"; g.fillRect(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < 70; i++) {
    const x = rand() * TEX_W, y = rand() * TEX_H, r = 20 + rand() * 90, v = rand() > 0.5 ? 255 : 0;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.12)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < TEX_W * 0.25; i++) { // tiny set blisters
    const x = rand() * TEX_W, y = rand() * TEX_H, r = 1.5 + rand() ** 2 * 5;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,0.5)"); gr.addColorStop(0.7, "rgba(255,255,255,0.12)"); gr.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

const colorTex = new THREE.CanvasTexture(texCanvas);
colorTex.colorSpace = THREE.SRGBColorSpace;
colorTex.flipY = false;
colorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const bumpTex = new THREE.CanvasTexture(bumpCanvas);
bumpTex.flipY = false;
const pbrData = new Uint8Array(GW * GH * 4);
const pbrTex = new THREE.DataTexture(pbrData, GW, GH); // R = clearcoat, G = roughness
pbrTex.magFilter = pbrTex.minFilter = THREE.LinearFilter;

// Custard → golden → amber → burnt sugar.
const RAMP = [
  [0.0, [246, 226, 160]],
  [0.18, [242, 210, 128]],
  [0.38, [232, 170, 68]],
  [0.62, [200, 118, 34]],
  [0.9, [140, 64, 16]],
  [1.3, [58, 24, 7]],
];
function ramp(h, out) {
  if (h <= 0) { out[0] = RAMP[0][1][0]; out[1] = RAMP[0][1][1]; out[2] = RAMP[0][1][2]; return; }
  for (let i = 1; i < RAMP.length; i++) {
    if (h <= RAMP[i][0]) {
      const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (h - a) / (b - a);
      out[0] = ca[0] + (cb[0] - ca[0]) * t; out[1] = ca[1] + (cb[1] - ca[1]) * t; out[2] = ca[2] + (cb[2] - ca[2]) * t;
      return;
    }
  }
  const l = RAMP[RAMP.length - 1][1];
  out[0] = l[0]; out[1] = l[1]; out[2] = l[2];
}

// Bubbles that boil up under the flame and pop, leaving pock marks.
const bubbles = [];
function drawBubbles(ctx, forBump) {
  for (const b of bubbles) {
    const k = b.age / b.life, r = b.r * (0.4 + 0.6 * Math.min(1, k * 2.2));
    const a = Math.min(1, (1 - k) * 4);
    if (forBump) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.8 * a})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.35, r * 0.05, b.x, b.y, r);
      g.addColorStop(0, `rgba(255,246,220,${0.85 * a})`);
      g.addColorStop(0.35, `rgba(255,190,90,${0.25 * a})`);
      g.addColorStop(0.85, `rgba(120,50,10,${0.35 * a})`);
      g.addColorStop(1, "rgba(120,50,10,0)");
      ctx.fillStyle = g;
    }
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
  }
}
function popBubble(b) {
  const g = pctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.1);
  g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(0.7, "rgba(255,255,255,0.3)"); g.addColorStop(1, "rgba(255,255,255,0)");
  pctx.fillStyle = g; pctx.beginPath(); pctx.arc(b.x, b.y, b.r * 1.1, 0, Math.PI * 2); pctx.fill();
  // Each pop leaves a slightly darker freckle, like a real torched top.
  const gx = Math.round((b.x / TEX_W) * GW), gy = Math.round((b.y / TEX_H) * GH);
  for (let y = gy - 1; y <= gy + 1; y++)
    for (let x = gx - 1; x <= gx + 1; x++)
      if (x >= 0 && y >= 0 && x < GW && y < GH) heat[y * GW + x] = Math.min(1.35, heat[y * GW + x] + 0.05);
}

let dirty = true;
const rgb = [0, 0, 0];
function paintTexture() {
  const d = gridImg.data, m = maskImg.data;
  for (let i = 0; i < GW * GH; i++) {
    const hv = heat[i];
    const h = hv * (1 + 0.4 * grain[i] * 2 + 0.3 * patch[i]);
    ramp(h, rgb);
    let [r, g, b] = rgb;
    if (hv < 0.3 && speck[i] > 0.82) { // raw sugar crystals sparkle before they melt
      const k = (1 - hv / 0.3) * 0.6;
      r += (255 - r) * k; g += (250 - g) * k; b += (236 - b) * k;
    }
    const o = i * 4;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    const melt = smoothstep(0.15, 0.5, h);
    const burnt = smoothstep(0.95, 1.35, h);
    pbrData[o] = 255 * melt * (1 - 0.45 * burnt); // clearcoat grows as the sugar turns to glass
    pbrData[o + 1] = 255 * (0.72 - 0.62 * melt + 0.22 * burnt); // roughness falls
    pbrData[o + 2] = 0; pbrData[o + 3] = 255;
    m[o + 3] = 255 * melt;
  }
  gctx.putImageData(gridImg, 0, 0);
  mctx.putImageData(maskImg, 0, 0);
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(gridCanvas, 0, 0, TEX_W, TEX_H);
  drawBubbles(tctx, false);
  tctx.drawImage(crackCanvas, 0, 0);

  bctx.globalCompositeOperation = "source-over";
  bctx.drawImage(granule, 0, 0);
  tmpctx.globalCompositeOperation = "copy";
  tmpctx.drawImage(caramelBump, 0, 0);
  tmpctx.globalCompositeOperation = "destination-in";
  tmpctx.drawImage(maskCanvas, 0, 0, TEX_W, TEX_H);
  bctx.drawImage(tmpCanvas, 0, 0);
  bctx.drawImage(pockCanvas, 0, 0);
  drawBubbles(bctx, true);
  bctx.drawImage(crackBump, 0, 0);

  colorTex.needsUpdate = true;
  bumpTex.needsUpdate = true;
  pbrTex.needsUpdate = true;
  dirty = false;
}

const sugarMat = new THREE.MeshPhysicalMaterial({
  map: colorTex, roughness: 1, roughnessMap: pbrTex, metalness: 0,
  clearcoat: 1, clearcoatMap: pbrTex, clearcoatRoughness: 0.06,
  bumpMap: bumpTex, bumpScale: 1.2, specularIntensity: 0.9, ior: 1.5,
});
const sugar = new THREE.Mesh(topGeo, sugarMat);
sugar.receiveShadow = true;
tray.add(sugar);

// ---------- Stone board, contact shadows, props ----------
const BOARD_R = 2.0, BOARD_Z = -0.25;
const stone = stoneTextures(rand, small ? 512 : 1024);
const board = new THREE.Mesh(
  boardGeometry(BOARD_R, 0.16),
  new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 0.6, roughness: 0.88, metalness: 0 })
);
board.position.set(0, 0, BOARD_Z);
board.receiveShadow = true; board.castShadow = true;
scene.add(board);

function shadowPlane(tex, w, h, y, opacity, parent, z = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, y, z);
  m.renderOrder = -1;
  parent.add(m);
  return m;
}
// Soft contact shadow hugging the tray, and one under the board on the red.
shadowPlane(blobShadowTexture(256, 128, (g) => {
  const sx = 256 / (TRAY_W + 0.7), sy = 128 / (TRAY_H + 0.7);
  g.save(); g.translate(128, 64); g.scale(sx, sy);
  g.fill(new Path2D(svgStadium(TRAY_W - 0.2, TRAY_H - 0.2))); g.restore();
}, 14, 0.95), TRAY_W + 0.7, TRAY_H + 0.7, 0.002, 0.7, tray);
shadowPlane(blobShadowTexture(256, 256, (g) => { g.beginPath(); g.arc(128, 128, 98, 0, Math.PI * 2); g.fill(); }, 26, 0.9),
  BOARD_R * 2.6, BOARD_R * 2.6, -0.158, 0.45, scene, BOARD_Z + 0.08);
function svgStadium(w, h) {
  const r = h / 2, s = w / 2 - r;
  return `M${-s},${-r} L${s},${-r} A${r},${r} 0 0 1 ${s},${r} L${-s},${r} A${r},${r} 0 0 1 ${-s},${-r} Z`;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.16;
ground.receiveShadow = true;
scene.add(ground);

// Vanilla pods, as in every photo of the real thing.
const podMat = new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35,
  sheen: 0.6, sheenColor: new THREE.Color(0x5a3018), sheenRoughness: 0.5,
});
for (const [x, z, ry, len] of [[0.95, -1.25, 0.42, 1.6], [1.05, -1.1, 0.62, 1.45]]) {
  const pod = new THREE.Mesh(vanillaPodGeometry(rand, len, 0.05), podMat);
  pod.position.set(x, 0, z);
  pod.rotation.y = ry;
  pod.castShadow = true; pod.receiveShadow = true;
  scene.add(pod);
}
const bloom = flower(rand);
bloom.position.set(-1.38, 0.002, 0.78);
bloom.rotation.y = 0.5;
bloom.scale.setScalar(1.1);
scene.add(bloom);

// ---------- Sugar crystal shower ----------
const NCRYST = small ? 320 : 850;
const crystalMat = new THREE.MeshStandardMaterial({ color: 0xfffbf2, roughness: 0.12, metalness: 0, envMapIntensity: 1.6 });
const crystals = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), crystalMat, NCRYST);
crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
crystals.frustumCulled = false;
tray.add(crystals);
const cr = Array.from({ length: NCRYST }, () => ({}));
const dummy = new THREE.Object3D();
let crystalsActive = false;
function showerCrystals(instant) {
  for (const c of cr) {
    let x, z;
    do { x = (rand() - 0.5) * TOP_W; z = (rand() - 0.5) * TOP_H; } while (stadiumSD(x, z, SS, SR) > -0.06);
    c.size = 0.012 + rand() * 0.012;
    c.floor = surfaceY(x, z) + c.size * 0.3;
    c.x = x; c.z = z;
    c.vx = (rand() - 0.5) * 0.12; c.vz = (rand() - 0.5) * 0.12;
    c.delay = instant ? 0 : 0.1 + rand() * 0.9;
    c.y = instant ? c.floor : c.floor + 1.4 + rand() * 1.4;
    c.vy = instant ? 0 : -0.6;
    c.rx = rand() * 6; c.ry = rand() * 6; c.rz = rand() * 6;
    c.spin = instant ? 0 : 4 + rand() * 8;
    c.landed = instant;
    c.melt = 1;
    c.gi = -1;
  }
  crystalsActive = true;
  updateCrystals(0, true);
}
function updateCrystals(dt, force) {
  if (!crystalsActive && !force) return;
  let moving = false;
  for (let i = 0; i < NCRYST; i++) {
    const c = cr[i];
    let changed = force;
    if (!c.landed) {
      if (c.delay > 0) {
        c.delay -= dt; moving = true;
        if (force) { dummy.scale.setScalar(0); dummy.updateMatrix(); crystals.setMatrixAt(i, dummy.matrix); }
        continue;
      }
      c.vy -= 9 * dt;
      c.y += c.vy * dt; c.x += c.vx * dt; c.z += c.vz * dt;
      c.rx += c.spin * dt; c.ry += c.spin * 0.7 * dt;
      if (c.y <= c.floor) {
        c.y = c.floor;
        if (c.vy < -0.9) { c.vy *= -0.28; c.spin *= 0.4; c.vx *= 0.5; c.vz *= 0.5; }
        else { c.landed = true; c.vy = 0; }
      }
      changed = true; moving = true;
    }
    if (c.landed) {
      if (c.gi < 0) {
        const gx = Math.min(GW - 1, Math.max(0, Math.floor((c.x / TOP_W + 0.5) * GW)));
        const gy = Math.min(GH - 1, Math.max(0, Math.floor((c.z / TOP_H + 0.5) * GH)));
        c.gi = gy * GW + gx;
      }
      const m = 1 - smoothstep(0.1, 0.42, heat[c.gi]);
      if (Math.abs(m - c.melt) > 0.03 || (m === 0 && c.melt !== 0)) { c.melt = m; changed = true; }
    }
    if (changed) {
      const s = c.size * c.melt;
      dummy.position.set(c.x, c.y - (1 - c.melt) * c.size * 0.4, c.z);
      dummy.rotation.set(c.rx, c.ry, c.rz);
      dummy.scale.set(s, s * 0.85, s);
      dummy.updateMatrix();
      crystals.setMatrixAt(i, dummy.matrix);
    }
  }
  crystals.instanceMatrix.needsUpdate = true;
  crystalsActive = moving;
}

// ---------- Torch: nozzle, flame, glow, embers, smoke ----------
const TORCH_DIR = new THREE.Vector3(0.62, 1, 0.08).normalize(); // from the sugar back up to the nozzle
const FLAME_LEN = 0.4;
const nozzle = new THREE.Group();
{
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 1, roughness: 0.22 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 1, roughness: 0.3 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.62, 24), steel);
  tube.position.y = 0.31;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.08, 24), brass);
  collar.position.y = 0.5;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 24), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.5 }));
  mouth.rotation.x = Math.PI / 2;
  nozzle.add(tube, collar, mouth);
  nozzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), TORCH_DIR);
  nozzle.visible = false;
  scene.add(nozzle);
}
const flameMat = flameMaterial();
const flameGeo = new THREE.PlaneGeometry(1, 1);
flameGeo.translate(0, 0.5, 0);
const flame = new THREE.Mesh(flameGeo, flameMat);
flame.matrixAutoUpdate = false;
flame.frustumCulled = false;
flame.renderOrder = 5;
flame.visible = false;
scene.add(flame);

const impact = new THREE.Mesh(
  new THREE.PlaneGeometry(0.42, 0.42),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, "rgba(255,240,200,1)"], [0.25, "rgba(255,160,60,0.7)"], [0.6, "rgba(255,90,20,0.18)"], [1, "rgba(255,60,0,0)"]]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
  })
);
impact.rotation.x = -Math.PI / 2;
impact.renderOrder = 4;
tray.add(impact);

const NEMB = small ? 48 : 110;
const embPos = new Float32Array(NEMB * 3).fill(-99), embCol = new Float32Array(NEMB * 3);
const embGeo = new THREE.BufferGeometry();
embGeo.setAttribute("position", new THREE.BufferAttribute(embPos, 3));
embGeo.setAttribute("color", new THREE.BufferAttribute(embCol, 3));
const embers = new THREE.Points(embGeo, new THREE.PointsMaterial({
  size: 0.028, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  map: radialTexture([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,0.6)"], [1, "rgba(255,255,255,0)"]], 32),
}));
embers.frustumCulled = false;
scene.add(embers);
const emb = Array.from({ length: NEMB }, () => ({ life: 0, age: 1, vx: 0, vy: 0, vz: 0 }));
let embCursor = 0;

const smokeTex = smokeTexture(rand);
const NSMOKE = small ? 8 : 16;
const smoke = Array.from({ length: NSMOKE }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0, color: 0xf6efe6 }));
  s.visible = false;
  s.renderOrder = 6;
  scene.add(s);
  return { s, age: 1, life: 1, vx: 0, vz: 0, rot: 0 };
});
let smokeCursor = 0, smokeTimer = 0, emberTimer = 0, bubbleTimer = 0;

// ---------- Crack: shards, crumbs ----------
const shards = [];
const crumbN = small ? 18 : 30;
const crumbs = new THREE.InstancedMesh(
  new THREE.TetrahedronGeometry(1, 0),
  new THREE.MeshPhysicalMaterial({ color: 0xd88f3a, roughness: 0.12, clearcoat: 1, emissive: 0x3a1604 }),
  crumbN
);
crumbs.frustumCulled = false;
crumbs.visible = false;
tray.add(crumbs);
const crumbState = Array.from({ length: crumbN }, () => ({}));

// ---------- Sizing ----------
function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  fit = w / h < 1 ? 1.25 / (w / h) ** 0.6 : 1; // pull back on narrow screens so the whole tray stays in view
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- Interaction ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerUV = null, pointerDown = false, pointerType = "mouse";
const pointerLocal = new THREE.Vector3();
let userTouched = false, cracked = false, ready = false;
const parallax = { x: 0, y: 0 };
const INTRO = reduceMotion ? 0 : 2.3;

function hitTest(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  parallax.x = ndc.x; parallax.y = ndc.y;
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(sugar)[0] || null;
}
function onMove(e) {
  pointerType = e.pointerType;
  const hit = hitTest(e);
  const active = pointerType === "mouse" ? true : pointerDown; // mouse torches on hover, touch while pressed
  if (hit && active && !cracked && t > INTRO) {
    pointerUV = hit.uv.clone();
    pointerLocal.copy(tray.worldToLocal(hit.point.clone()));
    userTouched = true;
  } else pointerUV = null;
}
stage.addEventListener("pointermove", onMove);
stage.addEventListener("pointerdown", (e) => {
  pointerDown = true;
  stage.setPointerCapture?.(e.pointerId);
  const hit = hitTest(e);
  if (hit && ready && !cracked) crack(tray.worldToLocal(hit.point.clone()));
  else onMove(e);
});
const release = () => { pointerDown = false; if (pointerType !== "mouse") pointerUV = null; };
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("pointerleave", () => { pointerUV = null; });

function torchAt(u, v, dt) {
  const cx = u * GW, cy = v * GH, R = GW * 0.036;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(GW - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(GH - 1, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (R * R);
      if (d2 > 1) continue;
      const i = y * GW + x;
      heat[i] = Math.min(1.3, heat[i] + dt * 5.2 * (1 - d2) ** 1.5 * (0.8 + 0.4 * Math.random()));
    }
  dirty = true;
}
function coverage() {
  let n = 0;
  for (let i = 0; i < heat.length; i++) if (inside[i] && heat[i] > 0.55) n++;
  return n / insideCount;
}
const toTex = (x, z) => [(x / TOP_W + 0.5) * TEX_W, (z / TOP_H + 0.5) * TEX_H];

function crack(p) {
  cracked = true;
  pointerUV = null;
  // Keep the shards clear of the foil.
  const cx = Math.max(-SS - SR * 0.15, Math.min(SS + SR * 0.15, p.x));
  const cz = Math.max(-0.16, Math.min(0.16, p.z));
  // Snapshot the crust before cutting holes, so the shards carry its colour.
  const shardCanvas = canvas(TEX_W, TEX_H);
  shardCanvas.getContext("2d").drawImage(texCanvas, 0, 0);
  const shardBumpC = canvas(TEX_W, TEX_H);
  shardBumpC.getContext("2d").drawImage(bumpCanvas, 0, 0);
  const shardTex = new THREE.CanvasTexture(shardCanvas);
  shardTex.colorSpace = THREE.SRGBColorSpace; shardTex.flipY = false;
  const shardBump = new THREE.CanvasTexture(shardBumpC);
  shardBump.flipY = false;
  const topMat = new THREE.MeshPhysicalMaterial({
    map: shardTex, bumpMap: shardBump, bumpScale: 1.2, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05,
  });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0xd99a48, roughness: 0.1, clearcoat: 1, emissive: 0x4a1e04 });

  const n = 6 + Math.floor(Math.random() * 2);
  const angles = [], outer = [];
  for (let k = 0; k < n; k++) {
    angles.push(((k + 0.25 + Math.random() * 0.5) / n) * Math.PI * 2);
    outer.push(0.24 + Math.random() * 0.12);
  }
  const r0 = 0.07 + Math.random() * 0.02;
  const pt = (a, r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r * 0.85];
  const polys = [{ pts: angles.map((a) => pt(a, r0 * (0.8 + Math.random() * 0.4))), centre: true }];
  for (let k = 0; k < n; k++) {
    const a0 = angles[k], a1 = angles[(k + 1) % n] + (k === n - 1 ? Math.PI * 2 : 0);
    polys.push({ pts: [pt(a0, r0), pt(a1, r0), pt(a1, outer[(k + 1) % n]), pt((a0 + a1) / 2, Math.max(outer[k], outer[(k + 1) % n]) * (0.9 + Math.random() * 0.2)), pt(a0, outer[k])] });
  }
  // Paint the custard showing through, then the crack lines.
  cctx.lineCap = cctx.lineJoin = "round";
  for (const poly of polys) {
    const path = new Path2D();
    poly.pts.forEach(([x, z], i) => { const [u, v] = toTex(x, z); i ? path.lineTo(u, v) : path.moveTo(u, v); });
    path.closePath();
    cctx.fillStyle = "#f6dc93"; cctx.fill(path);
    cctx.strokeStyle = "rgba(170,110,30,0.55)"; cctx.lineWidth = 3; cctx.stroke(path);
    cbctx.fillStyle = "rgba(0,0,0,0.6)"; cbctx.fill(path);
  }
  const strokeArm = (pts) => {
    for (const [style, w, off, ctx] of [["rgba(255,226,160,0.5)", 2, 1.2, cctx], ["rgba(38,14,3,0.92)", 2.4, 0, cctx], ["#000", 3, 0, cbctx]]) {
      ctx.strokeStyle = style; ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + off, y + off) : ctx.moveTo(x + off, y + off)));
      ctx.stroke();
    }
  };
  for (let k = 0; k < n; k++) {
    let ang = angles[k], [x, y] = toTex(...pt(angles[k], outer[k]));
    const pts = [[x, y]], len = (0.25 + Math.random() * 0.45) * PX;
    for (let s = 0; s < len; s += 10) {
      ang += (Math.random() - 0.5) * 0.7;
      x += Math.cos(ang) * 10; y += Math.sin(ang) * 10;
      pts.push([x, y]);
      if (Math.random() < 0.06) { // hairline branch
        let bx = x, by = y, ba = ang + (Math.random() > 0.5 ? 0.9 : -0.9);
        const bp = [[bx, by]];
        for (let j = 0; j < 5; j++) { ba += (Math.random() - 0.5) * 0.6; bx += Math.cos(ba) * 9; by += Math.sin(ba) * 9; bp.push([bx, by]); }
        strokeArm(bp);
      }
    }
    strokeArm(pts);
  }
  dirty = true;
  paintTexture();

  // The 3D shards: wedges tip up at their outer edge, the middle sinks under the spoon.
  for (const poly of polys) {
    const c = poly.pts.reduce((a, [x, z]) => [a[0] + x / poly.pts.length, a[1] + z / poly.pts.length], [0, 0]);
    const geo = shardGeometry(poly.pts, c, 0.014);
    const mesh = new THREE.Mesh(geo, [topMat, edgeMat]);
    mesh.castShadow = true;
    const y0 = surfaceY(c[0], c[1]) + 0.0015;
    mesh.position.set(c[0], y0, c[1]);
    const radial = new THREE.Vector3(c[0] - cx, 0, c[1] - cz);
    if (radial.lengthSq() < 1e-6) radial.set(1, 0, 0);
    radial.normalize();
    const axis = new THREE.Vector3().crossVectors(radial, new THREE.Vector3(0, 1, 0)).normalize();
    tray.add(mesh);
    shards.push({
      mesh, home: mesh.position.clone(), axis, age: -Math.random() * 0.05,
      tilt: poly.centre ? (Math.random() - 0.5) * 0.25 : 0.28 + Math.random() * 0.3,
      lift: poly.centre ? -0.022 : 0.012 + Math.random() * 0.014,
      push: poly.centre ? 0 : 0.012 + Math.random() * 0.012, radial,
      geo, mats: [topMat, edgeMat],
    });
  }
  shards.texes = [shardTex, shardBump];
  // A spray of caramel crumbs.
  crumbs.visible = true;
  for (const s of crumbState) {
    const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.6;
    Object.assign(s, {
      x: cx + Math.cos(a) * 0.05, z: cz + Math.sin(a) * 0.05, y: surfaceY(cx, cz) + 0.01,
      vx: Math.cos(a) * sp * 0.6, vz: Math.sin(a) * sp * 0.5, vy: 0.8 + Math.random() * 0.9,
      size: 0.006 + Math.random() * 0.01, rx: Math.random() * 6, ry: Math.random() * 6, spin: 8 + Math.random() * 10, rest: false,
    });
  }
  shake = 1;
  statusEl.textContent = TEXT.cracked;
  resetBtn.hidden = false;
}

function shardGeometry(pts, c, th) {
  const pos = [], uv = [], top = [], side = [];
  const local = pts.map(([x, z]) => [x - c[0], z - c[1]]);
  const U = (x, z) => [(x + c[0]) / TOP_W + 0.5, (z + c[1]) / TOP_H + 0.5];
  const push = (x, y, z) => { pos.push(x, y, z); uv.push(...U(x, z)); };
  for (let i = 0; i < local.length; i++) { // top fan
    const [ax, az] = local[i], [bx, bz] = local[(i + 1) % local.length];
    push(0, 0, 0); push(bx, 0, bz); push(ax, 0, az);
  }
  const topCount = local.length * 3;
  for (let i = 0; i < local.length; i++) { // walls
    const [ax, az] = local[i], [bx, bz] = local[(i + 1) % local.length];
    push(ax, 0, az); push(bx, 0, bz); push(ax, -th, az);
    push(bx, 0, bz); push(bx, -th, bz); push(ax, -th, az);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.addGroup(0, topCount, 0);
  g.addGroup(topCount, pos.length / 3 - topCount, 1);
  // Winding can be either way depending on the polygon; make the top face up.
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const x1 = p.getX(i + 1), y1 = p.getY(i + 1), z1 = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x1, y1, z1);
      const u = g.attributes.uv, u1 = u.getX(i + 1), v1 = u.getY(i + 1);
      u.setXY(i + 1, u.getX(i + 2), u.getY(i + 2)); u.setXY(i + 2, u1, v1);
    }
    g.computeVertexNormals();
  }
  return g;
}

resetBtn.addEventListener("click", () => {
  heat.fill(0);
  for (const c of [cctx, cbctx, pctx]) c.clearRect(0, 0, TEX_W, TEX_H);
  bubbles.length = 0;
  for (const s of shards) { tray.remove(s.mesh); s.geo.dispose(); s.mats.forEach((m) => m.dispose()); }
  shards.texes?.forEach((x) => x.dispose());
  shards.length = 0;
  crumbs.visible = false;
  cracked = false; ready = false; dirty = true; lastCov = -1;
  glintT = -1;
  resetBtn.hidden = true;
  statusEl.textContent = TEXT.idle;
  meterFill.style.width = "0%";
  showerCrystals(reduceMotion); // a fresh layer of sugar
});

// ---------- Loop ----------
let last = performance.now(), t = 0, shake = 0, visible = true, lastCov = -1, lastPaint = 0;
let engage = 0, glintT = -1, frameAvg = 1 / 60, adaptTimer = 0;
const torchPos = new THREE.Vector3(), torchTarget = new THREE.Vector3(), tmpV = new THREE.Vector3();
const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

function spawnEmber(p) {
  const e = emb[embCursor = (embCursor + 1) % NEMB];
  const a = Math.random() * Math.PI * 2, sp = 0.15 + Math.random() * 0.5;
  e.age = 0; e.life = 0.35 + Math.random() * 0.55;
  e.vx = Math.cos(a) * sp; e.vz = Math.sin(a) * sp; e.vy = 0.4 + Math.random() * 0.9;
  const i = embCursor * 3;
  embPos[i] = p.x; embPos[i + 1] = p.y + 0.01; embPos[i + 2] = p.z;
}
function spawnSmoke(p) {
  const s = smoke[smokeCursor = (smokeCursor + 1) % NSMOKE];
  s.age = 0; s.life = 1.6 + Math.random() * 1.0;
  s.vx = (Math.random() - 0.5) * 0.08 + 0.05; s.vz = (Math.random() - 0.5) * 0.06;
  s.rot = (Math.random() - 0.5) * 0.8;
  s.s.position.set(p.x + (Math.random() - 0.5) * 0.08, p.y + 0.05, p.z);
  s.s.material.rotation = Math.random() * 6;
  s.s.visible = true;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!visible) return;
  t += dt;

  // Drop resolution a notch if a slow device can't hold the frame rate.
  frameAvg += (dt - frameAvg) * 0.05;
  adaptTimer += dt;
  if (!navigator.webdriver && adaptTimer > 2 && frameAvg > 1 / 42 && pixelRatio > 1) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    resize();
    adaptTimer = 0;
  }

  // Before anyone touches it, the torch demonstrates on its own, then hands over.
  let torchUV = pointerUV;
  if (pointerUV) torchTarget.copy(pointerLocal);
  if (!userTouched && !reduceMotion && t > INTRO + 0.5 && !cracked && coverage() < 0.32) {
    const tt = t - INTRO;
    const u = 0.5 + 0.38 * Math.sin(tt * 0.9 - 0.6), v = 0.5 + 0.3 * Math.sin(tt * 1.9);
    torchUV = { x: u, y: v };
    torchTarget.set((u - 0.5) * TOP_W, 0, (v - 0.5) * TOP_H);
    torchTarget.y = surfaceY(torchTarget.x, torchTarget.z);
  }
  const torching = !!torchUV && !cracked;
  if (torching && engage < 0.05) torchPos.copy(torchTarget);
  torchPos.lerp(torchTarget, 1 - Math.exp(-dt * 22));
  engage += ((torching ? 1 : 0) - engage) * (1 - Math.exp(-dt * (torching ? 10 : 7)));

  if (torching) {
    torchAt(torchUV.x, torchUV.y, dt);
    // Bubbles boil up on molten sugar near the flame.
    bubbleTimer += dt;
    while (bubbleTimer > 0.03) {
      bubbleTimer -= 0.03;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.09;
      const x = torchPos.x + Math.cos(a) * r, z = torchPos.z + Math.sin(a) * r;
      const gx = Math.floor((x / TOP_W + 0.5) * GW), gy = Math.floor((z / TOP_H + 0.5) * GH);
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH || !inside[gy * GW + gx] || heat[gy * GW + gx] < 0.4 || bubbles.length > 40) continue;
      const [u, v] = toTex(x, z);
      bubbles.push({ x: u, y: v, r: (2 + Math.random() * 4.5) * (TEX_W / 1024), age: 0, life: 0.25 + Math.random() * 0.7 });
    }
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.age += dt;
    if (b.age >= b.life) { popBubble(b); bubbles.splice(i, 1); }
    dirty = true;
  }

  // Flame, nozzle and light follow the smoothed contact point.
  const worldContact = tray.localToWorld(tmpV.copy(torchPos));
  if (engage > 0.01) {
    const len = FLAME_LEN * (0.75 + 0.25 * engage);
    const noz = worldContact.clone().addScaledVector(TORCH_DIR, len + (1 - engage) * 0.5);
    nozzle.visible = true;
    nozzle.position.copy(noz);
    const axis = TORCH_DIR.clone().negate();
    const view = camera.position.clone().sub(noz).normalize();
    const sideV = new THREE.Vector3().crossVectors(axis, view).normalize();
    const norm = new THREE.Vector3().crossVectors(sideV, axis);
    const f = 1 + Math.sin(t * 43) * 0.05 + (Math.random() - 0.5) * 0.08;
    flame.matrix.makeBasis(sideV.multiplyScalar(0.17 * f), axis.multiplyScalar(len * 1.04), norm).setPosition(noz);
    flame.matrixWorldNeedsUpdate = true;
    flame.visible = true;
    flameMat.uniforms.uTime.value = t;
    flameMat.uniforms.uPower.value = engage * f;
    impact.visible = true;
    impact.position.set(torchPos.x, torchPos.y + 0.012, torchPos.z);
    impact.material.opacity = engage * (0.55 + 0.25 * f);
    impact.scale.setScalar(0.85 + 0.2 * f);
    torchLight.position.copy(worldContact).y += 0.14;
    torchLight.intensity = 3.4 * engage * f;
  } else {
    nozzle.visible = flame.visible = impact.visible = false;
    torchLight.intensity = 0;
  }

  // Embers and smoke.
  if (torching && engage > 0.5) {
    emberTimer += dt * (small ? 30 : 55);
    while (emberTimer > 1) { emberTimer--; spawnEmber(worldContact); }
    smokeTimer += dt;
    if (smokeTimer > 0.14) { smokeTimer = 0; spawnSmoke(worldContact); }
  }
  for (let k = 0; k < NEMB; k++) {
    const e = emb[k], i = k * 3;
    if (e.age >= e.life) { embCol[i] = embCol[i + 1] = embCol[i + 2] = 0; continue; }
    e.age += dt;
    e.vy -= 0.9 * dt; e.vx *= 0.97; e.vz *= 0.97;
    embPos[i] += e.vx * dt; embPos[i + 1] += e.vy * dt; embPos[i + 2] += e.vz * dt;
    const k1 = 1 - e.age / e.life;
    embCol[i] = 1 * k1; embCol[i + 1] = (0.35 + 0.5 * k1 * k1) * k1; embCol[i + 2] = 0.12 * k1 * k1 * k1;
  }
  embGeo.attributes.position.needsUpdate = true;
  embGeo.attributes.color.needsUpdate = true;
  for (const s of smoke) {
    if (!s.s.visible) continue;
    s.age += dt;
    const k = s.age / s.life;
    if (k >= 1) { s.s.visible = false; continue; }
    s.s.position.x += s.vx * dt; s.s.position.z += s.vz * dt; s.s.position.y += (0.3 - 0.1 * k) * dt;
    s.s.scale.setScalar(0.14 + 0.6 * k);
    s.s.material.rotation += s.rot * dt;
    s.s.material.opacity = 0.32 * Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k);
  }

  updateCrystals(dt, false);
  if (dirty) updateCrystals(0, false);

  if (dirty && (now - lastPaint > 33 || !torching)) {
    // Crystals melt where the sugar has caught.
    for (const c of cr) if (c.landed) crystalsActive = true;
    paintTexture();
    lastPaint = now;
    const cov = coverage();
    if (Math.abs(cov - lastCov) > 0.002 && !cracked) {
      lastCov = cov;
      const pct = Math.min(100, Math.round((cov / 0.7) * 100));
      meterFill.style.width = pct + "%";
      if (cov >= 0.7 && !ready) {
        ready = true;
        glintT = 0;
        statusEl.textContent = TEXT.golden;
      } else if (!ready && userTouched) {
        statusEl.textContent = pct < 15 ? TEXT.going : TEXT.pct(pct);
      } else if (!userTouched && t > INTRO) {
        statusEl.textContent = TEXT.idle;
      }
    }
  }

  // Golden moment: a highlight sweeps across the glassy crust.
  if (glintT >= 0) {
    glintT += dt;
    const k = Math.min(1, glintT / 1.4);
    glint.position.set(-5 + 10 * ease(k), 3.2, -4);
    glint.intensity = reduceMotion ? 0 : 5 * Math.sin(Math.PI * k);
    if (k >= 1) { glintT = -1; glint.intensity = 0; }
  }

  // Shards spring into place; crumbs bounce and settle.
  for (const s of shards) {
    s.age += dt;
    const a = Math.max(0, s.age), k = reduceMotion ? 1 : 1 - Math.exp(-a * 9) * Math.cos(a * 16);
    s.mesh.quaternion.setFromAxisAngle(s.axis, s.tilt * k);
    s.mesh.position.copy(s.home).addScaledVector(s.radial, s.push * k);
    s.mesh.position.y += s.lift * k;
  }
  if (crumbs.visible) {
    for (let i = 0; i < crumbN; i++) {
      const s = crumbState[i];
      if (!s.rest) {
        s.vy -= 6 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
        s.rx += s.spin * dt;
        const fl = stadiumSD(s.x, s.z, SS, SR) < 0 ? surfaceY(s.x, s.z) + s.size * 0.5 : WALL + 0.01;
        if (s.y < fl) { s.y = fl; if (s.vy < -0.5) { s.vy *= -0.3; s.vx *= 0.4; s.vz *= 0.4; s.spin *= 0.5; } else s.rest = true; }
      }
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(s.rx, s.ry, 0);
      dummy.scale.setScalar(s.size);
      dummy.updateMatrix();
      crumbs.setMatrixAt(i, dummy.matrix);
    }
    crumbs.instanceMatrix.needsUpdate = true;
  }

  // Camera: opening move, then gentle parallax, plus a micro-shake on the crack.
  const ik = INTRO ? ease(Math.min(1, t / INTRO)) : 1;
  camPos.copy(INTRO_POS).lerp(REST_POS, ik).multiplyScalar(fit);
  camPos.y += Math.sin(ik * Math.PI) * 0.35;
  camAim.copy(INTRO_AIM).lerp(REST_AIM, ik);
  if (!reduceMotion) {
    camPos.x += parallax.x * 0.35 * ik;
    camPos.y += parallax.y * 0.15 * ik;
  }
  camera.position.lerp(camPos, ik < 1 ? 1 : 1 - Math.exp(-dt * 3));
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 2.6);
    const a = shake * shake * 0.025;
    camera.position.x += Math.sin(t * 90) * a;
    camera.position.y += Math.sin(t * 77 + 1) * a;
  }
  camera.lookAt(camAim);
  tray.rotation.y += ((reduceMotion ? 0 : Math.sin(t * 0.25) * 0.06) - tray.rotation.y) * 0.05;

  renderer.render(scene, camera);
  if (!stage.classList.contains("ready")) stage.classList.add("ready");
}

showerCrystals(reduceMotion);
paintTexture();
requestAnimationFrame(frame);
