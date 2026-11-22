// Procedural textures, geometry and materials for the crème brûlée hero.
// Everything is generated at load so the page ships no extra image files.
import * as THREE from "three";

// ---------- Small utilities ----------
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(rand) {
  const perm = new Uint8Array(512), val = new Float32Array(256), p = [];
  for (let i = 0; i < 256; i++) { val[i] = rand(); p.push(i); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = val[perm[X + perm[Y]]], b = val[perm[X + 1 + perm[Y]]];
    const c = val[perm[X + perm[Y + 1]]], d = val[perm[X + 1 + perm[Y + 1]]];
    const u = fade(xf), v = fade(yf);
    const top = a + (b - a) * u;
    return top + (c + (d - c) * u - top) * v; // 0..1
  };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function dataTex(c, { srgb = false, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Stadium (foil-tray) shapes ----------
export function stadiumShape(w, h, shape = new THREE.Shape()) {
  const r = h / 2, s = w / 2 - r;
  shape.moveTo(-s, -r);
  shape.lineTo(s, -r);
  shape.absarc(s, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-s, r);
  shape.absarc(-s, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return shape;
}

// Signed distance to a stadium in the XZ plane (negative inside).
export function stadiumSD(x, z, s, r) {
  const dx = Math.max(Math.abs(x) - s, 0);
  return Math.hypot(dx, z) - r;
}

// Parameterises the outline with fixed segment fractions so offset rings line up.
export function stadiumParam(sRef, rRef) {
  const L = 4 * sRef + 2 * Math.PI * rRef, fS = (2 * sRef) / L, fA = (Math.PI * rRef) / L;
  return (s, r, u) => {
    u = ((u % 1) + 1) % 1;
    if (u < fS) { const t = u / fS; return [-s + 2 * s * t, r, 0, 1]; }
    u -= fS;
    if (u < fA) { const a = Math.PI / 2 - Math.PI * (u / fA); return [s + r * Math.cos(a), r * Math.sin(a), Math.cos(a), Math.sin(a)]; }
    u -= fA;
    if (u < fS) { const t = u / fS; return [s - 2 * s * t, -r, 0, -1]; }
    u -= fS;
    const a = -Math.PI / 2 - Math.PI * (u / fA);
    return [-s + r * Math.cos(a), r * Math.sin(a), Math.cos(a), Math.sin(a)];
  };
}

// A strip of rings that follow the stadium outline at different offsets/heights.
// rows: [{ off, y, pleat }]. Pleats crimp the curved ends like a real foil tray.
export function ringStrip({ s, r, rows, segs, pleats = 0, rand = Math.random, uvScale = 1, seamU = 0, flip = false }) {
  const param = stadiumParam(s, r);
  const cols = segs + 1;
  const pos = new Float32Array(rows.length * cols * 3), uv = new Float32Array(rows.length * cols * 2);
  const L = 4 * s + 2 * Math.PI * r;
  const jitter = Array.from({ length: pleats + 1 }, () => 0.6 + rand() * 0.8);
  let vAcc = 0, prev = null;
  rows.forEach((row, i) => {
    const rr = Math.max(1e-4, r + row.off);
    for (let j = 0; j < cols; j++) {
      const u = j / segs;
      const [x, z, nx, nz] = param(s, rr, u + seamU);
      let disp = 0;
      if (pleats && row.pleat) {
        const w = smoothstep(s - 0.25, s + 0.05, Math.abs(x));
        const k = Math.floor(u * pleats);
        disp = row.pleat * w * jitter[k] * Math.sin(u * pleats * Math.PI * 2);
      }
      const o = (i * cols + j) * 3;
      pos[o] = x + nx * disp; pos[o + 1] = row.y; pos[o + 2] = z + nz * disp;
      uv[(i * cols + j) * 2] = (u * L) / uvScale;
    }
    if (prev) vAcc += Math.hypot(row.off - prev.off, row.y - prev.y);
    for (let j = 0; j < cols; j++) uv[(i * cols + j) * 2 + 1] = vAcc / uvScale;
    prev = row;
  });
  const idx = [];
  for (let i = 0; i < rows.length - 1; i++)
    for (let j = 0; j < segs; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Weld the seam normals so there is no crease where the strip closes.
  const n = g.attributes.normal;
  for (let i = 0; i < rows.length; i++) {
    const a = i * cols, b = i * cols + segs;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

// ---------- Studio environment (reflections) ----------
// A warm room with a soft box behind the dessert, so the glassy caramel picks up a
// long, soft highlight, and a NOMA-red floor that tints the foil.
export function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 16),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: new THREE.Color(0.11, 0.075, 0.06) })
  );
  env.add(room);
  const panel = (w, h, rgb, k, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb).multiplyScalar(k), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
    return m;
  };
  panel(22, 22, [0.62, 0.07, 0.07], 0.12, [0, -4, 0]);
  panel(22, 22, [1, 0.95, 0.9], 0.35, [0, -1.5, 9]); // light wall in front so outer foil reads bright // red bounce from the hero
  panel(4.2, 1.6, [1, 0.96, 0.88], 7, [-1.0, 6.2, -6.5]); // key soft box (reflects on caramel)
  panel(1.0, 7, [1, 0.95, 0.85], 3.2, [-8, 3, 0.5]); // tall strip, left
  panel(5, 2.2, [1, 0.9, 0.78], 1.4, [6, 4, 5]); // warm fill, right front
  panel(8, 3, [1, 0.97, 0.92], 0.8, [0, 9, 2]); // overhead
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

// ---------- Foil: crinkled normal map ----------
export function foilNormalMap(rand, size = 512) {
  const c = canvas(size, size), g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, size, size);
  const tiled = (fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  // Facets: overlapping flat planes read as hand-pressed foil.
  for (let i = 0; i < 220; i++) {
    const cx = rand() * size, cy = rand() * size, R = size * (0.04 + rand() * 0.16);
    const v = Math.floor(rand() * 255), pts = [];
    for (let k = 0; k < 3 + Math.floor(rand() * 3); k++) {
      const a = rand() * Math.PI * 2;
      pts.push([cx + Math.cos(a) * R * (0.4 + rand()), cy + Math.sin(a) * R * (0.4 + rand())]);
    }
    tiled(() => {
      g.fillStyle = `rgba(${v},${v},${v},0.12)`;
      g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill();
    });
  }
  // Creases.
  for (let i = 0; i < 140; i++) {
    let x = rand() * size, y = rand() * size, a = rand() * Math.PI * 2;
    const pts = [[x, y]], n = 3 + Math.floor(rand() * 6), step = size * (0.02 + rand() * 0.05);
    for (let k = 0; k < n; k++) { a += (rand() - 0.5) * 0.9; x += Math.cos(a) * step; y += Math.sin(a) * step; pts.push([x, y]); }
    const light = rand() > 0.5, w = 0.8 + rand() * 1.8;
    tiled(() => {
      g.strokeStyle = light ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
      g.lineWidth = w;
      g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    });
  }
  const src = g.getImageData(0, 0, size, size), d = src.data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] / 255;
  const out = g.createImageData(size, size), o = out.data, k = 6;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
      const dx = (h[y * size + xr] - h[y * size + xl]) * k, dy = (h[yd * size + x] - h[yu * size + x]) * k;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (-dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
  g.putImageData(out, 0, 0);
  return dataTex(c, { repeat: true });
}

// ---------- Stone board: speckled sandstone ----------
export function stoneTextures(rand, size = 512) {
  const col = canvas(size, size), bmp = canvas(size, size);
  const gc = col.getContext("2d"), gb = bmp.getContext("2d");
  gc.fillStyle = "#d8c3a0"; gc.fillRect(0, 0, size, size);
  gb.fillStyle = "#b4b4b4"; gb.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    const x = rand() * size, y = rand() * size, r = size * (0.08 + rand() * 0.25);
    const grad = gc.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() > 0.5 ? "120,96,66" : "246,234,210";
    grad.addColorStop(0, `rgba(${tone},0.13)`); grad.addColorStop(1, `rgba(${tone},0)`);
    gc.fillStyle = grad; gc.fillRect(0, 0, size, size);
  }
  const palette = ["138,116,88", "181,156,120", "241,230,208", "109,90,68", "201,178,140", "92,76,60"];
  for (let i = 0; i < size * 14; i++) {
    const x = rand() * size, y = rand() * size, r = 0.35 + rand() ** 3 * 2.2;
    const c = palette[Math.floor(rand() * palette.length)], dark = c.startsWith("9") || c.startsWith("1") && c[1] < "4";
    gc.fillStyle = `rgba(${c},${0.45 + rand() * 0.5})`;
    gc.beginPath(); gc.arc(x, y, r, 0, Math.PI * 2); gc.fill();
    gb.fillStyle = dark ? "rgba(60,60,60,0.6)" : "rgba(230,230,230,0.5)";
    gb.beginPath(); gb.arc(x, y, r, 0, Math.PI * 2); gb.fill();
  }
  for (let i = 0; i < size * 1.4; i++) { // pores
    const x = rand() * size, y = rand() * size, r = 0.6 + rand() * 1.4;
    gc.fillStyle = "rgba(96,76,56,0.55)"; gc.beginPath(); gc.arc(x, y, r, 0, Math.PI * 2); gc.fill();
    gb.fillStyle = "rgba(0,0,0,0.85)"; gb.beginPath(); gb.arc(x, y, r, 0, Math.PI * 2); gb.fill();
  }
  return { map: dataTex(col, { srgb: true }), bump: dataTex(bmp) };
}

// Board with a softly rounded edge; planar UVs so the speckle texture lies flat.
export function boardGeometry(R, H) {
  const pts = [new THREE.Vector2(0, 0)], e = 0.05;
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector2(R - e + Math.sin(a) * e, -e + Math.cos(a) * e)); }
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(R - 0.02 + Math.cos(a) * 0.02, -H + 0.02 - Math.sin(a) * 0.02)); }
  pts.push(new THREE.Vector2(0, -H));
  const g = new THREE.LatheGeometry(pts, 128);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * R) + 0.5, p.getZ(i) / (2 * R) + 0.5);
  return g;
}

