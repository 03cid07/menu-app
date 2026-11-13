/* Move a dish around the floor in the 3D viewer, one at a time (used when more than one dish is shown).

   Press on a dish and drag: that dish follows your finger or mouse across the floor, and the others stay put. Press on empty floor or
   background and drag: the camera turns as usual. The dish is moved by changing its position inside <model-viewer>'s scene (the same
   kind of internal access as js/ar-guide.js, with a check; if it is missing nothing breaks, the dishes just cannot be moved).
   The positions are kept by the page (see viewer.js), so they survive an effect being switched. */
(function (root) {
  "use strict";

  const GRAB_SLACK = 0.02;   // metres around a dish's footprint that still count as touching it

  // <model-viewer> keeps its three.js scene under a Symbol("scene") key
  function findScene(mv) {
    try {
      for (let o = mv; o; o = Object.getPrototypeOf(o)) {
        for (const s of Object.getOwnPropertySymbols(o)) {
          if (s.description !== "scene") continue;
          const sc = mv[s];
          if (sc && sc.model && typeof sc.queueRender === "function" && typeof sc.updateBoundingBox === "function" && typeof sc.updateShadow === "function") return sc;
        }
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  /* opts.floor: the FloorGrid handle (turns a spot on the screen into a spot on the floor)
     opts.dishes(): [{ i, cx, cz, hx, hz, ox, oz }] = dish number, centre on the floor, half size, and where the model's own centre is in its file
     opts.onGrab(i), opts.onMove(i, x, z), opts.onDrop() */
  function attach(mv, opts) {
    let drag = null;
    const local = (e) => { const r = mv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    function down(e) {
      if (drag || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0) || !mv.loaded) return;
      const sc = findScene(mv); if (!sc) return;
      const [x, y] = local(e);
      let hit = null; try { hit = mv.positionAndNormalFromPoint(x, y); } catch (err) { hit = null; }
      const hp = hit && hit.position; if (!hp) return;       // pressed on the empty background or floor: let the camera turn
      const ds = opts.dishes();
      let best = -1, bestD = Infinity;
      ds.forEach((d, k) => {
        if (Math.abs(hp.x - d.cx) - d.hx > GRAB_SLACK || Math.abs(hp.z - d.cz) - d.hz > GRAB_SLACK) return;
        const dist = Math.hypot(hp.x - d.cx, hp.z - d.cz);
        if (dist < bestD) { bestD = dist; best = k; }
      });
      if (best < 0) return;
      let w = null;
      sc.model.traverse((o) => { if (o.userData && o.userData.dish === ds[best].i) w = o; });
      const p0 = opts.floor.screenToPlane(x, y, hp.y);       // the plane at the height you grabbed it, so it stays under your finger
      if (!w || !p0) return;
      drag = { d: ds[best], w, sc, p0, y: hp.y, id: e.pointerId, moved: false };
      e.stopPropagation(); e.preventDefault();               // the camera does not turn while a dish is held
      try { mv.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      opts.onGrab(drag.d.i);
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const [x, y] = local(e);
      const p = opts.floor.screenToPlane(x, y, drag.y); if (!p) return;
      const lim = opts.floor.half * 0.9, d = drag.d;
      const nx = Math.max(-lim, Math.min(lim, d.cx + p.x - drag.p0.x)), nz = Math.max(-lim, Math.min(lim, d.cz + p.z - drag.p0.z));
      drag.w.position.x = nx - d.ox; drag.w.position.z = nz - d.oz;
      drag.cur = { x: nx, z: nz }; drag.moved = true;
      opts.onMove(d.i, nx, nz);
      drag.sc.queueShadowRender(); drag.sc.queueRender();
      e.preventDefault();
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      try { mv.releasePointerCapture(e.pointerId); } catch (err) { /* ok */ }
      if (d.moved) { d.sc.updateBoundingBox(); d.sc.updateShadow(); d.sc.queueRender(); opts.onDrop(); }   // the shadow and the size follow the new spot
    }
    const noScroll = (e) => { if (drag && e.cancelable) e.preventDefault(); };   // a finger on a held dish must not scroll the page

    mv.addEventListener("pointerdown", down, true);
    mv.addEventListener("pointermove", move);
    mv.addEventListener("pointerup", up);
    mv.addEventListener("pointercancel", up);
    mv.addEventListener("touchstart", noScroll, { passive: false, capture: true });
    mv.addEventListener("touchmove", noScroll, { passive: false, capture: true });
    return {
      detach() {
        mv.removeEventListener("pointerdown", down, true); mv.removeEventListener("pointermove", move);
        mv.removeEventListener("pointerup", up); mv.removeEventListener("pointercancel", up);
        mv.removeEventListener("touchstart", noScroll, true); mv.removeEventListener("touchmove", noScroll, true);
      },
    };
  }

  root.DishDrag = { attach };
})(typeof window !== "undefined" ? window : globalThis);
