let data, active = "All";
const $ = (s) => document.querySelector(s);
const money = (n) => `${data.currency}${Number(n).toLocaleString()}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Filter & sort state ----
// Categories now live inside the Filter panel, so remove the old button row if the page still has it
document.querySelector("nav.cats")?.remove();
// Make sure the filter bar has a place on the page, even if index.html is an older copy
if (!$("#fs")) { const el = document.createElement("div"); el.id = "fs"; $("#menu").before(el); }
const view = { avail: false, ar: false, photo: false, sort: "featured", open: "", q: "" };
const SORTS = { featured: "Featured", low: "Price, low to high", high: "Price, high to low", az: "Name, A to Z" };
const FILTERS = [["Availability", [["avail", "Available now"]]], ["Extras", [["ar", "3D / AR"], ["photo", "With photo"]]]];
const filterCount = () => ["avail", "ar", "photo"].filter((k) => view[k]).length + (active !== "All" ? 1 : 0);
const SEARCH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 12 8" width="14" height="10" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';


// ---- Ratings + product detail card (opens when a dish is tapped) ----
// true when there is no Node server (e.g. GitHub Pages): menu comes from menu.json and rating is read-only
let staticMode = false;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: ratings still work this visit */ } },
};
let devId = store.get("menuDevice");
if (!devId) { devId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12); store.set("menuDevice", devId); }
const myRatings = () => { try { return JSON.parse(store.get("menuRatings") || "{}"); } catch { return {}; } };
function ratingHtml(i, long) {
  const r = i.rating || { avg: 0, count: 0 };
  if (!r.count) return long ? '<div class="rating"><span class="stars" aria-hidden="true"></span><span class="rcount">No ratings yet</span></div>' : "";
  return `<div class="rating"><span class="stars" style="--pct:${(r.avg / 5) * 100}%" role="img" aria-label="${r.avg} out of 5 stars"></span><span class="rnum">${r.avg.toFixed(1)}</span><span class="rcount">(${r.count}${long ? ` rating${r.count === 1 ? "" : "s"}` : ""})</span></div>`;
}
function rateHtml(i) {
  if (staticMode) return "";
  const mine = myRatings()[i.id] || 0;
  return `<h3 class="sheet-sub">${mine ? "Your rating" : "Rate this dish"}</h3>
    <div class="rate-stars" role="group" aria-label="Rate this dish">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="rate-star${n <= mine ? " on" : ""}" data-n="${n}" aria-label="${n} star${n === 1 ? "" : "s"}" aria-pressed="${n === mine}">\u2605</button>`).join("")}</div>
    <p class="rate-msg" role="status">${mine ? "Tap a star to change it." : "Tap a star to rate."}</p>`;
}
const galleryOf = (i) => (i.images && i.images.length ? i.images : i.image ? [i.image] : []);
function heroHtml(i) {
  const g = galleryOf(i);
  if (!g.length) return `<div class="sheet-hero sheet-ph" aria-hidden="true">${esc(i.name.trim().charAt(0).toUpperCase())}</div>`;
  if (g.length === 1) return `<img class="sheet-hero" src="${esc(g[0])}" alt="${esc(i.name)}">`;
  return `<div class="gallery" role="group" aria-roledescription="carousel" aria-label="Photos of ${esc(i.name)}">
      <div class="gal-track" tabindex="0">${g.map((src, n) => `<img class="gal-slide" src="${esc(src)}" alt="${esc(i.name)}, photo ${n + 1} of ${g.length}"${n ? ' loading="lazy"' : ""}>`).join("")}</div>
      <button type="button" class="gal-nav prev" aria-label="Previous photo" disabled>\u2039</button>
      <button type="button" class="gal-nav next" aria-label="Next photo">\u203a</button>
      <span class="gal-count" aria-live="polite">1 / ${g.length}</span>
      <div class="gal-dots">${g.map((_, n) => `<button type="button" class="gal-dot" data-g="${n}" aria-label="Show photo ${n + 1}"${n ? "" : ' aria-current="true"'}></button>`).join("")}</div>
    </div>`;
}
// Keep the arrows, dots and counter in step with the photo being shown
function galSync(track) {
  const g = track.parentElement, count = track.children.length;
  const n = Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
  g.querySelectorAll(".gal-dot").forEach((d, k) => (k === n ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
  g.querySelector(".gal-count").textContent = `${n + 1} / ${count}`;
  g.querySelector(".prev").disabled = n === 0;
  g.querySelector(".next").disabled = n === count - 1;
  return n;
}
function galGo(track, n) {
  const to = Math.max(0, Math.min(track.children.length - 1, n));
  track.scrollTo({ left: to * track.clientWidth, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
function sheetHtml(i) {
  return `<button type="button" class="sheet-close" aria-label="Close">\u00d7</button>
    ${heroHtml(i)}
    <div class="sheet-body">
      <div class="sheet-head"><h2 id="sheet-title">${esc(i.name)}</h2><span class="price big">${money(i.price)}</span></div>
      <div class="sheet-meta"><small class="itemcat">${esc(i.category)}</small><span class="tag ${i.available ? "ok" : "no"}">${i.available ? "Available" : "Sold out"}</span>${labelHtml(i)}</div>
      <div class="sheet-rating">${ratingHtml(i, true)}</div>
      ${i.description ? `<h3 class="sheet-sub">Description</h3><p class="sheet-text">${esc(i.description)}</p>` : ""}
      ${i.ingredients ? `<h3 class="sheet-sub">Ingredients</h3><p class="sheet-text">${esc(i.ingredients)}</p>` : ""}
      <div class="sheet-actions">
        ${addSheetHtml(i)}
        ${i.model ? `<button type="button" class="ar-open sheet-ar" data-id="${esc(i.id)}" data-model="${esc(i.model)}" data-name="${esc(i.name)}">View in 3D / AR</button>` : ""}
      </div>
      <div class="sheet-rate">${rateHtml(i)}</div>
    </div>`;
}

const LABELS = { popular: "Popular", new: "New", hot: "Hot" };
const labelHtml = (i) => (LABELS[i.label] ? `<span class="hl hl-${i.label}">${LABELS[i.label]}</span>` : "");

// List row: photo, name and price. Everything else lives in the detail card (openSheet).
const itemHtml = (i) => `
      <article class="item ${i.available ? "" : "sold-out"}" data-id="${esc(i.id)}">
        ${i.image ? `<img class="thumb" src="${esc(i.image)}" alt="" loading="lazy">` : `<div class="thumb ph" aria-hidden="true">${esc(i.name.trim().charAt(0).toUpperCase())}</div>`}
        <div class="info">
          <h3><button type="button" class="item-open" aria-haspopup="dialog">${esc(i.name)}</button>${labelHtml(i)}${i.available ? "" : '<span class="badge">Sold out</span>'}</h3>
        </div>
        <span class="row-price">${money(i.price)}</span>
        ${addBtnHtml(i)}
        <span class="chevron" aria-hidden="true">\u203a</span>
      </article>`;

function visibleItems() {
  const q = view.q.trim().toLowerCase();
  const list = data.items.filter((i) => (active === "All" || i.category === active)
    && (!q || [i.name, i.description, i.ingredients, i.category].some((t) => String(t || "").toLowerCase().includes(q)))
    && (!view.avail || i.available) && (!view.ar || i.model) && (!view.photo || i.image));
  if (view.sort === "low") list.sort((x, y) => x.price - y.price);
  if (view.sort === "high") list.sort((x, y) => y.price - x.price);
  if (view.sort === "az") list.sort((x, y) => x.name.localeCompare(y.name));
  return list;
}

function renderBar() {
  const n = filterCount(), f = view.open === "filter", s = view.open === "sort";
  const focused = document.activeElement && document.activeElement.closest("#fs") ? document.activeElement : null;
  const key = focused && (focused.dataset.open ? `[data-open="${focused.dataset.open}"]` : focused.dataset.f ? `[data-f="${focused.dataset.f}"]` : focused.dataset.c ? `[data-c="${focused.dataset.c.replace(/"/g, "\\\"")}"]` : focused.name === "sort" ? `input[value="${focused.value}"]` : "");
  $("#fs").innerHTML = `<div class="fs-bar">
      <button type="button" class="fs-icon${view.q ? " has-q" : ""}" data-open="search" aria-expanded="${view.open === "search"}" aria-controls="fs-search" aria-label="Search">${SEARCH}</button>
      <button type="button" class="fs-tab" data-open="filter" aria-expanded="${f}" aria-controls="fs-filter">Filter${n ? ` (${n})` : ""}${CHEV}</button>
      <button type="button" class="fs-tab" data-open="sort" aria-expanded="${s}" aria-controls="fs-sort">Sort by${CHEV}</button>
    </div>
    <div class="fs-panel" id="fs-search" ${view.open === "search" ? "" : "hidden"}>
      <input type="search" id="fs-q" class="fs-q" placeholder="Search dishes…" aria-label="Search dishes" autocomplete="off" value="${esc(view.q)}">
    </div>
    <div class="fs-panel" id="fs-filter" ${f ? "" : "hidden"}>
      <div class="fs-row"><span class="fs-label">Category</span>${["All", ...data.categories].map((c) => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${c === active}">${esc(c)}</button>`).join("")}</div>
      ${FILTERS.map(([label, chips]) => `<div class="fs-row"><span class="fs-label">${label}</span>${chips.map(([k, t]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${view[k]}">${t}</button>`).join("")}</div>`).join("")}
      ${n ? '<button type="button" class="linkbtn" data-clear>Clear all</button>' : ""}
    </div>
    <div class="fs-panel" id="fs-sort" ${s ? "" : "hidden"} role="radiogroup" aria-label="Sort by">
      ${Object.entries(SORTS).map(([k, t]) => `<label class="radio"><input type="radio" name="sort" value="${k}" ${view.sort === k ? "checked" : ""}><span>${t}</span></label>`).join("")}
    </div>`;
  if (key) { const el = $("#fs").querySelector(key); if (el) el.focus(); }
}

function render() {
  $("#name").textContent = data.restaurant;
  document.title = `${data.restaurant} menu`;
  renderBar();
  renderList();
}

function renderList() {
  const items = visibleItems();
  let html;
  if (!data.items.length) html = '<p class="empty">No items yet. Add some on the admin page.</p>';
  else if (!items.length) html = '<p class="empty">No dishes match these filters. <button type="button" class="linkbtn" data-clear>Clear filters</button></p>';
  else if (view.sort === "featured") {
    html = data.categories.map((c) => {
      const inCat = items.filter((i) => i.category === c);
      return inCat.length ? `<section class="cat"><h2>${esc(c)}</h2>${inCat.map((i) => itemHtml(i)).join("")}</section>` : "";
    }).join("");
  } else html = `<section class="cat"><h2>${SORTS[view.sort]}</h2>${items.map((i) => itemHtml(i)).join("")}</section>`;
  $("#menu").innerHTML = html;
}

$("#fs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-open],[data-f],[data-c]");
  if (!t) return;
  if (t.dataset.c !== undefined) active = t.dataset.c;
  else if (t.dataset.open) view.open = view.open === t.dataset.open ? "" : t.dataset.open;
  else view[t.dataset.f] = !view[t.dataset.f];
  render();
  if (t.dataset.open === "search" && view.open === "search") $("#fs-q").focus();
});
// Typing only refreshes the dish list, so the search box keeps focus
$("#fs").addEventListener("input", (e) => {
  if (e.target.id !== "fs-q") return;
  view.q = e.target.value;
  $("#fs .fs-icon").classList.toggle("has-q", !!view.q.trim());
  renderList();
});
$("#fs").addEventListener("change", (e) => { if (e.target.name === "sort") { view.sort = e.target.value; render(); } });
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-clear]")) return;
  view.avail = view.ar = view.photo = false; view.q = ""; active = "All"; render();
});


