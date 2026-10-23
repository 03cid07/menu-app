let data, active = "All";
const $ = (s) => document.querySelector(s);
const money = (n) => `${data.currency}${Number(n).toLocaleString()}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function render() {
  $("#name").textContent = data.restaurant;
  document.title = `${data.restaurant} menu`;
  const cats = ["All", ...data.categories];
  $("#cats").innerHTML = cats
    .map((c) => `<button aria-pressed="${c === active}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
  const shown = data.categories.filter((c) => active === "All" || c === active);
  const html = shown.map((c) => {
    const items = data.items.filter((i) => i.category === c);
    if (!items.length) return "";
    return `<section class="cat"><h2>${esc(c)}</h2>${items.map((i) => `
      <article class="item ${i.available ? "" : "sold-out"}">
        ${i.image ? `<img class="thumb" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : `<div class="thumb ph" aria-hidden="true">${esc(i.name.trim().charAt(0).toUpperCase())}</div>`}
        <div class="info">
          <div class="head"><h3>${esc(i.name)}${i.available ? "" : '<span class="badge">Sold out</span>'}</h3><span class="price">${money(i.price)}</span></div>
          ${i.description ? `<p>${esc(i.description)}</p>` : ""}
          ${i.ingredients ? `<p class="ingredients"><strong>Ingredients:</strong> ${esc(i.ingredients)}</p>` : ""}
          ${i.model ? `<button type="button" class="ar-open" data-model="${esc(i.model)}" data-scale="${esc(i.modelScale || 1)}" data-name="${esc(i.name)}">View in 3D / AR</button>` : ""}
        </div>
      </article>`).join("")}</section>`;
  }).join("");
  $("#menu").innerHTML = html || '<p class="empty">No items yet. Add some on the admin page.</p>';
}

$("#cats").addEventListener("click", (e) => {
  if (e.target.dataset.c) { active = e.target.dataset.c; render(); }
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
  $("#viewer-stage").innerHTML = `<model-viewer src="${esc(src)}" alt="3D model of ${esc(b.dataset.name)}"
    ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" ar-placement="floor"
    camera-controls touch-action="pan-y" shadow-intensity="1">
    <button slot="ar-button" type="button" class="btn ar-btn">View on your table (AR)</button>
  </model-viewer>`;
  viewer.hidden = false;
});
$("#viewer-close").addEventListener("click", closeViewer);
viewer.addEventListener("click", (e) => { if (e.target === viewer) closeViewer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !viewer.hidden) closeViewer(); });
