// Book-style menu: one category per page. Swipe left or right to turn the page
// (the buttons, the dots and the arrow keys work too, for phones without a touch swipe and for computers).
//
//   Pager.show(rootElement, { pages: [{ key, title, html }], current: key, onChange(key) })
//   Pager.clear()   // call before the menu is drawn some other way
//
// The page follows the finger, stretches like a rubber band at the first and last page, and settles with the
// same spring physics as the bottom cards (see spring.js). It uses pointer events with `touch-action: pan-y`,
// so up and down still scroll the page normally and only a mostly sideways drag turns the page.
(() => {
  const GAP = 24;           // space between two pages while they slide past each other
  const LOCK = 8;           // how far the finger must move before we decide: sideways (turn) or up/down (scroll)
  const FAR = 0.28;         // dragged further than this share of the width: the page turns
  const FLING = 0.45;       // ... or flicked faster than this (px per ms)
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bar = () => document.getElementById("fs");
  let P = null;             // the pager on screen

  const clear = () => { if (P && P.anim) P.anim.stop(); P = null; };

  function pageHtml(pages, j) {
    const n = pages.length, p = pages[j];
    const dots = pages.map((q, k) => `<button type="button" class="pgr-dot${k === j ? " on" : ""}" data-go="${k}" aria-label="${esc(q.title)}, page ${k + 1} of ${n}"${k === j ? ' aria-current="true"' : ""}></button>`).join("");
    const side = (k, cls, label) => (pages[k]
      ? `<button type="button" class="pgr-btn ${cls}" data-go="${k}">${cls === "prev" ? '<span class="pgr-arr" aria-hidden="true">\u2039</span>' : ""}<span class="pgr-lbl">${esc(pages[k].title)}</span>${cls === "next" ? '<span class="pgr-arr" aria-hidden="true">\u203a</span>' : ""}</button>`
      : `<span class="pgr-sp"></span>`);
    return `<section class="cat pgr-page" data-key="${esc(p.key)}" tabindex="-1" aria-label="${esc(p.title)}, page ${j + 1} of ${n}">
      <h2><span class="pgr-title">${esc(p.title)}</span><span class="pgr-count" aria-hidden="true">${j + 1} / ${n}</span></h2>
      ${p.html}
      <nav class="pgr-nav" aria-label="Menu pages">
        <div class="pgr-dots">${dots}</div>
        <div class="pgr-btns">${side(j - 1, "prev")}${side(j + 1, "next")}</div>
        <p class="pgr-hint">Swipe to turn the page</p>
      </nav>
    </section>`;
  }

  function show(root, { pages, current, onChange }) {
    clear();
    const i = Math.max(0, pages.findIndex((p) => p.key === current));
    const el = document.createElement("div");
    el.className = "pgr";
    el.innerHTML = pages.map((_, j) => pageHtml(pages, j)).join("");
    root.replaceChildren(el);
    const els = Array.from(el.children);
    els.forEach((n, j) => n.classList.toggle("pgr-off", j !== i));
    const S = (P = { el, els, pages, i, onChange, x: 0, W: 1, limit: 0, anim: null, peeks: [], suppress: false });
    bind(S);
    warmNear(S);
    if (onChange) onChange(pages[i].key); // remember the page even when the old one no longer exists
    return S;
  }

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
    const cur = S.els[S.i];
    S.W = S.el.clientWidth || 1;
    // The search bar is pinned, so the person may be scrolled far down the page. The next page slides in at the
    // same height on screen, and once it has settled we scroll back up to its top (see settle).
    const barH = (bar() ? bar().offsetHeight : 0) + 8;
    const top = S.el.getBoundingClientRect().top + window.scrollY - barH;
    S.limit = Math.max(0, top);
    const Y = Math.max(0, window.scrollY - top);
    S.el.style.minHeight = cur.offsetHeight + "px";
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

  // Everything has stopped moving: make page j the one on screen
  function settle(S, j) {
    if (S !== P) return;
    const changed = j !== S.i;
    const hadFocus = S.els[S.i].contains(document.activeElement);
    for (const n of S.els) { n.style.transform = n.style.top = ""; n.classList.remove("pgr-peek"); }
    S.i = j;
    S.els.forEach((n, k) => n.classList.toggle("pgr-off", k !== j));
    S.el.style.minHeight = "";
    S.el.classList.remove("live");
    S.peeks = []; S.x = 0; S.anim = null;
    if (!changed) return;
    // turning a page starts at the top of the new page (when the person had scrolled past it)
    if (window.scrollY > S.limit) window.scrollTo({ top: S.limit, left: 0, behavior: "instant" });
    if (hadFocus) S.els[j].focus({ preventScroll: true }); // keyboard users keep their place
    if (S.onChange) S.onChange(S.pages[j].key);
    warmNear(S);
  }

  function animateTo(S, target, velocity, j) {
    if (S.anim) S.anim.stop();
    S.anim = Springs.spring({ from: S.x, to: target, velocity, response: 0.42, damping: 1, onUpdate: (x) => setX(S, x), onDone: () => settle(S, j) });
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
      animateTo(S, -Math.sign(j - S.i) * (S.W + GAP), 0, j);
    });
  }

  function bind(S) {
    const el = S.el;
    let g = null; // the finger on the screen
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || !e.isPrimary || animating(S)) return;
      S.suppress = false;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, locked: false, s: [[e.clientX, e.timeStamp]] };
    });
    el.addEventListener("pointermove", (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.locked) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) { g = null; return; } // mostly up/down: the page scrolls as usual
        g.locked = true; S.suppress = true;
        g.x0 = e.clientX; g.s = [[e.clientX, e.timeStamp]]; // start from 0 so the page does not jump by the first few pixels
        prepare(S, [S.i - 1, S.i + 1]);
        try { el.setPointerCapture(e.pointerId); } catch { /* the drag still works without it */ }
        return;
      }
      const d = e.clientX - g.x0;
      const edge = (d > 0 && S.i === 0) || (d < 0 && S.i === S.els.length - 1); // nothing before the first / after the last page
      setX(S, edge ? Math.sign(d) * Springs.rubber(Math.abs(d), S.W) : d);
      g.s.push([e.clientX, e.timeStamp]);
      while (g.s.length > 2 && e.timeStamp - g.s[0][1] > 100) g.s.shift();
    });
    const end = (e, cancelled) => {
      if (!g || e.pointerId !== g.id) return;
      const f = g; g = null;
      if (!f.locked) return;
      setTimeout(() => { S.suppress = false; }, 60);
      const x = S.x, W = S.W, a = f.s[0], b = f.s[f.s.length - 1];
      const v = b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0; // px per ms
      const want = x < 0 ? 1 : -1;
      const far = Math.abs(x) > W * FAR;
      const fwd = Math.abs(v) > FLING && Math.sign(v) === Math.sign(x), back = Math.abs(v) > FLING && Math.sign(v) !== Math.sign(x);
      let j = S.i;
      if (!cancelled && ((far && !back) || fwd)) j = S.i + want;
      if (j < 0 || j >= S.els.length) j = S.i;
      animateTo(S, j === S.i ? 0 : -want * (W + GAP), v * 1000, j);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
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

  window.Pager = { show, clear, go: (j) => P && go(P, j), index: () => (P ? P.i : -1) };
})();
