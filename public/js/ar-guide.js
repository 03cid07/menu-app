/* AR guide for the 3D viewer.
 *
 * Problem: model-viewer's WebXR mode drops the dish in front of the camera the moment AR starts, then snaps it to the FIRST flat surface it
 * detects and stops looking. Phones usually find the floor before the table, so the dish ended up on the floor.
 *
 * What this does (only while a WebXR AR session is running):
 *   1. Hides the dish until a table-like surface is found, and shows a scanner animation with live status so the customer knows what is going on.
 *   2. Ignores surfaces that are far below the phone (most likely the floor) and keeps searching. A surface counts as a table when it is within
 *      FLOOR_DROP_M of the phone, or when it sits clearly above a lower surface that was already seen (the floor).
 *   3. Waits until the surface is steady for a few frames (and at least MIN_SEARCH_MS after the search starts), so one noisy reading cannot lock the
 *      dish in the wrong place. The floor level is the lowest height that many readings agree on, not the single lowest reading.
 *      Add ?ardebug=1 to the page address to see the numbers the phone measures while it searches.
 *   4. Offers "Place it here anyway" after a while, so nobody is ever stuck (for example a very low coffee table).
 *   5. Puts the dish where the table was found, not a metre in front of where AR started.
 *   6. When no table shows up (floor only for TABLE_FLOOR_MS, or nothing found at all) it asks: "Try again" (search for the table from scratch) or
 *      "Use a 3D table" (the customer picks one of the 3D tables in js/virtual-table.js and the dish stands on it, on the floor in front of them).
 *      Nothing is added by itself. The scene is built by js/viewer.js (the onTable option below). With a 3D table only the real floor is accepted
 *      (never the top of a real table).
 *   7. After the dish is down, "Try again" stays in the top-left corner (next to "Change table" when a 3D table is used): it takes the dish
 *      off, drops the 3D table if there is one, and searches for a table again.
 *
 *   ArGuide.attach(mv, { tables: [{ id, name, note, shape, color, img }], onTable: async (id) => {}, fits: (id) => boolean })
 *     fits(id) is optional: false greys that table out as too small for the dishes in the scene. onTable may throw an error with .fit = true (no room).
 *     tables / onTable are optional; without them the virtual table offer is simply not shown. onTable("") means "no table".
 *
 * It reaches into model-viewer 4.0.0 internals (the pinned version in index.html) with feature checks. If anything is missing it falls back to the
 * overlay messages only: the dish is not hidden, but nothing breaks. The 2D view is always restored when AR ends.
 */
