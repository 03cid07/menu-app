/* GLB tools: read/write .glb files, embed textures, resize, and bake in food & drink effects.
   No page or DOM code lives here except prepImage (texture shrinking), so it can also be tested in Node.
   Used by glb-fixer.js (the 3D model fixer that opens from the admin page). */
(function (root) {
/* ---------- GLB read / write ---------- */
const MAGIC = 0x46546C67, T_JSON = 0x4E4F534A, T_BIN = 0x004E4942;

function parseGlb(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== MAGIC) throw new Error("Not a valid .glb file");
  let off = 12, gltf = null, bin = new Uint8Array(0);
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const data = new Uint8Array(buf, off + 8, len);
    if (type === T_JSON) gltf = JSON.parse(new TextDecoder().decode(data).replace(/[\0 ]+$/, ""));
    else if (type === T_BIN) bin = data;
    off += 8 + len;
  }
  if (!gltf) throw new Error("No JSON chunk found in .glb");
  return { gltf, bin };
}

function buildGlb(gltf, bin) {                       // bin length must already be a multiple of 4
  const js = new TextEncoder().encode(JSON.stringify(gltf));
  const jsLen = js.length + ((4 - (js.length % 4)) % 4);
  const total = 20 + jsLen + (bin.length ? 8 + bin.length : 0);
  const out = new Uint8Array(total).fill(0x20);
  const o = new DataView(out.buffer);
  o.setUint32(0, MAGIC, true); o.setUint32(4, 2, true); o.setUint32(8, total, true);
  o.setUint32(12, jsLen, true); o.setUint32(16, T_JSON, true);
  out.set(js, 20);
  if (bin.length) {
    const p = 20 + jsLen;
    out.fill(0, p, p + 8 + bin.length);
    o.setUint32(p, bin.length, true); o.setUint32(p + 4, T_BIN, true);
    out.set(bin, p + 8);
  }
  return out;
}

/* ---------- textures: embed + optional downscale ---------- */
const baseName = (uri) => decodeURIComponent(uri).split(/[\\/]/).pop().toLowerCase();

async function prepImage(file, max) {
  const mime = /\.png$/i.test(file.name) ? "image/png" : "image/jpeg";
  const orig = new Uint8Array(await file.arrayBuffer());
  if (!max) return { bytes: orig, mime };
  const bmp = await createImageBitmap(file);
  const m = Math.max(bmp.width, bmp.height);
  if (m <= max) { bmp.close(); return { bytes: orig, mime }; }
  const k = max / m, c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise((r) => c.toBlob(r, mime, 0.9));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime };
}

async function embedTextures(parsed, files, maxTex) {
  const g = structuredClone(parsed.gltf);
  const chunks = [parsed.bin]; let len = parsed.bin.length;
  const status = [];
  g.bufferViews = g.bufferViews || [];
  for (const img of g.images || []) {
    if (img.uri === undefined) { status.push({ name: img.name || "(already embedded)", ok: true }); continue; }
    if (img.uri.startsWith("data:")) { status.push({ name: "(data URI)", ok: true }); continue; }
    const name = baseName(img.uri), f = files.get(name);
    if (!f) { status.push({ name: decodeURIComponent(img.uri), ok: false }); continue; }
    const { bytes, mime } = await prepImage(f, maxTex);
    const padded = new Uint8Array(bytes.length + ((4 - (bytes.length % 4)) % 4));
    padded.set(bytes);
    g.bufferViews.push({ buffer: 0, byteOffset: len, byteLength: bytes.length });
    img.bufferView = g.bufferViews.length - 1; img.mimeType = mime; delete img.uri;
    chunks.push(padded); len += padded.length;
    status.push({ name: f.name, ok: true });
  }
  if (g.buffers && g.buffers[0] && g.buffers[0].uri && !g.buffers[0].uri.startsWith("data:"))
    throw new Error("This .glb points to an external .bin file, which is not supported");
  const bin = new Uint8Array(len); let p = 0;
  for (const c of chunks) { bin.set(c, p); p += c.length; }
  g.buffers = g.buffers && g.buffers.length ? g.buffers : [{}];
  g.buffers[0] = { ...g.buffers[0], byteLength: len };
  return { glb: buildGlb(g, bin), status };
}

