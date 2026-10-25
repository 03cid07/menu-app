let data;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Drink-like categories get a hot/cold choice (same test as the customer menu)
const DRINK_RE = /drink|beverage|juice|coffee|tea\b|shake|smoothie|soda|cocktail|beer|wine/i;
const syncTemp = () => { $("#temp-box").hidden = !DRINK_RE.test($("#category").value); };
const say = (t, err) => { $("#msg").textContent = t; $("#msg").className = "msg" + (err ? " error" : ""); };

// Tabs: only one section is shown at a time, which keeps the page short
function showTab(name) {
  if (!document.querySelector(`[data-panel="${name}"]`)) name = "items";
  document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  document.querySelectorAll(".adminnav [data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
}
document.querySelector(".adminnav-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab);
});

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-admin-pin": $("#pin").value },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error((j && j.error) || (res.status === 404 ? "The server doesn't know this action yet. Stop it (Ctrl+C) and start it again with npm start." : `Request failed (error ${res.status})`));
  }
  return res.status === 204 ? null : res.json();
}

async function uploadModel(file) {
  const res = await fetch(`/api/upload-model?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "x-admin-pin": $("#pin").value },
    body: file,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed");
  return (await res.json()).model;
}

// Shrink a phone photo (often 4 MB+) to at most 900 px wide JPEG before uploading, so the menu loads fast
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Could not read that photo"))), "image/jpeg", 0.85));
}

async function uploadImage(file) {
  const res = await fetch("/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "x-admin-pin": $("#pin").value },
    body: await shrinkImage(file),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Photo upload failed");
  return (await res.json()).image;
}

// Photos of the item being edited: { path } for uploaded ones, { file, url } for ones picked but not uploaded yet
let photos = [];
const gallery = (i) => (i.images && i.images.length ? i.images : i.image ? [i.image] : []);
function renderPhotos() {
  $("#photo-grid").innerHTML = photos.map((p, n) => `<div class="photo-tile"><img src="${esc(p.url || "/" + p.path)}" alt="Photo ${n + 1}">${n === 0 ? '<span class="cover-tag">Cover</span>' : ""}
    <div class="photo-btns"><button type="button" class="pb" data-pl="${n}" aria-label="Move photo ${n + 1} earlier" ${n === 0 ? "disabled" : ""}>\u2039</button><button type="button" class="pb" data-pr="${n}" aria-label="Move photo ${n + 1} later" ${n === photos.length - 1 ? "disabled" : ""}>\u203a</button><button type="button" class="pb danger" data-px="${n}" aria-label="Remove photo ${n + 1}">\u00d7</button></div></div>`).join("");
}

function showModel(path) {
  $("#model").value = path || "";
  $("#model-current").textContent = path ? `Current 3D model: ${path}` : "";
  $("#model-remove").hidden = !path;
}

async function refresh() {
  data = await (await fetch("/api/menu")).json();
  $("#cat-list").innerHTML = data.categories.map((c) => `<option value="${esc(c)}">`).join("");
  const count = (c) => data.items.filter((i) => i.category === c).length;
  $("#cat-manage").innerHTML = data.categories.length
    ? data.categories.map((c, n) => `<div class="admin-item"><div><strong>${esc(c)}</strong> <small>${count(c)} dish${count(c) === 1 ? "" : "es"}</small></div>
        <div><button class="btn ghost" data-crename="${n}">Rename / merge</button><button class="btn ghost danger" data-cdel="${n}">Delete</button></div></div>`).join("")
    : "<p>No categories yet.</p>";
  $("#list").innerHTML = data.items.length
    ? data.items.map((i) => `<div class="admin-item">
        <div class="admin-row">${i.image ? `<img class="admin-thumb" src="/${esc(i.image)}" alt="">` : ""}<div><strong>${esc(i.name)}</strong> <span class="price">${data.currency}${i.price}</span><br>
        <small>${esc(i.category)}${i.model ? " · 3D model" : ""}${i.available ? "" : " (sold out)"}</small></div></div>
        <div><button class="btn ghost" data-edit="${i.id}">Edit</button>
        <button class="btn ghost" data-toggle="${i.id}">${i.available ? "Mark sold out" : "Mark available"}</button>
        <button class="btn ghost danger" data-del="${i.id}">Delete</button></div></div>`).join("")
    : "<p>No items yet. Add your first item above.</p>";
}

function resetForm() {
  $("#form").reset(); $("#id").value = ""; $("#available").checked = true; showModel(""); photos = []; renderPhotos(); $("#imageFile").value = ""; syncTemp();
  $("#form-title").textContent = "Add item"; $("#save").textContent = "Add item"; $("#cancel").hidden = true;
  $("#tab-add").textContent = "Add item";
}

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const todo = photos.filter((p) => p.file);
    for (const [k, p] of todo.entries()) {
      say(`Uploading photo ${k + 1} of ${todo.length}…`);
      p.path = await uploadImage(p.file); delete p.file; // kept as uploaded, so a retry won't upload it twice
    }
    const file = $("#modelFile").files[0];
    if (file) { say("Uploading 3D model…"); showModel(await uploadModel(file)); }
    const body = { name: $("#name").value, price: $("#price").value, category: $("#category").value,
                   description: $("#description").value, ingredients: $("#ingredients").value, images: photos.map((p) => p.path),
                   model: $("#model").value,
                   temp: DRINK_RE.test($("#category").value) ? $("#temp").value : "",
                   available: $("#available").checked };
    const id = $("#id").value;
    await (id ? api("PUT", `/api/items/${id}`, body) : api("POST", "/api/items", body));
    say(id ? "Changes saved" : "Item added"); resetForm(); refresh(); if (id) showTab("items");
  } catch (err) { say(err.message, true); }
});

$("#cancel").addEventListener("click", () => { resetForm(); showTab("items"); });
$("#category").addEventListener("input", syncTemp);
$("#imageFile").addEventListener("change", () => {
  const room = 8 - photos.length, picked = [...$("#imageFile").files];
  photos.push(...picked.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) })));
  if (picked.length > room) say("A dish can have up to 8 photos, so the extra ones were skipped.", true);
  $("#imageFile").value = ""; renderPhotos();
});
$("#photo-grid").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const n = Number(b.dataset.pl ?? b.dataset.pr ?? b.dataset.px);
  if (b.dataset.px !== undefined) photos.splice(n, 1);
  else { const m = b.dataset.pl !== undefined ? n - 1 : n + 1; [photos[n], photos[m]] = [photos[m], photos[n]]; }
  renderPhotos();
});
$("#model-remove").addEventListener("click", () => { showModel(""); $("#modelFile").value = ""; });

$("#list").addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.dataset.edit) {
      const i = data.items.find((x) => x.id === t.dataset.edit);
      $("#id").value = i.id; $("#name").value = i.name; $("#price").value = i.price;
      $("#category").value = i.category; $("#description").value = i.description; $("#available").checked = i.available;
      $("#ingredients").value = i.ingredients || ""; $("#temp").value = i.temp || ""; syncTemp(); showModel(i.model || ""); $("#modelFile").value = ""; photos = gallery(i).map((path) => ({ path })); renderPhotos(); $("#imageFile").value = "";
      $("#form-title").textContent = "Edit item"; $("#save").textContent = "Save changes"; $("#cancel").hidden = false;
      $("#tab-add").textContent = "Edit item"; showTab("add"); $("#name").focus();
    } else if (t.dataset.toggle) {
      const i = data.items.find((x) => x.id === t.dataset.toggle);
      await api("PUT", `/api/items/${i.id}`, { available: !i.available }); refresh();
    } else if (t.dataset.del && confirm("Delete this item?")) {
      await api("DELETE", `/api/items/${t.dataset.del}`); say("Item deleted"); refresh();
    }
  } catch (err) { say(err.message, true); }
});

const sayCat = (t, err) => { $("#cat-msg").textContent = t; $("#cat-msg").className = "msg" + (err ? " error" : ""); };
$("#cat-manage").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  try {
    if (t.dataset.crename !== undefined) {
      const from = data.categories[t.dataset.crename];
      const to = prompt(`Rename "${from}" to (type an existing category to merge them):`, from);
      if (to === null || to.trim() === from) return;
      const r = await api("PUT", "/api/categories", { from, to });
      sayCat(r.merged ? `Merged into "${to.trim()}"` : "Category renamed");
    } else if (t.dataset.cdel !== undefined) {
      const name = data.categories[t.dataset.cdel];
      if (!confirm(`Delete the category "${name}"?`)) return;
      await api("DELETE", `/api/categories?name=${encodeURIComponent(name)}`);
      sayCat("Category deleted");
    } else return;
    refresh();
  } catch (err) { sayCat(err.message, true); }
});

showTab(location.hash.slice(1) || "items");
refresh();


// ---- QR code tab: shows the menu link as a QR code, with download and print ----
(() => {
  const input = $("#qr-url"), img = $("#qr-img"), note = $("#qr-note");
  const SOURCE = { PUBLIC_URL: "Using the PUBLIC_URL setting.", tunnel: "Using your tunnel link (filled in automatically).", request: "Using the address this page was opened on." };
  let timer = 0, source = "request";
  function update() {
    const raw = input.value.trim();
    let u = null;
    try { u = new URL(raw); if (!/^https?:$/.test(u.protocol)) u = null; } catch { u = null; }
    $("#qr-download").removeAttribute("href"); $("#qr-print").removeAttribute("href");
    if (!u) { img.removeAttribute("src"); note.className = "qr-note error"; note.textContent = "Type a full link that starts with https://"; return; }
    const q = encodeURIComponent(u.href);
    img.src = `/qr.png?size=480&url=${q}`;
    $("#qr-download").href = `/qr.png?size=1200&url=${q}`;
    $("#qr-print").href = `/qr-print.html?url=${q}`;
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname);
    if (local) { note.className = "qr-note error"; note.textContent = "This is a localhost link. It will not open on customers' phones. Start the tunnel (start-all.bat) and use the link it gives you."; }
    else if (u.protocol !== "https:") { note.className = "qr-note error"; note.textContent = "This link is not https. The menu will open, but AR needs https to work on phones."; }
    else { note.className = "qr-note ok"; note.textContent = (SOURCE[source] || "") + " Scan it with your phone to test."; }
  }
  input.addEventListener("input", () => { source = ""; clearTimeout(timer); timer = setTimeout(update, 300); });
  fetch("/api/qr-url").then((r) => r.json()).then((j) => { input.value = j.url; source = j.source; update(); })
    .catch(() => { input.value = location.origin + "/"; update(); });
})();
