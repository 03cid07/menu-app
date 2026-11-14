// "My list": customers tap + on a dish to collect what they want, then show the list to staff.
// The list has its own page (a full screen at #list, like the 3D view), not a floating bar or pop-up.
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
// Detail card: "Add to list" first; once the dish is in the list it becomes a stepper (- 2 +) so a customer
// can also take one off right there, plus a "View list" button.
const sheetCtlHtml = (i) => {
  const q = listQty(i.id), id = esc(i.id);
  if (!i.available) return `<button type="button" class="btn sheet-add" disabled>${ICON_LIST}<span class="lbl">Sold out</span></button>`;
  if (!q) return `<button type="button" class="btn sheet-add" data-add="${id}">${ICON_LIST}<span class="lbl">Add to list</span></button>`;
  return `<div class="sheet-step" role="group" aria-label="${esc(i.name)} in your list">
      <button type="button" data-sheet-dec aria-label="Remove one ${esc(i.name)}">${ICON_MINUS}</button><span aria-live="polite">${q}</span><button type="button" data-add="${id}" aria-label="Add one ${esc(i.name)}">${ICON_PLUS}</button>
    </div>
    <button type="button" class="btn ghost sheet-viewlist" data-open-list>${ICON_LIST}<span>View list</span></button>`;
};
const addSheetHtml = (i) => `<div class="sheet-listctl" data-ctl="${esc(i.id)}">${sheetCtlHtml(i)}</div>`;
function addLabel(i, q) { return i.available ? `Add ${i.name} to list${q ? ` (${q} in list)` : ""}` : `${i.name} is sold out`; }

// ---- My list page (a full screen on top of the menu, below the bottom bar; address #list) ----
const listPage = document.createElement("section");
listPage.className = "list-page";
listPage.hidden = true;
listPage.setAttribute("aria-labelledby", "mylist-title");
// Goes in before the bottom bar, so the bar stays on top of it (the 3D view does the same)
document.body.insertBefore(listPage, document.querySelector(".bottomnav"));
// Screen-reader announcement ("Crispy Lumpia added"); kept outside the page because the page is hidden when closed
const listStatus = document.createElement("p");
listStatus.className = "sr-only";
listStatus.setAttribute("role", "status");
document.body.appendChild(listStatus);

const LIST_HASH = "#list";
let drawerView = "list", receiptTime = null, listOpen = false, listInert = [], listFade = null, listV = 0;
const BACK_BTN = '<button type="button" class="home-back" data-list-back>\u2039 Back</button>';

function receiptHtml(rows) {
  const when = receiptTime.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return `${BACK_BTN}<h1 id="mylist-title" class="list-title" tabindex="-1">Receipt</h1>
    <div class="receipt">
      <div class="rc-head"><strong>${esc(data.restaurant)}</strong><span>${esc(when)}</span></div>
      <ul class="rc-rows">${rows.map(([it, q]) => `<li><span class="rc-q">${q}\u00d7</span><span class="rc-n">${esc(it.name)}${it.available ? "" : " (sold out)"}</span><span class="rc-p">${money(Number(it.price) * q)}</span></li>`).join("")}</ul>
      <div class="rc-total"><span>Total</span><strong>${money(listTotal())}</strong></div>
      <p class="rc-note">Show this to your server to order. Tip: take a screenshot so you can keep it.</p>
    </div>
    <div class="mylist-actions"><button type="button" class="btn ghost" data-back-list>Back to list</button><button type="button" class="btn" data-new-list>New list</button></div>`;
}