(function (root) {
  "use strict";

  const FLOOR_DROP_M = 0.9;     // a surface further than this below the phone is probably the floor
  const RAISED_BY_M = 0.25;     // ...unless it is at least this much higher than the lowest surface seen so far (then it is a table)
  const STABLE_FRAMES = 10;     // hold the same height for this many frames before accepting (about a fifth of a second)
  const STABLE_TOL_M = 0.03;
  const RECENT_MS = 3000;       // "floor only" message stays up this long after the last floor reading
  const SLOW_HINT_MS = 4000;    // after this, tell them to move the phone
  const NONE_HINT_MS = 12000;   // after this with nothing found, say no surface was detected
  const OVERRIDE_FLOOR_MS = 8000;   // floor-only for this long: offer "place it here anyway"
  const OVERRIDE_NONE_MS = 25000;   // nothing at all for this long: offer it too
  const FOUND_TOAST_MS = 4000;
  const TABLE_FLOOR_MS = 6000;      // floor-only for this long: ask "try again or use a 3D table" (with nothing at all it is asked once "No table detected" shows)
  const SURE_FLOOR_M = 1.1;         // with a 3D table: a surface must be at least this far below the phone to count as the floor (a table is rarely that far down)
  const HIT_ANGLE_DEG = 20;         // the angle model-viewer 4.0.0 aims its search ray down at (needed to start the search again after placing)
  const FLOOR_TOL_M = 0.15;         // with a virtual table: the surface must be this close to the lowest one seen to count as the floor
  const LEVEL_BIN_M = 0.05;         // heights are grouped in 5 cm steps...
  const LEVEL_MIN_FRAMES = 8;       // ...and a height only counts as a real surface (the floor) once this many readings landed on it: a few stray low readings (shiny tiles) are ignored
  const MIN_SEARCH_MS = 2000;       // never place sooner than this after the search starts, so the phone has time to see the floor as well as the table
  const NEAR_FRAC = 0.7;            // the bar says "Almost there" from this share of STABLE_FRAMES
  const NOTICE_MS = 5000;           // how long "could not set up that table" stays up

  // model-viewer keeps its renderer under a Symbol("renderer") key; the AR part of it is renderer.arRenderer
  function findAr(mv) {
    try {
      for (let o = mv; o; o = Object.getPrototypeOf(o)) {
        for (const s of Object.getOwnPropertySymbols(o)) {
          if (s.description === "renderer") { const r = mv[s]; return (r && r.arRenderer) || null; }
        }
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  // The renderer is a singleton shared by every viewer that is opened, so the hooks are installed once and hand over to whichever guide is active
  function installHooks(ar) {
    if (ar.__menuGuide) return ar.__menuGuide;
    const h = ar.__menuGuide = { cur: null, origHit: ar.getHitPoint, origMove: ar.moveToFloor };
    ar.getHitPoint = function (hit) {
      const p = h.origHit.call(this, hit);
      return h.cur ? h.cur.judge(this, p) : p;
    };
    ar.moveToFloor = function (frame) {
      const g = h.cur;
      if (g) g.beforeMove();
      try { return h.origMove.call(this, frame); }
      finally { if (g) g.afterMove(this); }
    };
    return h;
  }

  const SCAN_HTML = `<div class="ar-stage" aria-hidden="true">
      <div class="ar-plane"><i class="ar-sweep"></i><i class="ar-ring"></i><i class="ar-ring r2"></i><b class="ar-x">\u2715</b><b class="ar-ok">\u2713</b></div>
      <div class="ar-phone"></div>
    </div>
    <div class="ar-msg"><div class="ar-title"></div><div class="ar-sub"></div>
      <div class="ar-prog" hidden><div class="ar-prog-bar"><i class="ar-prog-fill"></i></div><div class="ar-prog-lbl"></div></div></div>
    <button type="button" class="ar-override" hidden>Place it here anyway</button>
    <div class="ar-choice" hidden><button type="button" class="ar-retry">Try again</button><button type="button" class="ar-vt-btn">Use a 3D table</button></div>
    <div class="ar-vt" role="dialog" aria-label="Choose a virtual table" hidden>
      <div class="ar-vt-head">
        <div class="ar-vt-ttl"><div class="ar-vt-title">Make your own table</div><div class="ar-vt-sub">Swipe and pick one. Your dish stands on it.</div></div>
        <button type="button" class="ar-vt-cancel">Keep looking</button>
      </div>
      <div class="ar-vt-list"></div>
      <button type="button" class="ar-vt-none" hidden>Take the table away</button>
    </div>
    <div class="ar-corner"><button type="button" class="ar-vt-chg" hidden>Change table</button><button type="button" class="ar-retry-chg" hidden>Try again</button></div>`;

  const TEXT = {
    scanning: ["Looking for your table\u2026", "Hold your phone about an arm's length above the table."],
    moving:   ["Looking for your table\u2026", "Move your phone slowly from side to side."],
    floor:    ["I can only see the floor", "Aim at the table top and keep moving slowly. The dish waits until it finds the table."],
    noTable:  ["No table found", "Try again, or use a 3D table on the floor if there is no table here."],
    retry:    ["Looking again\u2026", "Hold your phone about an arm's length above the table and move it slowly."],
    retryFail: ["Could not search again", "Close AR and open it again to start over."],
    none:     ["No table detected yet", "Try brighter light, or put a napkin or menu with a pattern on the table and aim at it."],
    lost:     ["Lost tracking", "Move slowly and keep the table in view."],
    found:    ["Table found", "Drag the dish to move it. Turn it with two fingers."],
    tableWait: ["Setting up your table\u2026", "This takes a moment."],
    tableLook: ["Now looking for the floor", "Aim at the floor in front of you. Your table will stand there."],
    tableFound: ["Your table is ready", "Drag it to move it. Turn it with two fingers."],
    tableFail: ["Could not set up that table", "Try another one, or keep looking for your real table."],
    tableTight: ["Not enough room on that table", "Your dishes do not all fit. Pick a bigger table, or remove a dish."],
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function attach(mv, opts) {
    const tables = (opts && Array.isArray(opts.tables) ? opts.tables : []), onTable = opts && opts.onTable;
    const canTable = tables.length > 0 && typeof onTable === "function";
    const ar = findAr(mv);
    const hooked = !!(ar && typeof ar.moveToFloor === "function" && typeof ar.getHitPoint === "function");

    const el = document.createElement("div");
    el.className = "ar-scan";
    el.hidden = true;
    el.dataset.state = "scanning";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = SCAN_HTML;
    const titleEl = el.querySelector(".ar-title"), subEl = el.querySelector(".ar-sub"), btn = el.querySelector(".ar-override");
    const progEl = el.querySelector(".ar-prog"), progFill = el.querySelector(".ar-prog-fill"), progLbl = el.querySelector(".ar-prog-lbl");
    const vtBtn = el.querySelector(".ar-vt-btn"), vt = el.querySelector(".ar-vt"), vtList = el.querySelector(".ar-vt-list"),
      vtNone = el.querySelector(".ar-vt-none"), vtCancel = el.querySelector(".ar-vt-cancel"), vtChg = el.querySelector(".ar-vt-chg");
    const choice = el.querySelector(".ar-choice"), retryBtn = el.querySelector(".ar-retry"), retryChg = el.querySelector(".ar-retry-chg"), corner = el.querySelector(".ar-corner");
    vtList.innerHTML = tables.map((t) => {
      const pic = t.img ? `<img class="ar-vt-img" src="${esc(t.img)}" alt=""  draggable="false">` : `<i class="ar-vt-sw ${t.shape === "square" ? "square" : "round"}" style="--c:${esc(t.color || "#999")}"></i>`;
      return `<button type="button" class="ar-vt-opt" data-id="${esc(t.id)}"><span class="ar-vt-pic">${pic}</span><b>${esc(t.name)}</b><small>${esc(t.note || "")}</small><em class="ar-vt-tag" hidden>Too small for your dishes</em></button>`;
    }).join("");
    // In AR, taps on page elements would also count as "select" in the XR scene; this keeps the button tap to itself
    [btn, choice, vt, corner].forEach((n) => n.addEventListener("beforexrselect", (e) => e.preventDefault()));
    ["pointerdown", "pointermove", "pointerup", "mousedown", "touchstart", "touchmove", "touchend", "wheel"].forEach((t) => vt.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
    mv.appendChild(el);      // inside <model-viewer> so it is part of what the browser shows over the camera

    let active = false, placed = false, lost = false, allowFloor = false;
    let startedAt = 0, firstFloorAt = 0, lastFloorAt = 0, tableAt = 0;
    let levels = new Map(), streak = 0, lastY = 0, accepted = null, frameNo = 0;
    let scene = null, timer = 0, toast = 0, inSearch = false;
    let tableId = "", busy = false, notice = 0, tight = false, retrying = false, noticeText = null;      // the virtual table now in use ("" = none), setting one up, and until when the error message stays

    const setScene = (visible) => { try { if (scene) scene.visible = visible; } catch (e) { /* ignore */ } };

    // ---- heights seen so far: the floor is the lowest height that enough readings agree on ----
    function noteLevel(y) { const k = Math.round(y / LEVEL_BIN_M); levels.set(k, (levels.get(k) || 0) + 1); }
    function floorRef() {
      let best = null;
      levels.forEach((n, k) => { if (n >= LEVEL_MIN_FRAMES && (best === null || k < best)) best = k; });
      return best === null ? null : best * LEVEL_BIN_M;
    }

    // ---- debug readout (?ardebug=1 in the address, or localStorage ardebug = 1) ----
    let debugOn = false;
    try { debugOn = /[?&]ardebug\b/.test(location.search) || localStorage.getItem("ardebug") === "1"; } catch (e) { /* ignore */ }
    const dbg = debugOn ? document.createElement("div") : null;
    if (dbg) {
      dbg.style.cssText = "position:absolute;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:13;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.72);color:#9fe870;font:11px/1.35 monospace;text-align:left;pointer-events:none;white-space:pre-wrap";
      el.appendChild(dbg);
    }
    const f2 = (n) => (n === null || n === undefined ? "-" : n.toFixed(2));
    function showDebug(y, drop, ref, rise, verdict) {
      if (!dbg || (++frameNo % 4)) return;
      const lv = [...levels.entries()].sort((a, b) => a[0] - b[0]).slice(0, 4).map(([k, n]) => f2(k * LEVEL_BIN_M) + "x" + n).join("  ");
      const wait = Math.min(1, (performance.now() - startedAt) / MIN_SEARCH_MS);
      dbg.textContent = "drop " + f2(drop) + " m   y " + f2(y) + "   floor " + f2(ref) + "   rise " + f2(rise) + "\n" + verdict + "   steady " + streak + "/" + STABLE_FRAMES + "   wait " + Math.round(wait * 100) + "%\nlevels: " + (lv || "-");
    }

    // ---- progress bar: how close the phone is to locking on a surface ----
    let shown = 0, shownAt = 0;                                  // what the bar shows now: it rises at once but drains slowly, so a wobble does not make it jump to nothing
    function updateProg() {
      if (!active) { progEl.hidden = true; delete el.dataset.near; return; }
      const now = performance.now();
      let target = 0, label, wait = false;
      if (placed) { target = 1; label = "Locked on"; }
      else if (busy) { target = shown; label = retrying ? "Searching again\u2026" : "Setting up your table\u2026"; wait = true; }
      else if (lost) label = "Lost tracking. Move slowly.";
      else if (streak > 0) {                                     // a table-like surface is being held steady
        target = Math.min(1, streak / STABLE_FRAMES, Math.max(0.1, (now - startedAt) / MIN_SEARCH_MS));
        label = target >= NEAR_FRAC ? "Almost there\u2026 hold steady" : "Locking on\u2026";
      } else label = shown > 0.05 ? "Lost the surface. Keep aiming\u2026" : (lastFloorAt && now - lastFloorAt < RECENT_MS ? "Floor found. Aim at the table." : "Scanning for a surface\u2026");
      const dt = shownAt ? Math.min(0.5, (now - shownAt) / 1000) : 0; shownAt = now;
      shown = (placed || target >= shown) ? target : Math.max(target, shown - 0.6 * dt);
      progEl.hidden = false;
      if (wait) progEl.dataset.wait = "1"; else delete progEl.dataset.wait;
      progFill.style.width = Math.round(shown * 100) + "%";
      if (progLbl.textContent !== label) progLbl.textContent = label;
      if (!placed && streak > 0 && shown >= NEAR_FRAC) el.dataset.near = "1"; else delete el.dataset.near;
    }

    // ---- model-viewer hooks: called by the shared wrappers while this guide is the active one ----
    const hooks = hooked ? installHooks(ar) : null;
    const api = {
      beforeMove() { inSearch = active && !placed; accepted = null; },
      afterMove(arr) { inSearch = false; if (accepted) land(arr, accepted); },
      judge(arr, p) {
        if (!p || !inSearch || !active || placed) return p;      // other callers (dragging the dish) are left alone
        const cam = arr.presentedScene && arr.presentedScene.getCamera && arr.presentedScene.getCamera();
        if (!cam) return p;
        const y = p.y, drop = cam.position.y - y, now = performance.now();
        noteLevel(y);
        const ref = floorRef(), rise = ref === null ? 0 : y - ref;      // how far above the confirmed floor this surface is
        // with a virtual table only the real floor will do: far below the phone and at the floor level (never the top of a real table)
        const tableLike = allowFloor || (tableId ? (drop >= SURE_FLOOR_M && rise <= FLOOR_TOL_M) : (drop <= FLOOR_DROP_M || rise >= RAISED_BY_M));
        if (!tableLike) {                                         // probably the floor: keep looking
          if (!firstFloorAt) firstFloorAt = now;
          lastFloorAt = now; streak = 0;
          updateProg(); showDebug(y, drop, ref, rise, "FLOOR-LIKE, ignored");
          return null;
        }
        if (streak && Math.abs(y - lastY) <= STABLE_TOL_M) streak++; else { streak = 1; lastY = y; }
        updateProg();
        const settled = now - startedAt >= MIN_SEARCH_MS;
        if (streak < STABLE_FRAMES || !settled) { showDebug(y, drop, ref, rise, allowFloor ? "override, waiting" : "TABLE-LIKE, waiting"); return null; }     // not steady (or not searched long enough) yet
        showDebug(y, drop, ref, rise, "PLACING");
        accepted = { x: p.x, z: p.z };
        return p;
      },
    };

    // Put the dish where the table was found (model-viewer only sets the height), then show it
    function land(arr, a) {
      try {
        if (!arr.isTranslating && scene && scene.pivot) {
          arr.goalPosition.x = a.x; arr.goalPosition.z = a.z;
          scene.pivot.position.x = a.x; scene.pivot.position.z = a.z;   // height still glides down, which is what turns the shadow on
        }
      } catch (e) { /* ignore */ }
      setScene(true);
      markPlaced();
    }

    // ---- what the customer sees ----
    function view() {
      const now = performance.now(), t = now - startedAt;
      let st, text, offer = false;
      if (placed) { st = "found"; text = tableId ? TEXT.tableFound : TEXT.found; }
      else if (busy) { st = "scanning"; text = retrying ? TEXT.retry : TEXT.tableWait; }
      else if (now < notice) { st = "none"; text = noticeText || (tight ? TEXT.tableTight : TEXT.tableFail); }
      else if (lost) { st = "lost"; text = TEXT.lost; }
      else if (tableId) { st = "scanning"; text = TEXT.tableLook; }
      else if (hooked && lastFloorAt && now - lastFloorAt < RECENT_MS) {
        st = "floor"; text = TEXT.floor; offer = now - firstFloorAt > OVERRIDE_FLOOR_MS;
      } else if (t > NONE_HINT_MS && !(lastFloorAt && now - lastFloorAt < RECENT_MS)) {
        st = "none"; text = TEXT.none; offer = hooked && t > OVERRIDE_NONE_MS;
      } else { st = "scanning"; text = t > SLOW_HINT_MS ? TEXT.moving : TEXT.scanning; }
      // nothing but the floor (or nothing at all) for a while: ask the customer instead of guessing
      const ask = canTable && !placed && !busy && !tableId && now >= notice && streak === 0 && (st === "none" || (st === "floor" && now - firstFloorAt > TABLE_FLOOR_MS));
      if (ask) { st = "none"; text = TEXT.noTable; }
      if (el.dataset.state !== st) el.dataset.state = st;
      if (titleEl.textContent !== text[0]) titleEl.textContent = text[0];
      if (subEl.textContent !== text[1]) subEl.textContent = text[1];
      if (tableId && !placed && !busy && tableAt && now - tableAt > OVERRIDE_FLOOR_MS) offer = true;     // 3D table chosen but no floor found: do not leave anyone stuck
      btn.hidden = !offer || allowFloor || placed;
      choice.hidden = !ask;
      vtChg.hidden = !(canTable && placed && tableId);
      retryChg.hidden = !(hooked && placed);
      updateProg();
    }

    function markPlaced() {
      if (placed) return;
      placed = true;
      mv.removeAttribute("data-ar-scan");       // brings the name/price label back
      view();
      toast = setTimeout(() => { el.dataset.compact = "1"; }, FOUND_TOAST_MS);       // the corner buttons stay: Try again (and Change table)
    }

    btn.addEventListener("click", () => { allowFloor = true; streak = 0; view(); });

    // ---- virtual table: pick one (or take it away), then let the app rebuild the scene ----
    function openPicker() {
      vtNone.hidden = !tableId;
      vtCancel.textContent = placed ? "Close" : "Keep looking";
      vtList.querySelectorAll(".ar-vt-opt").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.id === tableId));
        const room = !opts || typeof opts.fits !== "function" || opts.fits(b.dataset.id) !== false;     // too small for the dishes now in the scene
        b.disabled = !room; b.querySelector(".ar-vt-tag").hidden = room;
      });
      vt.hidden = false; el.dataset.vt = "open";
    }
    function closePicker() { vt.hidden = true; delete el.dataset.vt; }
    async function choose(id) {
      if (busy || id === tableId) { closePicker(); return; }
      closePicker(); busy = true; view();
      try { await onTable(id); }
      catch (e) {
        console.error("AR guide: could not set up the virtual table", e);
        busy = false; tight = !!(e && e.fit); noticeText = null; notice = performance.now() + NOTICE_MS; view();
        return;
      }
      busy = false; tableId = id;
      if (!placed && id) { streak = 0; tableAt = performance.now(); }      // a virtual table stands on the floor: only floor-like surfaces count now (see judge)
      if (placed) {                                              // changed after the dish was already down: show the result for a moment, or close the overlay
        clearTimeout(toast); delete el.dataset.compact;
        el.hidden = false; toast = setTimeout(() => { el.dataset.compact = "1"; }, FOUND_TOAST_MS);
      }
      view();
    }
    // ---- try again: forget what was seen, drop the 3D table, take the dish off the surface and search for a table from scratch ----
    // model-viewer cancels its search the moment it places the dish, so after placing the search has to be started again by hand
    async function rearm() {
      if (ar.initialHitSource) return true;                       // still searching
      const sess = ar.currentSession;
      if (!hooked || !sess) return false;
      try {
        const space = await sess.requestReferenceSpace("viewer"), rad = HIT_ANGLE_DEG * Math.PI / 180;
        const ray = typeof XRRay === "function" ? new XRRay(new DOMPoint(0, 0, 0), { x: 0, y: -Math.sin(rad), z: -Math.cos(rad) }) : undefined;
        const src = await sess.requestHitTestSource({ space, offsetRay: ray });
        if (ar.currentSession !== sess) { src.cancel(); return false; }
        ar.initialHitSource = src; ar.placementComplete = false;
        return true;
      } catch (e) { console.warn("AR guide: could not search again", e); return false; }
    }
    async function retry() {
      if (!active || busy) return;
      closePicker(); busy = true; retrying = true; view();
      const wasPlaced = placed, ok = await rearm();
      if (!active) return;
      if (!ok && wasPlaced) {                                     // cannot search again: leave things as they are and say so
        busy = false; retrying = false; noticeText = TEXT.retryFail; notice = performance.now() + NOTICE_MS; el.hidden = false; delete el.dataset.compact; view();
        toast = setTimeout(() => { el.dataset.compact = "1"; }, NOTICE_MS);
        return;
      }
      if (tableId) { try { await onTable(""); } catch (e) { console.error("AR guide: could not take the 3D table away", e); } tableId = ""; }
      clearTimeout(toast); delete el.dataset.compact; el.hidden = false;
      placed = false; lost = false; allowFloor = false; streak = 0; lastY = 0; levels = new Map(); accepted = null;
      firstFloorAt = lastFloorAt = tableAt = 0; startedAt = performance.now(); notice = 0; noticeText = null; shown = 0; shownAt = 0;
      scene = hooked ? ar.presentedScene : scene;
      if (scene) { setScene(false); mv.setAttribute("data-ar-scan", ""); }
      busy = false; retrying = false;
      view();
    }
    retryBtn.addEventListener("click", retry);
    retryChg.addEventListener("click", retry);
    vtBtn.addEventListener("click", openPicker);
    vtChg.addEventListener("click", () => { delete el.dataset.compact; openPicker(); });
    vtCancel.addEventListener("click", () => { closePicker(); if (placed) el.dataset.compact = "1"; });
    vtNone.addEventListener("click", () => choose(""));
    vtList.addEventListener("click", (e) => { const b = e.target.closest(".ar-vt-opt"); if (b) choose(b.dataset.id); });

    function begin() {
      end(true);
      active = true; placed = false; lost = false; allowFloor = false;
      tableId = ""; busy = false; retrying = false; notice = 0; noticeText = null; closePicker(); delete el.dataset.compact;
      startedAt = performance.now(); firstFloorAt = lastFloorAt = tableAt = 0; levels = new Map(); streak = 0; shown = 0; shownAt = 0;
      scene = hooked ? ar.presentedScene : null;
      if (hooks) hooks.cur = api;
      if (scene) { setScene(false); mv.setAttribute("data-ar-scan", ""); }      // dish stays hidden until a table is found
      el.hidden = false;
      view();
      timer = setInterval(view, 400);
    }

    // restoreOnly: called at the start of a new session to clear leftovers
    function end(restoreOnly) {
      clearInterval(timer); clearTimeout(toast); timer = toast = 0;
      if (hooks && hooks.cur === api) hooks.cur = null;
      setScene(true);                              // never leave the 2D view hidden
      scene = null;
      mv.removeAttribute("data-ar-scan");
      el.hidden = true; closePicker(); delete el.dataset.compact; vtChg.hidden = true; retryChg.hidden = true; choice.hidden = true; progEl.hidden = true; delete el.dataset.near;
      if (!restoreOnly) { active = false; tableId = ""; busy = false; retrying = false; }
    }

    function onStatus(e) {
      const s = e.detail && e.detail.status;
      if (s === "session-started") begin();
      else if (s === "object-placed") { if (active) { setScene(true); markPlaced(); } }   // also covers the case where the hooks were not available
      else if (s === "not-presenting" || s === "failed") end();
    }
    function onTracking(e) {
      if (!active || placed) return;
      lost = !!(e.detail && e.detail.status === "not-tracking");
      view();
    }
    mv.addEventListener("ar-status", onStatus);
    mv.addEventListener("ar-tracking", onTracking);

    return {
      hooked,
      detach() {
        end();
        mv.removeEventListener("ar-status", onStatus);
        mv.removeEventListener("ar-tracking", onTracking);
        el.remove();
      },
    };
  }

  const ArGuide = { attach, FLOOR_DROP_M, RAISED_BY_M, STABLE_FRAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = ArGuide;
  root.ArGuide = ArGuide;
})(typeof window !== "undefined" ? window : globalThis);
