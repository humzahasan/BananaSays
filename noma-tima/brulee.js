// Interactive crème brûlée: drag to torch the sugar, tap the golden crust to crack it.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const stage = document.getElementById("stage");
const statusEl = document.getElementById("status");
const meterFill = document.getElementById("meter-fill");
const resetBtn = document.getElementById("reset");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (e) {
  statusEl.textContent = "Your browser can’t show the 3D brûlée, so here’s a photo of the real one.";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);
stage.classList.add("ready");

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
const camBase = new THREE.Vector3(0, 5.4, 4.6);
camera.position.copy(camBase);
camera.lookAt(0, 0.1, 0);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xfff3d6, 0x7a2010, 0.6));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(-3, 6, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
sun.shadow.radius = 6;
sun.shadow.bias = -0.0005;
scene.add(sun);
const torchLight = new THREE.PointLight(0xff8a2a, 0, 2.5, 2);
scene.add(torchLight);

// ---------- Geometry helpers ----------
// A stadium (pill) shape like the foil trays the brûlée is baked in.
function stadium(w, h, shape = new THREE.Shape()) {
  const r = h / 2, s = w / 2 - r;
  shape.moveTo(-s, -r);
  shape.lineTo(s, -r);
  shape.absarc(s, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-s, r);
  shape.absarc(-s, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return shape;
}
function ring(outerW, outerH, innerW, innerH) {
  const s = stadium(outerW, outerH);
  s.holes.push(stadium(innerW, innerH, new THREE.Path()));
  return s;
}

const TRAY_W = 3.1, TRAY_H = 1.2, WALL = 0.42;
const tray = new THREE.Group();
scene.add(tray);

const foil = new THREE.MeshStandardMaterial({ color: 0xd9d9dc, metalness: 0.95, roughness: 0.32 });

// Walls: a ring extruded upward, slightly flared by scaling the top.
const wallGeo = new THREE.ExtrudeGeometry(ring(TRAY_W, TRAY_H, TRAY_W - 0.06, TRAY_H - 0.06), {
  depth: WALL, bevelEnabled: false, curveSegments: 48,
});
wallGeo.rotateX(-Math.PI / 2);
{
  const p = wallGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / WALL; // 0 at base, 1 at rim
    const k = 0.9 + 0.1 * t;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * (0.86 + 0.14 * t));
  }
  wallGeo.computeVertexNormals();
}
const walls = new THREE.Mesh(wallGeo, foil);
walls.castShadow = true; walls.receiveShadow = true;
tray.add(walls);

// Rolled rim lip.
const lipGeo = new THREE.ExtrudeGeometry(ring(TRAY_W + 0.2, TRAY_H + 0.2, TRAY_W - 0.04, TRAY_H - 0.04), {
  depth: 0.035, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 48,
});
lipGeo.rotateX(-Math.PI / 2);
lipGeo.translate(0, WALL - 0.01, 0);
const lip = new THREE.Mesh(lipGeo, foil);
lip.castShadow = true;
tray.add(lip);

// Base.
const baseGeo = new THREE.ShapeGeometry(stadium(TRAY_W * 0.9, TRAY_H * 0.86), 48);
baseGeo.rotateX(-Math.PI / 2);
const base = new THREE.Mesh(baseGeo, foil);
base.position.y = 0.005;
tray.add(base);

// ---------- The sugar top: a painted texture ----------
const TOP_W = TRAY_W - 0.1, TOP_H = TRAY_H - 0.1, TOP_Y = WALL - 0.05;
const GW = 256, GH = Math.round((GW * TOP_H) / TOP_W); // heat grid
const heat = new Float32Array(GW * GH);
const grain = new Float32Array(GW * GH);
for (let i = 0; i < grain.length; i++) grain[i] = Math.random() * 2 - 1;
// Smooth the grain once so the browning comes out mottled rather than pixel noise.
for (let pass = 0; pass < 2; pass++) {
  for (let y = 1; y < GH - 1; y++)
    for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      grain[i] = grain[i] * 0.5 + (grain[i - 1] + grain[i + 1] + grain[i - GW] + grain[i + GW]) * 0.125;
    }
}
const speck = new Float32Array(GW * GH).map(() => Math.random());

