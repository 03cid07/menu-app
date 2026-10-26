/* 3D model fixer: a popup on the admin page.
   GlbFixer.open(files) shows the model (+ optional texture images), lets you embed textures, set the real size and add
   food/drink effects, then resolves with the finished .glb as a File, or null if the popup was closed without using it.
   The heavy lifting (reading/writing .glb, effects) lives in glb-tools.js. Nothing is uploaded from here. */
(function () {
  "use strict";
  const T = window.GlbTools, root = document.getElementById("gf");
  if (!T || !root) return;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const MV_URL = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
  const MAX_UPLOAD = 50 * 1048576;                      // the server refuses bigger .glb files
  const REFS = [["Coin", 2.5], ["Credit card", 8.6], ["Phone", 15], ["Coffee mug", 10], ["Dinner plate", 26], ["Laptop", 33]];
  const FOV = 30;                                       // vertical field of view in degrees (fixed, the rulers rely on it)
  const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const STEPS = [[0.1, 0.02], [0.2, 0.05], [0.5, 0.1], [1, 0.1], [2, 0.5], [5, 1], [10, 1], [20, 5], [50, 10], [100, 10], [200, 50], [500, 100]];

  let parsed = null, glbName = "model.glb", embedded = null, origCm = null, origCenter = null, fxResult = null;
  let scaleF = 1, token = 0, spanCm = 0, userZoom = false, missingTex = 0, files = new Map();   // files: lowercase texture name -> File
  let resolver = null, lastFocus = null, viewerReady = null;
  const fx = {};                                        // effect id -> strength 0..1 (missing = off)
  const fxActive = () => Object.values(fx).some((v) => v > 0);

  const fmt = (n) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
  const mb = (n) => (n / 1048576).toFixed(2) + " MB";
  const msg = (t, err) => { const m = $("#gf-msg"); m.textContent = t || ""; m.className = "gf-msg" + (err ? " err" : ""); };
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------- the 3D viewer is only downloaded the first time the fixer opens ---------- */
  function ensureViewer() {
    if (customElements.get("model-viewer")) return Promise.resolve();
    if (!viewerReady) {
      viewerReady = new Promise((ok, no) => {
        const s = document.createElement("script");
        s.type = "module"; s.src = MV_URL;
        s.onerror = () => { viewerReady = null; s.remove(); no(new Error("Could not load the 3D viewer. Check your internet connection and choose the file again.")); };
        document.head.appendChild(s);
        customElements.whenDefined("model-viewer").then(ok);
      });
    }
    return viewerReady;
  }

  /* ---------- stage: rulers, grid, fixed camera ---------- */
  const niceUp = (v) => { const p = 10 ** Math.floor(Math.log10(v)); for (const n of NICE) if (n * p >= v) return n * p; return 10 * p; };

  function sizeCanvas(c) {
    const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
    const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0);
    return { x, w: r.width, h: r.height };
  }

  function syncTarget() {                               // scaling pivots around the model origin, so re-aim the camera at the model's new centre
    const mv = $("#gf-mv");
    if (!origCenter) return;
    mv.setAttribute("camera-target", origCenter.map((v) => (v * scaleF).toFixed(6) + "m").join(" "));
    if (mv.jumpCameraToGoal) mv.jumpCameraToGoal();
  }

  function setCamera(front) {                           // camera distance chosen so spanCm fills the stage height
    const mv = $("#gf-mv");
    const r = ((spanCm / 100) / (2 * Math.tan((FOV * Math.PI) / 360))).toFixed(5) + "m";
    const o = mv.getCameraOrbit ? mv.getCameraOrbit() : null;      // keep the current rotation while zooming
    let th = o && isFinite(o.theta) ? o.theta : 0, ph = o && isFinite(o.phi) ? o.phi : Math.PI / 2;
    if (front) { th = 0; ph = Math.PI / 2; }
    mv.setAttribute("min-camera-orbit", `auto auto ${r}`);
    mv.setAttribute("max-camera-orbit", `auto auto ${r}`);
    mv.setAttribute("camera-orbit", `${th.toFixed(4)}rad ${ph.toFixed(4)}rad ${r}`);
    $("#gf-viewlabel").textContent = `View: ${fmt(spanCm)} cm tall`;
    if (mv.jumpCameraToGoal) mv.jumpCameraToGoal();
  }

  function updateSpan() {                               // zoom the view out only when the model would not fit
    if (!origCm) return;
    const v = $("#gf-view").getBoundingClientRect();
    if (!v.width || !v.height) return;
    const base = Math.max(...origCm), longest = base * scaleF, k = v.height / Math.min(v.width, v.height);
    if (!spanCm || (!userZoom && longest * 1.25 * k > spanCm)) { spanCm = niceUp(Math.max(base * 3, longest) * 1.25 * k); setCamera(); }
  }

  function setSpan(v) { spanCm = Math.min(2000, Math.max(0.5, v)); syncTarget(); setCamera(); drawStage(); }
  function zoomBy(f) { if (!spanCm) return; userZoom = true; setSpan(spanCm * f); }
  function fitView() {
    if (!origCm) return;
    const v = $("#gf-view").getBoundingClientRect();
    userZoom = false;
    setSpan(Math.max(...origCm) * scaleF * 1.4 * (v.height / Math.min(v.width, v.height)));
  }

  function isFront() {
    const mv = $("#gf-mv");
    if (!mv.getCameraOrbit) return false;
    const o = mv.getCameraOrbit();
    const t = (((o.theta + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return Math.abs(t) < 0.05 && Math.abs(o.phi - Math.PI / 2) < 0.05;
  }

  function drawOverlay() {
    const o = sizeCanvas($("#gf-overlay"));
    if (!spanCm || !origCm || !o.w || !o.h || !isFront()) return;
    const ppc = o.h / spanCm, w = origCm[0] * scaleF, h = origCm[1] * scaleF;
    const x0 = o.w / 2 - (w * ppc) / 2, y0 = o.h / 2 - (h * ppc) / 2;
    o.x.strokeStyle = cssVar("--accent"); o.x.fillStyle = cssVar("--accent");
    o.x.lineWidth = 1.5; o.x.setLineDash([6, 4]);
    o.x.strokeRect(x0, y0, w * ppc, h * ppc);
    o.x.setLineDash([]); o.x.font = "600 12px system-ui, sans-serif"; o.x.textAlign = "center";
    o.x.fillText(`${fmt(w)} x ${fmt(h)} cm`, o.w / 2, y0 > 16 ? y0 - 6 : y0 + h * ppc + 16);
  }

  function drawStage() {
    const g = sizeCanvas($("#gf-grid")), rx = sizeCanvas($("#gf-rulerX")), ry = sizeCanvas($("#gf-rulerY"));
    drawOverlay();
    if (!spanCm || !g.w || !g.h) return;
    const ppc = g.h / spanCm, cx = g.w / 2, cy = g.h / 2;
    const [major, minor] = STEPS.find((s) => s[0] * ppc >= 50) || STEPS[STEPS.length - 1];
    const showMinor = minor * ppc >= 5;
    const isMajor = (v) => Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const line = cssVar("--line"), muted = cssVar("--muted"), accent = cssVar("--accent");
    const nX = Math.floor(g.w / 2 / ppc / minor), nY = Math.floor(g.h / 2 / ppc / minor);
    const label = (v) => String(+v.toFixed(2));

    if (origCm) {                                       // model extent bands on the rulers
      const w = origCm[0] * scaleF * ppc, h = origCm[1] * scaleF * ppc;
      rx.x.globalAlpha = ry.x.globalAlpha = 0.22; rx.x.fillStyle = ry.x.fillStyle = accent;
      rx.x.fillRect(cx - w / 2, 0, w, rx.h); ry.x.fillRect(0, cy - h / 2, ry.w, h);
      rx.x.globalAlpha = ry.x.globalAlpha = 1;
    }

    g.x.lineWidth = 1; rx.x.lineWidth = ry.x.lineWidth = 1;
    rx.x.fillStyle = ry.x.fillStyle = muted; rx.x.strokeStyle = ry.x.strokeStyle = muted;
    rx.x.font = ry.x.font = "10px system-ui, sans-serif";
    rx.x.textAlign = "center"; ry.x.textAlign = "right"; ry.x.textBaseline = "middle";

    for (let i = -nX; i <= nX; i++) {                   // vertical grid lines + horizontal ruler
      const v = i * minor, maj = isMajor(v);
      if (!maj && !showMinor) continue;
      const px = Math.round(cx + v * ppc) + 0.5;
      g.x.globalAlpha = maj ? 0.9 : 0.35; g.x.strokeStyle = line;
      g.x.beginPath(); g.x.moveTo(px, 0); g.x.lineTo(px, g.h); g.x.stroke();
      rx.x.beginPath(); rx.x.moveTo(px, rx.h); rx.x.lineTo(px, rx.h - (maj ? 9 : 4)); rx.x.stroke();
      if (maj && px > 14 && px < rx.w - 14) rx.x.fillText(label(v), px, 11);
    }
    for (let i = -nY; i <= nY; i++) {                   // horizontal grid lines + vertical ruler (up = positive)
      const v = i * minor, maj = isMajor(v);
      if (!maj && !showMinor) continue;
      const py = Math.round(cy - v * ppc) + 0.5;
      g.x.globalAlpha = maj ? 0.9 : 0.35; g.x.strokeStyle = line;
      g.x.beginPath(); g.x.moveTo(0, py); g.x.lineTo(g.w, py); g.x.stroke();
      ry.x.beginPath(); ry.x.moveTo(ry.w, py); ry.x.lineTo(ry.w - (maj ? 9 : 4), py); ry.x.stroke();
      if (maj && py > 8 && py < ry.h - 8) ry.x.fillText(label(v), ry.w - 12, py);
    }
    g.x.globalAlpha = 0.5; g.x.strokeStyle = accent; g.x.setLineDash([3, 4]);   // centre cross-hair (the 0 / 0 point)
    g.x.beginPath(); g.x.moveTo(Math.round(cx) + 0.5, 0); g.x.lineTo(Math.round(cx) + 0.5, g.h);
    g.x.moveTo(0, Math.round(cy) + 0.5); g.x.lineTo(g.w, Math.round(cy) + 0.5); g.x.stroke();
    g.x.setLineDash([]); g.x.globalAlpha = 1;
  }

  function applyScale() {
    $("#gf-mv").setAttribute("scale", `${scaleF} ${scaleF} ${scaleF}`);
    syncTarget(); updateSpan(); drawStage();
  }

  function render(skipCm) {
    if (!origCm) return;
    const [w, h, d] = origCm.map((v) => v * scaleF), longest = Math.max(w, h, d);
    $("#gf-dw").textContent = fmt(w); $("#gf-dh").textContent = fmt(h); $("#gf-dd").textContent = fmt(d);
    $("#gf-pctlabel").textContent = Math.round(scaleF * 100);
    $("#gf-pct").value = Math.min(300, Math.max(1, scaleF * 100));
    if (!skipCm) $("#gf-cm").value = Number(longest.toFixed(2));
    applyScale();
    const max = Math.max(longest, ...REFS.map((r) => r[1]));
    $("#gf-refs").innerHTML =
      `<div class="gf-ref"><b>Your model: ${fmt(longest)} cm</b><div class="gf-bar model" style="width:${(longest / max) * 100}%"></div></div>` +
      REFS.map(([n, cm]) => `<div class="gf-ref">${n} (${cm} cm)<div class="gf-bar" style="width:${(cm / max) * 100}%"></div></div>`).join("");
  }

  /* ---------- model pipeline: embed textures -> (effects) -> preview ---------- */
  async function refresh() {                            // rebuild the embedded model and reload the preview
    if (!parsed) return;
    const my = ++token;
    msg("Working...");
    $("#gf-use").disabled = true; $("#gf-dl").disabled = true;
    try {
      const { glb, status } = await T.embedTextures(parsed, files, Number($("#gf-tmax").value));
      if (my !== token) return;
      embedded = glb;
      $("#gf-texlist").innerHTML = status.length
        ? status.map((s) => `<li class="${s.ok ? "gf-ok" : "gf-bad"}">${s.ok ? "OK" : "MISSING"} - ${s.name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</li>`).join("")
        : "<li>This model has no textures.</li>";
      showPreview();
      const missing = missingTex = status.filter((s) => !s.ok).length;
      msg(missing ? `${missing} texture file(s) missing. Use "Add textures" or drop them here.` : "", !!missing);
    } catch (e) { msg(e.message, true); }
  }

  let fxTimer = 0;
  const fxSoon = () => { clearTimeout(fxTimer); fxTimer = setTimeout(showPreview, 150); };

  function showPreview() {                              // model + effects -> preview (and the file that will be saved)
    if (!embedded) return;
    try {
      fxResult = origCm && origCenter && fxActive() ? T.applyEffects(embedded, origCm.map((v) => v / 100), origCenter, fx) : null;
    } catch (e) { fxResult = null; msg("Could not add effects: " + e.message, true); }
    const glb = fxResult ? fxResult.glb : embedded, mv = $("#gf-mv");
    $("#gf-outsize").textContent = `Output size: ${mb(glb.length)}`;
    if (mv.dataset.url) URL.revokeObjectURL(mv.dataset.url);
    mv.dataset.url = URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
    mv.src = mv.dataset.url;
  }

  $("#gf-mv").addEventListener("load", () => {
    let first = false;
    if (!origCm) {                                      // measure once, at scale 1 (not again after a texture reload)
      const mv = $("#gf-mv"), s = mv.getDimensions(), c = mv.getBoundingBoxCenter();
      origCm = [s.x * 100, s.y * 100, s.z * 100]; origCenter = [c.x, c.y, c.z];
      first = true;
      $("#gf-was").textContent = `Original size: ${fmt(origCm[0])} x ${fmt(origCm[1])} x ${fmt(origCm[2])} cm`;
    }
    $("#gf-use").disabled = false; $("#gf-dl").disabled = false;
    render();
    if (first && fxActive()) showPreview();
  });

  async function load(list) {
    for (const f of list) {
      if (/\.glb$/i.test(f.name)) {
        try { parsed = T.parseGlb(await f.arrayBuffer()); } catch (e) { return msg(e.message, true); }
        glbName = f.name; origCm = null; origCenter = null; fxResult = null; scaleF = 1; spanCm = 0; userZoom = false;
        $("#gf-mv").setAttribute("scale", "1 1 1");
        $("#gf-file").textContent = f.name;
      } else if (/\.(jpe?g|png)$/i.test(f.name)) files.set(f.name.toLowerCase(), f);
    }
    if (!parsed) return msg("Please include a .glb file", true);
    refresh();
  }

  /* ---------- finishing ---------- */
  function build() {                                    // finished file: textures embedded, effects baked in, real size applied
    const out = T.resizeGlb(fxResult ? fxResult.glb : embedded, scaleF);
    const base = glbName.replace(/\.glb$/i, "").replace(/_\d+(\.\d+)?cm(_fx)?$/i, "");   // re-fixing a fixed file should not stack suffixes
    return { out, name: `${base}_${Math.round(Math.max(...origCm) * scaleF)}cm${fxActive() ? "_fx" : ""}.glb` };
  }

  function useModel() {
    if (missingTex && !confirm(`${missingTex} texture file(s) are still missing, so customers would see the model without them. Use it anyway?`)) return;
    try {
      const { out, name } = build();
      if (out.length > MAX_UPLOAD) return msg(`This model is ${mb(out.length)}, but the limit is 50 MB. Choose a smaller texture size in step 1.`, true);
      finish(new File([out], name, { type: "model/gltf-binary" }));
    } catch (e) { msg(e.message, true); }
  }

  function downloadCopy() {
    try {
      const { out, name } = build();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([out], { type: "model/gltf-binary" }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      msg(`Downloaded ${name} (${mb(out.length)}).`);
    } catch (e) { msg(e.message, true); }
  }

  function finish(result) {
    const done = resolver; resolver = null;
    clearTimeout(fxTimer); token++;
    root.hidden = true; document.body.classList.remove("no-scroll");
    const mv = $("#gf-mv");
    if (mv.dataset.url) { URL.revokeObjectURL(mv.dataset.url); delete mv.dataset.url; }
    mv.removeAttribute("src");
    parsed = embedded = fxResult = null; files = new Map();      // free the memory held by big models
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (done) done(result);
  }

  function requestClose() {
    if ((scaleF !== 1 || fxActive()) && !confirm("Close without using this model? The size and effects you set will be lost.")) return;
    finish(null);
  }

  function reset() {                                    // a fresh start every time the fixer opens
    parsed = embedded = fxResult = origCm = origCenter = null; glbName = "model.glb"; scaleF = 1; spanCm = 0; userZoom = false; missingTex = 0;
    token++; files = new Map(); for (const k in fx) delete fx[k];
    const mv = $("#gf-mv");
    if (mv.dataset.url) { URL.revokeObjectURL(mv.dataset.url); delete mv.dataset.url; }
    mv.removeAttribute("src");
    for (const a of ["camera-target", "min-camera-orbit", "max-camera-orbit"]) mv.removeAttribute(a);
    mv.setAttribute("camera-orbit", "0deg 90deg auto"); mv.setAttribute("scale", "1 1 1");
    $("#gf-tmax").value = "1024"; $("#gf-cm").value = ""; $("#gf-pct").value = 100; $("#gf-pctlabel").textContent = "100";
    for (const id of ["dw", "dh", "dd"]) $("#gf-" + id).textContent = "-";
    for (const id of ["texlist", "refs"]) $("#gf-" + id).innerHTML = "";
    for (const id of ["outsize", "was", "viewlabel", "file"]) $("#gf-" + id).textContent = "";
    $("#gf-use").disabled = true; $("#gf-dl").disabled = true;
    msg(""); syncFxUi(); setTab("tex"); drawStage();
  }

  /**
   * Open the fixer with a .glb and (optionally) its texture images.
   * Resolves with the finished .glb (a File) or null when closed without using it.
   */
  function open(list) {
    if (resolver) return Promise.resolve(null);         // already open
    return new Promise((resolve) => {
      resolver = resolve; lastFocus = document.activeElement;
      reset(); root.hidden = false; document.body.classList.add("no-scroll");
      $(".gf-box").focus();                             // focus the popup itself, not a button, so no ring shows on open
      msg("Loading the 3D viewer...");
      ensureViewer().then(() => load(list)).catch((e) => msg(e.message, true));
    });
  }
  window.GlbFixer = { open };

  /* ---------- wiring ---------- */
  new ResizeObserver(() => drawStage()).observe($("#gf-view"));
  $("#gf-mv").addEventListener("camera-change", drawOverlay);
  $("#gf-zin").addEventListener("click", () => zoomBy(1 / 1.4));
  $("#gf-zout").addEventListener("click", () => zoomBy(1.4));
  $("#gf-zfit").addEventListener("click", fitView);
  $("#gf-front").addEventListener("click", () => { if (spanCm) { setCamera(true); drawOverlay(); } });
  $("#gf-view").addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 / 1.15 : 1.15); }, { passive: false });

  $("#gf-tmax").addEventListener("change", refresh);
  $("#gf-pct").addEventListener("input", () => { scaleF = Number($("#gf-pct").value) / 100; render(); });
  $$("[data-p]").forEach((b) => b.addEventListener("click", () => { scaleF = Number(b.dataset.p) / 100; render(); }));
  $("#gf-cm").addEventListener("input", () => {
    const cm = Number($("#gf-cm").value);
    if (!origCm || !(cm > 0)) return;
    scaleF = cm / Math.max(...origCm);
    render(true);
  });
  $("#gf-cm").addEventListener("blur", () => render());

  $("#gf-use").addEventListener("click", useModel);
  $("#gf-dl").addEventListener("click", downloadCopy);
  $("#gf-cancel").addEventListener("click", requestClose);
  $("#gf-close").addEventListener("click", requestClose);

  // more textures: the button, or drop files anywhere on the popup
  $("#gf-addtex").addEventListener("click", () => $("#gf-in").click());
  $("#gf-in").addEventListener("change", (e) => { const l = [...e.target.files]; e.target.value = ""; if (l.length) load(l); });
  root.addEventListener("dragover", (e) => { e.preventDefault(); $("#gf-drop").classList.add("over"); });
  root.addEventListener("dragleave", (e) => { if (!root.contains(e.relatedTarget)) $("#gf-drop").classList.remove("over"); });
  root.addEventListener("drop", (e) => { e.preventDefault(); $("#gf-drop").classList.remove("over"); const l = [...e.dataTransfer.files]; if (l.length) load(l); });

  document.addEventListener("keydown", (e) => {
    if (root.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); requestClose(); return; }
    if (e.key !== "Tab") return;                        // keep keyboard focus inside the popup
    const f = $$("button, input, select").filter((x) => !x.disabled && !x.hidden && x.type !== "hidden" && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* ---------- section tabs ---------- */
  function setTab(t) {
    $$("#gf-tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
    $$(".gf-pane").forEach((p) => p.classList.toggle("gf-cur", p.dataset.pane === t));
  }
  $("#gf-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) setTab(b.dataset.t); });
  function updateTabs() {
    const n = Object.values(fx).filter((v) => v > 0).length;
    $("#gf-fxtab").textContent = n ? `3 Effects (${n})` : "3 Effects";
  }

  /* ---------- effects panel ---------- */
  const EFFECTS = [
    { id: "steam", g: "Hot food", icon: "♨️", name: "Steam", note: "Wisps of steam rising off the dish" },
    { id: "glow", g: "Hot food", icon: "🔥", name: "Hot glow", note: "Warm, fresh-off-the-grill glow" },
    { id: "golden", g: "Hot food", icon: "🍞", name: "Golden toast", note: "Baked, golden-brown tint" },
    { id: "fizz", g: "Cold drinks", icon: "🫧", name: "Fizz bubbles", note: "Bubbles popping above the drink" },
    { id: "cold", g: "Cold drinks", icon: "🧊", name: "Ice cold", note: "Cool, frosty blue tint" },
    { id: "sprinkles", g: "Sweets", icon: "🍬", name: "Sprinkles", note: "Candy sprinkles raining down" },
    { id: "sparkle", g: "Sweets", icon: "✨", name: "Sparkle", note: "Twinkling stars for something special" },
    { id: "jelly", g: "Sweets", icon: "🍮", name: "Jelly wobble", note: "Squishy pudding wiggle" },
    { id: "gloss", g: "Shine & motion", icon: "🍯", name: "Juicy gloss", note: "Wet, glazed, shiny surface" },
    { id: "float", g: "Shine & motion", icon: "🎈", name: "Float", note: "Gentle bobbing up and down" },
    { id: "spin", g: "Shine & motion", icon: "🔄", name: "Turntable spin", note: "Slowly rotates like a display stand" },
    { id: "munch", g: "Fun", icon: "⛏️", name: "Minecraft munch", note: "Shakes and crumbles like eating food in Minecraft" },
    { id: "heaven", g: "Fun", icon: "😇", name: "Going to heaven", note: "Floats up off a cloud with a halo and a beam of light" },
  ];
  const RECIPES = [
    ["Hot dish", { steam: 0.6, glow: 0.5, gloss: 0.5 }], ["Cold drink", { fizz: 0.6, cold: 0.6, float: 0.4 }],
    ["Dessert", { sprinkles: 0.6, sparkle: 0.5, jelly: 0.5 }], ["Fresh bake", { steam: 0.5, golden: 0.6, spin: 0.3 }], ["Clear all", {}],
  ];

  function syncFxUi() {
    $$(".gf-fxrow").forEach((r) => {
      const v = fx[r.dataset.id] || 0, sl = r.querySelector("input[type=range]");
      r.querySelector("input[type=checkbox]").checked = v > 0;
      sl.hidden = !(v > 0); if (v > 0) sl.value = Math.round(v * 100);
    });
    updateTabs();
  }

  (function buildFx() {
    let html = '<div class="gf-presets">' + RECIPES.map(([n], i) => `<button type="button" class="chip" data-r="${i}">${n}</button>`).join("") + "</div>", last = "";
    for (const e of EFFECTS) {
      if (e.g !== last) { html += `<div class="gf-fxgroup">${e.g.replace("&", "&amp;")}</div>`; last = e.g; }
      html += `<div class="gf-fxrow" data-id="${e.id}"><label class="gf-fxhead"><input type="checkbox"><span>${e.icon} <b>${e.name}</b><small>${e.note}</small></span></label>` +
              `<input type="range" min="10" max="100" value="60" hidden aria-label="${e.name} strength"></div>`;
    }
    const box = $("#gf-fxlist"); box.innerHTML = html;
    box.addEventListener("change", (e) => {
      if (!e.target.matches("input[type=checkbox]")) return;
      const id = e.target.closest(".gf-fxrow").dataset.id;
      if (e.target.checked) fx[id] = 0.6; else delete fx[id];
      syncFxUi(); fxSoon();
    });
    box.addEventListener("input", (e) => {
      if (!e.target.matches("input[type=range]")) return;
      fx[e.target.closest(".gf-fxrow").dataset.id] = Number(e.target.value) / 100; fxSoon();
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]"); if (!b) return;
      for (const k in fx) delete fx[k];
      Object.assign(fx, RECIPES[b.dataset.r][1]); syncFxUi(); fxSoon();
    });
  })();
})();