function pageHtml() {
  const rows = listEntries();
  if (!rows.length) return `${BACK_BTN}<h1 id="mylist-title" class="list-title" tabindex="-1">My list</h1>
    <p class="mylist-empty">Your list is empty. Tap + on a dish to add it.</p>
    <div class="mylist-actions"><button type="button" class="btn" data-list-back>Browse the menu</button></div>`;
  if (drawerView === "receipt") return receiptHtml(rows);
  return `${BACK_BTN}<h1 id="mylist-title" class="list-title" tabindex="-1">My list</h1>
    <p class="mylist-hint">Show this list to your server when you're ready to order.</p>
    <p class="mylist-summary"><strong>${rows.length}</strong> dish${rows.length === 1 ? "" : "es"} \u00b7 <strong>${listCount()}</strong> item${listCount() === 1 ? "" : "s"}</p>
    <ul class="mylist-rows">${rows.map(([it, q]) => {
      const img = (it.images && it.images[0]) || it.image;
      const thumb = img ? `<img class="ml-thumb" src="${esc(img)}" alt="" loading="lazy">` : `<span class="ml-thumb ph" aria-hidden="true">${esc(it.name.trim().charAt(0).toUpperCase())}</span>`;
      return `<li class="ml-row${it.available ? "" : " is-out"}" data-id="${esc(it.id)}">
      ${thumb}
      <div class="ml-name">${mqHtml(it.name)}
        <small>${it.category ? `${esc(it.category)} \u00b7 ` : ""}${money(it.price)} each${it.available ? "" : ' \u00b7 <em class="ml-out">sold out</em>'}</small>
      </div>
      <div class="ml-step" role="group" aria-label="Quantity of ${esc(it.name)}">
        <button type="button" data-dec aria-label="Remove one ${esc(it.name)}">${ICON_MINUS}</button><span aria-live="polite">${q}</span><button type="button" data-inc aria-label="Add one ${esc(it.name)}"${it.available ? "" : " disabled"}>${ICON_PLUS}</button>
      </div>
      <span class="ml-sub"><small>${q} \u00d7 ${money(it.price)}</small>${money(Number(it.price) * q)}</span></li>`;
    }).join("")}</ul>
    <div class="mylist-foot"><div class="mylist-count"><span>Items</span><span>${listCount()}</span></div><div class="mylist-total"><span>Total</span><strong>${money(listTotal())}</strong></div></div>
    <div class="mylist-actions"><button type="button" class="btn ghost" data-clear-list>Clear list</button><button type="button" class="btn" data-done>Done</button></div>`;
}

// Draws the page again (after + / - or a change in the list). Keeps keyboard focus on the same button where it can.
function listRender(focusHeading) {
  const a = document.activeElement, row = a && a.closest && a.closest(".ml-row");
  const keep = row && listPage.contains(a) ? [row.dataset.id, a.hasAttribute("data-inc") ? "[data-inc]" : "[data-dec]"] : null;
  const top = listPage.scrollTop;
  listPage.innerHTML = `<div class="list-box">${pageHtml()}</div>`;
  listPage.scrollTop = top;
  if (focusHeading) return listPage.querySelector(".list-title")?.focus({ preventScroll: true });
  if (keep) {
    const r = listPage.querySelector(`.ml-row[data-id="${CSS.escape(keep[0])}"]`);
    const b = r && (r.querySelector(keep[1] + ":not(:disabled)") || r.querySelector("button:not(:disabled)"));
    if (b) return b.focus({ preventScroll: true });
    if (a && a !== document.body && !listPage.contains(a)) return;
    if (listOpen) listPage.querySelector(".list-title")?.focus({ preventScroll: true });
  }
}

// Refresh every + button, the detail card button, the bottom bar badge and (if open) the list page
function listSync() {
  document.querySelectorAll(".add-btn[data-add]").forEach((b) => {
    const q = listQty(b.dataset.add), it = listItem(b.dataset.add);
    b.classList.toggle("has", q > 0);
    b.querySelector(".add-qty").textContent = q || "";
    if (it) b.setAttribute("aria-label", addLabel(it, q));
  });
  document.querySelectorAll(".sheet-listctl[data-ctl]").forEach((c) => {
    const it = listItem(c.dataset.ctl);
    if (!it) return;
    // Keep keyboard focus on the same kind of button after the controls are redrawn
    const keep = c.contains(document.activeElement) ? (document.activeElement.hasAttribute("data-sheet-dec") ? "[data-sheet-dec]" : "[data-add]") : null;
    c.innerHTML = sheetCtlHtml(it);
    if (keep) (c.querySelector(keep) || c.querySelector("button"))?.focus();
  });
  const n = listCount();
  document.querySelectorAll(".fs-list, .nav-list").forEach((b) => {
    const badge = b.querySelector(".fs-badge");
    badge.textContent = n; badge.hidden = !n;
    b.setAttribute("aria-label", n ? `My list (${n} item${n === 1 ? "" : "s"})` : "My list");
  });
  if (listOpen) listRender();
}

function listSet(id, q) {
  if (q > 0) myList[id] = q; else delete myList[id];
  listSave();
  listSync();
}

// Fades in and out with a spring (see spring.js), the same way as the start screen
function listShow(on, done) {
  if (listFade) listFade.stop();
  if (!window.Springs) { listPage.style.setProperty("--h", on ? "1" : "0"); return done && done(); }
  listFade = Springs.spring({ from: listV, to: on ? 100 : 0, response: on ? 0.4 : 0.3, damping: 1,
    onUpdate: (x) => { listV = x; listPage.style.setProperty("--h", (x / 100).toFixed(4)); }, onDone: done });
}
// The screens under the list page can't be reached by keyboard or screen reader while it is open.
// Only what is not already inert is touched, so the 3D view's own inert state is left alone.
const listBackdrop = () => [document.querySelector("header.top"), document.getElementById("fs"), document.getElementById("menu"), ...document.querySelectorAll(".home, .vw-screen")].filter(Boolean);

