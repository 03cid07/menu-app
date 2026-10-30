// iOS-style rubber band for EVERY scrollable area, so new screens get it without extra code.
// The formula comes from https://blog.justinbuilds.mov/ios/ (read from Apple's UIKit binary):
//   overscroll = (1 - 1 / (c*x/d + 1)) * d     c = 0.55 for touch, d = the size of the scroll area
// Pull past the end of a list and the content follows your finger less and less; let go and a spring
// (spring.js) brings it back. A fast flick into an end gives a small bounce too (not on iPhone, which
// already does that itself).
//
// How it works: one set of listeners on the document. When a finger drags, it finds the scroll area under
// it (the nearest element that really scrolls in that direction, or the page itself). Nothing needs to be
// added to a new screen. Two optional attributes on an element:
//   data-rb="off"            leave this scroll area alone
//   data-rb-edges="end"      only stretch at the end (or "start"); the bottom cards use this because
//                            pulling down at their top closes the card instead (see spring.js)
// Needs spring.js first. Touch only; mice and trackpads keep the browser's own behaviour.
(() => {
  const S = window.Springs;
  if (!S || !S.spring || !S.rubber) return;
  if (!(window.CSS && CSS.supports && CSS.supports("translate", "0 1px"))) return; // old browser: skip quietly

  const C = 0.55; // touch coefficient (TouchRubberBandingCoefficient)
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pageEl = () => document.scrollingElement || document.documentElement;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const running = new Map(); // scroll area -> { anim, ax, st } while a bounce-back is playing
  const states = new WeakMap(); // scroll area -> { moved: [children], offset }
  let g = null; // the finger gesture in progress
  let lastTouch = { target: null, t: 0 };

  // ---- measuring a scroll area ----
  const metrics = (sc, ax) => {
    const pos = ax === "y" ? sc.scrollTop : sc.scrollLeft;
    const mx = ax === "y" ? sc.scrollHeight - sc.clientHeight : sc.scrollWidth - sc.clientWidth;
    return { pos, mx, size: (ax === "y" ? sc.clientHeight : sc.clientWidth) || 1, start: pos <= 1, end: pos >= mx - 1, native: pos < -1 || pos > mx + 1 };
  };
  const edgeOn = (sc, which) => { const e = sc.dataset.rbEdges || "both"; return e === "both" || e === which; };

  // the nearest element under the finger that scrolls in this direction (like the browser's own chaining)
  function findScroller(target, ax) {
    for (let n = target; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.dataset.rb === "off") return null;
      const cs = getComputedStyle(n);
      const o = ax === "y" ? cs.overflowY : cs.overflowX;
      const overflows = ax === "y" ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1;
      if ((o === "auto" || o === "scroll") && overflows) return n;
      const oc = cs.getPropertyValue(ax === "y" ? "overscroll-behavior-y" : "overscroll-behavior-x");
      if (oc === "contain" || oc === "none") return null; // this area keeps the scroll to itself
    }
    // the page itself (not while something like an open card locks it)
    if (ax !== "y" || document.body.dataset.rb === "off" || getComputedStyle(document.body).overflowY === "hidden") return null;
    const p = pageEl();
    return p.scrollHeight > p.clientHeight + 1 ? p : null;
  }

  // ---- moving the content ----
  // Content moves with the CSS `translate` property (separate from `transform`, so nothing that already
  // animates is disturbed). Fixed elements stay where they are.
  function prepare(sc) {
    let st = states.get(sc);
    if (!st) states.set(sc, (st = { moved: [], offset: 0 }));
    st.moved = Array.from(sc.children).filter((c) => !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(c.tagName) && getComputedStyle(c).position !== "fixed");
    return st;
  }
  function setOffset(sc, ax, v) {
    const st = states.get(sc);
    if (!st) return;
    st.offset = v;
    const val = Math.abs(v) < 0.05 ? "" : ax === "y" ? `0 ${v.toFixed(2)}px` : `${v.toFixed(2)}px 0`;
    for (const c of st.moved) c.style.translate = val;
  }
  const offsetFor = (raw, d) => (raw === 0 ? 0 : -Math.sign(raw) * S.rubber(Math.abs(raw), d, C));
  // the finger distance that gives this content offset (the formula run backwards), to take over a bounce mid-air
  const rawFor = (off, d) => { const y = Math.min(Math.abs(off), d * 0.999); return -Math.sign(off) * ((y * d) / (C * (d - y))); };

  function release(sc, ax, velocity) {
    const st = states.get(sc);
    if (!st) return;
    const prev = running.get(sc);
    if (prev) prev.anim.stop();
    const from = st.offset || (velocity < 0 ? -0.01 : 0.01); // spring() ignores a start that already equals the target
    const anim = S.spring({
      from, to: 0, velocity, response: 0.5, damping: 1,
      onUpdate: (v) => setOffset(sc, ax, v),
      onDone: () => { setOffset(sc, ax, 0); running.delete(sc); },
    });
    if (anim.running()) running.set(sc, { anim, ax });
    else { setOffset(sc, ax, 0); running.delete(sc); }
  }

  // ---- finger ----
  document.addEventListener("touchstart", (e) => {
    lastTouch = { target: e.target, t: performance.now() };
    if (e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0];
    g = { target: e.target, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY, ax: null, sc: null, raw: 0, pts: [], caught: false, dead: false, touching: true };
    // caught a bounce that is still moving: take over from where it is
    for (const [sc, r] of running) {
      if (sc !== pageEl() && !sc.contains(e.target)) continue;
      const st = states.get(sc);
      const v0 = r.anim.velocity();
      r.anim.stop(); running.delete(sc);
      g.ax = r.ax; g.sc = sc; g.caught = true; g.v0 = v0;
      g.d = metrics(sc, r.ax).size;
      g.raw = rawFor(st.offset, g.d);
      break;
    }
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!g || g.dead || reduced() || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - g.lx, dy = t.clientY - g.ly;
    g.lx = t.clientX; g.ly = t.clientY;

    if (!g.ax) {
      const tx = t.clientX - g.x, ty = t.clientY - g.y;
      if (Math.abs(tx) < 6 && Math.abs(ty) < 6) return;
      g.ax = Math.abs(tx) > Math.abs(ty) ? "x" : "y";
      g.sc = findScroller(g.target, g.ax);
      if (!g.sc) { g.dead = true; return; }
      g.d = metrics(g.sc, g.ax).size;
    }
    const sc = g.sc, ax = g.ax;
    const m = metrics(sc, ax);
    if (m.native) { // the browser is already stretching by itself (iPhone): leave it alone
      if (g.raw !== 0) { g.raw = 0; setOffset(sc, ax, 0); }
      g.dead = true; return;
    }
    const s = -(ax === "y" ? dy : dx); // finger up/left = scrolling towards the end = positive

    if (g.raw !== 0) {
      const next = g.raw + s;
      if (g.raw * next <= 0) { g.raw = 0; g.caught = false; setOffset(sc, ax, 0); return; } // finger came back: normal scrolling
      g.raw = next;
    } else if (s > 0 && m.end && edgeOn(sc, "end")) { g.raw = s; prepare(sc); }
    else if (s < 0 && m.start && edgeOn(sc, "start")) { g.raw = s; prepare(sc); }
    else return;

    if (e.cancelable) e.preventDefault();
    const off = offsetFor(g.raw, g.d);
    setOffset(sc, ax, off);
    g.pts.push([performance.now(), off]);
  }, { passive: false });

  const end = () => {
    const G = g; g = null;
    if (!G || !G.sc || (G.raw === 0 && !G.caught)) return;
    let v = G.caught && !G.pts.length ? G.v0 || 0 : 0;
    if (G.pts.length > 1) {
      const now = performance.now(), recent = G.pts.filter((p) => now - p[0] < 120);
      const a = recent[0], z = recent[recent.length - 1];
      if (recent.length > 1 && z[0] - a[0] >= 8) v = ((z[1] - a[1]) / (z[0] - a[0])) * 1000;
    }
    release(G.sc, G.ax, Math.max(-3000, Math.min(3000, v))); // px per second, kept sane
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);

  // ---- a fast flick into an end: a small bounce (the browser's own momentum scroll, so we only watch it) ----
  const seen = new WeakMap();
  document.addEventListener("scroll", (e) => {
    if (ios || reduced() || (g && g.touching)) return;
    const sc = e.target === document ? pageEl() : e.target;
    if (!sc || sc.nodeType !== 1 || sc.dataset.rb === "off") return;
    const now = performance.now(), prev = seen.get(sc);
    seen.set(sc, { t: now, x: sc.scrollLeft, y: sc.scrollTop });
    if (!prev || now - prev.t > 100 || now - lastTouch.t > 3000) return; // only momentum that follows a finger
    if (sc !== pageEl() && !sc.contains(lastTouch.target)) return;
    if (sc === pageEl() && (document.body.dataset.rb === "off" || getComputedStyle(document.body).overflowY === "hidden")) return;
    for (const ax of ["y", "x"]) {
      const m = metrics(sc, ax);
      if (m.native || m.mx <= 1) continue;
      const before = (ax === "y" ? prev.y : prev.x);
      const speed = ((m.pos - before) / (now - prev.t)) * 1000; // px per second, + = towards the end
      if (Math.abs(speed) < 600) continue;
      const hitEnd = speed > 0 && m.end && before < m.mx - 1 && edgeOn(sc, "end");
      const hitStart = speed < 0 && m.start && before > 1 && edgeOn(sc, "start");
      if (!hitEnd && !hitStart) continue;
      const st = prepare(sc);
      st.offset = 0;
      release(sc, ax, -Math.sign(speed) * Math.min(Math.abs(speed) * 0.8, 2500));
      return;
    }
  }, true);

  S.rubberScroll = { C };
})();
