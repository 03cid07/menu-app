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

  const clear = () => { if (P && P.anim) P.anim.stop(); if (P && P.float) P.float.remove(); P = null; document.body.classList.remove("pgr-fixed"); };

  function pageHtml(pages, j) {
    const n = pages.length, p = pages[j];
    const side = (k, cls, label) => (pages[k]
      ? `<button type="button" class="pgr-btn ${cls}" data-go="${k}">${cls === "prev" ? '<span class="pgr-arr" aria-hidden="true">\u2039</span>' : ""}<span class="pgr-lbl">${esc(pages[k].label || pages[k].title)}</span>${cls === "next" ? '<span class="pgr-arr" aria-hidden="true">\u203a</span>' : ""}</button>`
      : `<span class="pgr-sp"></span>`);
    return `<section class="cat pgr-page" data-key="${esc(p.key)}" tabindex="-1" aria-label="${esc(p.title)}, page ${j + 1} of ${n}">
      <h2><span class="pgr-title">${esc(p.title)}</span>${n > 1 ? `<span class="pgr-count" aria-hidden="true">${j + 1} / ${n}</span>` : ""}</h2>
      <div class="pgr-box"><div class="pgr-list">${p.html}</div></div>
      <nav class="pgr-nav" aria-label="Menu pages">
        <div class="pgr-btns">${side(j - 1, "prev")}${side(j + 1, "next")}</div>
        <p class="pgr-hint">Swipe to turn the page</p>
      </nav>
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
    const S = (P = { el, els, pages, i, onChange, x: 0, W: 1, limit: 0, restY: null, anim: null, peeks: [], suppress: false });
    measure(S);
    el.addEventListener("scroll", (e) => { if (e.target.classList && e.target.classList.contains("pgr-list")) markMore(e.target); }, true);
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
      });
    });
  }

  function measure(S) {
    const lists = S.els.map((n) => n.querySelector(".pgr-list"));
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
    if (changed) { const l = S.els[S.i].querySelector(".pgr-list"); if (l) { l.scrollTop = 0; markMore(l); } } // the page we leave starts from its first dish next time
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
    // a drag must not also "tap" the dish or button under the finger
    el.addEventListener("click", (e) => { if (S.suppress) { e.preventDefault(); e.stopPropagation(); } }, true);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (b) go(S, Number(b.dataset.go));
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!P || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (document.body.classList.contains("no-scroll")) return; // a card or the 3D viewer is open
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable], model-viewer")) return;
    go(P, P.i + (e.key === "ArrowRight" ? 1 : -1));
  });

  window.Pager = { show, clear, go: (j) => P && go(P, j), index: () => (P ? P.i : -1), dragging: () => !!(P && (P.suppress || P.x !== 0)) };
})();
