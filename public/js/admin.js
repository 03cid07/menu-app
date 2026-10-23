let data;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Drink-like categories get a hot/cold choice (same test as the customer menu)
const DRINK_RE = /drink|beverage|juice|coffee|tea\b|shake|smoothie|soda|cocktail|beer|wine/i;
const syncTemp = () => { $("#temp-box").hidden = !DRINK_RE.test($("#category").value); };
const say = (t, err) => { $("#msg").textContent = t; $("#msg").className = "msg" + (err ? " error" : ""); };

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-admin-pin": $("#pin").value },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
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

function showImage(path, localUrl) {
  $("#image").value = path || "";
  $("#image-preview").hidden = !(path || localUrl);
  $("#image-img").src = localUrl || (path ? "/" + path : "");
}

// Read the model's real size (width, height, depth in meters) from the .glb header
function glbSize(ab) {
  try {
    const dv = new DataView(ab);
    if (dv.getUint32(0, true) !== 0x46546c67) return null;
    const g = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, dv.getUint32(12, true))));
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const m of g.meshes || []) for (const p of m.primitives) {
      const a = g.accessors[p.attributes.POSITION];
      if (!a || !a.min || !a.max) continue;
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a.min[k]); mx[k] = Math.max(mx[k], a.max[k]); }
    }
    return mn[0] === Infinity ? null : mx.map((v, k) => v - mn[k]);
  } catch { return null; }
}

let origSize = null, sizeToken = 0;

function updateSize() {
  const pct = Number($("#modelScale").value);
  $("#scale-label").textContent = pct;
  const cm = (v) => Math.round(v * 100);
  $("#model-size").textContent = origSize
    ? `Original: ${origSize.map(cm).join(" × ")} cm  →  in AR: ${origSize.map((v) => cm(v * pct / 100)).join(" × ")} cm`
    : "";
}

async function loadSize(source) {
  const token = ++sizeToken;
  origSize = null; updateSize();
  try {
    const ab = typeof source === "string" ? await (await fetch(source)).arrayBuffer() : await source.arrayBuffer();
    if (token === sizeToken) { origSize = glbSize(ab); updateSize(); }
  } catch { /* size readout is optional */ }
}

function showModel(path, scale = 1) {
  $("#model").value = path || "";
  $("#model-current").textContent = path ? `Current 3D model: ${path}` : "";
  $("#model-remove").hidden = !path;
  $("#size-box").hidden = !path;
  $("#modelScale").value = Math.round(scale * 100);
  if (path) loadSize(path); else { origSize = null; updateSize(); }
}

async function refresh() {
  data = await (await fetch("/api/menu")).json();
  $("#cat-list").innerHTML = data.categories.map((c) => `<option value="${esc(c)}">`).join("");
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
  $("#form").reset(); $("#id").value = ""; $("#available").checked = true; showModel(""); showImage(""); $("#imageFile").value = ""; syncTemp();
  $("#form-title").textContent = "Add item"; $("#save").textContent = "Add item"; $("#cancel").hidden = true;
}

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const photo = $("#imageFile").files[0];
    if (photo) { say("Uploading photo…"); showImage(await uploadImage(photo)); }
    const file = $("#modelFile").files[0];
    const pct = Number($("#modelScale").value);
    if (file) { say("Uploading 3D model…"); showModel(await uploadModel(file), pct / 100); }
    const body = { name: $("#name").value, price: $("#price").value, category: $("#category").value,
                   description: $("#description").value, ingredients: $("#ingredients").value, image: $("#image").value,
                   model: $("#model").value, modelScale: $("#model").value ? pct / 100 : 1,
                   temp: DRINK_RE.test($("#category").value) ? $("#temp").value : "",
                   available: $("#available").checked };
    const id = $("#id").value;
    await (id ? api("PUT", `/api/items/${id}`, body) : api("POST", "/api/items", body));
    say(id ? "Changes saved" : "Item added"); resetForm(); refresh();
  } catch (err) { say(err.message, true); }
});

$("#cancel").addEventListener("click", resetForm);
$("#category").addEventListener("input", syncTemp);
$("#imageFile").addEventListener("change", () => {
  const f = $("#imageFile").files[0];
  if (f) showImage("", URL.createObjectURL(f));
});
$("#image-remove").addEventListener("click", () => { showImage(""); $("#imageFile").value = ""; });
$("#modelScale").addEventListener("input", updateSize);
$("#modelFile").addEventListener("change", () => {
  const f = $("#modelFile").files[0];
  if (!f) return;
  $("#size-box").hidden = false;
  loadSize(f);
});
$("#model-remove").addEventListener("click", () => { showModel(""); $("#modelFile").value = ""; });

$("#list").addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.dataset.edit) {
      const i = data.items.find((x) => x.id === t.dataset.edit);
      $("#id").value = i.id; $("#name").value = i.name; $("#price").value = i.price;
      $("#category").value = i.category; $("#description").value = i.description; $("#available").checked = i.available;
      $("#ingredients").value = i.ingredients || ""; $("#temp").value = i.temp || ""; syncTemp(); showModel(i.model || "", i.modelScale || 1); $("#modelFile").value = ""; showImage(i.image || ""); $("#imageFile").value = "";
      $("#form-title").textContent = "Edit item"; $("#save").textContent = "Save changes"; $("#cancel").hidden = false;
      $("#name").focus();
    } else if (t.dataset.toggle) {
      const i = data.items.find((x) => x.id === t.dataset.toggle);
      await api("PUT", `/api/items/${i.id}`, { available: !i.available }); refresh();
    } else if (t.dataset.del && confirm("Delete this item?")) {
      await api("DELETE", `/api/items/${t.dataset.del}`); say("Item deleted"); refresh();
    }
  } catch (err) { say(err.message, true); }
});

refresh();