// ---- Product detail card ----
const sheet = document.createElement("div");
sheet.className = "sheet";
sheet.hidden = true;
sheet.innerHTML = '<div class="sheet-box" role="dialog" aria-modal="true" aria-labelledby="sheet-title"></div>';
document.body.appendChild(sheet);
const sheetBox = sheet.querySelector(".sheet-box");
let sheetItem = null, sheetOpener = null;
function openSheet(id, opener) {
  sheetItem = data.items.find((x) => x.id === id);
  if (!sheetItem) return;
  sheetOpener = opener || null;
  sheetBox.innerHTML = sheetHtml(sheetItem);
  sheetBox.scrollTop = 0;
  sheet.hidden = false;
  document.body.classList.add("no-scroll");
  sheetBox.querySelector(".sheet-close").focus();
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.hidden = true;
  document.body.classList.remove("no-scroll");
  const back = sheetItem && document.querySelector(`.item[data-id="${CSS.escape(sheetItem.id)}"] .item-open`);
  (back || sheetOpener)?.focus?.();
  sheetItem = null;
}
document.addEventListener("click", (e) => {
  const card = e.target.closest("#menu .item[data-id]");
  if (!card) return;
  const inner = e.target.closest("button, a");
  if (inner && !inner.classList.contains("item-open")) return; // e.g. the 3D / AR button keeps its own job
  openSheet(card.dataset.id, card.querySelector(".item-open"));
});
sheet.addEventListener("click", (e) => {
  if (e.target === sheet || e.target.closest(".sheet-close")) return closeSheet();
  const gb = e.target.closest(".gal-nav, .gal-dot");
  if (gb) {
    const track = gb.closest(".gallery").querySelector(".gal-track");
    return galGo(track, gb.dataset.g !== undefined ? Number(gb.dataset.g) : galSync(track) + (gb.classList.contains("next") ? 1 : -1));
  }
  const star = e.target.closest(".rate-star");
  if (!star || !sheetItem) return;
  const item = sheetItem, n = Number(star.dataset.n), msg = sheetBox.querySelector(".rate-msg");
  msg.textContent = "Saving\u2026";
  fetch(`/api/items/${encodeURIComponent(item.id)}/rate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stars: n, device: devId }) })
    .then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || "Could not save your rating"); return j; }))
    .then((sum) => {
      item.rating = sum;
      const mine = myRatings(); mine[item.id] = n; store.set("menuRatings", JSON.stringify(mine));
      if (sheetItem !== item) return;
      sheetBox.querySelector(".sheet-rating").innerHTML = ratingHtml(item, true);
      sheetBox.querySelector(".sheet-rate").innerHTML = rateHtml(item);
      sheetBox.querySelector(".rate-msg").textContent = `Thanks! You rated ${n} star${n === 1 ? "" : "s"}.`;
      sheetBox.querySelector(`.rate-star[data-n="${n}"]`).focus();
      renderList();
    })
    .catch((err) => { msg.textContent = err.message || "Could not save your rating"; });
});
// Scroll events don't bubble, so listen while they travel down to the gallery
let galRaf = 0;
sheetBox.addEventListener("scroll", (e) => {
  const t = e.target;
  if (!t.classList || !t.classList.contains("gal-track") || galRaf) return;
  galRaf = requestAnimationFrame(() => { galRaf = 0; galSync(t); });
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!viewer.hidden) closeViewer(); else closeSheet();
});

fetch("api/menu")
  .then((r) => { if (!r.ok) throw new Error("no api"); return r.json(); })
  .catch(() => { staticMode = true; return fetch("menu.json").then((r) => r.json()); })
  .then((d) => { data = d; render(); })
  .catch(() => ($("#menu").innerHTML = '<p class="empty">Could not load the menu. Please refresh the page.</p>'));

// ---- Category animations: food gets munched, hot drinks steam, cold drinks frost over ----
const DRINK_RE = /drink|beverage|juice|coffee|tea\b|shake|smoothie|soda|cocktail|beer|wine/i;
const COLD_RE = /iced|ice\b|cold|juice|shake|smoothie|soda|lemonade|frappe|cooler|beer/i;
function fxKind(it) {
  if (!DRINK_RE.test(it.category || "")) return "food";
  return it.temp === "cold" || (!it.temp && COLD_RE.test(it.name)) ? "cold" : "hot";
}
// Effects start on, unless the phone asks for reduced motion
let fxOn = !matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- 3D / AR viewer (opens when a customer taps "View in 3D / AR") ----
const viewer = document.createElement("div");
viewer.className = "viewer";
viewer.hidden = true;
viewer.innerHTML = `<div class="viewer-box" role="dialog" aria-modal="true" aria-label="3D view">
  <div class="viewer-top"><strong id="viewer-title"></strong><button type="button" class="btn ghost" id="viewer-close">Close</button></div>
  <div id="viewer-stage"></div>
  <p class="viewer-hint">Drag to rotate. Tap "View on your table" to see it at real size through your camera. If that button is missing, this phone or browser does not support AR.</p>
</div>`;
document.body.appendChild(viewer);

let viewerCleanup = () => {};
const closeViewer = () => { viewerCleanup(); viewerCleanup = () => {}; viewer.hidden = true; $("#viewer-stage").innerHTML = ""; };

document.addEventListener("click", (e) => {
  const b = e.target.closest(".ar-open");
  if (!b) return;
  $("#viewer-title").textContent = b.dataset.name;
  const src = b.dataset.model;
  const it = data.items.find((x) => x.id === b.dataset.id) || { name: b.dataset.name, price: 0, category: "" };
  const kind = fxKind(it);
  // Floating label: the name drops in letter by letter, the price pops, the description fades in
  const label = `<div slot="hotspot-label" class="mv-label" data-position="0 1 0"><div class="mv-card">
      <div class="mv-name">${[...it.name].map((ch, k) => `<span style="--d:${k * 45}ms">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("")}</div>
      <div class="mv-price">${money(it.price)}</div>
      ${it.description ? `<div class="mv-desc">${esc(it.description)}</div>` : ""}
    </div><button type="button" class="mv-toggle" aria-expanded="true" aria-label="Hide details">${CHEV}</button></div>`;
  $("#viewer-stage").innerHTML = `<div class="stage-wrap" data-fx="${kind}"><div class="mv-loader" role="status" aria-live="polite"><div class="mv-spin" aria-hidden="true"></div><div class="mv-ltext">Loading 3D model\u2026 <span class="mv-pct">0%</span></div><div class="mv-lbar" aria-hidden="true"><i></i></div></div><model-viewer ${fxOn ? `src="${esc(src)}"` : ""} alt="3D model of ${esc(b.dataset.name)}"
    ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" ar-placement="floor"
    autoplay camera-controls touch-action="pan-y" shadow-intensity="1" camera-orbit="auto auto 150%">
    <div slot="progress-bar" class="mv-topbar" aria-hidden="true"><i></i></div>
    ${label}
    <button slot="ar-button" type="button" class="btn ar-btn">View on your table (AR)</button>
  </model-viewer>
  <button type="button" class="fx-toggle" aria-pressed="${fxOn}" hidden>Effects: ${fxOn ? "on" : "off"}</button></div>`;
  // Once the model has loaded, float the label just above its top
  const mv = $("#viewer-stage model-viewer");
  // Visible loading indicator: spinner + percentage, removed once the model is ready (or shows an error)
  const topbar = mv.querySelector(".mv-topbar i"), loader = $("#viewer-stage .mv-loader"), pct = loader.querySelector(".mv-pct"), lbar = loader.querySelector(".mv-lbar i");
  mv.addEventListener("progress", (e) => {
    const p = Math.round((e.detail.totalProgress || 0) * 100);
    pct.textContent = `${p}%`; lbar.style.width = `${p}%`; topbar.style.width = `${p}%`;
  });
  mv.addEventListener("load", () => { loader.remove(); mv.querySelector(".mv-topbar")?.remove(); });
  mv.addEventListener("error", () => {
    loader.classList.add("failed");
    loader.innerHTML = '<div class="mv-ltext">Could not load the 3D model. Please close and try again.</div>';
  });

  // ---- Effects button: the effects are baked into the .glb, so "off" shows a copy of the model with them taken out ----
  const wrap = $("#viewer-stage .stage-wrap"), fxBtn = wrap.querySelector(".fx-toggle");
  let plainP = null, swap = 0;
  const plain = () => plainP || (plainP = (async () => {         // blob URL of the model without its effects (null if it has none)
    const T = window.GlbTools;
    if (!T) return null;
    const r = T.stripEffects(T.parseGlb(await (await fetch(src)).arrayBuffer()));
    return r.had ? URL.createObjectURL(new Blob([T.buildGlb(r.gltf, r.bin)], { type: "model/gltf-binary" })) : null;
  })().catch(() => null));
  viewerCleanup = () => { swap++; if (plainP) plainP.then((u) => u && URL.revokeObjectURL(u)); };
  const showFx = async (on) => {
    const my = ++swap;
    fxBtn.disabled = true;
    const url = on ? src : await plain();
    if (my !== swap || !mv.isConnected) return;
    mv.arModes = on ? "webxr scene-viewer quick-look" : "webxr quick-look";   // Android Scene Viewer needs a real URL, so it only works with effects on
    if (!url || mv.getAttribute("src") === url) { fxBtn.disabled = false; if (!mv.getAttribute("src")) mv.src = src; return; }
    const o = mv.getCameraOrbit && mv.loaded ? mv.getCameraOrbit() : null;
    mv.addEventListener("load", () => {
      fxBtn.disabled = false;
      if (o) { mv.cameraOrbit = `${o.theta}rad ${o.phi}rad auto`; if (mv.jumpCameraToGoal) mv.jumpCameraToGoal(); }
    }, { once: true });
    mv.src = url;
  };
  if (fxOn) mv.addEventListener("load", () => plain().then((u) => { if (u && mv.isConnected) fxBtn.hidden = false; }), { once: true });
  else plain().then((u) => { if (u && mv.isConnected) fxBtn.hidden = false; showFx(false); });   // starts with effects off: wait for the plain copy before showing anything
  // In AR (WebXR camera view) the page itself is hidden, so the on/off button is moved inside <model-viewer>, which is what the browser shows over the camera.
  mv.addEventListener("ar-status", (e) => {
    if (e.detail.status === "session-started") { fxBtn.classList.add("in-ar"); mv.appendChild(fxBtn); }
    else if (e.detail.status === "not-presenting") { fxBtn.classList.remove("in-ar"); wrap.appendChild(fxBtn); }
  });
  fxBtn.addEventListener("click", () => {
    fxOn = !fxOn;
    fxBtn.setAttribute("aria-pressed", String(fxOn));
    fxBtn.textContent = `Effects: ${fxOn ? "on" : "off"}`;
    showFx(fxOn);
  });
  let relayout = () => {}, labelSched = null;
  // Arrow button: hides the text (leaving just the arrow), tap again to show it
  const toggle = mv.querySelector(".mv-toggle");
  toggle.addEventListener("click", () => {
    const hide = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!hide));
    toggle.setAttribute("aria-label", hide ? "Show details" : "Hide details");
    mv.querySelector(".mv-label").classList.toggle("collapsed", hide);
    relayout();
  });
  mv.addEventListener("load", () => {
    const d = mv.getDimensions(), c = mv.getBoundingBoxCenter();
    mv.updateHotspot({ name: "hotspot-label", position: `${c.x} ${c.y + d.y / 2 + d.y * 0.06} ${c.z}` });
    // Aim the camera a little above the model's middle so the model sits low and the label has headroom
    mv.cameraTarget = `${c.x}m ${c.y + d.y * 0.22}m ${c.z}m`;
    // Tall models: if the label still pokes out of the top, zoom out a bit and check again
    const lab = mv.querySelector(".mv-label");
    let pct = 150, tries = 0;
    const fit = () => {
      if (!mv.isConnected || tries++ > 3) return;
      const r = lab.getBoundingClientRect(), s = mv.getBoundingClientRect();
      if (r.height && r.top < s.top + 6) {
        pct += 15;
        mv.cameraOrbit = `auto auto ${pct}%`;
        if (mv.jumpCameraToGoal) mv.jumpCameraToGoal();
        setTimeout(fit, 120);
      }
    };
    setTimeout(fit, 250);
    // Safety net: whatever the camera does, slide the label down so it is never cut off by the top edge
    if (!labelSched) {
    let raf = 0;
    const clamp = () => {
      raf = 0;
      if (!mv.isConnected) return;
      const shift = parseFloat(lab.style.getPropertyValue("--shift")) || 0;
      const shiftX = parseFloat(lab.style.getPropertyValue("--shiftx")) || 0;
      const r = lab.getBoundingClientRect(), s = mv.getBoundingClientRect();
      if (!r.height) return;
      const next = Math.max(0, Math.round(s.top + 8 - (r.top - shift)));
      if (next !== shift) lab.style.setProperty("--shift", next + "px");
      // Keep the label centered over the model: the camera orbits the model's middle, which is always the viewer's center line
      const nextX = Math.round(s.left + s.width / 2 - (r.left + r.width / 2 - shiftX));
      if (nextX !== shiftX) lab.style.setProperty("--shiftx", nextX + "px");
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(clamp); };
    labelSched = relayout = schedule;
    mv.addEventListener("camera-change", schedule);
    window.addEventListener("resize", schedule);
    }
    setTimeout(labelSched, 300);
    setTimeout(labelSched, 900);
  });
  viewer.hidden = false;
});
$("#viewer-close").addEventListener("click", closeViewer);
viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !viewer.hidden) closeViewer(); });