// A soft, blurred shadow blob drawn with canvas shadowBlur (works in every browser).
export function blobShadowTexture(w, h, draw, blur, alpha = 0.9) {
  const c = canvas(w, h), g = c.getContext("2d");
  g.shadowColor = `rgba(0,0,0,${alpha})`;
  g.shadowBlur = blur;
  g.shadowOffsetX = w * 2;
  g.translate(-w * 2, 0);
  g.fillStyle = "#000";
  draw(g);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ---------- Vanilla pod: flat, wrinkled, tapered ----------
export function vanillaPodGeometry(rand, len = 1.5, maxW = 0.05) {
  const NS = 110, NR = 18, noise = makeNoise(rand), seed = rand() * 10;
  const bend = 0.06 + rand() * 0.06, twist = rand() * 0.6;
  const pos = [], col = [], idx = [];
  const centre = (s) => new THREE.Vector3((s - 0.5) * len, 0, Math.sin(s * Math.PI * 1.2 + seed) * bend);
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const c = centre(s), t = centre(Math.min(1, s + 0.01)).sub(centre(Math.max(0, s - 0.01))).normalize();
    const side = new THREE.Vector3(-t.z, 0, t.x);
    // Taper to a fine point at the tip, a short stalk at the other end.
    let w = maxW * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.02)), 0.45) * (0.9 + 0.2 * noise(s * 6, seed));
    if (s < 0.05) w = Math.max(w, 0.006);
    const th = w * 0.36 + 0.004;
    const lift = s > 0.9 ? (s - 0.9) * 0.25 : 0; // tip curls up a touch
    for (let j = 0; j <= NR; j++) {
      const a = (j / NR) * Math.PI * 2 + twist * s;
      let ex = Math.cos(a), ey = Math.sin(a);
      if (ey < 0) ey *= 0.55; // flattened where it rests on the board
      const wr = 1 + 0.1 * Math.sin(a * 7 + seed + 3 * noise(s * 9, 2)) + 0.08 * (noise(s * 30, a * 2 + seed) - 0.5);
      const p = c.clone().addScaledVector(side, w * ex * wr);
      p.y = th * (ey * wr + 0.55) + lift;
      pos.push(p.x, p.y, p.z);
      const shade = 0.75 + 0.5 * (wr - 1) * 4 + 0.15 * noise(s * 40, j);
      const base = [0.055, 0.026, 0.012];
      col.push(base[0] * shade, base[1] * shade, base[2] * shade);
    }
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j, b = a + 1, c = a + NR + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Edible flower (frangipani, as in the real product photo) ----------
export function flower(rand) {
  const group = new THREE.Group();
  const L = 0.2, NU = 16, NV = 10;
  const petal = () => {
    const pos = [], col = [], idx = [];
    const skew = 0.035;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const w = 0.085 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.85) + 0.006;
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * 2 - 1;
        const x = v * w + skew * u * u + 0.012 * (1 - u) * v;
        const z = u * L;
        const y = 0.06 * u * u * (1 - 0.35 * u) + 0.012 * v * v * u + 0.01 * Math.sin(u * 9) * 0.3;
        pos.push(x, y, z);
        const yel = 1 - smoothstep(0.05, 0.45, u);
        col.push(1, 0.98 - yel * 0.12, 0.92 - yel * 0.68);
      }
    }
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(1, 1, 1), sheenRoughness: 0.4,
    side: THREE.DoubleSide,
  });
  const geo = petal();
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = (k / 5) * Math.PI * 2 + rand() * 0.1;
    m.position.y = k * 0.0025;
    m.castShadow = true;
    group.add(m);
  }
  const centre = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf2c440, roughness: 0.6 })
  );
  centre.scale.y = 0.6;
  centre.position.y = 0.012;
  group.add(centre);
  return group;
}