let cardBack = null; // { id, opener } of the dish card that was open when My list was opened from it
function openList(opts = {}) {
  if (listOpen || typeof data === "undefined" || !data) return;
  // From the dish card's "View list": close the card first, and remember it so Back brings the same card (and its row of swipeable dishes) back
  cardBack = null;
  if (typeof sheet !== "undefined" && !sheet.hidden && typeof closeSheet === "function") {
    if (sheetItem) cardBack = { id: sheetItem.id, opener: sheetOpener };
    closeSheet();
  }
  drawerView = "list";
  listOpen = true;
  listPage.hidden = false;
  listPage.scrollTop = 0;
  listRender(true);
  listInert = listBackdrop().filter((el) => !el.inert);
  listInert.forEach((el) => { el.inert = true; });
  listShow(true);
  if (!opts.noPush) history.pushState({ ml: 1 }, "", LIST_HASH);
  document.dispatchEvent(new CustomEvent("list:open"));
}
// quiet: another screen is taking over (the bottom bar sets itself), so hide at once and say nothing.
// fromPop: the browser's Back button already moved the address.
function closeList(opts = {}) {
  if (!listOpen) return;
  listOpen = false;
  listInert.forEach((el) => { el.inert = false; });
  listInert = [];
  if (!opts.fromPop && location.hash === LIST_HASH) history.replaceState(null, "", location.pathname + location.search);
  if (opts.quiet) { cardBack = null; if (listFade) listFade.stop(); listV = 0; listPage.style.setProperty("--h", "0"); listPage.hidden = true; }
  else {
    listShow(false, () => {
      if (listOpen) return;
      listPage.hidden = true;
      // Back to where we were: the dish card opens again on the same dish
      const back = cardBack; cardBack = null;
      if (back && typeof openSheet === "function" && sheet.hidden) {
        const op = back.opener && back.opener.isConnected ? back.opener : document.querySelector(`.item[data-id="${CSS.escape(back.id)}"] .item-open`);
        openSheet(back.id, op);
      }
    });
    document.dispatchEvent(new CustomEvent("list:close"));
  }
}
// The page's own Back button: step back in history when this page was opened from the app, so Back / Forward stay in line
const listBack = () => { if (history.state && history.state.ml) history.back(); else closeList(); };

document.addEventListener("click", (e) => { if (e.target.closest("[data-open-list]")) openList(); });
listPage.addEventListener("click", (e) => {
  if (e.target.closest("[data-list-back]")) return listBack();
  if (e.target.closest("[data-clear-list], [data-new-list]")) { myList = {}; drawerView = "list"; listSave(); listStatus.textContent = "List cleared."; listSync(); return listRender(true); }
  if (e.target.closest("[data-done]")) { drawerView = "receipt"; receiptTime = new Date(); listRender(true); return (listPage.scrollTop = 0); }
  if (e.target.closest("[data-back-list]")) { drawerView = "list"; listRender(true); return (listPage.scrollTop = 0); }
  const row = e.target.closest(".ml-row");
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest("[data-inc]")) listSet(id, listQty(id) + 1);
  else if (e.target.closest("[data-dec]")) listSet(id, listQty(id) - 1);
});
// Browser Back / Forward, and opening the address #list directly
window.addEventListener("popstate", () => {
  if (location.hash === LIST_HASH) openList({ noPush: true });
  else if (listOpen) closeList({ fromPop: true });
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && listOpen && (typeof sheet === "undefined" || sheet.hidden)) listBack(); });
window.MyList = { open: openList, close: closeList, isOpen: () => listOpen };

// - in the detail card stepper
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sheet-dec]");
  const c = b && b.closest(".sheet-listctl[data-ctl]");
  const it = c && listItem(c.dataset.ctl);
  if (!it) return;
  listSet(it.id, listQty(it.id) - 1);
  listStatus.textContent = `${it.name} removed. ${listQty(it.id)} in your list.`;
});

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

// Once the menu has loaded, update the badge (and drop anything the owner has since removed)
const listWait = setInterval(() => {
  if (typeof data === "undefined" || !data) return;
  clearInterval(listWait);
  let changed = false;
  Object.keys(myList).forEach((id) => { if (!listItem(id)) { delete myList[id]; changed = true; } });
  if (changed) listSave();
  listSync();
}, 50);
