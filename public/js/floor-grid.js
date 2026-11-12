/* Floor grid for the 3D viewer: a grid of thin lines lying flat under the dish, so it looks like it stands on a floor.

   How it works: the grid is drawn on a 2D canvas that sits BEHIND <model-viewer> (which has a transparent background).
   Each time the camera moves, the grid's corners are projected with the same camera <model-viewer> uses, so the lines stay glued to the floor
   while you spin or zoom. Because the dish is drawn on top of the canvas, lines behind it are hidden by it, like a real floor.

   Nothing is added to the .glb file, so AR, effects and model sizes are not touched. The canvas is hidden while AR is running.
   Only uses <model-viewer>'s public methods: getCameraOrbit, getCameraTarget, getFieldOfView, getDimensions, getBoundingBoxCenter. */
(function (root) {
  "use strict";

  const HALF_CELLS = 24;      // the grid reaches this many cells out from the dish, in every direction
  const FADE_FROM = 0.35;     // lines are full strength up to this share of the way out, then fade away to nothing
  const PIECES = 14;          // each line is drawn in this many pieces so it can fade smoothly
  const NEAR = 0.01;          // metres: anything closer to the camera than this is cut off

  // 1, 2 or 5 times a power of ten, the closest to x (so the cells have friendly sizes)
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
    return p * (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10);
  }

  function attach(mv, wrap, opts) {
    const empty = !!(opts && opts.empty);     // no dish yet: show a plain floor around the middle of the scene
    const cv = document.createElement("canvas");
    cv.className = "floor-grid";
    cv.setAttribute("aria-hidden", "true");
    wrap.insertBefore(cv, wrap.firstChild);
    const ctx = cv.getContext("2d");

    let floorY = 0, cx = 0, cz = 0, step = 0.05, ready = empty, inAr = false, raf = 0, alive = true, fixedStep = 0;

    function measure() {
      try {
        const d = mv.getDimensions(), c = mv.getBoundingBoxCenter();
        if (!d || !c || !isFinite(d.x + d.y + d.z + c.x + c.y + c.z)) return;
        floorY = c.y - d.y / 2;
        if (fixedStep) {                                     // several dishes that can be moved: the cells keep their size and the grid moves in whole cells, so the lines never seem to slide
          step = fixedStep; cx = Math.round(c.x / step) * step; cz = Math.round(c.z / step) * step;
        } else {
          step = niceStep(Math.max(d.x, d.z, 0.02) / 4);
          cx = c.x; cz = c.z;
        }
        ready = true;
      } catch (e) { ready = false; }
    }

    // 'rgb' of a CSS colour variable, so the lines follow the light / dark theme
    function lineRgb() {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
      const m = /^#([0-9a-f]{6})$/i.exec(v);
      if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
      return document.documentElement.getAttribute("data-theme") === "light" ? [42, 35, 26] : [239, 232, 219];
    }

    // the camera, exactly as <model-viewer> places it: it circles the target at the given distance
    function camera(W, H) {
      const o = mv.getCameraOrbit(), t = mv.getCameraTarget(), fov = mv.getFieldOfView();
      if (!o || !t || !fov) return null;
      const sp = Math.sin(o.phi), px = t.x + o.radius * sp * Math.sin(o.theta), py = t.y + o.radius * Math.cos(o.phi), pz = t.z + o.radius * sp * Math.cos(o.theta);
      let fx = t.x - px, fy = t.y - py, fz = t.z - pz;       // forward
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      let rx = -fz, rz = fx;                                 // right = forward x up(0,1,0)
      const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      const ux = -fy * rz, uy = fx * rz - fz * rx, uz = fy * rx;   // up = right x forward
      return { px, py, pz, rx, rz, ux, uy, uz, fx, fy, fz, pxl: (H / 2) / Math.tan((fov * Math.PI) / 360) };   // pxl: pixels per unit of x/z and of y/z (the vertical field of view fills the height)
    }

    // where the line through a spot on the screen (pixels inside the viewer) meets the flat plane at height y: { x, z } or null
    function screenToPlane(sx, sy, y) {
      const W = mv.clientWidth, H = mv.clientHeight, C = camera(W, H);
      if (!C) return null;
      const a = (sx - W / 2) / C.pxl, b = -(sy - H / 2) / C.pxl;
      const dx = a * C.rx + b * C.ux + C.fx, dy = b * C.uy + C.fy, dz = a * C.rz + b * C.uz + C.fz;
      if (dy > -1e-6) return null;                           // looking at or above the horizon
      const t = (y - C.py) / dy;
      return t > 0 ? { x: C.px + dx * t, z: C.pz + dz * t } : null;
    }

    function draw() {
      raf = 0;
      if (!alive) return;
      const W = mv.clientWidth, H = mv.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      cv.style.left = mv.offsetLeft + "px"; cv.style.top = mv.offsetTop + "px";
      cv.style.width = W + "px"; cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!ready || inAr || (!empty && !mv.loaded)) return;

      const C = camera(W, H);
      if (!C) return;
      if (C.py <= floorY + 1e-4) return;                     // camera is under the floor: a floor seen from below would look wrong, so show nothing
      const { px, py, pz, rx, rz, ux, uy, uz, fx, fy, fz, pxl } = C;

      // world point -> { x, y, z } with z the distance in front of the camera
      const cam = (X, Z) => {
        const dx = X - px, dy = floorY - py, dz = Z - pz;
        return { x: dx * rx + dz * rz, y: dx * ux + dy * uy + dz * uz, z: dx * fx + dy * fy + dz * fz };
      };
      const scr = (c) => [W / 2 + (c.x / c.z) * pxl, H / 2 - (c.y / c.z) * pxl];

      const half = HALF_CELLS * step, rgb = lineRgb();
      ctx.lineWidth = 1; ctx.lineCap = "butt";
      const base = 0.34;                                     // overall strength of the lines

      const line = (x0, z0, x1, z1) => {
        let prev = null;
        for (let i = 0; i <= PIECES; i++) {
          const u = i / PIECES, X = x0 + (x1 - x0) * u, Z = z0 + (z1 - z0) * u;
          const c = cam(X, Z);
          const cur = { c, X, Z };
          if (prev) {
            let a = prev.c, b = cur.c;
            if (a.z > NEAR || b.z > NEAR) {
              if (a.z <= NEAR) a = lerp(a, b, (NEAR - a.z) / (b.z - a.z));   // cut the part behind the camera
              else if (b.z <= NEAR) b = lerp(b, a, (NEAR - b.z) / (a.z - b.z));
              const d = Math.hypot((prev.X + X - 2 * cx) / 2, (prev.Z + Z - 2 * cz) / 2) / half;   // how far out this piece is, 0 centre .. 1 edge
              const f = d <= FADE_FROM ? 1 : Math.max(0, 1 - (d - FADE_FROM) / (1 - FADE_FROM));
              if (f > 0.01) {
                const [ax, ay] = scr(a), [bx, by] = scr(b);
                ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(base * f * f).toFixed(3)})`;
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
              }
            }
          }
          prev = cur;
        }
      };

      for (let i = -HALF_CELLS; i <= HALF_CELLS; i++) {
        line(cx + i * step, cz - half, cx + i * step, cz + half);   // lines running front to back
        line(cx - half, cz + i * step, cx + half, cz + i * step);   // lines running side to side
      }
    }
    const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });

    const queue = () => { if (!raf && alive) raf = requestAnimationFrame(draw); };
    const onLoad = () => { measure(); queue(); };
    const onAr = (e) => {
      if (e.detail.status === "session-started") inAr = true;
      else if (e.detail.status === "not-presenting") inAr = false;
      queue();
    };
    mv.addEventListener("load", onLoad);
    mv.addEventListener("camera-change", queue);
    mv.addEventListener("ar-status", onAr);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(queue) : null;
    if (ro) ro.observe(mv);
    window.addEventListener("resize", queue);
    if (mv.loaded) onLoad(); else if (empty) queue();

    return {
      refresh() { measure(); queue(); },
      setStep(s) { fixedStep = s; measure(); queue(); },
      screenToPlane,
      get half() { return HALF_CELLS * step; },
      detach() {
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        mv.removeEventListener("load", onLoad); mv.removeEventListener("camera-change", queue); mv.removeEventListener("ar-status", onAr);
        window.removeEventListener("resize", queue);
        if (ro) ro.disconnect();
        cv.remove();
      },
    };
  }

  root.FloorGrid = { attach, niceStep };
})(typeof window !== "undefined" ? window : globalThis);
