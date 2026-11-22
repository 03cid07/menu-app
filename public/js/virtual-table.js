/* Virtual tables for AR.
 *
 * When the phone cannot find a real table (see js/ar-guide.js), the customer can pick one of these instead. The dish is joined to the table
 * into one scene (GlbTools.mergeGlbs, done in js/viewer.js), so the dish stands on top of it and the pair is put on the floor in front of them.
 *
 *   VirtualTable.LIST            [{ id, name, note, shape, color, url, img }]   (img = the picture shown on the table's card in the AR picker)
 *   VirtualTable.byId(id)        one entry of LIST, or undefined
 *   VirtualTable.arrange(table, feet)   where each dish stands on a table top so nothing hangs over the edge: table = { shape, w, d } (meters), feet = [[width, depth], ...]
 *                                one per dish. Returns [{ x, z }, ...] (centres, table middle = 0,0) in the same order, or null when they do not all fit.
 *   VirtualTable.fits(id, feet)  true when arrange() finds room for these dishes on that table (uses the sizes in LIST, so no download is needed)
 *   VirtualTable.load(id)        Promise of { u8, size, ctr, top }: the .glb bytes, its size and centre (meters), and how high its top is.
 *                                Downloaded once, then kept.
 *
 * The .glb files in models/ are the owner's tables, slimmed down for phones (about 1 to 2 MB each instead of 37 to 82 MB):
 * fewer triangles and 1024 px textures. Real sizes are kept (the round ones are 90 cm wide and 80 cm high, the white one 60 cm and 75 cm).
 * To add a table: put its .glb (one buffer, bottom at y = 0, in meters) in models/ and a preview picture in images/tables/, then add a line to LIST below.
 */
(function (root) {
  "use strict";

  const LIST = [
    { id: "brown", name: "Brown table", note: "Round, 90 cm wide",  shape: "round",  color: "#b5683a", w: 0.9, d: 0.9, url: "models/table-brown.glb", img: "images/tables/brown.png" },
    { id: "round", name: "Round table", note: "Round, 90 cm wide",  shape: "round",  color: "#a9602f", w: 0.9, d: 0.9, url: "models/table-round.glb", img: "images/tables/round.png" },
    { id: "white", name: "White table", note: "Square, 60 cm wide", shape: "square", color: "#ecebe7", w: 0.6, d: 0.6, url: "models/table-white.glb", img: "images/tables/white.png" },
  ];

  const cache = new Map();

  const byId = (id) => LIST.find((t) => t.id === id);

  function load(id) {
    const t = byId(id);
    if (!t) return Promise.reject(new Error("Unknown table: " + id));
    if (!cache.has(id)) {
      cache.set(id, (async () => {
        const T = root.GlbTools;
        if (!T) throw new Error("GlbTools is not loaded");
        const res = await fetch(t.url);
        if (!res.ok) throw new Error("Could not download " + t.url);
        const buf = await res.arrayBuffer();
        const bd = T.bounds(T.parseGlb(buf).gltf);
        if (!bd) throw new Error("The table has no shapes to measure");
        return { u8: new Uint8Array(buf), size: bd.size, ctr: bd.ctr, top: bd.size[1] };
      })().catch((e) => { cache.delete(id); throw e; }));
    }
    return cache.get(id);
  }

  // ---- Room on the table top ----
  // Every dish is treated as a circle as wide as its longer side (exact for round plates and cups, a little roomy for long dishes), kept EDGE_M
  // inside the rim and GAP_M away from its neighbours. Biggest dish first, each one at the free spot closest to the middle. The finished group
  // is then slid so it is centred on the table, when that still fits.
  const EDGE_M = 0.05, GAP_M = 0.03, STEP_M = 0.01;

  function arrange(table, feet) {
    if (!table || !feet || !feet.length) return feet && !feet.length ? [] : null;
    const round = table.shape !== "square";
    const hw = table.w / 2, hd = (table.d || table.w) / 2, R = Math.min(hw, hd);
    const r = feet.map((f) => Math.max(f[0], f[1]) / 2);
    const inside = (x, z, rr) => (round ? Math.hypot(x, z) + rr <= R - EDGE_M + 1e-9 : Math.abs(x) + rr <= hw - EDGE_M + 1e-9 && Math.abs(z) + rr <= hd - EDGE_M + 1e-9);
    if (r.some((rr) => !inside(0, 0, rr))) return null;                      // one dish alone is already too big
    const order = r.map((_, i) => i).sort((a, b) => r[b] - r[a]);
    const out = new Array(feet.length), done = [];
    const cands = [];
    for (let x = -hw; x <= hw + 1e-9; x += STEP_M) for (let z = -hd; z <= hd + 1e-9; z += STEP_M) cands.push([x, z, Math.hypot(x, z)]);
    cands.sort((a, b) => a[2] - b[2] || Math.abs(a[1]) - Math.abs(b[1]));   // closest to the middle first; on a tie the one along the left-right line
    for (const i of order) {
      let at = null;
      for (const c of cands) {
        if (!inside(c[0], c[1], r[i])) continue;
        if (done.every((j) => Math.hypot(c[0] - out[j].x, c[1] - out[j].z) >= r[i] + r[j] + GAP_M - 1e-9)) { at = c; break; }
      }
      if (!at) return null;
      out[i] = { x: at[0], z: at[1] }; done.push(i);
    }
    // centre the group (the box around all the dishes) on the table, if every dish is still inside and apart
    const x0 = Math.min(...out.map((p, i) => p.x - r[i])), x1 = Math.max(...out.map((p, i) => p.x + r[i]));
    const z0 = Math.min(...out.map((p, i) => p.z - r[i])), z1 = Math.max(...out.map((p, i) => p.z + r[i]));
    const sx = -(x0 + x1) / 2, sz = -(z0 + z1) / 2;
    if (out.every((p, i) => inside(p.x + sx, p.z + sz, r[i]))) out.forEach((p) => { p.x += sx; p.z += sz; });
    return out;
  }

  function fits(id, feet) {
    const t = byId(id);
    return !!(t && arrange({ shape: t.shape, w: t.w, d: t.d }, feet));
  }

  const VirtualTable = { LIST, byId, load, arrange, fits, EDGE_M, GAP_M };
  if (typeof module !== "undefined" && module.exports) module.exports = VirtualTable;
  root.VirtualTable = VirtualTable;
})(typeof window !== "undefined" ? window : globalThis);
