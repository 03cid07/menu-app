/* AR guide for the 3D viewer.
 *
 * Problem: model-viewer's WebXR mode drops the dish in front of the camera the moment AR starts, then snaps it to the FIRST flat surface it
 * detects and stops looking. Phones usually find the floor before the table, so the dish ended up on the floor.
 *
 * What this does (only while a WebXR AR session is running):
 *   1. Hides the dish until a table-like surface is found, and shows a scanner animation with live status so the customer knows what is going on.
 *   2. Ignores surfaces that are far below the phone (most likely the floor) and keeps searching. A surface counts as a table when it is within
 *      FLOOR_DROP_M of the phone, or when it sits clearly above a lower surface that was already seen (the floor).
 *   3. Waits until the surface is steady for a few frames, so one noisy reading cannot lock the dish in the wrong place.
 *   4. Offers "Place it here anyway" after a while, so nobody is ever stuck (for example a very low coffee table).
 *   5. Puts the dish where the table was found, not a metre in front of where AR started.
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
    <div class="ar-msg"><div class="ar-title"></div><div class="ar-sub"></div></div>
    <button type="button" class="ar-override" hidden>Place it here anyway</button>`;

  const TEXT = {
    scanning: ["Looking for your table\u2026", "Hold your phone about an arm's length above the table."],
    moving:   ["Looking for your table\u2026", "Move your phone slowly from side to side."],
    floor:    ["I can only see the floor", "Aim at the table top and keep moving slowly. The dish waits until it finds the table."],
    none:     ["No table detected yet", "Try brighter light, or put a napkin or menu with a pattern on the table and aim at it."],
    lost:     ["Lost tracking", "Move slowly and keep the table in view."],
    found:    ["Table found", "Drag the dish to move it. Turn it with two fingers."],
  };

  function attach(mv) {
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
    // In AR, taps on page elements would also count as "select" in the XR scene; this keeps the button tap to itself
    btn.addEventListener("beforexrselect", (e) => e.preventDefault());
    mv.appendChild(el);      // inside <model-viewer> so it is part of what the browser shows over the camera

    let active = false, placed = false, lost = false, allowFloor = false;
    let startedAt = 0, firstFloorAt = 0, lastFloorAt = 0;
    let lowestY = null, streak = 0, lastY = 0, accepted = null;
    let scene = null, timer = 0, toast = 0, inSearch = false;

    const setScene = (visible) => { try { if (scene) scene.visible = visible; } catch (e) { /* ignore */ } };

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
        if (lowestY === null || y < lowestY) lowestY = y;
        const tableLike = allowFloor || drop <= FLOOR_DROP_M || (y - lowestY) >= RAISED_BY_M;
        if (!tableLike) {                                         // probably the floor: keep looking
          if (!firstFloorAt) firstFloorAt = now;
          lastFloorAt = now; streak = 0;
          return null;
        }
        if (streak && Math.abs(y - lastY) <= STABLE_TOL_M) streak++; else { streak = 1; lastY = y; }
        if (streak < STABLE_FRAMES) return null;                  // not steady yet
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
      if (placed) { st = "found"; text = TEXT.found; }
      else if (lost) { st = "lost"; text = TEXT.lost; }
      else if (hooked && lastFloorAt && now - lastFloorAt < RECENT_MS) {
        st = "floor"; text = TEXT.floor; offer = now - firstFloorAt > OVERRIDE_FLOOR_MS;
      } else if (t > NONE_HINT_MS && !(lastFloorAt && now - lastFloorAt < RECENT_MS)) {
        st = "none"; text = TEXT.none; offer = hooked && t > OVERRIDE_NONE_MS;
      } else { st = "scanning"; text = t > SLOW_HINT_MS ? TEXT.moving : TEXT.scanning; }
      if (el.dataset.state !== st) el.dataset.state = st;
      if (titleEl.textContent !== text[0]) titleEl.textContent = text[0];
      if (subEl.textContent !== text[1]) subEl.textContent = text[1];
      btn.hidden = !offer || allowFloor || placed;
    }

    function markPlaced() {
      if (placed) return;
      placed = true;
      mv.removeAttribute("data-ar-scan");       // brings the name/price label back
      view();
      toast = setTimeout(() => { el.hidden = true; }, FOUND_TOAST_MS);
    }

    btn.addEventListener("click", () => { allowFloor = true; streak = 0; view(); });

    function begin() {
      end(true);
      active = true; placed = false; lost = false; allowFloor = false;
      startedAt = performance.now(); firstFloorAt = lastFloorAt = 0; lowestY = null; streak = 0;
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
      el.hidden = true;
      if (!restoreOnly) active = false;
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
