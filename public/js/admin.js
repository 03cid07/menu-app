let data;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Messages show right above the Save button while the add/edit form is open, so they can't be missed.
const say = (t, err) => {
  const formOpen = !$("#form").hidden;
  const target = $(formOpen ? "#form-msg" : "#msg"), other = $(formOpen ? "#msg" : "#form-msg");
  other.textContent = ""; other.className = "msg";
  target.textContent = t; target.className = "msg" + (err ? " error" : "");
  if (formOpen && t) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
};

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

// 3D model of the item being edited: `#model` holds the saved path, `pendingModel` is a finished file from the fixer that uploads on save
let pendingModel = null;
const mb = (n) => (n / 1048576).toFixed(2) + " MB";
function syncModelUi() {
  const saved = $("#model").value;
  $("#model-current").textContent = pendingModel ? `New 3D model ready: ${pendingModel.name} (${mb(pendingModel.size)}). It uploads when you save.` : saved ? `Current 3D model: ${saved}` : "";
  $("#model-edit").hidden = !(pendingModel || saved);
  $("#model-remove").hidden = !(pendingModel || saved);
  $("#model-remove").textContent = pendingModel ? "Discard new model" : "Remove 3D model";
}
function showModel(path) { $("#model").value = path || ""; pendingModel = null; syncModelUi(); }

