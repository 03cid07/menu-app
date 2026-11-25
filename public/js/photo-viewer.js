// Photo viewer for the dish card.
//   tap a photo ........ it expands (grows out of the photo you tapped)
//   double-tap / double-click ... zoom in on that spot, again to zoom out
//   pinch (or scroll wheel) ..... zoom; one finger / mouse drag pans a zoomed photo
//   swipe sideways ...... next / previous photo (arrow keys and the buttons work too)
//   swipe down (or up), tap outside the photo, Esc, or the X ... close (the photo shrinks back into the card)
// Same rules as the dish card: the photo is never stretched, and the motion is Web Animations / transforms only.
(() => {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE_OUT = "cubic-bezier(.22, 1, .36, 1)";
  const EASE_IN_OUT = "cubic-bezier(.32, .72, 0, 1)";
  const MAX = 5, DOUBLE = 2.5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // past the edge a drag still moves, but at a third of the speed (a soft stop, it springs back on release)
  const soft = (v, m) => (Math.abs(v) <= m ? v : Math.sign(v) * (m + (Math.abs(v) - m) * 0.35));

  let root, bg, stage, img, ui, prevB, nextB, countEl, closeB;
  let photos = [], alts = [], thumbs = [], track = null;
  let idx = 0, isOpen = false, closing = false, busy = false;
  let nW = 1, nH = 1, fitW = 0, fitH = 0;      // the photo's own size, and its size when it fits the screen
  const S = { s: 1, x: 0, y: 0 };               // zoom and pan (pan is from the centre of the screen)
  const ptrs = new Map();
  let g = null, tap = null, lastTap = null, animT = 0, wan = [];

  const vw = () => root.clientWidth || innerWidth;
  const vh = () => root.clientHeight || innerHeight;
  const maxX = (s) => Math.max(0, (fitW * s - vw()) / 2);
  const maxY = (s) => Math.max(0, (fitH * s - vh()) / 2);

  function build() {
    if (root) return;
    root = document.createElement("div");
    root.className = "pv";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Photo viewer");
    root.innerHTML = '<div class="pv-bg"></div>' +
      '<div class="pv-stage"><img class="pv-img" alt="" draggable="false"></div>' +
      '<div class="pv-ui">' +
      '<button type="button" class="pv-btn pv-close" aria-label="Close photo">\u00d7</button>' +
      '<button type="button" class="pv-btn pv-nav prev" aria-label="Previous photo">\u2039</button>' +
      '<button type="button" class="pv-btn pv-nav next" aria-label="Next photo">\u203a</button>' +
      '<span class="pv-count" aria-live="polite"></span></div>';
    document.body.appendChild(root);
    bg = root.querySelector(".pv-bg");
    stage = root.querySelector(".pv-stage");
    img = root.querySelector(".pv-img");
    ui = root.querySelector(".pv-ui");
    closeB = root.querySelector(".pv-close");
    prevB = root.querySelector(".pv-nav.prev");
    nextB = root.querySelector(".pv-nav.next");
    countEl = root.querySelector(".pv-count");

    closeB.addEventListener("click", close);
    prevB.addEventListener("click", () => step(-1));
    nextB.addEventListener("click", () => step(1));
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", wheel, { passive: false });
    stage.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("resize", () => { if (isOpen) { fit(); S.x = clamp(S.x, -maxX(S.s), maxX(S.s)); S.y = clamp(S.y, -maxY(S.s), maxY(S.s)); apply(); } });
  }

  // ---- drawing ----
  function apply(anim) {
    img.classList.toggle("anim", !!anim);
    img.style.transform = `translate3d(${S.x}px, ${S.y}px, 0) scale(${S.s})`;
    root.classList.toggle("zoomed", S.s > 1.02);
    clearTimeout(animT);
    if (anim) animT = setTimeout(() => img.classList.remove("anim"), 320);
  }
  function fit() {
    const k = Math.min(vw() / nW, vh() / nH);
    fitW = nW * k; fitH = nH * k;
    img.style.width = fitW + "px";
    img.style.height = fitH + "px";
  }
  function label() {
    countEl.textContent = photos.length > 1 ? `${idx + 1} / ${photos.length}` : "";
    prevB.hidden = nextB.hidden = photos.length < 2;
    prevB.disabled = idx === 0;
    nextB.disabled = idx === photos.length - 1;
  }
  async function show(i) {
    idx = i;
    img.alt = alts[i] || "";
    img.src = photos[i];
    try { await img.decode(); } catch (_) { /* a broken photo still shows its alt text */ }
    nW = img.naturalWidth || 1; nH = img.naturalHeight || 1;
    fit();
    label();
    for (const j of [i - 1, i + 1]) if (photos[j]) { const p = new Image(); p.src = photos[j]; } // so the next one is ready
  }
  const stopAnim = () => { wan.forEach((a) => a.cancel()); wan = []; };

  // The photo as it looks over a thumbnail: the same size as in the thumbnail, cropped to the thumbnail's shape (never stretched)
  function overThumb(rect) {
    const kc = Math.max(rect.width / nW, rect.height / nH);   // how big the photo is drawn in the thumbnail
    const k = kc / (fitW / nW);                                 // relative to its fitted size
    const dx = rect.left + rect.width / 2 - vw() / 2, dy = rect.top + rect.height / 2 - vh() / 2;
    const ix = Math.max(0, (fitW - rect.width / k) / 2), iy = Math.max(0, (fitH - rect.height / k) / 2);
    return { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${k})`, clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px)` };
  }
  const visible = (r) => r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;

  // ---- open / close ----
  async function open(thumb) {
    if (isOpen) return;
    build();
    const gal = thumb.closest(".gallery");
    thumbs = gal ? [...gal.querySelectorAll(".gal-slide")] : [thumb];
    photos = thumbs.map((t) => t.currentSrc || t.src);
    alts = thumbs.map((t) => t.alt);
    track = gal ? gal.querySelector(".gal-track") : null;
    const rect = thumb.getBoundingClientRect();
    isOpen = true; closing = false; busy = false;
    S.s = 1; S.x = 0; S.y = 0;
    ptrs.clear(); g = null; tap = null; lastTap = null;
    root.hidden = false;
    root.classList.remove("zoomed");
    bg.style.opacity = "";
    img.style.visibility = "hidden";
    img.style.transform = "";
    await show(Math.max(0, thumbs.indexOf(thumb)));
    if (!isOpen) return;
    img.style.visibility = "";
    stopAnim();
    if (!reduced()) {
      const d = 360;
      if (visible(rect)) {
        const from = overThumb(rect);
        wan.push(img.animate([from, { transform: "translate3d(0, 0, 0) scale(1)", clipPath: "inset(0px 0px 0px 0px)" }], { duration: d, easing: EASE_OUT }));
      } else {
        wan.push(img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" }));
      }
      wan.push(bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: EASE_OUT }));
      wan.push(ui.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 140, easing: "ease-out", fill: "backwards" }));
    }
    closeB.focus({ preventScroll: true });
  }

  function finishClose() {
    root.hidden = true;
    stopAnim();
    isOpen = false; closing = false;
    ptrs.clear(); g = null; tap = null;
    img.removeAttribute("src");
    img.style.transform = ""; img.style.width = img.style.height = "";
    bg.style.opacity = "";
    root.style.opacity = "";
  }
  function close() {
    if (!isOpen || closing) return;
    closing = true; busy = true;
    stopAnim();
    // bring the card's own gallery to the photo that is showing, so the photo can shrink back into it
    if (track && photos.length > 1) track.scrollTo({ left: idx * track.clientWidth, behavior: "auto" });
    const rect = thumbs[idx] && thumbs[idx].getBoundingClientRect();
    if (reduced()) { setTimeout(finishClose, 60); return; } // not at once: the tap that closes it must not land on the card under it
    const d = 320;
    if (visible(rect)) {
      const to = overThumb(rect);
      const a = img.animate([{ clipPath: "inset(0px 0px 0px 0px)" }, to], { duration: d, easing: EASE_IN_OUT, fill: "forwards" });
      wan = [a, bg.animate({ opacity: 0 }, { duration: d, easing: EASE_IN_OUT, fill: "forwards" }),
        ui.animate({ opacity: 0 }, { duration: 120, fill: "forwards" })];
      a.onfinish = finishClose;
    } else {
      const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-out", fill: "forwards" });
      wan = [a];
      a.onfinish = finishClose;
    }
  }

  // ---- next / previous photo ----
  function step(dir) { const n = idx + dir; if (n >= 0 && n < photos.length) go(n, dir); }
  async function go(n, dir) {
    if (busy || closing) return;
    busy = true;
    stopAnim();
    if (!reduced()) {
      const out = img.animate({ transform: `translate3d(${S.x - dir * 90}px, ${S.y}px, 0) scale(${S.s})`, opacity: 0 }, { duration: 130, easing: "ease-in", fill: "forwards" });
      wan.push(out); // so it is cancelled with the rest once the next photo is in place
      try { await out.finished; } catch (_) { /* cancelled */ }
    }
    if (!isOpen || closing) { busy = false; return; }
    img.style.visibility = "hidden";
    S.s = 1; S.x = 0; S.y = 0;
    await show(n);
    apply();
    img.style.visibility = "";
    stopAnim();
    if (!reduced()) wan.push(img.animate([{ transform: `translate3d(${dir * 90}px, 0, 0)`, opacity: 0 }, { transform: "translate3d(0, 0, 0)", opacity: 1 }], { duration: 240, easing: EASE_OUT }));
    busy = false;
  }

  // ---- gestures ----
  function begin() {
    const pts = [...ptrs.values()];
    g = { s: S.s, x: S.x, y: S.y, mode: null, t: performance.now() };
    if (pts.length >= 2) {
      const [a, b] = pts;
      g.d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.mx = (a.x + b.x) / 2; g.my = (a.y + b.y) / 2;
      g.mode = "pinch";
    } else if (pts.length === 1) {
      g.px = pts[0].x; g.py = pts[0].y;
      if (S.s > 1.02) g.mode = "pan";
    }
  }
  function down(e) {
    if (closing || busy || (e.pointerType === "mouse" && e.button !== 0)) return;
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    stopAnim();
    img.classList.remove("anim");
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) tap = { x: e.clientX, y: e.clientY, onImg: e.target === img, moved: false };
    else if (tap) tap.moved = true;
    begin();
  }
  function move(e) {
    const p = ptrs.get(e.pointerId);
    if (!p || !g) return;
    p.x = e.clientX; p.y = e.clientY;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.moved = true;
    const cx = vw() / 2, cy = vh() / 2;
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const s = clamp((g.s * d) / g.d, 0.6, MAX * 1.25);
      // the spot of the photo that was between the fingers stays between the fingers
      const qx = (g.mx - cx - g.x) / g.s, qy = (g.my - cy - g.y) / g.s;
      S.s = s; S.x = mx - cx - s * qx; S.y = my - cy - s * qy;
      apply();
      return;
    }
    const dx = p.x - g.px, dy = p.y - g.py;
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 8) return;
      g.mode = Math.abs(dy) > Math.abs(dx) ? "dismiss" : "swipe";
    }
    if (g.mode === "pan") {
      S.x = soft(g.x + dx, maxX(S.s)); S.y = soft(g.y + dy, maxY(S.s));
    } else if (g.mode === "dismiss") {
      S.y = dy; S.s = 1 - Math.min(0.25, Math.abs(dy) / (vh() * 2));
      bg.style.opacity = String(1 - Math.min(1, Math.abs(dy) / (vh() * 0.5)));
    } else if (g.mode === "swipe") {
      const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === photos.length - 1);
      S.x = edge ? dx * 0.3 : dx;
    }
    apply();
  }
  function up(e) {
    if (!ptrs.delete(e.pointerId)) return;
    if (ptrs.size >= 1) { begin(); return; }            // a finger is still down after a pinch: carry on as a pan
    const mode = g && g.mode, took = g ? performance.now() - g.t : 0, tp = tap;
    g = null; tap = null;
    if (e.type === "pointercancel") { settle(mode, took); return; }
    if (tp && !tp.moved) {                              // a tap
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(tp.x - lastTap.x, tp.y - lastTap.y) < 36) { lastTap = null; doubleTap(tp.x, tp.y); return; }
      lastTap = { t: now, x: tp.x, y: tp.y };
      if (!tp.onImg) close();                           // a tap beside the photo
      return;
    }
    settle(mode, took);
  }
  function settle(mode, took) {
    if (mode === "dismiss") {
      const fast = Math.abs(S.y) > 40 && (Math.abs(S.y) / Math.max(1, took)) * 1000 > 600;
      if (Math.abs(S.y) > 110 || fast) return close();
      S.s = 1; S.y = 0; bg.style.opacity = "";
      return apply(true);
    }
    if (mode === "swipe") {
      const n = S.x < -70 ? idx + 1 : S.x > 70 ? idx - 1 : idx;
      if (n !== idx && photos[n]) return go(n, n > idx ? 1 : -1);
      S.x = 0;
      return apply(true);
    }
    if (S.s < 1.02) { S.s = 1; S.x = 0; S.y = 0; return apply(true); }
    S.s = Math.min(S.s, MAX);
    S.x = clamp(S.x, -maxX(S.s), maxX(S.s)); S.y = clamp(S.y, -maxY(S.s), maxY(S.s));
    apply(true);
  }
  // zoom to `s2` keeping the spot under (px, py) where it is
  function zoomAt(px, py, s2, anim) {
    s2 = clamp(s2, 1, MAX);
    const cx = vw() / 2, cy = vh() / 2;
    const qx = (px - cx - S.x) / S.s, qy = (py - cy - S.y) / S.s;
    S.s = s2;
    S.x = clamp(px - cx - s2 * qx, -maxX(s2), maxX(s2));
    S.y = clamp(py - cy - s2 * qy, -maxY(s2), maxY(s2));
    if (s2 <= 1.001) { S.x = 0; S.y = 0; }
    apply(anim);
  }
  function doubleTap(px, py) {
    if (S.s > 1.05) { S.s = 1; S.x = 0; S.y = 0; apply(true); } else zoomAt(px, py, DOUBLE, true);
  }
  function wheel(e) {
    if (closing || busy) return;
    e.preventDefault();
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));  // ctrl + wheel is also how a laptop trackpad pinch arrives
    zoomAt(e.clientX, e.clientY, S.s * f, false);
  }

  // ---- keys ----
  addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomAt(vw() / 2, vh() / 2, S.s * 1.5, true); }
    else if (e.key === "-") { e.preventDefault(); zoomAt(vw() / 2, vh() / 2, S.s / 1.5, true); }
  }, true);

  // ---- hooks into the dish card ----
  document.addEventListener("click", (e) => {
    const im = e.target.closest && e.target.closest(".sheet .gal-slide, .sheet img.sheet-hero");
    if (im && im.naturalWidth) open(im);
  });
  document.addEventListener("keydown", (e) => {   // keyboard: Enter on the photo strip opens the photo that is showing
    if (e.key !== "Enter" || isOpen) return;
    const tr = e.target.closest && e.target.closest(".sheet .gal-track");
    if (!tr) return;
    const n = Math.round(tr.scrollLeft / (tr.clientWidth || 1));
    const im = tr.querySelectorAll(".gal-slide")[n];
    if (im && im.naturalWidth) { e.preventDefault(); open(im); }
  });
})();
