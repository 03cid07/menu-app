// Mini list: a small panel that grows out of a button (the dish card's "View list", or the floating list button at the bottom right).
// It shows the dishes in the list with - / + and the total, and has an "Open My list" button that goes to the full My list page (list.js).
// Uses helpers from menu.js and list.js: data, esc, money, listEntries, listCount, listTotal, listSet, ICON_LIST, ICON_PLUS, ICON_MINUS.
(() => {
  if (window.__miniList) return; // loaded twice (index.html and list.js both add it): only the first one runs
  window.__miniList = true;
  // Its own stylesheet, added here so only the script needs to be on the page
  if (!document.querySelector('link[href*="mini-list.css"]')) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/mini-list.css?v=7"; document.head.appendChild(l); }
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Floating button (bottom right) ----
  const fab = document.createElement("button");
  fab.type = "button"; fab.className = "ml-fab"; fab.setAttribute("aria-haspopup", "dialog"); fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = `${ICON_LIST}<span class="ml-fab-badge" hidden></span>`;
  document.body.appendChild(fab);

  // ---- Panel ----
  const scrim = document.createElement("div");
  scrim.className = "ml-scrim"; scrim.hidden = true;
  const panel = document.createElement("section");
  panel.className = "ml-mini"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "My list");
  panel.innerHTML = `<div class="ml-mini-in">
    <div class="ml-mini-head"><h2 tabindex="-1">My list</h2><span class="ml-mini-count"></span></div>
    <ul class="ml-mini-rows"></ul>
    <div class="ml-mini-foot"><div class="ml-mini-total"><span>Total</span><strong></strong></div><button type="button" class="btn ml-mini-open" data-open-list>${ICON_LIST}<span>Open My list</span></button></div>
  </div>`;
  document.body.append(scrim, panel);
  const inner = panel.firstElementChild, rowsEl = panel.querySelector(".ml-mini-rows");
  const countEl = panel.querySelector(".ml-mini-count"), totalEl = panel.querySelector(".ml-mini-total strong");

  let isOpen = false, origin = null, anim = null, t = 0, A = null, B = null;

  const fill = () => {
    const rows = listEntries(), n = listCount();
    countEl.textContent = n ? `${n} item${n === 1 ? "" : "s"}` : "";
    totalEl.textContent = money(listTotal());
    panel.classList.toggle("is-empty", !rows.length);
    rowsEl.innerHTML = rows.length ? rows.map(([it, q]) => {
      const img = (it.images && it.images[0]) || it.image;
      const th = img ? `<img class="mm-thumb" src="${esc(img)}" alt="" loading="lazy">` : `<span class="mm-thumb ph" aria-hidden="true">${esc(it.name.trim().charAt(0).toUpperCase())}</span>`;
      return `<li class="mm-row" data-id="${esc(it.id)}">${th}
        <div class="mm-name"><span>${esc(it.name)}</span><small>${money(Number(it.price) * q)}</small></div>
        <span class="mm-qty" aria-label="Quantity ${q}">\u00d7${q}</span>
        </li>`;
    }).join("") : `<li class="mm-empty">Your list is empty. Tap + on a dish to add it.</li>`;
  };

  const syncFab = () => {
    const n = listCount(), b = fab.querySelector(".ml-fab-badge");
    b.textContent = n; b.hidden = !n;
    fab.setAttribute("aria-label", n ? `My list (${n} item${n === 1 ? "" : "s"})` : "My list");
  };

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, w: r.width, h: r.height, rad: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14 };
  };
  const mix = (a, b, k) => a + (b - a) * k;
  const paint = (k) => {
    t = k;
    panel.style.right = mix(A.right, B.right, k) + "px";
    panel.style.bottom = mix(A.bottom, B.bottom, k) + "px";
    panel.style.width = mix(A.w, B.w, k) + "px";
    panel.style.height = mix(A.h, B.h, k) + "px";
    panel.style.borderRadius = mix(A.rad, B.rad, k) + "px";
    inner.style.opacity = Math.max(0, Math.min(1, (k - 0.3) / 0.6)).toFixed(3);
    scrim.style.opacity = Math.min(1, k).toFixed(3);
  };
  const run = (to, done) => {
    if (anim) anim.stop();
    if (reduce() || !window.Springs) { paint(to); return done && done(); }
    anim = Springs.spring({ from: t * 100, to: to * 100, response: to ? 0.42 : 0.32, damping: 1, onUpdate: (x) => paint(Math.max(0, Math.min(1, x / 100))), onDone: () => { paint(to); done && done(); } });
  };

  // Where the panel ends up: its bottom right corner stays on the button it grew from, as wide as fits, as tall as its list needs
  const target = (from) => {
    const W = Math.min(360, innerWidth - 24);
    const prev = [panel.style.width, panel.style.height];
    panel.style.width = W + "px"; panel.style.height = "auto"; inner.style.opacity = "0";
    const nat = inner.offsetHeight;
    panel.style.width = prev[0]; panel.style.height = prev[1];
    let right = Math.max(12, from.right), bottom = Math.max(12, from.bottom);
    if (innerWidth - right - W < 12) right = innerWidth - W - 12;
    const H = Math.min(nat, Math.max(160, innerHeight - bottom - 24 - 24), Math.round(innerHeight * 0.7));
    return { right, bottom, w: W, h: H, rad: 22 };
  };

  function open(from) {
    if (isOpen || typeof data === "undefined" || !data) return;
    isOpen = true; origin = from;
    fill();
    scrim.hidden = false; panel.hidden = false;
    A = rectOf(from); B = target(A);
    fab.setAttribute("aria-expanded", "true");
    if (from === fab) fab.classList.add("is-away");
    t = 0; paint(0);
    run(1, () => { if (isOpen) panel.querySelector("h2").focus({ preventScroll: true }); });
  }
  function close(quiet) {
    if (!isOpen) return;
    isOpen = false;
    fab.setAttribute("aria-expanded", "false");
    const back = origin; origin = null;
    const finish = () => { if (isOpen) return; panel.hidden = true; scrim.hidden = true; fab.classList.remove("is-away"); if (anim) anim.stop(); };
    if (quiet) { finish(); t = 0; return; }
    // grow back into the button it came from (found again, as the card redraws its controls); else into the floating button
    const btn = back === fab ? fab : (document.querySelector(".sheet:not([hidden]) .sheet-viewlist") || null);
    if (btn && btn.getBoundingClientRect().width) { A = rectOf(btn); }
    else { fab.classList.remove("is-away"); A = rectOf(fab); }
    run(0, () => { finish(); if (back && back.isConnected && !back.closest("[hidden]")) back.focus({ preventScroll: true }); });
  }

  // The floating button is tucked into the bottom edge of the menu's rounded box (.pgr-box): centred on the box, fully inside it and in front of the dishes
  // (a normal, sharp button, not under the frosted glass). It follows the box as the page lays out,
  // and falls back to the CSS position (bottom right of the column, above everything) on screens that have no such box.
  let last = "";
  const place = () => {
    requestAnimationFrame(place);
    if (isOpen) return;
    const box = document.querySelector("#menu .pgr-box:not(.pgr-off)") || document.querySelector("#menu .pgr-box");
    const r = box && box.getBoundingClientRect();
    let key = "";
    if (r && r.width > 120 && r.height > 120 && r.bottom > 80 && r.top < innerHeight) {
      const edge = Math.min(r.bottom, innerHeight - 96), size = fab.offsetWidth || 52;
      const left = (r.left + r.right) / 2 - size / 2, bottom = innerHeight - edge + 10;
      key = Math.round(left) + "," + Math.round(bottom);
      if (key !== last) { fab.classList.add("in-box"); fab.style.left = left + "px"; fab.style.right = "auto"; fab.style.bottom = bottom + "px"; }
    } else if (last !== "") { fab.classList.remove("in-box"); fab.style.left = ""; fab.style.right = ""; fab.style.bottom = ""; }
    last = key;
  };
  place();
  fab.addEventListener("click", () => (isOpen ? close() : open(fab)));
  scrim.addEventListener("click", () => close());
  // The dish card's "View list" opens the panel instead of the page (the panel's own "Open My list" goes to the page)
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".sheet-viewlist");
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    open(b);
  }, true);
  // The only button in the panel is "Open My list" (list.js, on the document, opens the page right after this closes the panel)
  panel.addEventListener("click", (e) => { if (e.target.closest("[data-open-list]")) close(true); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) { e.stopPropagation(); close(); } }, true);
  document.addEventListener("list:open", () => close(true));

  // Refresh when the list changes (list.js tells us), keeping the scroll place and the panel's size right
  document.addEventListener("list:sync", () => {
    syncFab();
    if (!isOpen) return;
    const top = rowsEl.scrollTop;
    fill(); rowsEl.scrollTop = top;
    if (t >= 1) { B = target(B); paint(1); } // the panel follows the list as it grows or shrinks
  });
  syncFab();
})();
