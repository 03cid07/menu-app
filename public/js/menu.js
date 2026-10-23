let data, active = "All";
const $ = (s) => document.querySelector(s);
const money = (n) => `${data.currency}${Number(n).toLocaleString()}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Filter & sort state ----
// Categories now live inside the Filter panel, so remove the old button row if the page still has it
document.querySelector("nav.cats")?.remove();
// Make sure the filter bar has a place on the page, even if index.html is an older copy
if (!$("#fs")) { const el = document.createElement("div"); el.id = "fs"; $("#menu").before(el); }
const view = { avail: false, ar: false, photo: false, sort: "featured", open: "" };
const SORTS = { featured: "Featured", low: "Price, low to high", high: "Price, high to low", az: "Name, A to Z" };
const FILTERS = [["Availability", [["avail", "Available now"]]], ["Extras", [["ar", "3D / AR"], ["photo", "With photo"]]]];
const filterCount = () => ["avail", "ar", "photo"].filter((k) => view[k]).length + (active !== "All" ? 1 : 0);
const CHEV = '<svg class="chev" viewBox="0 0 12 8" width="14" height="10" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const itemHtml = (i, showCat) => `
      <article class="item ${i.available ? "" : "sold-out"}">
        ${i.image ? `<img class="thumb" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : `<div class="thumb ph" aria-hidden="true">${esc(i.name.trim().charAt(0).toUpperCase())}</div>`}
        <div class="info">
          <div class="head"><h3>${esc(i.name)}${i.available ? "" : '<span class="badge">Sold out</span>'}</h3><span class="price">${money(i.price)}</span></div>
          ${showCat ? `<small class="itemcat">${esc(i.category)}</small>` : ""}
          ${i.description ? `<p>${esc(i.description)}</p>` : ""}
          ${i.ingredients ? `<p class="ingredients"><strong>Ingredients:</strong> ${esc(i.ingredients)}</p>` : ""}
          ${i.model ? `<button type="button" class="ar-open" data-id="${esc(i.id)}" data-model="${esc(i.model)}" data-scale="${esc(i.modelScale || 1)}" data-name="${esc(i.name)}">View in 3D / AR</button>` : ""}
        </div>
      </article>`;

function visibleItems() {
  const list = data.items.filter((i) => (active === "All" || i.category === active)
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
      <button type="button" class="fs-tab" data-open="filter" aria-expanded="${f}" aria-controls="fs-filter">Filter${n ? ` (${n})` : ""}${CHEV}</button>
      <button type="button" class="fs-tab" data-open="sort" aria-expanded="${s}" aria-controls="fs-sort">Sort by${CHEV}</button>
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
  const items = visibleItems();
  let html;
  if (!data.items.length) html = '<p class="empty">No items yet. Add some on the admin page.</p>';
  else if (!items.length) html = '<p class="empty">No dishes match these filters. <button type="button" class="linkbtn" data-clear>Clear filters</button></p>';
  else if (view.sort === "featured") {
    html = data.categories.map((c) => {
      const inCat = items.filter((i) => i.category === c);
      return inCat.length ? `<section class="cat"><h2>${esc(c)}</h2>${inCat.map((i) => itemHtml(i, false)).join("")}</section>` : "";
    }).join("");
  } else html = `<section class="cat"><h2>${SORTS[view.sort]}</h2>${items.map((i) => itemHtml(i, true)).join("")}</section>`;
  $("#menu").innerHTML = html;
}

$("#fs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-open],[data-f],[data-c]");
  if (!t) return;
  if (t.dataset.c !== undefined) active = t.dataset.c;
  else if (t.dataset.open) view.open = view.open === t.dataset.open ? "" : t.dataset.open;
  else view[t.dataset.f] = !view[t.dataset.f];
  render();
});
$("#fs").addEventListener("change", (e) => { if (e.target.name === "sort") { view.sort = e.target.value; render(); } });
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-clear]")) return;
  view.avail = view.ar = view.photo = false; active = "All"; render();
});

fetch("/api/menu").then((r) => r.json()).then((d) => { data = d; render(); })
  .catch(() => ($("#menu").innerHTML = '<p class="empty">Could not load the menu. Check that the server is running.</p>'));

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

const closeViewer = () => { viewer.hidden = true; $("#viewer-stage").innerHTML = ""; };

$("#menu").addEventListener("click", (e) => {
  const b = e.target.closest(".ar-open");
  if (!b) return;
  $("#viewer-title").textContent = b.dataset.name;
  const scale = Number(b.dataset.scale) || 1;
  const src = scale === 1 ? b.dataset.model : `scaled/${scale}/${b.dataset.model.replace(/^models\//, "")}`;
  const it = data.items.find((x) => x.id === b.dataset.id) || { name: b.dataset.name, price: 0 };
  // Floating label: the name drops in letter by letter, the price pops, the description fades in
  const label = `<div slot="hotspot-label" class="mv-label" data-position="0 1 0"><div class="mv-card">
      <div class="mv-name">${[...it.name].map((ch, k) => `<span style="--d:${k * 45}ms">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("")}</div>
      <div class="mv-price">${money(it.price)}</div>
      ${it.description ? `<div class="mv-desc">${esc(it.description)}</div>` : ""}
    </div><button type="button" class="mv-toggle" aria-expanded="true" aria-label="Hide details">${CHEV}</button></div>`;
  $("#viewer-stage").innerHTML = `<model-viewer src="${esc(src)}" alt="3D model of ${esc(b.dataset.name)}"
    ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" ar-placement="floor"
    camera-controls touch-action="pan-y" shadow-intensity="1" camera-orbit="auto auto 150%">
    ${label}
    <button slot="ar-button" type="button" class="btn ar-btn">View on your table (AR)</button>
  </model-viewer>`;
  // Once the model has loaded, float the label just above its top
  const mv = $("#viewer-stage model-viewer");
  let relayout = () => {};
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
    relayout = schedule;
    mv.addEventListener("camera-change", schedule);
    window.addEventListener("resize", schedule);
    setTimeout(schedule, 300);
    setTimeout(schedule, 900);
  });
  viewer.hidden = false;
});
$("#viewer-close").addEventListener("click", closeViewer);
viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !viewer.hidden) closeViewer(); });