const small = document.createElement("canvas");
small.width = GW; small.height = GH;
const sctx = small.getContext("2d");
const img = sctx.createImageData(GW, GH);

const TEX_W = 1024, TEX_H = Math.round((TEX_W * TOP_H) / TOP_W);
const texCanvas = document.createElement("canvas");
texCanvas.width = TEX_W; texCanvas.height = TEX_H;
const tctx = texCanvas.getContext("2d");
const crackCanvas = document.createElement("canvas");
crackCanvas.width = TEX_W; crackCanvas.height = TEX_H;
const cctx = crackCanvas.getContext("2d");

const sugarTex = new THREE.CanvasTexture(texCanvas);
sugarTex.colorSpace = THREE.SRGBColorSpace;
sugarTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

// Custard → golden → amber → burnt sugar.
const RAMP = [
  [0.0, [244, 214, 128]],
  [0.3, [236, 186, 86]],
  [0.6, [205, 128, 40]],
  [0.9, [139, 68, 18]],
  [1.25, [62, 26, 8]],
];
function ramp(h) {
  if (h <= 0) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    if (h <= RAMP[i][0]) {
      const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i];
      const t = (h - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

let dirty = true;
function paintTexture() {
  const d = img.data;
  for (let i = 0; i < GW * GH; i++) {
    const h = heat[i] * (1 + 0.35 * grain[i] * 2);
    let [r, g, b] = ramp(h);
    // Raw sugar crystals sparkle before they melt.
    if (heat[i] < 0.25 && speck[i] > 0.86) {
      const k = (1 - heat[i] / 0.25) * 0.55;
      r += (255 - r) * k; g += (246 - g) * k; b += (222 - b) * k;
    }
    const o = i * 4;
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(small, 0, 0, TEX_W, TEX_H);
  tctx.drawImage(crackCanvas, 0, 0);
  sugarTex.needsUpdate = true;
  dirty = false;
}

const topGeo = new THREE.ShapeGeometry(stadium(TOP_W * 0.97, TOP_H * 0.95), 64);
topGeo.rotateX(-Math.PI / 2);
{
  const p = topGeo.attributes.position, uv = topGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    // Soft dome: the custard sits a little higher in the middle.
    const nx = p.getX(i) / (TOP_W / 2), nz = p.getZ(i) / (TOP_H / 2);
    p.setY(i, 0.03 * Math.max(0, 1 - (nx * nx * 0.6 + nz * nz)));
    uv.setXY(i, p.getX(i) / TOP_W + 0.5, p.getZ(i) / TOP_H + 0.5);
  }
  topGeo.computeVertexNormals();
}
const sugarMat = new THREE.MeshPhysicalMaterial({
  map: sugarTex, roughness: 0.55, clearcoat: 0.0, clearcoatRoughness: 0.25,
});
const sugar = new THREE.Mesh(topGeo, sugarMat);
sugar.position.y = TOP_Y;
sugar.receiveShadow = true;
tray.add(sugar);

// ---------- Stone board under the tray ----------
const board = new THREE.Mesh(
  new THREE.CylinderGeometry(1.95, 2.0, 0.16, 96),
  new THREE.MeshStandardMaterial({ color: 0xe2cfae, roughness: 0.92, metalness: 0 })
);
board.position.set(0, -0.08, -0.25);
board.receiveShadow = true; board.castShadow = true;
scene.add(board);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.28 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.16;
ground.receiveShadow = true;
scene.add(ground);

// Two vanilla pods, because they’re in every photo of the real thing.
const podMat = new THREE.MeshStandardMaterial({ color: 0x2a140a, roughness: 0.6 });
for (const [x, z, ry] of [[-0.75, 1.0, 0.25], [-0.55, 1.15, 0.15]]) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.7, 0, 0), new THREE.Vector3(-0.2, 0.02, 0.05),
    new THREE.Vector3(0.3, 0.02, -0.04), new THREE.Vector3(0.75, 0, 0.03),
  ]);
  const pod = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.035, 8, false), podMat);
  pod.position.set(x, 0.035, z);
  pod.rotation.y = ry;
  pod.castShadow = true;
  scene.add(pod);
}

