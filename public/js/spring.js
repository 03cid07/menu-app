// Spring motion and rubber-band drag for the bottom cards (dish card, My list).
// The numbers come from https://blog.justinbuilds.mov/ios/ (Apple's UIKit and SwiftUI):
//  - rubber band: overscroll = (1 - 1 / (c*x/d + 1)) * d, c = 0.55 for touch, d = the size of the view
//  - spring: damped harmonic oscillator, stiffness (2*PI / response)^2, damping 2 * ratio * (2*PI / response)
//    SwiftUI's default ".smooth" is response 0.5 and damping ratio 1.0 (no bounce)
// A spring keeps its speed when it is interrupted: grab the card mid-animation and it follows your finger.
(() => {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // How far content moves when the finger is x points past the edge (x <= 0 gives 0)
  const rubber = (x, d, c = 0.55) => (x <= 0 ? 0 : (1 - 1 / ((c * x) / d + 1)) * d);

  // Move a number from `from` to `to` with spring physics. Returns { stop(), value(), velocity() }.
  function spring({ from, to, velocity = 0, response = 0.5, damping = 1, onUpdate, onDone }) {
    const w = (2 * Math.PI) / response, k = w * w, b = 2 * damping * w;
    let x = from, v = velocity, raf = 0, last = 0, done = false;
    const finish = (ok) => { if (done) return; done = true; cancelAnimationFrame(raf); if (ok) { x = to; v = 0; onUpdate && onUpdate(x); onDone && onDone(); } };
    const ctl = { stop: () => finish(false), value: () => x, velocity: () => v, running: () => !done };
    if (reduced() || from === to) { finish(true); return ctl; }
    const step = (t) => {
      if (done) return;
      let dt = Math.min(0.05, (t - (last || t)) / 1000 || 0.016);
      last = t;
      const h = 1 / 240; // small fixed steps keep the integration stable
      while (dt > 0) {
        const s = Math.min(h, dt);
        v += (-k * (x - to) - b * v) * s;
        x += v * s;
        dt -= s;
      }
      if (Math.abs(x - to) < 0.4 && Math.abs(v) < 12) return finish(true);
      onUpdate && onUpdate(x);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return ctl;
  }

  // Make a fixed backdrop (`root`) with a bottom card (`box`) slide in and out with springs, and let
  // a finger drag it down to close. Pulling it up past its resting place stretches like a rubber band.
  // `reveal()` is called before it slides in; `finish()` is called when it has slid out (hide it there).
  //
  // Optional `origin()` (the rectangle of the thing that was tapped) and `target()` (the element that is the card, default the box)
  // turn the slide into a grow: a window the size of the tapped row opens up into the whole card, and closes back into the row,
  // also after a drag down (the card shrinks a little while it follows the finger, then lands in the row). The card itself is
  // never stretched. These run as Web Animations, so the browser runs them apart from the page's own scripts and they stay smooth
  // while the page is busy. Without a visible row the card slides like before.
  function bottomCard({ root, box, finish, dim = 0.55, scroller = null, origin = null, target = null }) {
    let y = 0, anim = null, closing = false, t0 = null;
    const morph = !!origin;
    let wanims = [], dragOrigin = "";
    const EASE_OUT = "cubic-bezier(.22, 1, .36, 1)";   // quick start and a long soft landing: feels like a spring without the bounce
    const EASE_IN_OUT = "cubic-bezier(.32, .72, 0, 1)";
    const FULL = "inset(0px 0px 0px 0px round 0px)";
    box.dataset.rbEdges = "end"; // rubber.js: pulling down at the top closes the card, so only the bottom stretches
    const height = () => box.offsetHeight || 1;
    // distance that moves the card fully below the screen; measured once per gesture, not every frame
    let off = 1;
    const measure = () => { off = innerHeight - (box.getBoundingClientRect().top - y) + 8; };
    const offscreen = () => off;
    function apply(v) {
      y = v;
      if (morph && v > 0) {
        // pulled down: the card shrinks a little as it follows the finger (about its own centre)
        const prog = Math.min(1, v / (innerHeight * 0.7));
        box.style.transformOrigin = dragOrigin;
        box.style.transform = `translate3d(0, ${v}px, 0) scale(${(1 - 0.28 * prog).toFixed(4)})`;
      } else {
        box.style.transform = v ? `translate3d(0, ${v}px, 0)` : "";
      }
      const p = Math.max(0, Math.min(1, 1 - v / (offscreen() || 1)));
      root.style.background = `rgba(0, 0, 0, ${(dim * p).toFixed(3)})`;
    }
    function clear() { box.style.transform = ""; box.style.transformOrigin = ""; root.style.background = ""; y = 0; }
    const stopW = () => { wanims.forEach((a) => a.cancel()); wanims = []; };
    const stop = () => { if (anim) anim.stop(); anim = null; stopW(); };

    // ---- the tapped row <-> the card ----
    // Measured with no transform on the card. `dy` moves the card so its top edge sits on the row's top edge; `clip` is the window
    // the size of the row (in the box's own coordinates, so it moves with the card). From the row's window to the whole card = the grow.
    function restRects() {
      if (!morph || reduced()) return null;
      const o = origin();
      if (!o) return null;
      const pt = box.style.transform, po = box.style.transformOrigin;
      box.style.transform = ""; box.style.transformOrigin = "";
      const t = ((target && target()) || box).getBoundingClientRect(), b = box.getBoundingClientRect();
      box.style.transform = pt; box.style.transformOrigin = po;
      if (!t.width || !t.height) return null;
      const top = t.top - b.top, left = o.left - b.left;
      return {
        dy: o.top - t.top,
        clip: `inset(${top}px ${Math.max(0, b.right - o.right)}px ${Math.max(0, b.height - top - o.height)}px ${Math.max(0, left)}px round 16px)`,
        ox: t.left + t.width / 2 - b.left, oy: t.top + t.height / 2 - b.top, // the card's own centre (for the shrink while dragging)
      };
    }

    function open() {
      stop(); closing = false; clear();
      const g = restRects();
      if (g) {
        const move = box.animate([{ transform: `translate3d(0, ${g.dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], { duration: 460, easing: EASE_OUT });
        const reveal = box.animate([{ clipPath: g.clip }, { clipPath: FULL }], { duration: 460, easing: EASE_OUT });
        const fade = box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: "ease-out" });
        const dimmer = root.animate([{ backgroundColor: "rgba(0, 0, 0, 0)" }, { backgroundColor: `rgba(0, 0, 0, ${dim})` }], { duration: 460, easing: EASE_OUT });
        wanims = [move, reveal, fade, dimmer];
        move.onfinish = () => { stopW(); clear(); };
        return;
      }
      measure();
      const from = offscreen();
      apply(from);
      anim = spring({ from, to: 0, response: 0.5, damping: 1, onUpdate: apply, onDone: clear });
    }
    function dismiss(velocity = 0) {
      if (closing) return;
      closing = true; stop();
      const g = restRects();
      if (g) {
        // close the window back to the row's size, from wherever the card is now (a drag leaves it low and a little smaller)
        box.style.transformOrigin = dragOrigin || `${g.ox}px ${g.oy}px`;
        const d = 360;
        const move = box.animate({ transform: `translate3d(0, ${g.dy}px, 0) scale(1)` }, { duration: d, easing: EASE_IN_OUT, fill: "forwards" });
        const reveal = box.animate([{ clipPath: FULL }, { clipPath: g.clip }], { duration: d, easing: EASE_IN_OUT, fill: "forwards" });
        const fade = box.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: d, easing: "linear", fill: "forwards" });
        const dimmer = root.animate({ backgroundColor: "rgba(0, 0, 0, 0)" }, { duration: d, easing: EASE_IN_OUT, fill: "forwards" });
        wanims = [move, reveal, fade, dimmer];
        move.onfinish = () => { finish(); stopW(); clear(); closing = false; }; // hide first, then drop the effects: no flash of the full card
        return;
      }
      measure();
      anim = spring({ from: y, to: offscreen(), velocity: Math.max(0, velocity), response: 0.4, damping: 1, onUpdate: apply, onDone: () => { clear(); closing = false; finish(); } });
    }
    function snapBack(velocity) {
      stop();
      const from = y;
      // overshooting upwards would show a gap under the card, so stop at the resting place
      anim = spring({ from, to: 0, velocity, response: 0.5, damping: 1, onUpdate: (v) => apply(from >= 0 ? Math.max(0, v) : v), onDone: clear });
    }

    // ---- touch drag ----
    box.addEventListener("touchstart", (e) => {
      if (closing || e.touches.length !== 1) { t0 = null; return; }
      const t = e.touches[0];
      if (wanims.length) { stopW(); clear(); } // touched while it was growing: it just lands, then the touch works as usual
      measure();
      if (morph) { const g = restRects(); dragOrigin = g ? `${g.ox}px ${g.oy}px` : ""; }
      t0 = { x: t.clientX, y: t.clientY, base: y, mode: null, pts: [[performance.now(), t.clientY]] };
      if (anim && anim.running()) { t0.v0 = anim.velocity(); stop(); t0.base = y; t0.mode = "drag"; t0.grabbed = true; } // caught mid-motion: take over
    }, { passive: true });

    box.addEventListener("touchmove", (e) => {
      if (!t0 || closing) return;
      const t = e.touches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
      if (!t0.mode) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy)) { t0.mode = "ignore"; return; } // sideways: the photo gallery's job
        // scroller(target) lets a card made of several swipeable pages say which page is scrolling (default: the box itself)
        const sc = (scroller && scroller(e.target)) || box;
        const atTop = sc.scrollTop <= 0, canScroll = sc.scrollHeight > sc.clientHeight + 1;
        t0.mode = (dy > 0 && atTop) || (dy < 0 && !canScroll) ? "drag" : "scroll";
        if (t0.mode === "drag") { t0.y = t.clientY; t0.base = y; t0.pts = [[performance.now(), t.clientY]]; }
      }
      if (t0.mode !== "drag") return;
      if (t0.grabbed && !t0.moved) {
        if (Math.hypot(dx, dy) < 6) return; // a plain catch: wait to see whether the finger really drags
        t0.moved = true; t0.y = t.clientY; t0.base = y; t0.pts = [[performance.now(), t.clientY]];
        return;
      }
      if (e.cancelable) e.preventDefault();
      const raw = t0.base + (t.clientY - t0.y);
      apply(raw >= 0 ? raw : -rubber(-raw, height()));
      t0.pts.push([performance.now(), t.clientY]);
    }, { passive: false });

    const end = () => {
      if (!t0) return;
      const m = t0.mode, pts = t0.pts, caught = t0.grabbed && !t0.moved, v0 = t0.v0 || 0; t0 = null;
      if (m !== "drag") return;
      if (caught) return snapBack(v0); // caught and let go without dragging: carry on to where it was heading
      const now = performance.now(), recent = pts.filter((p) => now - p[0] < 120);
      const a = recent[0], z = recent[recent.length - 1];
      const v = recent.length > 1 && z[0] > a[0] ? ((z[1] - a[1]) / (z[0] - a[0])) * 1000 : 0; // px per second
      if (y > height() * 0.3 || (v > 700 && y > 0)) dismiss(v); else snapBack(v);
    };
    box.addEventListener("touchend", end);
    box.addEventListener("touchcancel", end);

    return { open, dismiss, cancel: () => { stop(); closing = false; clear(); }, isClosing: () => closing };
  }

  window.Springs = { spring, rubber, bottomCard };
})();
