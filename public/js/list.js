// "My list": customers tap + on a dish to collect what they want, then show the list to staff.
// Saved on the phone (localStorage), so a refresh keeps it. No ordering happens here, it is just a list.
// Uses helpers from menu.js: data, $, esc, money, store.

const ICON_PLUS = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';
const ICON_MINUS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';
const ICON_LIST = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h11M4 12h8M4 18h6M17 14v8M13 18h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let myList = {};
try { myList = JSON.parse(store.get("menuList") || "{}"); } catch { myList = {}; }
const listQty = (id) => myList[id] || 0;
const listSave = () => store.set("menuList", JSON.stringify(myList));
const listItem = (id) => (typeof data !== "undefined" && data ? data.items.find((x) => x.id === id) : null);
// Only dishes that are still on the menu count (an item the owner deleted just drops out)
const listEntries = () => Object.entries(myList).map(([id, q]) => [listItem(id), q]).filter(([it, q]) => it && q > 0);
const listCount = () => listEntries().reduce((n, [, q]) => n + q, 0);
const listTotal = () => listEntries().reduce((s, [it, q]) => s + Number(it.price) * q, 0);

// Used by menu.js when it draws a row and the detail card
const addBtnHtml = (i) => {
  const q = listQty(i.id);
  return `<button type="button" class="add-btn${q ? " has" : ""}" data-add="${esc(i.id)}"${i.available ? "" : " disabled"} aria-label="${esc(addLabel(i, q))}">${ICON_PLUS}<span class="add-qty" aria-hidden="true">${q || ""}</span></button>`;
};
const sheetLabel = (i, q) => (!i.available ? "Sold out" : q ? `Add another (${q} in list)` : "Add to list");
const addSheetHtml = (i) => `<button type="button" class="btn sheet-add" data-add="${esc(i.id)}"${i.available ? "" : " disabled"}>${ICON_LIST}<span class="lbl">${esc(sheetLabel(i, listQty(i.id)))}</span></button>`;
function addLabel(i, q) { return i.available ? `Add ${i.name} to list${q ? ` (${q} in list)` : ""}` : `${i.name} is sold out`; }

// ---- Floating bar + list drawer ----
const bar = document.createElement("button");
bar.type = "button";
bar.className = "list-bar";
bar.hidden = true;
document.body.appendChild(bar);

const drawer = document.createElement("div");
drawer.className = "mylist";
drawer.hidden = true;
drawer.innerHTML = '<div class="mylist-box" role="dialog" aria-modal="true" aria-labelledby="mylist-title"></div>';
document.body.appendChild(drawer);
// Screen-reader announcement ("Crispy Lumpia added"); kept outside the drawer because the drawer is hidden when closed
const listStatus = document.createElement("p");
listStatus.className = "sr-only";
listStatus.setAttribute("role", "status");
document.body.appendChild(listStatus);
const drawerBox = drawer.querySelector(".mylist-box");

let drawerView = "list", receiptTime = null;
const CLOSE_BTN = '<button type="button" class="sheet-close mylist-close" aria-label="Close">\u00d7</button>';

function receiptHtml(rows) {
  const when = receiptTime.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return `<div class="mylist-top"><h2 id="mylist-title">Receipt</h2>${CLOSE_BTN}</div>
    <div class="receipt">
      <div class="rc-head"><strong>${esc(data.restaurant)}</strong><span>${esc(when)}</span></div>
      <ul class="rc-rows">${rows.map(([it, q]) => `<li><span class="rc-q">${q}\u00d7</span><span class="rc-n">${esc(it.name)}${it.available ? "" : " (sold out)"}</span><span class="rc-p">${money(Number(it.price) * q)}</span></li>`).join("")}</ul>
      <div class="rc-total"><span>Total</span><strong>${money(listTotal())}</strong></div>
      <p class="rc-note">Show this to your server to order. Tip: take a screenshot so you can keep it.</p>
    </div>
    <div class="mylist-actions"><button type="button" class="btn ghost" data-back-list>Back to list</button><button type="button" class="btn" data-new-list>New list</button></div>`;
}

