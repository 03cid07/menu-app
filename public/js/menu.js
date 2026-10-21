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
        <h3>${esc(i.name)}${i.available ? "" : '<span class="badge">Sold out</span>'}</h3>
        <span class="price">${money(i.price)}</span>
        ${i.description ? `<p>${esc(i.description)}</p>` : ""}
      </article>`).join("")}</section>`;
  }).join("");
  $("#menu").innerHTML = html || '<p class="empty">No items yet. Add some on the admin page.</p>';
}

$("#cats").addEventListener("click", (e) => {
  if (e.target.dataset.c) { active = e.target.dataset.c; render(); }
});

fetch("/api/menu").then((r) => r.json()).then((d) => { data = d; render(); })
  .catch(() => ($("#menu").innerHTML = '<p class="empty">Could not load the menu. Check that the server is running.</p>'));