/* ---------- resize: wrap the scene in a scaled node ---------- */
function resizeGlb(buf, factor) {
  const { gltf, bin } = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const scene = gltf.scenes[gltf.scene || 0];
  gltf.nodes.push({ name: "SizeFix", scale: [factor, factor, factor], children: scene.nodes.slice() });
  scene.nodes = [gltf.nodes.length - 1];
  return buildGlb(gltf, bin);
}

/* ---------- food & drink effects (baked into the .glb) ---------- */
function rng(seed) {                                   // small seeded random so the same settings always give the same result
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function sphereGeo() {
  const A = 8, B = 6, pos = [], nor = [], idx = [];
  for (let j = 0; j <= B; j++) for (let i = 0; i <= A; i++) {
    const v = (j / B) * Math.PI, u = (i / A) * 2 * Math.PI;
    const x = Math.sin(v) * Math.cos(u), y = Math.cos(v), z = Math.sin(v) * Math.sin(u);
    pos.push(x, y, z); nor.push(x, y, z);
  }
  for (let j = 0; j < B; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  return { pos, nor, idx };
}
function cubeGeo() {                                   // unit cube
  const F = [[[1,0,0],[0,1,0],[0,0,1]], [[-1,0,0],[0,0,1],[0,1,0]], [[0,1,0],[0,0,1],[1,0,0]],
             [[0,-1,0],[1,0,0],[0,0,1]], [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[0,1,0],[1,0,0]]];
  const pos = [], nor = [], idx = [];
  F.forEach(([n, u, v], f) => {
    for (const [a, b] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
      for (let c = 0; c < 3; c++) pos.push(n[c] * 0.5 + u[c] * 0.5 * a + v[c] * 0.5 * b);
      nor.push(...n);
    }
    idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { pos, nor, idx };
}
function starGeo() {                                   // two crossed 4-point stars, so it reads from any side
  const pos = [], nor = [], idx = [];
  for (const plane of [0, 1]) {
    const base = pos.length / 3;
    pos.push(0, 0, 0); nor.push(plane ? 1 : 0, 0, plane ? 0 : 1);
    for (let k = 0; k < 8; k++) {
      const r = k % 2 ? 0.26 : 1, a = (k * Math.PI) / 4, x = Math.cos(a) * r, y = Math.sin(a) * r;
      pos.push(plane ? 0 : x, y, plane ? x : 0); nor.push(plane ? 1 : 0, 0, plane ? 0 : 1);
    }
    for (let k = 0; k < 8; k++) idx.push(base, base + 1 + k, base + 1 + ((k + 1) % 8));
  }
  return { pos, nor, idx };
}
function torusGeo() {                                 // flat ring (halo), lies in the XZ plane
  const A = 20, B = 8, R = 1, r = 0.13, pos = [], nor = [], idx = [];
  for (let j = 0; j <= B; j++) for (let i = 0; i <= A; i++) {
    const v = (j / B) * 6.28319, u = (i / A) * 6.28319, c = Math.cos(u), z = Math.sin(u);
    pos.push((R + r * Math.cos(v)) * c, r * Math.sin(v), (R + r * Math.cos(v)) * z); nor.push(Math.cos(v) * c, Math.sin(v), Math.cos(v) * z);
  }
  for (let j = 0; j < B; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + A + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  return { pos, nor, idx };
}
function cylGeo() {                                    // open tube, radius 1, from y = 0 to y = 1 (light beam)
  const N = 20, pos = [], nor = [], idx = [];
  for (let i = 0; i <= N; i++) { const u = (i / N) * 6.28319, x = Math.cos(u), z = Math.sin(u); pos.push(x, 0, z, x, 1, z); nor.push(x, 0, z, x, 0, z); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return { pos, nor, idx };
}
const qMul = (a, b) => [a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0], a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]];
const qAxis = (a, ang) => { const s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; };

/* size = model size and ctr = model centre, both in glTF units (meters), measured at 100% scale.
   fxs = { effectId: strength 0..1 }. Returns { glb, hasAnim }. */
function applyEffects(buf, size, ctr, fxs) {
  const { gltf, bin } = parseGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const [sx, sy, sz] = size, [cx, cy, cz] = ctr;
  const H = sy, maxDim = Math.max(sx, sy, sz), top = cy + sy / 2, minY = cy - sy / 2;
  const on = (id) => fxs[id] || 0;
  const R = rng(20240607);
  const scene = gltf.scenes[gltf.scene || 0];
  for (const k of ["bufferViews", "accessors", "nodes", "materials", "meshes"]) gltf[k] = gltf[k] || [];
  const chunks = [bin]; let len = bin.length;

  /* --- look: tint, gloss, glow (changes the model's own materials) --- */
  const tint = [1, 1, 1];
  const mix = (t, k) => t.forEach((v, i) => { tint[i] *= 1 + (v - 1) * k; });
  if (on("golden")) mix([1, 0.84, 0.55], on("golden"));
  if (on("cold")) mix([0.78, 0.92, 1], on("cold"));
  const gloss = on("gloss"), glow = on("glow");
  for (const m of gltf.materials) {
    const p = (m.pbrMetallicRoughness = m.pbrMetallicRoughness || {});
    const bc = (p.baseColorFactor = p.baseColorFactor || [1, 1, 1, 1]);
    for (let i = 0; i < 3; i++) bc[i] = Math.min(1, bc[i] * tint[i]);
    if (gloss) {
      p.roughnessFactor = (p.roughnessFactor ?? 1) * (1 - 0.7 * gloss);
      m.extensions = { ...(m.extensions || {}), KHR_materials_clearcoat: { clearcoatFactor: 0.3 + 0.7 * gloss, clearcoatRoughnessFactor: 0.06 } };
    }
    if (glow) {
      const e = m.emissiveFactor || [0, 0, 0];
      m.emissiveFactor = [Math.min(1, e[0] + 0.38 * glow), Math.min(1, e[1] + 0.15 * glow), Math.min(1, e[2] + 0.03 * glow)];
    }
  }

  /* --- buffer helpers --- */
  const addView = (arr, target) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const padded = new Uint8Array(bytes.length + ((4 - (bytes.length % 4)) % 4)); padded.set(bytes);
    const v = { buffer: 0, byteOffset: len, byteLength: bytes.length }; if (target) v.target = target;
    gltf.bufferViews.push(v); chunks.push(padded); len += padded.length;
    return gltf.bufferViews.length - 1;
  };
  const addAcc = (arr, type, comp, count, target, min, max) => {
    const a = { bufferView: addView(arr, target), componentType: comp, count, type };
    if (min) { a.min = min; a.max = max; }
    gltf.accessors.push(a); return gltf.accessors.length - 1;
  };
  const addMesh = (g, material) => {
    const pos = new Float32Array(g.pos), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], pos[i + j]); mx[j] = Math.max(mx[j], pos[i + j]); }
    const prim = {
      attributes: { POSITION: addAcc(pos, "VEC3", 5126, pos.length / 3, 34962, mn, mx), NORMAL: addAcc(new Float32Array(g.nor), "VEC3", 5126, g.nor.length / 3, 34962) },
      indices: addAcc(new Uint16Array(g.idx), "SCALAR", 5123, g.idx.length, 34963), material, mode: 4,
    };
    gltf.meshes.push({ name: "FX", primitives: [prim] }); return gltf.meshes.length - 1;
  };
  const mat = (color, emis, rough, blend) => {
    gltf.materials.push({ name: "FX", pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: rough }, emissiveFactor: emis, alphaMode: blend ? "BLEND" : "OPAQUE", doubleSided: true });
    return gltf.materials.length - 1;
  };

  /* --- animation: one clip ("FoodFX", 8 s loop) holding every moving part --- */
  const K = 48, T = 8;
  const anim = { name: "FoodFX", samplers: [], channels: [] };
  const timeAccs = {};                                // time accessor per sample count
  const chan = (node, path, type, data, k = K) => {
    if (timeAccs[k] === undefined) { const t = new Float32Array(k + 1); for (let i = 0; i <= k; i++) t[i] = (i * T) / k; timeAccs[k] = addAcc(t, "SCALAR", 5126, k + 1, 0, [0], [T]); }
    anim.samplers.push({ input: timeAccs[k], output: addAcc(data, type, 5126, k + 1), interpolation: "LINEAR" });
    anim.channels.push({ sampler: anim.samplers.length - 1, target: { node, path } });
  };
  const roots = [];
  const emit = (o) => {                                // one particle: position + size (+ rotation) sampled over the loop
    const kk = o.k || K;
    const P = new Float32Array((kk + 1) * 3), S = new Float32Array((kk + 1) * 3), Q = o.rot ? new Float32Array((kk + 1) * 4) : null;
    for (let k = 0; k <= kk; k++) {
      const tt = k / kk, u = (((o.cycles * tt + o.phase) % 1) + 1) % 1;
      P.set(o.pos(u), k * 3); S.set(o.scl(u), k * 3); if (Q) Q.set(o.rot(tt), k * 4);
    }
    const node = { mesh: o.mesh, translation: [P[0], P[1], P[2]], scale: [S[0], S[1], S[2]] };   // first frame = still pose for viewers that cannot animate
    if (Q) node.rotation = [Q[0], Q[1], Q[2], Q[3]];
    gltf.nodes.push(node); const ni = gltf.nodes.length - 1; roots.push(ni);
    chan(ni, "translation", "VEC3", P, kk); chan(ni, "scale", "VEC3", S, kk); if (Q) chan(ni, "rotation", "VEC4", Q, kk);
  };
  const phase = () => Math.floor(R() * K) / K;
  const grow = (u) => Math.max(0.002, u);

  let s;
  if ((s = on("steam"))) {
    const m = addMesh(sphereGeo(), mat([1, 1, 1, 0.3], [0.15, 0.15, 0.15], 1, true));
    const n = 3 + Math.round(5 * s);
    for (let i = 0; i < n; i++) {
      const bx = cx + (R() - 0.5) * sx * 0.6, bz = cz + (R() - 0.5) * sz * 0.6, rise = H * (0.55 + 0.5 * s);
      const size = maxDim * (0.1 + 0.06 * R()), sw = maxDim * 0.08 * (R() + 0.5);
      emit({ mesh: m, cycles: 1, phase: phase(),
        pos: (u) => [bx + Math.sin(u * 6.283 + i) * sw, top + u * rise, bz + Math.cos(u * 6.283 + i) * sw * 0.6],
        scl: (u) => { const e = grow(Math.sin(Math.PI * u)) * (0.6 + 0.9 * u); return [size * e, size * e * 1.7, size * e]; } });
    }
  }
  if ((s = on("fizz"))) {
    const m = addMesh(sphereGeo(), mat([0.88, 0.96, 1, 0.4], [0.1, 0.12, 0.15], 0.1, true));
    const n = 8 + Math.round(16 * s), y0 = minY + H * 0.5, y1 = top + H * 0.45;
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, r = Math.sqrt(R()) * 0.8 * (Math.min(sx, sz) / 2), bx = cx + Math.cos(a) * r, bz = cz + Math.sin(a) * r;
      const size = maxDim * (0.018 + 0.028 * R());
      emit({ mesh: m, cycles: R() < 0.5 ? 1 : 2, phase: phase(),
        pos: (u) => [bx + Math.sin(u * 9 + i) * sx * 0.02, y0 + (y1 - y0) * u, bz + Math.cos(u * 7 + i) * sz * 0.02],
        scl: (u) => { const e = grow(Math.sqrt(Math.sin(Math.PI * u))); return [size * e, size * e, size * e]; } });
    }
  }
  if ((s = on("sparkle"))) {
    const m = addMesh(starGeo(), mat([1, 0.96, 0.72, 1], [1, 0.9, 0.5], 0.3, false));
    const n = 4 + Math.round(8 * s);
    for (let i = 0; i < n; i++) {
      const th = R() * 6.283, ph = Math.acos(2 * R() - 1), g = 0.62 * (1 + 0.35 * R());
      const P = [cx + Math.sin(ph) * Math.cos(th) * sx * g, cy + Math.cos(ph) * sy * g, cz + Math.sin(ph) * Math.sin(th) * sz * g];
      const size = maxDim * (0.07 + 0.07 * R());
      emit({ mesh: m, cycles: R() < 0.5 ? 1 : 2, phase: phase(), pos: () => P,
        scl: (u) => { const e = grow(Math.pow(Math.sin(Math.PI * u), 2)); return [size * e, size * e, size * e]; },
        rot: (tt) => qAxis([0, 1, 0], 6.283 * tt) });
    }
  }
  if ((s = on("sprinkles"))) {
    const cols = [[1, 0.45, 0.7, 1], [1, 0.85, 0.2, 1], [0.35, 0.75, 1, 1], [0.5, 0.9, 0.45, 1], [1, 1, 1, 1]];
    const meshes = cols.map((c) => addMesh(cubeGeo(), mat(c, [0, 0, 0], 0.5, false)));
    const n = 10 + Math.round(22 * s), y0 = top + H * 0.35;
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, r = (Math.max(sx, sz) / 2) * (0.75 + 0.75 * R()), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const len = maxDim * (0.05 + 0.02 * R()), w = len * 0.28, turns = 2 + Math.floor(R() * 3);
      let ax = [R() - 0.5, R() - 0.5, R() - 0.5]; const l = Math.hypot(...ax) || 1; ax = ax.map((v) => v / l);
      emit({ mesh: meshes[i % 5], cycles: R() < 0.5 ? 1 : 2, phase: phase(),
        pos: (u) => [x, y0 + (minY - y0) * u, z],
        scl: (u) => { const e = grow(Math.min(1, 6 * u, 6 * (1 - u))); return [len * e, w * e, w * e]; },
        rot: (tt) => qAxis(ax, 6.283 * turns * tt) });
    }
  }

  if ((s = on("munch"))) {                             // Minecraft eating: voxel crumbs burst out every 2 s while the food shakes
    const cols = [[0.55, 0.35, 0.18, 1], [0.8, 0.6, 0.3, 1], [0.95, 0.8, 0.45, 1], [0.4, 0.25, 0.12, 1]];
    const meshes = cols.map((c) => addMesh(cubeGeo(), mat(c, [0, 0, 0], 0.9, false)));
    const n = 10 + Math.round(18 * s), life = 0.45, grav = maxDim * 6;
    for (let i = 0; i < n; i++) {
      const u0 = R() * (0.75 - life), a = R() * 6.283, sp = maxDim * (0.35 + 0.5 * R());
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = maxDim * (0.9 + 0.9 * R()), size = maxDim * (0.025 + 0.02 * R());
      const p0 = [cx + sx * 0.2 + (R() - 0.5) * sx * 0.25, top - H * 0.15, cz + sz * 0.25 + (R() - 0.5) * sz * 0.25];
      let ax = [R() - 0.5, R() - 0.5, R() - 0.5]; const l = Math.hypot(...ax) || 1; ax = ax.map((v) => v / l);
      const turns = 4 + Math.floor(R() * 5);
      emit({ mesh: meshes[i % 4], cycles: 4, phase: 0, k: 96,
        pos: (u) => { const tau = Math.min(Math.max(u - u0, 0), life) * 2; return [p0[0] + vx * tau, p0[1] + vy * tau - 0.5 * grav * tau * tau, p0[2] + vz * tau]; },
        scl: (u) => { const e = grow(u >= u0 && u <= u0 + life ? Math.min(1, (u - u0) * 40, (u0 + life - u) * 10) : 0); return [size * e, size * e, size * e]; },
        rot: (tt) => qAxis(ax, 6.283 * turns * tt) });
    }
  }

  if ((s = on("heaven"))) {                            // Going to heaven: cloud + light beam + rising gold dust (halo and the lift are added with the motion below)
    const foot = Math.max(sx, sz) / 2, cb = Math.max(foot, maxDim * 0.3);
    const cloud = addMesh(sphereGeo(), mat([1, 1, 1, 1], [0.55, 0.58, 0.65], 1, false));
    const puffs = 8;
    for (let i = 0; i < puffs; i++) {
      const a = (i / 6) * 6.283 + R() * 0.5, d = i < 6 ? cb * (0.7 + 0.2 * R()) : cb * 0.2 * R(), rr = cb * (0.42 + 0.18 * R());
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = minY - rr * 0.35, ph = R() * 6.283;
      emit({ mesh: cloud, cycles: 1, phase: 0,
        pos: (u) => [x, y + Math.sin(6.283 * 2 * u + ph) * maxDim * 0.015, z], scl: () => [rr, rr * 0.55, rr] });
    }
    const beamH = H * (2.2 + 1.6 * s);
    [[0.55, 0.22], [0.9, 0.1]].forEach(([k, al], bi) => {
      const m = addMesh(cylGeo(), mat([1, 0.92, 0.6, al], [1, 0.85, 0.45], 1, true)), rad = Math.max(foot, maxDim * 0.18) * k;
      emit({ mesh: m, cycles: 1, phase: 0, pos: () => [cx, minY - H * 0.02, cz],
        scl: (u) => { const b = 1 + 0.06 * Math.sin(6.283 * 2 * u + bi); return [rad * b, beamH, rad * b]; } });
    });
    const star = addMesh(starGeo(), mat([1, 0.9, 0.5, 1], [1, 0.8, 0.3], 0.3, false));
    const n = 6 + Math.round(10 * s);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, r = Math.max(foot, maxDim * 0.18) * (0.2 + 0.6 * R()), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const y0 = minY + H * 0.1, y1 = minY + beamH * 0.9, size = maxDim * (0.035 + 0.035 * R());
      emit({ mesh: star, cycles: R() < 0.5 ? 1 : 2, phase: phase(),
        pos: (u) => [x + Math.sin(u * 8 + i) * foot * 0.08, y0 + (y1 - y0) * u, z],
        scl: (u) => { const e = grow(Math.pow(Math.sin(Math.PI * u), 1.5)); return [size * e, size * e, size * e]; },
        rot: (tt) => qAxis([0, 1, 0], 6.283 * tt) });
    }
  }

  /* --- whole-model motion: spin / float / jelly / munch (pivot sits at the model's base) --- */
  const spin = on("spin"), flt = on("float"), jel = on("jelly"), mun = on("munch"), hvn = on("heaven");
  let rootNodes = scene.nodes.slice();
  if (spin || flt || jel || mun || hvn) {
    gltf.nodes.push({ name: "FoodFXModel", translation: [-cx, -minY, -cz], children: rootNodes });
    const mi = gltf.nodes.length - 1;
    const kids = [mi]; let halo = -1;
    if (hvn) {                                         // halo rides above the food (child of the pivot, so it lifts with it)
      const hm = addMesh(torusGeo(), mat([1, 0.86, 0.35, 1], [1, 0.8, 0.25], 0.3, false));
      const hs = Math.max(Math.max(sx, sz) * 0.3, maxDim * 0.12);
      gltf.nodes.push({ name: "FoodFXHalo", mesh: hm, translation: [0, H * 1.15, 0], rotation: qAxis([1, 0, 0], 0.2), scale: [hs, hs, hs] });
      halo = gltf.nodes.length - 1; kids.push(halo);
    }
    gltf.nodes.push({ name: "FoodFXPivot", translation: [cx, minY, cz], children: kids });
    const pi = gltf.nodes.length - 1; rootNodes = [pi];
    if (halo >= 0) { const d = new Float32Array((K + 1) * 3); for (let k = 0; k <= K; k++) d.set([0, H * 1.15 + H * 0.03 * Math.sin((6.283 * 2 * k) / K), 0], k * 3); chan(halo, "translation", "VEC3", d); }
    const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const asc = (tt) => (tt < 0.25 ? 0 : tt < 0.6 ? sm((tt - 0.25) / 0.35) : tt < 0.8 ? 1 : 1 - sm((tt - 0.8) / 0.2));   // rest, rise, hold, float back down
    const KM = mun ? 192 : K;                          // munch shakes fast, so it needs more samples
    const fill = (comps, fn) => { const d = new Float32Array((KM + 1) * comps); for (let k = 0; k <= KM; k++) d.set(fn(k / KM), k * comps); return d; };
    const chew = (tt) => { const t = tt * T, ph = (t % 2) / 2; return ph >= 0.75 ? 0 : Math.sqrt(Math.sin((Math.PI * ph) / 0.75)); };   // 1.5 s of chewing, 0.5 s rest, every 2 s
    const bob = (tt) => Math.abs(Math.sin(6.283 * 2 * tt * T));
    const spinN = Math.max(1, Math.round(4 * spin));
    if (spin || mun) chan(pi, "rotation", "VEC4", fill(4, (tt) => {
      let q = spin ? qAxis([0, 1, 0], 6.283 * spinN * tt) : [0, 0, 0, 1];
      if (mun) q = qMul(q, qAxis([1, 0, 0], 0.16 * mun * chew(tt) * Math.sin(6.283 * 2 * tt * T)));
      return q;
    }), KM);
    if (flt || mun || hvn) { const A = H * (0.03 + 0.08 * flt), B = H * 0.05 * mun, L = H * (0.5 + hvn);
      chan(pi, "translation", "VEC3", fill(3, (tt) => [cx, minY + (flt ? A * (0.5 + 0.5 * Math.sin(6.283 * 2 * tt)) : 0) + (mun ? B * chew(tt) * bob(tt) : 0) + (hvn ? L * asc(tt) : 0), cz]), KM); }
    if (jel || mun) { const a = 0.03 + 0.12 * jel;
      chan(pi, "scale", "VEC3", fill(3, (tt) => {
        const w = jel ? Math.sin(6.283 * 4 * tt) : 0, sq = mun ? 1 - 0.07 * mun * chew(tt) * bob(tt) : 1;
        return [(1 - 0.5 * a * w) / Math.sqrt(sq), (1 + a * w) * sq, (1 - 0.5 * a * w) / Math.sqrt(sq)];
      }), KM); }
  }
  scene.nodes = [...rootNodes, ...roots];

  if (anim.channels.length) gltf.animations = [anim, ...(gltf.animations || [])];   // first, so a plain "autoplay" picks it
  if (gloss) gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed || []), "KHR_materials_clearcoat"])];
  const out = new Uint8Array(len); let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  gltf.buffers = gltf.buffers && gltf.buffers.length ? gltf.buffers : [{}];
  gltf.buffers[0] = { ...gltf.buffers[0], byteLength: len };
  return { glb: buildGlb(gltf, out), hasAnim: anim.channels.length > 0 };
}

const api = { parseGlb, buildGlb, embedTextures, resizeGlb, applyEffects, baseName };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GlbTools = api;
})(typeof window !== "undefined" ? window : globalThis);