function drawerHtml() {
  const rows = listEntries();
  if (!rows.length) return `<div class="mylist-top"><h2 id="mylist-title">My list</h2>${CLOSE_BTN}</div>
    <p class="mylist-empty">Your list is empty. Tap + on a dish to add it.</p>`;
  if (drawerView === "receipt") return receiptHtml(rows);
  return `<div class="mylist-top"><h2 id="mylist-title">My list</h2>${CLOSE_BTN}</div>
    <p class="mylist-hint">Show this list to your server when you're ready to order.</p>
    <ul class="mylist-rows">${rows.map(([it, q]) => `<li class="ml-row" data-id="${esc(it.id)}">
      <div class="ml-name">${esc(it.name)}<small>${money(it.price)} each${it.available ? "" : " \u00b7 sold out"}</small></div>
      <div class="ml-step" role="group" aria-label="Quantity of ${esc(it.name)}">
        <button type="button" data-dec aria-label="Remove one ${esc(it.name)}">${ICON_MINUS}</button><span aria-live="polite">${q}</span><button type="button" data-inc aria-label="Add one ${esc(it.name)}"${it.available ? "" : " disabled"}>${ICON_PLUS}</button>
      </div>
      <span class="ml-sub">${money(Number(it.price) * q)}</span></li>`).join("")}</ul>
    <div class="mylist-foot"><div class="mylist-total"><span>Total</span><strong>${money(listTotal())}</strong></div></div>
    <div class="mylist-actions"><button type="button" class="btn ghost" data-clear-list>Clear list</button><button type="button" class="btn" data-done>Done</button></div>`;
}

// Refresh every + button, the detail card button, the floating bar and (if open) the drawer
function listSync() {
  document.querySelectorAll(".add-btn[data-add]").forEach((b) => {
    const q = listQty(b.dataset.add), it = listItem(b.dataset.add);
    b.classList.toggle("has", q > 0);
    b.querySelector(".add-qty").textContent = q || "";
    if (it) b.setAttribute("aria-label", addLabel(it, q));
  });
  document.querySelectorAll(".sheet-add[data-add]").forEach((b) => {
    const it = listItem(b.dataset.add);
    if (it) b.querySelector(".lbl").textContent = sheetLabel(it, listQty(b.dataset.add));
  });
  const n = listCount();
  bar.hidden = !n;
  document.body.classList.toggle("has-list", n > 0);
  bar.innerHTML = `${ICON_LIST}<span class="lb-text">My list</span><span class="lb-count">${n} item${n === 1 ? "" : "s"}</span><span class="lb-total">${typeof data !== "undefined" && data ? money(listTotal()) : ""}</span>`;
  if (!drawer.hidden) drawerBox.innerHTML = drawerHtml();
}

function listSet(id, q) {
  if (q > 0) myList[id] = q; else delete myList[id];
  listSave();
  listSync();
}

function openList() {
  drawerView = "list";
  drawerBox.innerHTML = drawerHtml();
  drawer.hidden = false;
  document.body.classList.add("no-scroll");
  drawerBox.querySelector(".mylist-close").focus();
}
function closeList() {
  if (drawer.hidden) return;
  drawer.hidden = true;
  // Keep the page locked if the detail card is still open underneath
  if (typeof sheet === "undefined" || sheet.hidden) document.body.classList.remove("no-scroll");
  (bar.hidden ? document.body : bar).focus?.();
}

bar.addEventListener("click", openList);
drawer.addEventListener("click", (e) => {
  if (e.target === drawer || e.target.closest(".mylist-close")) return closeList();
  if (e.target.closest("[data-clear-list], [data-new-list]")) { myList = {}; listSave(); listSync(); return closeList(); }
  if (e.target.closest("[data-done]")) { drawerView = "receipt"; receiptTime = new Date(); drawerBox.innerHTML = drawerHtml(); drawerBox.scrollTop = 0; return drawerBox.querySelector(".mylist-close").focus(); }
  if (e.target.closest("[data-back-list]")) { drawerView = "list"; drawerBox.innerHTML = drawerHtml(); return drawerBox.querySelector(".mylist-close").focus(); }
  const row = e.target.closest(".ml-row");
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest("[data-inc]")) listSet(id, listQty(id) + 1);
  else if (e.target.closest("[data-dec]")) listSet(id, listQty(id) - 1);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeList(); });

// + on a row, or "Add to list" in the detail card
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]");
  if (!b || b.disabled) return;
  const it = listItem(b.dataset.add);
  if (!it || !it.available) return;
  listSet(it.id, listQty(it.id) + 1);
  document.querySelectorAll(`.add-btn[data-add="${CSS.escape(it.id)}"]`).forEach((x) => {
    x.classList.remove("pop"); void x.offsetWidth; x.classList.add("pop");
  });
  listStatus.textContent = `${it.name} added. ${listQty(it.id)} in your list.`;
});

// Once the menu has loaded, draw the bar (and drop anything the owner has since removed)
const listWait = setInterval(() => {
  if (typeof data === "undefined" || !data) return;
  clearInterval(listWait);
  let changed = false;
  Object.keys(myList).forEach((id) => { if (!listItem(id)) { delete myList[id]; changed = true; } });
  if (changed) listSave();
  listSync();
}, 50);
