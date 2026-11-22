/* Virtual tables for AR.
 *
 * When the phone cannot find a real table (see js/ar-guide.js), the customer can pick one of these instead. The dish is joined to the table
 * into one scene (GlbTools.mergeGlbs, done in js/viewer.js), so the dish stands on top of it and the pair is put on the floor in front of them.
 *
 *   VirtualTable.LIST            [{ id, name, note, shape, color, url }]
 *   VirtualTable.byId(id)        one entry of LIST, or undefined
 *   VirtualTable.load(id)        Promise of { u8, size, ctr, top }: the .glb bytes, its size and centre (meters), and how high its top is.
 *                                Downloaded once, then kept.
 *
 * The .glb files in models/tables/ are the owner's tables, slimmed down for phones (about 1 to 2 MB each instead of 37 to 82 MB):
 * fewer triangles and 1024 px textures. Real sizes are kept (the round ones are 90 cm wide and 80 cm high, the white one 60 cm and 75 cm).
 * To add a table: put its .glb (one buffer, bottom at y = 0, in meters) in models/tables/ and add a line to LIST below.
 */
(function (root) {
  "use strict";

  const LIST = [
    { id: "brown", name: "Brown table", note: "Round, 90 cm wide",  shape: "round",  color: "#b5683a", url: "models/tables/table-brown.glb" },
    { id: "round", name: "Round table", note: "Round, 90 cm wide",  shape: "round",  color: "#a9602f", url: "models/tables/table-round.glb" },
    { id: "white", name: "White table", note: "Square, 60 cm wide", shape: "square", color: "#ecebe7", url: "models/tables/table-white.glb" },
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

  const VirtualTable = { LIST, byId, load };
  if (typeof module !== "undefined" && module.exports) module.exports = VirtualTable;
  root.VirtualTable = VirtualTable;
})(typeof window !== "undefined" ? window : globalThis);
