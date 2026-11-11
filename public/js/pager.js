// Book-style menu: one category per page. Swipe left or right to turn the page
// (the buttons, the dots and the arrow keys work too, for phones without a touch swipe and for computers).
//
//   Pager.show(rootElement, { pages: [{ key, title, html }], current: key, onChange(key) })
//   Pager.clear()   // call before the menu is drawn some other way
//
// The page follows the finger and turns with a short, plain ease-out slide: no spring, no bounce, no rubber band
// (at the first and last page it simply stays put). Every page is a box of the SAME height (the tallest page,
// see measure), so turning a page never makes the document taller or shorter and nothing can stretch or snap.
// The whole menu sits in a box that is fixed on the screen (body.pgr-fixed): the header and search bar stay on top,
// the page buttons and dots stay at the bottom, and only the dishes in between scroll.
// Scrolling the dishes down hides the header and stretches the box to show more dishes (see setHeader); pulling down from the top of the screen
// (or at the first dish) drags the header back out, like the phone's quick settings, and it stays if you pull far enough.
// A page shows at most ROWS dishes at a time: a category with more dishes scrolls inside its list (the first
// ones slide out of the top as you scroll, the next ones come in at the bottom).
// It uses pointer events with `touch-action: pan-y`, so up and down still scroll the page normally and only a
// mostly sideways drag turns the page.
(() => {
  const GAP = 24;           // space between two pages while they slide past each other
  const LOCK = 8;           // how far the finger must move before we decide: sideways (turn) or up/down (scroll)
  const FAR = 0.28;         // dragged further than this share of the width: the page turns
  const FLING = 0.45;       // ... or flicked faster than this (px per ms)
  const ROWS = 6;           // dishes visible at once in a page's list; more than this scroll inside the list
  const SLIDE = 260;        // how long a full page turn takes (ms)
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bar = () => document.getElementById("fs");
  let P = null;             // the pager on screen

  // ---- Header: hides while the dishes scroll, comes back with a real pull-down (like the phone's quick settings) ----
  // ONE number drives everything: S.c = how many px the header has collapsed (0 = fully shown, S.hdrD = fully hidden).
  // paintHdr() sets the header's height and every list window (height + c) in the SAME frame, so the box grows smoothly
  // and nothing can drift out of step (before, two separate CSS transitions ran side by side and could glitch).
  //  - scroll a list down        -> the header slides away, the box stretches into the room it leaves
  //  - header hidden: drag down from the very top (the search bar area) or pull down at the first dish
  //                              -> the header follows the finger; let go past a third (or flick) and it stays,
  //                                 otherwise it springs back up
  const HDR_MS = 260;
  const hdr = () => document.querySelector("header.top");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pageLists = (S) => S.els.map((n) => n.querySelector(".pgr-list")).filter(Boolean);
  const clearHdrStyle = (h) => { h.classList.remove("hdr-off", "hdr-probe"); h.style.maxHeight = h.style.paddingTop = h.style.paddingBottom = h.style.opacity = ""; };
  const resetHeader = () => { const h = hdr(); if (h) clearHdrStyle(h); };
  const stopHdr = (S) => { if (S && S.hdrAnim) S.hdrAnim.stop(); };

  // How tall is the header open, and how tall does it stay when collapsed (the phone's notch space is kept)?
  function measureHdr(S) {
    const h = hdr();
    if (!h) return false;
    stopHdr(S);
    paintHdr(S, 0);
    const cs = getComputedStyle(h);
    S.hdrOpen = h.offsetHeight; S.hdrPt = parseFloat(cs.paddingTop) || 0; S.hdrPb = parseFloat(cs.paddingBottom) || 0;
    h.classList.add("hdr-probe");
    S.hdrShut = h.offsetHeight;
    h.classList.remove("hdr-probe");
    S.hdrD = Math.max(0, S.hdrOpen - S.hdrShut);
    return S.hdrD > 0;
  }

  // Draw the header collapsed by c px and every list window c px taller, all at once
  function paintHdr(S, c) {
    const h = hdr();
    if (!h) return;
    c = S.hdrD ? clamp(c, 0, S.hdrD) : 0;
    if (c <= 0.3) c = 0;
    S.c = c;
    if (!c) clearHdrStyle(h);
    else {
      const f = c / S.hdrD; // 0 = open, 1 = hidden
      h.classList.add("hdr-off");
      h.style.maxHeight = (S.hdrOpen - c) + "px";
      h.style.paddingTop = (S.hdrShut + (S.hdrPt - S.hdrShut) * (1 - f)) + "px";
      h.style.paddingBottom = (S.hdrPb * (1 - f)) + "px";
      h.style.opacity = String(clamp(1 - f * 1.3, 0, 1));
    }
    for (const l of pageLists(S)) if (l._base != null) l.style.maxHeight = (l._base + c) + "px"; // a page that shows every dish has nothing to stretch
  }

  // The box glows while it is changing size (class .growing, see the CSS), so the stretch is easy to notice
  const glow = (S, on) => S.el.classList.toggle("growing", on);

  // Slide c to a value with an ease-out (fixed time, no bounce)
  function moveHdr(S, to) {
    stopHdr(S);
    const from = S.c;
    if (reduced() || !S.hdrD || Math.abs(to - from) < 0.5) { paintHdr(S, to); glow(S, false); return; }
    glow(S, true);
    const ms = HDR_MS * clamp(Math.abs(to - from) / S.hdrD, 0.4, 1);
    const t0 = performance.now();
    let run = true, raf = 0;
    const step = (now) => {
      if (!run) return;
      const t = Math.min(1, (now - t0) / ms);
      paintHdr(S, from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
      else { run = false; S.hdrAnim = null; glow(S, false); }
    };
    S.hdrAnim = { stop() { run = false; cancelAnimationFrame(raf); S.hdrAnim = null; } };
    raf = requestAnimationFrame(step);
  }

  function setHeader(S, hide) {
    if (!hdr() || S !== P || S.hid === hide || S.peeks.length) return;
    S.hdrLock = performance.now() + HDR_MS + (hide ? 200 : 600); // the box changes size now: ignore the scroll events that causes
    if (hide) {
      if (!measureHdr(S)) return;
      S.hid = true;
      moveHdr(S, S.hdrD);
    } else {
      S.hid = false;
      moveHdr(S, 0);
    }
  }

  // Dragging the hidden header out: dy = how far the finger has gone down. It follows the finger one to one.
  function dragHdr(S, dy) {
    if (!S.hid || !S.hdrD) return;
    stopHdr(S);
    S.dragging = true; S.hdrLock = performance.now() + 600;
    glow(S, true);
    paintHdr(S, S.hdrD - clamp(dy, 0, S.hdrD));
  }
  // Finger up (v = px per ms going down): past a third of the way, or flicked down -> it stays. Otherwise it springs back up.
  function endDragHdr(S, v) {
    if (!S.dragging) return;
    S.dragging = false;
    const out = S.hdrD - S.c; // how far it came out
    S.hdrLock = performance.now() + HDR_MS + 600;
    if (out > S.hdrD * 0.33 || (v > 0.5 && out > 6)) { S.hid = false; moveHdr(S, 0); }
    else moveHdr(S, S.hdrD);
  }

  const clear = () => { if (P) { stopHdr(P); if (P.anim) P.anim.stop(); if (P.float) P.float.remove(); } P = null; resetHeader(); document.body.classList.remove("pgr-fixed"); };

  function pageHtml(pages, j) {
    const n = pages.length, p = pages[j];
    return `<section class="cat pgr-page" data-key="${esc(p.key)}" tabindex="-1" aria-label="${esc(p.title)}, page ${j + 1} of ${n}">
      <h2><span class="pgr-title">${esc(p.title)}</span></h2>
      <div class="pgr-box${pages[j - 1] ? " has-prev" : ""}${pages[j + 1] ? " has-next" : ""}"><div class="pgr-list">${p.html}</div></div>
      <nav class="pgr-nav" aria-hidden="true"></nav>
    </section>`;
  }

  // The page dots float: one pill fixed to the screen above the bottom nav, instead of one set per page that
  // scrolls away and slides sideways with the page. It lives on <body> and goes away with the pager (see clear).
  function floatDots(S) {
    const n = S.pages.length;
    const f = document.createElement("nav");
    f.className = "pgr-float";
    f.setAttribute("aria-label", "Menu pages");
    f.innerHTML = S.pages.map((q, k) => `<button type="button" class="pgr-dot" data-go="${k}" aria-label="${esc(q.label || q.title)}, page ${k + 1} of ${n}"></button>`).join("");
    f.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (b) go(S, Number(b.dataset.go));
    });
    document.body.appendChild(f);
    S.float = f;
    markDot(S, S.i);
  }
  const markDot = (S, j) => {
    if (!S.float) return;
    Array.from(S.float.children).forEach((b, k) => {
      b.classList.toggle("on", k === j);
      if (k === j) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
  };

  function show(root, { pages, current, onChange }) {
    clear();
    const i = Math.max(0, pages.findIndex((p) => p.key === current));
    const el = document.createElement("div");
    el.className = "pgr";
    el.dataset.rb = "off"; // no rubber band here (see rubber.js): this area only scrolls
    el.innerHTML = pages.map((_, j) => pageHtml(pages, j)).join("");
    root.replaceChildren(el);
    // The book-style menu is a fixed box that fills the screen between the search bar and the bottom bar:
    // the page itself does not scroll, only the dishes inside the box do (see body.pgr-fixed in the CSS)
    document.body.classList.add("pgr-fixed");
    window.scrollTo(0, 0);
    const els = Array.from(el.children);
    els.forEach((n, j) => n.classList.toggle("pgr-off", j !== i));
    const S = (P = { el, els, pages, i, onChange, x: 0, W: 1, limit: 0, restY: null, anim: null, peeks: [], suppress: false, hid: false, c: 0, hdrD: 0, hdrOpen: 0, hdrShut: 0, hdrPt: 0, hdrPb: 0, hdrAnim: null, dragging: false, hdrLock: 0, noHdr: false });
    measure(S);
    el.addEventListener("scroll", (e) => {
      const l = e.target;
      if (!l.classList || !l.classList.contains("pgr-list")) return;
      markMore(l);
      const t = l.scrollTop, prev = l._lt || 0;
      l._lt = t;
      if (S !== P || S.noHdr || S.dragging || performance.now() < S.hdrLock || l !== S.els[S.i].querySelector(".pgr-list")) return;
      if (!S.hid && t > prev && t > 10) setHeader(S, true); // scrolling down: hide the header, stretch the box (it comes back by pulling down from the top)
    }, true);
    bind(S);
    if (pages.length > 1) floatDots(S); // one page (a search that matches one category, a sort): nothing to turn to
    warmNear(S);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S === P && !S.peeks.length && !S.anim) measure(S); });
    if (onChange) onChange(pages[i].key); // remember the page even when the old one no longer exists
    return S;
  }

  // Lay a page out invisibly (if it is not the one showing) just long enough to run fn on it
  function laidOut(n, fn) {
    const off = n.classList.contains("pgr-off");
    if (off) { n.classList.remove("pgr-off"); n.classList.add("pgr-peek"); n.style.visibility = "hidden"; }
    const r = fn();
    if (off) { n.classList.add("pgr-off"); n.classList.remove("pgr-peek"); n.style.visibility = ""; }
    return r;
  }
  // Is there more list below the visible window? (draws a soft fade at the bottom, see .pgr-list.more in the CSS)
  const markMore = (list) => list.classList.toggle("more", list.scrollTop + list.clientHeight < list.scrollHeight - 2);

  // Every page is a box of the same fixed size: the list shows ROWS dishes (as tall as the tallest set of ROWS
  // dishes on any page) and scrolls inside when there are more; the page box is as tall as the tallest page.
  // A page with fewer dishes just has empty room under its list (its buttons stay at the bottom), so the
  // document keeps the same height on every page and nothing can stretch or snap.
  // ---- Fitting the dishes into the room there is (used by the Full menu here and by the Quick menu results) ----
  // The window shows k whole dishes and half of the next one, and it fills the room exactly: to make that work out, every
  // row grows or shrinks a few pixels (its top and bottom padding), so no space is wasted under the box.
  window.DishFit = {
    reset(items) { items.forEach((i) => { i.style.paddingTop = i.style.paddingBottom = ""; }); },
    // items: laid out with their padding reset. free: the room in px. Returns the window height, or 0 when every dish fits.
    apply(items, free) {
      const a = items[0], z = items[items.length - 1];
      const geo = () => ({ rowH: a.offsetHeight, pitch: items[1] ? items[1].offsetTop - a.offsetTop : a.offsetHeight + 10 });
      let { rowH, pitch } = geo();
      if (z.offsetTop + z.offsetHeight - a.offsetTop <= free) return 0;
      let best = null; // the k that needs the smallest change to the rows: k * (pitch + d) + (rowH + d) / 2 = free
      for (let k = 1; k <= items.length; k++) {
        const d = (free - rowH / 2 - k * pitch) / (k + 0.5);
        if (!best || Math.abs(d) < Math.abs(best.d)) best = { k, d };
        if (k * pitch > free) break;
      }
      const d = Math.max(-12, Math.min(14, best.d));
      if (d) items.forEach((i) => { const cs = getComputedStyle(i); i.style.paddingTop = parseFloat(cs.paddingTop) + d / 2 + "px"; i.style.paddingBottom = parseFloat(cs.paddingBottom) + d / 2 + "px"; });
      ({ rowH, pitch } = geo());
      return Math.floor(Math.min(free, best.k * pitch + rowH / 2));
    },
  };
  function fit(S, lists) {
    S.els.forEach((n, j) => {
      const list = lists[j], it = Array.from(list.querySelectorAll(".item"));
      if (!it.length) return;
      laidOut(n, () => {
        DishFit.reset(it);
        const box = list.parentElement, nav = n.querySelector(".pgr-nav");
        list.style.maxHeight = "0px";
        const free = nav.getBoundingClientRect().top - box.getBoundingClientRect().bottom; // room the window may use
        list.style.maxHeight = "";
        const h = DishFit.apply(it, free);
        list.style.maxHeight = h ? h + "px" : "";
        list._base = h || null; // the window height with the header shown (the header animation adds to this)
      });
    });
  }

  function measure(S) {
    const wasHid = S.hid;
    if (wasHid) { stopHdr(S); S.dragging = false; paintHdr(S, 0); } // measure with the header shown, then hide it again
    measureCore(S);
    if (wasHid) { if (measureHdr(S)) paintHdr(S, S.hdrD); else S.hid = false; }
  }
  function measureCore(S) {
    const lists = S.els.map((n) => n.querySelector(".pgr-list"));
    lists.forEach((l) => { l._base = null; });
    S.els.forEach((n, k) => { n.style.minHeight = ""; lists[k].style.maxHeight = ""; });
    let L = 0;
    S.els.forEach((n, k) => {
      L = Math.max(L, laidOut(n, () => {
        const it = lists[k].querySelectorAll(".item");
        if (!it.length) return 0;
        const a = it[0], z = it[Math.min(ROWS, it.length) - 1]; // offsetTop is measured from the list (position: relative)
        return z.offsetTop + z.offsetHeight - a.offsetTop;
      }));
    });
    if (L) lists.forEach((l) => { l.style.maxHeight = Math.ceil(L) + "px"; });
    fit(S, lists);
    let H = 0;
    S.els.forEach((n) => { H = Math.max(H, laidOut(n, () => n.offsetHeight)); });
    S.H = H; S.Wm = S.el.clientWidth; S.Hm = S.el.clientHeight;
    if (H) S.els.forEach((n) => { n.style.minHeight = H + "px"; });
    S.els.forEach((n, k) => laidOut(n, () => markMore(lists[k])));
  }
  window.addEventListener("resize", () => { if (P && !P.peeks.length && !P.anim && (P.el.clientWidth !== P.Wm || P.el.clientHeight !== P.Hm)) measure(P); });

  // The photos are lazy: on a page that is not on screen they would only start loading when it slides in
  // (grey placeholder, then a fade from transparent = the "blink"). So load and decode the neighbouring pages early.
  function warm(S, j) {
    const n = S.els[j];
    if (!n) return Promise.resolve();
    const jobs = Array.from(n.querySelectorAll("img")).map((im) => {
      if (im.loading === "lazy") im.loading = "eager";
      return im.decode ? im.decode().catch(() => {}) : Promise.resolve();
    });
    return Promise.all(jobs);
  }
  const warmNear = (S) => { warm(S, S.i - 1); warm(S, S.i + 1); };

  const animating = (S) => !!(S.anim && S.anim.running && S.anim.running());

  // Get the neighbouring pages ready to slide in next to the current one
  function prepare(S, targets) {
    if (S.peeks.length) return;
    S.W = S.el.clientWidth || 1;
    if (!S.H || S.Wm !== S.el.clientWidth) measure(S);
    // The search bar is pinned, so the person may be scrolled far down the page. The next page slides in at the
    // same height on screen, and once it has settled we scroll back up to its top (see settle).
    const barH = (bar() ? bar().offsetHeight : 0) + 8;
    const top = S.el.getBoundingClientRect().top + window.scrollY - barH;
    S.limit = Math.max(0, top);
    const Y = Math.max(0, window.scrollY - top);
    S.el.classList.add("live");
    S.peeks = targets.filter((j) => j >= 0 && j < S.els.length && j !== S.i).map((j) => {
      const n = S.els[j];
      n.classList.remove("pgr-off");
      n.classList.add("pgr-peek");
      n.style.top = Y + "px";
      return { n, j, side: Math.sign(j - S.i) };
    });
    setX(S, S.x); // put the incoming pages beside the current one right now, not a frame later (that frame was a flash)
  }

  // Draw the pages with the current one dragged x pixels sideways
  function setX(S, x) {
    S.x = x;
    const span = S.W + GAP;
    S.els[S.i].style.transform = x ? `translate3d(${x}px,0,0)` : "";
    for (const p of S.peeks) p.n.style.transform = `translate3d(${x + p.side * span}px,0,0)`;
  }

  // Jump the window to y without animation. Older Android WebViews throw on behavior: "instant", so fall back.
  function scrollToNow(y) {
    try { window.scrollTo({ top: y, left: 0, behavior: "instant" }); }
    catch { window.scrollTo(0, y); }
  }

  // Everything has stopped moving: make page j the one on screen
  function settle(S, j) {
    if (S !== P) return;
    const changed = j !== S.i;
    const y0 = window.scrollY; // where the page is scrolled now
    const hadFocus = S.els[S.i].contains(document.activeElement);
    for (const n of S.els) { n.style.transform = n.style.top = ""; n.classList.remove("pgr-peek"); }
    if (changed) { const l = S.els[S.i].querySelector(".pgr-list"); if (l) { S.noHdr = true; setTimeout(() => { S.noHdr = false; }, 150); l._lt = 0; l.scrollTop = 0; markMore(l); } } // the page we leave starts from its first dish next time
    S.i = j;
    S.els.forEach((n, k) => n.classList.toggle("pgr-off", k !== j));
    S.el.classList.remove("live");
    S.peeks = []; S.x = 0; S.anim = null;
    const rest0 = S.restY;
    S.restY = null; // never leak into the next turn
    if (!changed) return; // snapped back: nothing else to do
    // Every page box is the same height, so the document does not change size here and the scroll position is
    // always valid. Turning a page starts at the top of the new page (when the person had scrolled past it) ...
    // ... but if the person scrolled down while the slide was still running, their scroll wins.
    const rest = Number.isFinite(rest0) ? rest0 : y0;
    const tookOver = window.scrollY > rest + 0.5;
    const keep = tookOver ? y0 : Number.isFinite(S.limit) ? Math.min(y0, S.limit) : y0;
    if (Math.abs(window.scrollY - keep) > 0.5) scrollToNow(keep);
    if (hadFocus) S.els[j].focus({ preventScroll: true }); // keyboard users keep their place
    if (S.onChange) S.onChange(S.pages[j].key);
    warmNear(S);
  }

  // Slide to x = target with a plain ease-out (fixed time, no spring, no overshoot)
  function animateTo(S, target, j) {
    if (S.anim) S.anim.stop();
    S.restY = window.scrollY; // where the page was when the turn started
    markDot(S, j);
    const from = S.x, dist = target - from;
    if (Math.abs(dist) < 0.5 || reduced()) { setX(S, target); settle(S, j); return; }
    let run = true, raf = 0;
    const t0 = performance.now(), dur = Math.max(140, SLIDE * Math.min(1, Math.abs(dist) / (S.W + GAP)));
    const step = (now) => {
      if (!run) return;
      const t = Math.min(1, (now - t0) / dur);
      setX(S, from + dist * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
      else { run = false; settle(S, j); }
    };
    S.anim = { stop() { run = false; cancelAnimationFrame(raf); }, running: () => run };
    raf = requestAnimationFrame(step);
  }

  // Turn to page j (the dots, the buttons and the arrow keys use this)
  function go(S, j) {
    if (S !== P || j === S.i || j < 0 || j >= S.els.length || animating(S) || S.busy) return;
    const ready = Promise.race([warm(S, j), new Promise((r) => setTimeout(r, 250))]);
    S.busy = true;
    ready.then(() => {
      S.busy = false;
      if (S !== P || S.i === j || animating(S)) return;
      prepare(S, [j]);
      animateTo(S, -Math.sign(j - S.i) * (S.W + GAP), j);
    });
  }

  function bind(S) {
    const el = S.el;
    let g = null; // the finger on the screen
    el.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || animating(S)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return; // laptop: drag with the left button, like a finger
      S.suppress = false;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, locked: false, s: [[e.clientX, e.timeStamp]] };
    });
    el.addEventListener("pointermove", (e) => {
      if (!g || e.pointerId !== g.id) return;
      if (e.pointerType === "mouse" && e.buttons === 0) { g = null; return; } // button was released outside the window
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.locked) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) { g = null; return; } // mostly up/down: the page scrolls as usual
        g.locked = true; S.suppress = true;
        el.classList.add("dragging"); // no text selection / grab cursor while dragging with a mouse
        try { getSelection().removeAllRanges(); } catch { /* not important */ }
        g.x0 = e.clientX; g.s = [[e.clientX, e.timeStamp]]; // start from 0 so the page does not jump by the first few pixels
        prepare(S, [S.i - 1, S.i + 1]);
        try { el.setPointerCapture(e.pointerId); } catch { /* the drag still works without it */ }
        return;
      }
      const d = e.clientX - g.x0;
      const edge = (d > 0 && S.i === 0) || (d < 0 && S.i === S.els.length - 1); // nothing before the first / after the last page
      setX(S, edge ? 0 : d); // it just stays put there: no stretching
      g.s.push([e.clientX, e.timeStamp]);
      while (g.s.length > 2 && e.timeStamp - g.s[0][1] > 100) g.s.shift();
    });
    const end = (e, cancelled) => {
      if (!g || e.pointerId !== g.id) return;
      const f = g; g = null;
      if (!f.locked) return;
      el.classList.remove("dragging");
      setTimeout(() => { S.suppress = false; }, 60);
      const x = S.x, W = S.W, a = f.s[0], b = f.s[f.s.length - 1];
      const v = b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0; // px per ms
      const want = x < 0 ? 1 : -1;
      const far = Math.abs(x) > W * FAR;
      const fwd = Math.abs(v) > FLING && Math.sign(v) === Math.sign(x), back = Math.abs(v) > FLING && Math.sign(v) !== Math.sign(x);
      let j = S.i;
      if (!cancelled && ((far && !back) || fwd)) j = S.i + want;
      if (j < 0 || j >= S.els.length) j = S.i;
      animateTo(S, j === S.i ? 0 : -want * (W + GAP), j);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    // Laptop trackpad: a two-finger sideways swipe (or shift + wheel) turns one page per swipe.
    // The cooldown outlasts the trackpad's inertia, so one swipe never skips two pages.
    let acc = 0, quiet = 0, lockedUntil = 0;
    el.addEventListener("wheel", (e) => {
      const ax = Math.abs(e.deltaX), ay = Math.abs(e.deltaY);
      if (e.ctrlKey || ax < 1 || ax < ay * 1.2) return; // vertical scrolling and pinch-zoom stay normal
      e.preventDefault(); // also stops the browser's own "swipe = back" gesture
      const now = performance.now();
      clearTimeout(quiet);
      quiet = setTimeout(() => { acc = 0; }, 160);
      if (now < lockedUntil || animating(S) || S.busy) { lockedUntil = now + 120; return; } // still the same swipe's inertia
      acc += e.deltaX;
      if (Math.abs(acc) < 50) return;
      const j = S.i + (acc > 0 ? 1 : -1);
      acc = 0;
      if (j < 0 || j >= S.els.length) return;
      lockedUntil = now + 450;
      go(S, j);
    }, { passive: false });
    // Header hidden and the list at its first dish: keep wheeling up (mouse / trackpad) to drag it back out.
    // (Touch is handled for the whole screen below, see the touch listeners after bind.)
    const atTop = () => { const l = S.els[S.i].querySelector(".pgr-list"); return !l || l.scrollTop <= 1; };
    let wd = 0, wt = 0;
    el.addEventListener("wheel", (e) => {
      if (!S.hid || !atTop() || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      if (e.deltaY >= 0 && !S.dragging) return;
      wd = Math.max(0, wd - e.deltaY); // wheeling up pulls, wheeling down eases it back
      dragHdr(S, wd);
      clearTimeout(wt);
      wt = setTimeout(() => { wd = 0; endDragHdr(S, 0); }, 160);
    }, { passive: true });
    // a drag must not also "tap" the dish or button under the finger
    el.addEventListener("click", (e) => { if (S.suppress) { e.preventDefault(); e.stopPropagation(); } }, true);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (b) go(S, Number(b.dataset.go));
    });
  }

  // ---- Touch: pull the hidden header back down ----
  // Works from the top of the screen (the search bar area, like pulling down the quick settings) AND from the first dish of the list.
  // Only starts when the finger moves clearly downward, so taps on the search box or a dish are never stolen.
  let T = null;
  document.addEventListener("touchstart", (e) => {
    const S = P;
    T = null;
    if (!S || !S.hid || e.touches.length !== 1 || S.peeks.length || document.body.classList.contains("no-scroll")) return;
    const t = e.touches[0], b = bar();
    const topLine = b ? b.getBoundingClientRect().bottom : 0;
    const inList = S.el.contains(e.target);
    if (t.clientY > topLine && !inList) return;
    T = { x0: t.clientX, y0: t.clientY, zone: t.clientY <= topLine ? "top" : "list", on: false, base: 0, ly: t.clientY, lt: e.timeStamp, v: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    const S = P;
    if (!T || !S || (!S.hid && !S.dragging) || e.touches.length !== 1) return;
    const t = e.touches[0], dy = t.clientY - T.y0, dx = t.clientX - T.x0;
    if (!T.on) {
      if (Math.abs(dx) > LOCK && Math.abs(dx) > Math.abs(dy)) { T = null; return; } // sideways: the page turn
      const l = S.els[S.i].querySelector(".pgr-list");
      if (T.zone === "list" && (S.suppress || (l && l.scrollTop > 1) || dy < 0)) { T.y0 = t.clientY; T.x0 = t.clientX; return; } // still scrolling the list: the pull starts where we reach the top
      if (dy < 6 || dy < Math.abs(dx) * 1.2) return;
      T.on = true; T.base = S.hdrD - S.c; T.y0 = t.clientY; // take over (also from a header that is still sliding)
      stopHdr(S);
    }
    dragHdr(S, T.base + (t.clientY - T.y0));
    if (e.timeStamp > T.lt) { T.v = (t.clientY - T.ly) / (e.timeStamp - T.lt); T.ly = t.clientY; T.lt = e.timeStamp; }
  }, { passive: true });
  const letGo = () => { const S = P, f = T; T = null; if (S && f && f.on) endDragHdr(S, f.v); };
  document.addEventListener("touchend", letGo, { passive: true });
  document.addEventListener("touchcancel", letGo, { passive: true });

  document.addEventListener("keydown", (e) => {
    if (!P || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (document.body.classList.contains("no-scroll")) return; // a card or the 3D viewer is open
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable], model-viewer")) return;
    go(P, P.i + (e.key === "ArrowRight" ? 1 : -1));
  });

  window.Pager = { show, clear, go: (j) => P && go(P, j), index: () => (P ? P.i : -1), dragging: () => !!(P && (P.suppress || P.x !== 0)) };
})();
