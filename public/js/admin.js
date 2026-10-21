let data;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

async function refresh() {
  data = await (await fetch("/api/menu")).json();
  $("#cat-list").innerHTML = data.categories.map((c) => `<option value="${esc(c)}">`).join("");
  $("#list").innerHTML = data.items.length
    ? data.items.map((i) => `<div class="admin-item">
        <div><strong>${esc(i.name)}</strong> <span class="price">${data.currency}${i.price}</span><br>
        <small>${esc(i.category)}${i.available ? "" : " (sold out)"}</small></div>
        <div><button class="btn ghost" data-edit="${i.id}">Edit</button>
        <button class="btn ghost" data-toggle="${i.id}">${i.available ? "Mark sold out" : "Mark available"}</button>
        <button class="btn ghost danger" data-del="${i.id}">Delete</button></div></div>`).join("")
    : "<p>No items yet. Add your first item above.</p>";
}

function resetForm() {
  $("#form").reset(); $("#id").value = ""; $("#available").checked = true;
  $("#form-title").textContent = "Add item"; $("#save").textContent = "Add item"; $("#cancel").hidden = true;
}

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { name: $("#name").value, price: $("#price").value, category: $("#category").value,
                 description: $("#description").value, available: $("#available").checked };
  try {
    const id = $("#id").value;
    await (id ? api("PUT", `/api/items/${id}`, body) : api("POST", "/api/items", body));
    say(id ? "Changes saved" : "Item added"); resetForm(); refresh();
  } catch (err) { say(err.message, true); }
});

$("#cancel").addEventListener("click", resetForm);

$("#list").addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.dataset.edit) {
      const i = data.items.find((x) => x.id === t.dataset.edit);
      $("#id").value = i.id; $("#name").value = i.name; $("#price").value = i.price;
      $("#category").value = i.category; $("#description").value = i.description; $("#available").checked = i.available;
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