// ---------- Torch flame ----------
function flameTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 160;
  const g = c.getContext("2d");
  const outer = g.createRadialGradient(32, 150, 2, 32, 110, 70);
  outer.addColorStop(0, "rgba(255,240,200,1)");
  outer.addColorStop(0.25, "rgba(255,170,60,0.9)");
  outer.addColorStop(0.6, "rgba(255,90,20,0.35)");
  outer.addColorStop(1, "rgba(255,60,0,0)");
  g.fillStyle = outer;
  g.beginPath();
  g.ellipse(32, 100, 22, 62, 0, 0, Math.PI * 2);
  g.fill();
  const core = g.createRadialGradient(32, 145, 1, 32, 125, 30);
  core.addColorStop(0, "rgba(220,240,255,1)");
  core.addColorStop(0.5, "rgba(90,140,255,0.8)");
  core.addColorStop(1, "rgba(60,90,255,0)");
  g.fillStyle = core;
  g.beginPath();
  g.ellipse(32, 128, 9, 30, 0, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; // blue core at the nozzle (top), plume spreading onto the sugar
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const flame = new THREE.Sprite(new THREE.SpriteMaterial({
  map: flameTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
flame.center.set(0.5, 0.0);
flame.visible = false;
scene.add(flame);

// ---------- Sizing ----------
function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Pull back on narrow screens so the whole tray stays in view.
  const fit = w / h < 1 ? 1.25 / (w / h) ** 0.6 : 1;
  camera.position.copy(camBase).multiplyScalar(fit);
  camera.lookAt(0, 0.1, 0);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

// ---------- Interaction ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerUV = null, pointerPoint = new THREE.Vector3(), pointerDown = false, pointerType = "mouse";
let userTouched = false, cracked = false, ready = false;
let parallax = { x: 0, y: 0 };

function hitTest(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  parallax.x = ndc.x; parallax.y = ndc.y;
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(sugar)[0];
  return hit || null;
}

function onMove(e) {
  pointerType = e.pointerType;
  const hit = hitTest(e);
  // Mouse torches on hover; touch and pen torch while pressed.
  const active = pointerType === "mouse" ? true : pointerDown;
  if (hit && active && !cracked) {
    pointerUV = hit.uv.clone();
    pointerPoint.copy(hit.point);
    if (!userTouched) { userTouched = true; }
  } else {
    pointerUV = null;
  }
}
stage.addEventListener("pointermove", onMove);
stage.addEventListener("pointerdown", (e) => {
  pointerDown = true;
  stage.setPointerCapture?.(e.pointerId);
  const hit = hitTest(e);
  if (hit && ready && !cracked) crack(hit.uv);
  else onMove(e);
});
const release = () => { pointerDown = false; if (pointerType !== "mouse") pointerUV = null; };
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("pointerleave", () => { pointerUV = null; });

function torchAt(u, v, dt) {
  const cx = u * GW, cy = v * GH, R = 11;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(GW - 1, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(GH - 1, Math.ceil(cy + R));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (R * R);
      if (d2 > 1) continue;
      const i = y * GW + x;
      heat[i] = Math.min(1.3, heat[i] + dt * 5.5 * (1 - d2) ** 1.5 * (0.8 + 0.4 * Math.random()));
    }
  dirty = true;
}

// Only cells inside the stadium count towards progress.
const inside = new Uint8Array(GW * GH);
let insideCount = 0;
{
  const r = 0.5 * (TOP_H * 0.95), s = (TOP_W * 0.97) / 2 - r;
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      const px = (x / GW - 0.5) * TOP_W, pz = (y / GH - 0.5) * TOP_H;
      const dx = Math.max(Math.abs(px) - s, 0);
      if (dx * dx + pz * pz < r * r * 0.92) { inside[y * GW + x] = 1; insideCount++; }
    }
}
function coverage() {
  let n = 0;
  for (let i = 0; i < heat.length; i++) if (inside[i] && heat[i] > 0.55) n++;
  return n / insideCount;
}

function crack(uv) {
  cracked = true;
  const cx = uv.x * TEX_W, cy = uv.y * TEX_H;
  cctx.lineCap = "round"; cctx.lineJoin = "round";
  const arms = 7 + Math.floor(Math.random() * 4);
  for (let a = 0; a < arms; a++) {
    let ang = (a / arms) * Math.PI * 2 + Math.random() * 0.5;
    let x = cx, y = cy;
    const pts = [[x, y]];
    const len = 60 + Math.random() * 140;
    for (let s = 0; s < len; s += 12) {
      ang += (Math.random() - 0.5) * 0.7;
      x += Math.cos(ang) * 12; y += Math.sin(ang) * 12;
      pts.push([x, y]);
    }
    for (const [style, w, off] of [["rgba(255,226,160,0.55)", 2, 1.5], ["rgba(40,16,4,0.9)", 2.5, 0]]) {
      cctx.strokeStyle = style; cctx.lineWidth = w;
      cctx.beginPath();
      pts.forEach(([px, py], i) => (i ? cctx.lineTo(px + off, py + off) : cctx.moveTo(px + off, py + off)));
      cctx.stroke();
    }
  }
  // A small sunken shard where the spoon went in.
  cctx.fillStyle = "rgba(250,222,150,0.9)";
  cctx.beginPath();
  cctx.ellipse(cx, cy, 16, 11, Math.random(), 0, Math.PI * 2);
  cctx.fill();
  dirty = true;
  shake = 0.25;
  statusEl.textContent = "That crack is the whole point. Order one below.";
  resetBtn.hidden = false;
}

resetBtn.addEventListener("click", () => {
  heat.fill(0);
  cctx.clearRect(0, 0, TEX_W, TEX_H);
  cracked = false; ready = false; dirty = true;
  resetBtn.hidden = true;
  statusEl.textContent = "Drag across the custard to torch it.";
  meterFill.style.width = "0%";
});

// ---------- Loop ----------
let last = performance.now(), t = 0, shake = 0, visible = true, lastCov = -1;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(stage);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!visible) return;
  t += dt;

  // Before anyone touches it, the torch demonstrates on its own, then hands over.
  let torchUV = pointerUV, torchPoint = pointerPoint;
  if (!userTouched && !reduceMotion && t > 1.2 && coverage() < 0.32) {
    const u = 0.5 + 0.4 * Math.sin(t * 0.9), v = 0.5 + 0.33 * Math.sin(t * 1.9);
    torchUV = { x: u, y: v };
    torchPoint = new THREE.Vector3((u - 0.5) * TOP_W, TOP_Y + 0.03, (v - 0.5) * TOP_H);
  }

  if (torchUV && !cracked) {
    torchAt(torchUV.x, torchUV.y, dt);
    flame.visible = true;
    flame.position.set(torchPoint.x, torchPoint.y + 0.02, torchPoint.z);
    const f = 1 + Math.sin(t * 40) * 0.06 + (Math.random() - 0.5) * 0.08;
    flame.scale.set(0.22 * f, 0.55 * f, 1);
    torchLight.position.set(torchPoint.x, torchPoint.y + 0.15, torchPoint.z);
    torchLight.intensity = 3.2 * f;
  } else {
    flame.visible = false;
    torchLight.intensity *= 0.85;
  }

  if (dirty) {
    paintTexture();
    const cov = coverage();
    sugarMat.clearcoat = Math.min(0.8, cov * 1.1); // caramel turns glassy as it sets
    if (Math.abs(cov - lastCov) > 0.002 && !cracked) {
      lastCov = cov;
      const pct = Math.min(100, Math.round((cov / 0.7) * 100));
      meterFill.style.width = pct + "%";
      if (cov >= 0.7 && !ready) {
        ready = true;
        statusEl.textContent = "Golden. Tap the crust to crack it.";
      } else if (!ready && userTouched) {
        statusEl.textContent = `Keep going, ${pct}% torched.`;
      } else if (!userTouched && t > 1.2) {
        statusEl.textContent = "Your turn. Drag across the custard.";
      }
    }
  }

  // Gentle parallax toward the pointer, plus a tiny shake on the crack.
  const px = reduceMotion ? 0 : parallax.x * 0.35;
  tray.rotation.y += ((reduceMotion ? 0 : Math.sin(t * 0.25) * 0.08) - tray.rotation.y) * 0.05;
  camera.position.x += (camBase.x + px - camera.position.x) * 0.05;
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    tray.position.x = (Math.random() - 0.5) * shake * 0.08;
  } else tray.position.x = 0;
  camera.lookAt(0, 0.1, 0);

  renderer.render(scene, camera);
}
paintTexture();
requestAnimationFrame(frame);
