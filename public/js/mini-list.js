// Mini list: a small panel that grows out of a button (the bottom bar's "My list" tab, or the dish card's "View list").
// With dishes in the list, tapping "My list" in the bottom bar shows this panel first; its "Open My list" button goes on to the full page. With an empty list the tab opens the page directly.
// It shows the dishes in the list with - / + and the total, and has an "Open My list" button that goes to the full My list page (list.js).
// Uses helpers from menu.js and list.js: data, esc, money, listEntries, listCount, listTotal, listSet, ICON_LIST, ICON_PLUS, ICON_MINUS.
(() => {
  if (window.__miniList) return; // loaded twice (index.html and list.js both add it): only the first one runs
  window.__miniList = true;
  // Its own stylesheet, added here so only the script needs to be on the page
  if (!document.querySelector('link[href*="mini-list.css"]')) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "css/mini-list.css?v=9"; document.head.appendChild(l); }
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  let isOpen = false, origin = null, anim = null, t = 0, A = null, B = null, anchor = null;
  const navBtn = () => document.querySelector(".bottomnav [data-nav=\"list\"]");

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

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, w: r.width, h: r.height, rad: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 14 };
  };
  // The panel is laid out once at its final size and only moves with transform + opacity (no size change while it animates, so nothing reflows).
  // It grows out of the button it came from: scaling from that button's centre, as a spring.
  const layout = () => {
    panel.style.right = B.right + "px"; panel.style.bottom = B.bottom + "px";
    panel.style.width = B.w + "px"; panel.style.height = B.h + "px"; panel.style.borderRadius = B.rad + "px";
    setOrigin();
  };
  const setOrigin = () => {
    const cx = innerWidth - A.right - A.w / 2, cy = innerHeight - A.bottom - A.h / 2;
    panel.style.transformOrigin = (cx - (innerWidth - B.right - B.w)).toFixed(1) + "px " + (cy - (innerHeight - B.bottom - B.h)).toFixed(1) + "px";
  };
  const paint = (k) => {
    t = k;
    const c = Math.max(0, Math.min(1, k));
    panel.style.opacity = Math.min(1, c * 1.8).toFixed(3);
    panel.style.transform = k === 1 ? "none" : `translateY(${((1 - k) * 10).toFixed(2)}px) scale(${(0.6 + 0.4 * Math.max(0, k)).toFixed(4)})`;
    inner.style.opacity = Math.max(0, Math.min(1, (c - 0.15) / 0.5)).toFixed(3);
    scrim.style.opacity = c.toFixed(3);
  };
  const run = (to, done) => {
    if (anim) anim.stop();
    if (reduce() || !window.Springs) { paint(to); return done && done(); }
    // opening settles with a small bounce; closing is quick and clean
    anim = Springs.spring({ from: t * 100, to: to * 100, response: to ? 0.46 : 0.26, damping: to ? 0.74 : 1, onUpdate: (x) => paint(Math.max(0, x / 100)), onDone: () => { paint(to); done && done(); } });
  };

  // Where the panel ends up. From the bottom bar's tab: centred just above the tab. From the dish card's button: its bottom right corner stays on the button.
  // As wide as fits, as tall as its list needs.
  const target = (from, above) => {
    const W = Math.min(360, innerWidth - 24);
    const prev = [panel.style.width, panel.style.height];
    panel.style.width = W + "px"; panel.style.height = "auto"; inner.style.opacity = "0";
    const nat = inner.offsetHeight;
    panel.style.width = prev[0]; panel.style.height = prev[1];
    let right, bottom;
    if (above) {
      const cx = innerWidth - from.right - from.w / 2;
      const left = Math.max(12, Math.min(cx - W / 2, innerWidth - W - 12));
      right = innerWidth - left - W; bottom = from.bottom + from.h + 10;
    } else {
      right = Math.max(12, from.right); bottom = Math.max(12, from.bottom);
      if (innerWidth - right - W < 12) right = innerWidth - W - 12;
    }
    const H = Math.min(nat, Math.max(160, innerHeight - bottom - 24 - 24), Math.round(innerHeight * 0.7));
    return { right, bottom, w: W, h: H, rad: 22 };
  };

  function open(from) {
    if (isOpen || typeof data === "undefined" || !data) return;
    isOpen = true; origin = from;
    fill();
    scrim.hidden = false; panel.hidden = false;
    A = rectOf(from); anchor = A; B = target(anchor, from === navBtn());
    from.setAttribute("aria-expanded", "true");
    layout(); t = 0; paint(0);
    run(1, () => { if (isOpen) panel.querySelector("h2").focus({ preventScroll: true }); });
  }
  function close(quiet) {
    if (!isOpen) return;
    isOpen = false;
    const back = origin; origin = null;
    if (back && back.setAttribute) back.setAttribute("aria-expanded", "false");
    const finish = () => { if (isOpen) return; panel.hidden = true; scrim.hidden = true; if (anim) anim.stop(); };
    if (quiet) { finish(); t = 0; return; }
    // grow back into the button it came from (found again, as the card redraws its controls); else just fade away where it is
    const btn = back && back === navBtn() ? back : (document.querySelector(".sheet:not([hidden]) .sheet-viewlist") || null);
    if (btn && btn.getBoundingClientRect().width) { A = rectOf(btn); setOrigin(); }
    run(0, () => { finish(); if (back && back.isConnected && !back.closest("[hidden]")) back.focus({ preventScroll: true }); });
  }

  // The bottom bar's "My list" tab: with dishes in the list it shows this panel first (the panel's "Open My list" goes on to the page).
  // With an empty list, or while the page is already open, the tab behaves as before (quick.js).
  document.addEventListener("click", (e) => {
    const n = e.target.closest('[data-nav="list"]');
    if (!n) return;
    if (isOpen) { e.stopPropagation(); e.preventDefault(); return close(); }
    if (window.MyList && MyList.isOpen()) return;
    if (typeof listCount !== "function" || !listCount()) return;
    e.stopPropagation(); e.preventDefault();
    open(n);
  }, true);
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
    if (!isOpen) return;
    const top = rowsEl.scrollTop;
    fill(); rowsEl.scrollTop = top;
    if (t >= 1) { B = target(anchor, origin === navBtn()); layout(); paint(1); } // the panel follows the list as it grows or shrinks
  });
})();
