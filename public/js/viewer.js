// 3D view: a screen inside index.html (it used to be its own page, viewer.html, so going to or from it reloaded the whole app).
// It sits on top of whatever screen was showing, so closing it (Back, or any tab in the bottom bar) brings that screen straight back.
//   Viewer.open(ids)       show the 3D view with these dishes ([] = the empty floor)
//   Viewer.openDish(id)    same, for one dish; keeps the dishes chosen before when "Add another 3D model" was used
//   Viewer.close()         hide it
//   Viewer.beginPick(keep) go to the Full menu listing only dishes with a 3D model; the next "View in 3D / AR" comes back here
// It tells quick.js what happened with the events viewer:open, viewer:close and viewer:pick (quick.js owns the bottom bar and the Full menu).
// Uses helpers from menu.js: $, esc, data, view, render, fxKind.
(() => {
  const MAX_DISHES = 4;
  const root = document.createElement("div");
  root.className = "vw-screen";
  root.id = "vw";
  root.hidden = true;
  root.innerHTML = `<header class="vw-head"><h1>3D view</h1><p>Spin it around, or see it on your table.</p></header><main class="vw-main" id="vw-page" aria-live="polite"></main>`;
  document.body.appendChild(root); // quick.js moves it above the start screen (see Viewer.root there)
  const page = root.querySelector("#vw-page");

  const MAIN_HTML = `<div class="vw-pick">
      <button type="button" class="btn ghost" id="pick-btn">Choose a 3D model</button>
      <button type="button" class="btn ghost" id="add-btn" hidden>Add another 3D model</button>
    </div>
    <div id="viewer-stage"><div class="stage-wrap sk-stage" aria-hidden="true"></div></div>
    <p class="vw-hint">Drag to rotate. Tap "View on your table" to see it at real size through your camera. The dish appears once your phone has found your table; until then you will see a scanner. If that button is missing, this phone or browser does not support AR.</p>
    <details class="ar-guide"><summary>Tips for placing it on your table</summary>
      <ol>
        <li>Tap <strong>View on your table (AR)</strong> and allow camera access.</li>
        <li>Hold the phone about an arm's length from the table and move it slowly side to side for a few seconds.</li>
        <li>Keep the camera on the table top, not the floor. While the scanner shows, the dish stays hidden on purpose.</li>
        <li>When the dish appears, drag it to move it and turn it with two fingers.</li>
      </ol>
      <p>Works best in good light. Plain, shiny or dark tables are hard to detect, so try placing a napkin, menu or coaster with a pattern on the table and aim at it.</p>
    </details>`;

  let isOpen = false, cleanup = () => {}, prevTitle = "", currentIds = [], picking = null; // picking: { keep, prevAr } while the Full menu is listing dishes to choose from
  const hashFor = (ids) => "#viewer" + (ids.length ? "=" + ids.map(encodeURIComponent).join(",") : "");
  const hashIds = () => { const m = /^#viewer(?:=(.*))?$/.exec(location.hash); return m ? (m[1] || "").split(",").filter(Boolean).map(decodeURIComponent) : null; };
  const modelDishes = () => data.items.filter((x) => x.model);
  const backdrop = () => [document.querySelector("header.top"), document.getElementById("fs"), document.getElementById("menu"), document.querySelector(".home")].filter(Boolean);

    // Nothing chosen yet: just the empty floor. The dish appears when the customer picks one.
    function openEmpty() {
      cleanup(); cleanup = () => {};
      $("#viewer-stage").innerHTML = '<div class="stage-wrap"><model-viewer alt="Empty floor" camera-controls touch-action="pan-y" interaction-prompt="none" camera-target="0m 0m 0m" camera-orbit="30deg 72deg 0.7m" min-camera-orbit="auto 5deg 0.2m" max-camera-orbit="auto 88deg 4m"></model-viewer><p class="vw-empty">Choose a 3D model above to put it on the floor.</p></div>';
      const mv = $("#viewer-stage model-viewer"), wrap = $("#viewer-stage .stage-wrap");
      const floor = window.FloorGrid ? FloorGrid.attach(mv, wrap, { empty: true }) : null;
      cleanup = () => { if (floor) floor.detach(); };
      document.title = `3D view | ${data.restaurant}`;
    }

    // One or more dishes on the same floor. With several, the models are joined into one scene on the phone (js/glb-tools.js, mergeGlbs).
    // Effects belong to one dish at a time: tap a dish below the viewer, then pick its effect.
    function openModels(items) {
      cleanup(); cleanup = () => {};
      const multi = items.length > 1, src = items[0].model;
      const stageHtml = `<div class="stage-wrap"><div class="mv-loader" role="status" aria-live="polite"><div class="mv-spin" aria-hidden="true"></div><div class="mv-ltext">${multi ? "Putting your dishes together\u2026" : "Loading 3D model\u2026"} <span class="mv-pct">0%</span></div><div class="mv-lbar" aria-hidden="true"><i></i></div></div><model-viewer ${multi ? "" : `src="${esc(src)}"`} alt="3D model of ${esc(items.map((i) => i.name.trim()).join(", "))}"
        ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" ar-placement="floor"
        autoplay camera-controls touch-action="pan-y" shadow-intensity="1" camera-orbit="auto auto 150%" max-camera-orbit="auto auto 600%">
        <div slot="progress-bar" aria-hidden="true"></div>
        <button slot="ar-button" type="button" class="btn ar-btn">View on your table (AR)</button>
      </model-viewer>
      <div class="fx-ui"><button type="button" class="fx-toggle" aria-expanded="false" hidden>\u2728 Effects</button><div class="fx-tray" role="group" aria-label="Choose an effect" hidden></div></div></div>`;
      const dishesHtml = multi ? `<div class="vw-dishes" role="group" aria-label="Dishes in this view">${items.map((it, i) => `<span class="vw-dish"><button type="button" class="vw-dish-sel" data-i="${i}" aria-pressed="${i === 0}">${esc(it.name.trim())}</button><button type="button" class="vw-dish-x" data-i="${i}" aria-label="Remove ${esc(it.name.trim())}">\u00d7</button></span>`).join("")}</div><p class="vw-hint">Drag a dish to move it. Tap its name to give it effects; each dish has its own.</p>` : "";
      $("#viewer-stage").innerHTML = stageHtml + dishesHtml;
      const mv = $("#viewer-stage model-viewer");
      const loader = $("#viewer-stage .mv-loader"), pct = loader.querySelector(".mv-pct"), lbar = loader.querySelector(".mv-lbar i");
      mv.addEventListener("progress", (e) => { const p = Math.round((e.detail.totalProgress || 0) * 100); pct.textContent = `${p}%`; lbar.style.width = `${p}%`; });
      mv.addEventListener("load", () => loader.remove());
      const fail = (msg) => { loader.classList.add("failed"); loader.innerHTML = `<div class="mv-ltext">${msg}</div>`; };
      mv.addEventListener("error", () => fail("Could not load the 3D model. Please reload and try again."));
  
      // Effects picker (built into a copy of each dish on the phone, see js/glb-tools.js)
      const T = window.GlbTools;
      const wrap = $("#viewer-stage .stage-wrap"), fxUi = wrap.querySelector(".fx-ui"), fxBtn = fxUi.querySelector(".fx-toggle"), tray = fxUi.querySelector(".fx-tray");
      const FX_STRENGTH = 0.7;
      let swap = 0, sel = 0;
      const pick = {};                                   // dish id -> effect id ("" = none)
      const bases = new Map(), made = new Map();
      const place = {}, info = {};                        // where each dish stands on the floor (centre x, z) and its size, so a moved dish stays where you put it
      const blobUrl = (u8) => URL.createObjectURL(new Blob([u8], { type: "model/gltf-binary" }));
      const baseOf = (it) => {
        if (!bases.has(it.id)) bases.set(it.id, (async () => {
          if (!T) throw new Error("GlbTools is not loaded");
          const buf = await (await fetch(it.model)).arrayBuffer();
          const r = T.stripEffects(T.parseGlb(buf));
          const bd = T.bounds(r.gltf);
          if (!bd) throw new Error("the model has no shapes to measure");
          return { u8: r.had ? T.buildGlb(r.gltf, r.bin) : new Uint8Array(buf), had: r.had, size: bd.size, ctr: bd.ctr };
        })().catch((e) => { console.error("Effects: could not prepare the model", e); return null; }));
        return bases.get(it.id);
      };
      const withFx = (b, id) => (id ? T.applyEffects(b.u8, b.size, b.ctr, { [id]: FX_STRENGTH }).glb : b.u8);
      const urlFor = async () => {
        const key = items.map((i) => pick[i.id] || "").join("|") + (multi ? JSON.stringify(place) : "");
        if (made.has(key)) return made.get(key);
        const bs = await Promise.all(items.map(baseOf));
        if (bs.some((b) => !b)) return null;
        let url;
        if (!multi) {
          const id = pick[items[0].id] || "", b = bs[0];
          url = id ? blobUrl(withFx(b, id)) : (b.had ? blobUrl(b.u8) : src);
        } else {
          if (!Object.keys(place).length) {                // first time: side by side along the left-right line, a gap of about a third of the widest dish between them
            const gap = Math.max(0.02, 0.3 * Math.max(...bs.map((b) => b.size[0])));
            let x = -(bs.reduce((s, b) => s + b.size[0], 0) + gap * (bs.length - 1)) / 2;
            bs.forEach((b, i) => { place[items[i].id] = { x: x + b.size[0] / 2, z: 0 }; info[items[i].id] = b; x += b.size[0] + gap; });
            if (floor) floor.setStep(FloorGrid.niceStep(Math.max(...bs.map((b) => Math.max(b.size[0], b.size[2]))) / 4));
          }
          const parts = bs.map((b, i) => {
            const pl = place[items[i].id];
            return { index: i, u8: withFx(b, pick[items[i].id] || ""), pos: [pl.x - b.ctr[0], -(b.ctr[1] - b.size[1] / 2), pl.z - b.ctr[2]] };
          });
          url = blobUrl(T.mergeGlbs(parts));
        }
        made.set(key, url);
        return url;
      };
      const guide = window.ArGuide ? ArGuide.attach(mv) : null;
      const floor = window.FloorGrid ? FloorGrid.attach(mv, wrap) : null;   // grid lines on the floor under the dishes
      const drag = multi && window.DishDrag && floor ? DishDrag.attach(mv, {
        floor,
        dishes: () => items.map((it, i) => (place[it.id] && info[it.id] ? { i, cx: place[it.id].x, cz: place[it.id].z, hx: info[it.id].size[0] / 2, hz: info[it.id].size[2] / 2, ox: info[it.id].ctr[0], oz: info[it.id].ctr[2] } : null)).filter(Boolean),
        onGrab: (i) => { sel = i; buildTray(); syncFx(); },
        onMove: (i, x, z) => { place[items[i].id] = { x, z }; },
        onDrop: () => floor.refresh(),
      }) : null;
      const showFx = async () => {
        const my = ++swap;
        let url = null;
        try { url = await urlFor(); } catch (e) {
          console.error("Could not build the 3D scene", e);
          if (my === swap) {
            if (!mv.loaded) fail(multi ? "Could not put these dishes together. Try removing one." : "Could not load the 3D model.");
            else { pick[items[sel].id] = ""; syncFx(); fxBtn.textContent = "Could not add that"; setTimeout(() => { if (mv.isConnected) syncFx(); }, 2000); }
          }
        }
        if (my !== swap || !mv.isConnected || !url || mv.src === url) return;
        const o = mv.getCameraOrbit && mv.loaded ? mv.getCameraOrbit() : null, tg = multi && o ? mv.getCameraTarget() : null;
        mv.addEventListener("load", () => { if (o) { mv.cameraOrbit = `${o.theta}rad ${o.phi}rad ${o.radius}m`; if (tg) mv.cameraTarget = `${tg.x}m ${tg.y}m ${tg.z}m`; if (mv.jumpCameraToGoal) mv.jumpCameraToGoal(); } }, { once: true });
        mv.src = url;
      };
      const comeBack = () => { if (document.visibilityState === "visible" && mv.isConnected && mv.src === src && bases.size) showFx(); };
      document.addEventListener("visibilitychange", comeBack);
      cleanup = () => { swap++; document.removeEventListener("visibilitychange", comeBack); if (guide) guide.detach(); if (floor) floor.detach(); if (drag) drag.detach(); made.forEach((u) => { if (u !== src) URL.revokeObjectURL(u); }); made.clear(); };
  
      let FX = [];
      const buildTray = () => {
        FX = T ? [{ id: "", icon: "\u{1F6AB}", name: "None" }, ...[...T.EFFECTS].sort((x, y) => (y.g === fxKind(items[sel])) - (x.g === fxKind(items[sel])))] : [];
        tray.innerHTML = FX.map((f) => `<button type="button" class="fx-chip" data-id="${f.id}" aria-pressed="false">${f.icon} ${esc(f.name)}</button>`).join("");
      };
      function syncFx() {
        const cur = pick[items[sel].id] || "";
        tray.querySelectorAll(".fx-chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === cur)));
        const f = FX.find((x) => x.id === cur);
        fxBtn.textContent = cur && f ? `${f.icon} ${f.name}` : "\u2728 Effects";
        document.querySelectorAll(".vw-dish-sel").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.i) === sel)));
      }
      buildTray(); syncFx();
  
      if (multi) {
        showFx();                                        // the scene is built first, then shown
        $("#viewer-stage").querySelector(".vw-dishes").addEventListener("click", (e) => {
          const x = e.target.closest(".vw-dish-x"), s = e.target.closest(".vw-dish-sel");
          if (x) { const ids = items.map((i) => i.id).filter((_, i) => i !== Number(x.dataset.i)); setDishes(ids); }
          else if (s) { sel = Number(s.dataset.i); buildTray(); syncFx(); }
        });
      }
      mv.addEventListener("load", () => {
        Promise.all(items.map(baseOf)).then((bs) => {
          if (!mv.isConnected) return;
          fxBtn.hidden = false;
          if (bs.some((b) => !b)) { fxBtn.disabled = true; fxBtn.textContent = "Effects unavailable"; return; }
          if (!multi && bs[0].had) showFx();
        });
      }, { once: true });
      tray.dataset.rb = "off";
      [fxUi, fxBtn, tray].forEach((el) => el.addEventListener("beforexrselect", (e) => e.preventDefault()));
      ["pointerdown", "pointermove", "pointerup", "mousedown", "touchstart", "touchmove", "touchend", "wheel"].forEach((t) => tray.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
      fxBtn.addEventListener("click", () => { const open = tray.hidden; tray.hidden = !open; fxBtn.setAttribute("aria-expanded", String(open)); });
      tray.addEventListener("click", (e) => { const c = e.target.closest(".fx-chip"); if (!c) return; pick[items[sel].id] = c.dataset.id; syncFx(); showFx(); });
      let xr = false;
      if (navigator.xr && navigator.xr.isSessionSupported) navigator.xr.isSessionSupported("immersive-ar").then((v) => { xr = v; }).catch(() => {});
      // Android without WebXR opens Scene Viewer from the file's web address, so it gets the first dish's original file (it cannot read the combined scene)
      mv.querySelector(".ar-btn").addEventListener("click", () => { if (!xr && /Android/i.test(navigator.userAgent) && mv.src !== src) mv.src = src; }, true);
      mv.addEventListener("ar-status", (e) => {
        if (e.detail.status === "session-started") { fxUi.classList.add("in-ar"); mv.appendChild(fxUi); }
        else if (e.detail.status === "not-presenting") { fxUi.classList.remove("in-ar"); wrap.appendChild(fxUi); }
      });
    }

  // Draws the 3D view for these dishes (ids that have no 3D model are skipped)
  function draw(ids) {
    const withModel = modelDishes();
    if (!withModel.length) { page.innerHTML = '<p class="vw-err">No dishes have a 3D model yet. <button type="button" class="linkbtn" data-vw-full>Go to the full menu</button></p>'; return; }
    const its = [...new Set(ids)].map((id) => withModel.find((x) => x.id === id)).filter(Boolean).slice(0, MAX_DISHES);
    currentIds = its.map((x) => x.id);
    const pickBtn = $("#pick-btn"), addBtn = $("#add-btn");
    if (!its.length) { pickBtn.textContent = "Choose a 3D model"; pickBtn.hidden = false; addBtn.hidden = true; openEmpty(); return; }
    document.title = `${its.map((x) => x.name.trim()).join(", ")} in 3D | ${data.restaurant}`;
    pickBtn.textContent = "Choose another 3D model"; pickBtn.hidden = its.length > 1;   // with several dishes, change them with the buttons under the viewer
    addBtn.hidden = its.length >= MAX_DISHES || withModel.length <= its.length;
    openModels(its);
  }

  function open(ids = [], opts = {}) {
    if (typeof data === "undefined" || !data) return;
    const was = isOpen;
    if (!was) {
      prevTitle = document.title;
      page.innerHTML = MAIN_HTML;          // a fresh screen every time it opens
      root.hidden = false;
      root.style.animation = "none"; void root.offsetWidth; root.style.animation = ""; // plays the soft fade-in again
      isOpen = true;
      document.body.classList.add("no-scroll", "vw-open");
      backdrop().forEach((el) => { el.inert = true; });
    }
    try { draw(ids); } catch (e) {
      console.error(e);
      page.innerHTML = `<p class="vw-err">Could not load this page. <button type="button" class="linkbtn" data-vw-full>Go to the full menu</button><br><small>${esc(String((e && e.message) || e))}</small></p>`;
    }
    if (!opts.noPush) (was ? history.replaceState : history.pushState).call(history, { vw: 1 }, "", hashFor(currentIds));
    if (!was) document.dispatchEvent(new CustomEvent("viewer:open"));
  }
  // Changing the dishes while it is open (the x on a dish) just redraws
  const setDishes = (ids) => open(ids);

  function close(opts = {}) {
    if (!isOpen) return;
    cleanup(); cleanup = () => {};
    isOpen = false;
    root.hidden = true;
    page.innerHTML = "";
    backdrop().forEach((el) => { el.inert = false; });
    document.body.classList.remove("vw-open");
    if (typeof sheet === "undefined" || sheet.hidden) document.body.classList.remove("no-scroll");
    document.title = prevTitle || document.title;
    if (!opts.fromPop && /^#viewer/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    if (!opts.quiet) document.dispatchEvent(new CustomEvent("viewer:close"));
  }

  // "Choose a 3D model" / "Add another 3D model": the Full menu, listing only dishes that have a model
  function beginPick(keep) {
    if (!picking) picking = { keep: [], prevAr: view.ar };
    picking.keep = keep.slice();
    view.ar = true;
    close({ quiet: true });
    render();
    document.dispatchEvent(new CustomEvent("viewer:pick"));
  }
  // Leaves that mode: puts the 3D / AR filter back the way the customer had it
  function endPick() {
    if (!picking) return;
    view.ar = picking.prevAr; picking = null;
    render();
  }
  function openDish(id) {
    const keep = picking ? picking.keep.filter((x) => x !== id) : [];
    endPick();
    open([...keep, id]);
  }
  function goFull() { close({ quiet: true }); document.dispatchEvent(new CustomEvent("viewer:pick")); }

  root.addEventListener("click", (e) => {
    if (e.target.closest("#pick-btn")) beginPick([]);
    else if (e.target.closest("#add-btn")) beginPick(currentIds);
    else if (e.target.closest("[data-vw-full]")) goFull();
  });
  // Browser Back / Forward
  window.addEventListener("popstate", () => {
    const ids = hashIds();
    if (ids) open(ids, { noPush: true });
    else if (isOpen) close({ fromPop: true });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen && (typeof sheet === "undefined" || sheet.hidden)) close();
  });

  window.Viewer = { root, open, openDish, close, beginPick, endPick, hashIds, isOpen: () => isOpen, modelDishes };
})();