// ---------- Torch flame shader ----------
// A camera-facing ribbon aligned with the torch axis: blue inner cone at the nozzle,
// orange plume flaring where it meets the sugar, noisy flicker.
export function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime, uPower;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float y = vUv.y;           // 0 at the nozzle, 1 where the flame hits the sugar
        float x = vUv.x * 2.0 - 1.0;
        float n = noise(vec2(x * 3.0, y * 7.0 - uTime * 16.0));
        float n2 = noise(vec2(x * 8.0 + 3.0, y * 14.0 - uTime * 27.0));
        float xo = x + (n - 0.5) * 0.45 * y;
        float w = mix(0.16, 1.0, pow(y, 0.9));
        float plume = smoothstep(w, w * 0.15, abs(xo)) * smoothstep(0.0, 0.08, y);
        float wi = 0.2 * (1.0 - y / 0.42);
        float cone = smoothstep(wi, wi * 0.1, abs(x)) * step(y, 0.42) * smoothstep(0.0, 0.03, y);
        vec3 blue = vec3(0.22, 0.42, 1.0);
        vec3 orange = mix(vec3(1.0, 0.72, 0.32), vec3(1.0, 0.36, 0.06), smoothstep(0.5, 1.0, y));
        vec3 col = blue * plume * 0.7 * (1.0 - smoothstep(0.25, 0.65, y));
        col += orange * plume * (0.55 + 0.7 * n2) * smoothstep(0.3, 0.75, y);
        col += vec3(0.7, 0.85, 1.0) * cone * 1.3;
        col += vec3(1.0, 0.8, 0.45) * smoothstep(0.86, 1.0, y) * smoothstep(w, 0.0, abs(xo)) * 0.9;
        col *= uPower * (0.85 + 0.3 * n);
        float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
        gl_FragColor = vec4(col, a * 0.6);
      }`,
  });
}

export function radialTexture(stops, size = 64) {
  const c = canvas(size, size), g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, s]) => grad.addColorStop(o, s));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeTexture(rand, size = 128) {
  const c = canvas(size, size), g = c.getContext("2d");
  for (let i = 0; i < 18; i++) {
    const x = size / 2 + (rand() - 0.5) * size * 0.4, y = size / 2 + (rand() - 0.5) * size * 0.4;
    const r = size * (0.15 + rand() * 0.25);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.22)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