// Open the 3D fixer for a .glb (and any texture images picked with it); keep the finished file for the save step
async function fixModel(list) {
  if (!list.some((f) => /\.glb$/i.test(f.name))) { say("Choose a .glb file. If it has texture images (.jpg / .png), choose them together with it.", true); return; }
  if (!window.GlbFixer) { say("The 3D fixer did not load. Refresh the page and try again.", true); return; }
  const file = await GlbFixer.open(list);
  if (file) { pendingModel = file; syncModelUi(); say("3D model ready. It uploads when you save the item."); }
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
        <div class="admin-row">${i.image ? `<img class="admin-thumb" src="/${esc(i.image)}" alt="">` : ""}<div><div class="admin-title"><strong>${mqHtml(i.name)}</strong><span class="price">${data.currency}${i.price}</span></div>
        <small>${esc(i.category)}${i.model ? " · 3D model" : ""}${i.available ? "" : " (sold out)"}</small></div></div>
        <div><button class="btn ghost" data-edit="${i.id}">Edit</button>
        <button class="btn ghost" data-qr="${i.id}">QR</button>
        <button class="btn ghost" data-toggle="${i.id}">${i.available ? "Mark sold out" : "Mark available"}</button>
        <button class="btn ghost danger" data-del="${i.id}">Delete</button></div></div>`).join("")
    : "<p>No items yet. Add your first item above.</p>";
}

function resetForm() {
  $("#form").reset(); $("#id").value = ""; $("#available").checked = true; showModel(""); photos = []; renderPhotos(); $("#imageFile").value = "";
  $("#form-title").textContent = "Add item"; $("#save").textContent = "Add item"; $("#cancel").hidden = true;
  $("#tab-add .lbl").textContent = "Add item";
}

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const todo = photos.filter((p) => p.file);
    for (const [k, p] of todo.entries()) {
      say(`Uploading photo ${k + 1} of ${todo.length}…`);
      p.path = await uploadImage(p.file); delete p.file; // kept as uploaded, so a retry won't upload it twice
    }
    if (pendingModel) { say("Uploading 3D model…"); showModel(await uploadModel(pendingModel)); }
    const body = { name: $("#name").value, price: $("#price").value, category: $("#category").value,
                   description: $("#description").value, ingredients: $("#ingredients").value, images: photos.map((p) => p.path),
                   model: $("#model").value, label: $("#label").value,
                   available: $("#available").checked };
    const id = $("#id").value;
    await (id ? api("PUT", `/api/items/${id}`, body) : api("POST", "/api/items", body));
    resetForm(); refresh(); if (id) showTab("items"); say(id ? "Changes saved" : "Item added");
  } catch (err) { say(err.message, true); }
});

$("#cancel").addEventListener("click", () => { resetForm(); showTab("items"); });
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
$("#model-remove").addEventListener("click", () => {
  if (pendingModel) { pendingModel = null; syncModelUi(); say("New 3D model discarded."); }   // back to the saved one, if any
  else showModel("");
  $("#modelFile").value = "";
});
$("#modelFile").addEventListener("change", () => {
  const list = [...$("#modelFile").files];
  $("#modelFile").value = "";                       // so choosing the same file again still opens the fixer
  if (list.length) fixModel(list);
});
$("#model-edit").addEventListener("click", async () => {
  try {
    if (pendingModel) return fixModel([pendingModel]);
    const path = $("#model").value;
    say("Loading 3D model…");
    const res = await fetch("/" + path.replace(/^\//, ""));
    if (!res.ok) throw new Error("Could not load the saved 3D model (error " + res.status + ")");
    say("");
    await fixModel([new File([await res.blob()], path.split("/").pop(), { type: "model/gltf-binary" })]);
  } catch (err) { say(err.message, true); }
});

$("#list").addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.dataset.edit) {
      const i = data.items.find((x) => x.id === t.dataset.edit);
      $("#id").value = i.id; $("#name").value = i.name; $("#price").value = i.price;
      $("#category").value = i.category; $("#description").value = i.description; $("#available").checked = i.available;
      $("#ingredients").value = i.ingredients || ""; $("#label").value = i.label || ""; showModel(i.model || ""); $("#modelFile").value = ""; photos = gallery(i).map((path) => ({ path })); renderPhotos(); $("#imageFile").value = "";
      $("#form-title").textContent = "Edit item"; $("#save").textContent = "Save changes"; $("#cancel").hidden = false;
      $("#tab-add .lbl").textContent = "Edit item"; showTab("add"); $("#name").focus();
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


// ---- QR code tab: a QR for the whole menu or for one dish, with download, print and a test link ----
$("#list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-qr]");
  if (!b) return;
  showTab("qr");
  document.dispatchEvent(new CustomEvent("qr-for", { detail: b.dataset.qr }));
});
(() => {
  const input = $("#qr-url"), img = $("#qr-img"), note = $("#qr-note"), target = $("#qr-target");
  const SOURCE = { PUBLIC_URL: "Using the PUBLIC_URL setting.", pages: "Using your permanent GitHub Pages link. It works even when your laptop is off.", tunnel: "Using your tunnel link (filled in automatically).", request: "Using the address this page was opened on." };
  let timer = 0, source = "request", base = "", items = [];
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dish";
  const itemOf = (id) => items.find((i) => i.id === id);

  function fillTargets(keep) {
    target.innerHTML = '<option value="">Whole menu</option>' + items.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join("");
    target.value = itemOf(keep) ? keep : "";
  }
  // Same link with ?item=ID added (or removed for the whole menu)
  function linkFor(id) {
    let u;
    try { u = new URL(input.value.trim() || base); } catch { try { u = new URL(base); } catch { return input.value; } }
    u.searchParams.delete("item");
    if (id) u.searchParams.set("item", id);
    return u.href;
  }
  async function loadItems(keep) {
    try { items = (await (await fetch("/api/menu")).json()).items || []; } catch { items = []; }
    fillTargets(keep === undefined ? target.value : keep);
  }
  function update() {
    const raw = input.value.trim();
    let u = null;
    try { u = new URL(raw); if (!/^https?:$/.test(u.protocol)) u = null; } catch { u = null; }
    for (const id of ["#qr-download", "#qr-print", "#qr-test"]) $(id).removeAttribute("href");
    if (!u) { img.removeAttribute("src"); note.className = "qr-note error"; note.textContent = "Type a full link that starts with https://"; return; }
    const it = itemOf(u.searchParams.get("item"));
    if (it && target.value !== it.id) target.value = it.id;
    else if (!it && u.searchParams.get("item") === null && target.value) target.value = "";
    const q = encodeURIComponent(u.href);
    img.src = `/qr.png?size=480&url=${q}`;
    img.alt = it ? `QR code that opens ${it.name}` : "QR code that opens the menu";
    $("#qr-download").href = `/qr.png?size=1200&url=${q}`;
    $("#qr-download").setAttribute("download", it ? `qr-${slug(it.name)}.png` : "menu-qr.png");
    $("#qr-print").href = `/qr-print.html?url=${q}` + (it ? `&title=${encodeURIComponent(it.name)}&sub=${encodeURIComponent("Scan to see this dish")}` : "");
    $("#qr-test").href = u.href;
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname);
    if (local) { note.className = "qr-note error"; note.textContent = "This is a localhost link. It will not open on customers' phones. Use your public link instead (the GitHub Pages one)."; }
    else if (u.protocol !== "https:") { note.className = "qr-note error"; note.textContent = "This link is not https. The menu will open, but AR needs https to work on phones."; }
    else { note.className = "qr-note ok"; note.textContent = (SOURCE[source] || "") + " Scan it with your phone, or press Test link."; }
  }
  target.addEventListener("change", () => { input.value = linkFor(target.value); update(); });
  input.addEventListener("input", () => { source = ""; clearTimeout(timer); timer = setTimeout(update, 300); });
  document.addEventListener("qr-for", async (e) => { await loadItems(e.detail); input.value = linkFor(target.value); update(); });
  document.querySelector('[data-tab="qr"]').addEventListener("click", () => loadItems());
  Promise.all([
    fetch("/api/qr-url").then((r) => r.json()).catch(() => ({ url: location.origin + "/", source: "request" })),
    loadItems(""),
  ]).then(([j]) => { base = j.url; input.value = j.url; source = j.source; update(); });
})();
