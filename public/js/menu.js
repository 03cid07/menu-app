let data, active = "All";
const $ = (s) => document.querySelector(s);
const money = (n) => `${data.currency}${Number(n).toLocaleString()}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Filter & sort state ----
// Categories now live inside the Filter panel, so remove the old button row if the page still has it
document.querySelector("nav.cats")?.remove();
// Make sure the filter bar has a place on the page, even if index.html is an older copy
if (!$("#fs")) { const el = document.createElement("div"); el.id = "fs"; $("#menu").before(el); }
// The settings gear sits in the header, left of the title (older index.html copies get the slot made here)
if (!$("#gear-slot") && $("#name")) {
  const row = document.createElement("div"), slot = document.createElement("div"), h = $("#name");
  row.className = "top-row"; slot.className = "fs-actions"; slot.id = "gear-slot";
  h.before(row); row.append(slot, h);
}
const view = { avail: false, ar: false, photo: false, sort: "featured", open: "", q: "", picks: null };
// view.picks is set by quick.js when the Quick menu quiz ends: { rank: Map(dishId -> position), noted: bool, count }.
// While it is set the main menu only lists those dishes (best match first), and the burger panel shows "Show full menu".
let pageCat = null; // which category page the book-style menu is on (see pager.js)
let searching = false, searchTimer = 0; // Enter-to-search loading state (see runSearchLoad)
const SORTS = { featured: "Featured", low: "Price, low to high", high: "Price, high to low", az: "Name, A to Z" };
const FILTERS = [["Availability", [["avail", "Available now"]]], ["Extras", [["ar", "3D / AR"], ["photo", "With photo"]]]];
const filterCount = () => ["avail", "ar", "photo"].filter((k) => view[k]).length + (active !== "All" ? 1 : 0);
const SEARCH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const QR_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M17 20h4v-3"/></svg>';
const BURGER = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 12 8" width="14" height="10" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Marks dishes that have a 3D model (shown on the photo in the list)
const CUBE_ICON = '<svg viewBox="24 19 72 82" width="15" height="17" aria-hidden="true" stroke="#10181d" stroke-width="3" stroke-linejoin="round"><path d="M60 24L91 42L60 60L29 42z" fill="#5fd0c4"/><path d="M29 42L60 60V96L29 78z" fill="#1b8a85"/><path d="M60 60L91 42V78L60 96z" fill="#0f5c5c"/></svg>';


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
        <div class="sheet-more">
          ${i.model ? `<button type="button" class="ar-open sheet-ar" data-id="${esc(i.id)}" data-model="${esc(i.model)}" data-name="${esc(i.name)}">View in 3D / AR</button>` : ""}
          <button type="button" class="sheet-qr" data-qr-item="${esc(i.id)}" aria-label="Show a QR code for ${esc(i.name)}">${QR_ICON}<span>QR code</span></button>
        </div>
      </div>
      <div class="sheet-rate">${rateHtml(i)}</div>
    </div>`;
}

const LABELS = { popular: "Popular", new: "New", hot: "Hot" };
const labelHtml = (i) => (LABELS[i.label] ? `<span class="hl hl-${i.label}">${LABELS[i.label]}</span>` : "");

// List row: photo, name and price. Everything else lives in the detail card (openSheet).
const itemHtml = (i) => `
      <article class="item ${i.available ? "" : "sold-out"}" data-id="${esc(i.id)}">
        <span class="thumb-wrap">
          ${i.image ? `<img class="thumb" src="${esc(i.image)}" alt="" loading="lazy">` : `<div class="thumb ph" aria-hidden="true">${esc(i.name.trim().charAt(0).toUpperCase())}</div>`}
          ${i.model ? `<span class="has-3d" role="img" aria-label="Has a 3D model" title="3D model">${CUBE_ICON}</span>` : ""}
        </span>
        <div class="info">
          <h3><button type="button" class="item-open" aria-haspopup="dialog">${mqHtml(i.name)}</button>${labelHtml(i)}${i.available ? "" : '<span class="badge">Sold out</span>'}</h3>
        </div>
        <span class="row-price">${money(i.price)}</span>
        ${addBtnHtml(i)}
        <span class="chevron" aria-hidden="true">\u203a</span>
      </article>`;

function visibleItems() {
  const q = view.q.trim().toLowerCase();
  const list = data.items.filter((i) => (active === "All" || i.category === active)
    && (!q || [i.name, i.description, i.ingredients, i.category].some((t) => String(t || "").toLowerCase().includes(q)))
    && (!view.picks || view.picks.rank.has(i.id))
    && (!view.avail || i.available) && (!view.ar || i.model) && (!view.photo || i.image));
  if (view.picks && view.sort === "featured") list.sort((x, y) => view.picks.rank.get(x.id) - view.picks.rank.get(y.id)); // best match first
  if (view.sort === "low") list.sort((x, y) => x.price - y.price);
  if (view.sort === "high") list.sort((x, y) => y.price - x.price);
  if (view.sort === "az") list.sort((x, y) => x.name.localeCompare(y.name));
  return list;
}

const GEAR_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const SUN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const AUTO_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>';
const THEMES = [["auto", "Auto", AUTO_ICON], ["light", "Light", SUN_ICON], ["dark", "Dark", MOON_ICON]];
const LIST_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h11M4 12h8M4 18h6M17 14v8M13 18h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let settingsOpen = false;
function themeHint(pref, now) { return pref === "auto" ? `Auto: light from 6 AM to 6 PM, dark at night. Now using ${now}.` : `Using ${now} mode.`; }
// Open/close the settings menu and refresh the theme buttons without rebuilding the whole bar (a rebuild made it flash)
function syncSettings(open) {
  if (typeof open === "boolean") settingsOpen = open;
  const root = $("#gear-slot");
  if (!root) return;
  const gear = root.querySelector("[data-open-settings]"), menu = root.querySelector("#fs-settings");
  if (gear) gear.setAttribute("aria-expanded", String(settingsOpen));
  if (menu) menu.hidden = !settingsOpen;
  const pref = (window.menuTheme && window.menuTheme.pref()) || "auto", now = (window.menuTheme && window.menuTheme.eff()) || "dark";
  root.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === pref)));
  const hint = root.querySelector(".fs-set-hint");
  if (hint) hint.textContent = themeHint(pref, now);
}
function renderBar() {
  const n = filterCount();
  const lc = typeof listCount === "function" ? listCount() : 0;
  const focused = document.activeElement && document.activeElement.closest("#fs") ? document.activeElement : null;
  const key = focused && (focused.id === "fs-q" ? "#fs-q" : focused.dataset.openSettings !== undefined ? "[data-open-settings]" : focused.dataset.open ? `[data-open="${focused.dataset.open}"]` : focused.dataset.f ? `[data-f="${focused.dataset.f}"]` : focused.dataset.c ? `[data-c="${focused.dataset.c.replace(/"/g, "\\\"")}"]` : focused.name === "sort" ? `input[value="${focused.value}"]` : "");
  const themePref = (window.menuTheme && window.menuTheme.pref()) || "auto", themeNow = (window.menuTheme && window.menuTheme.eff()) || "dark";
  const m = view.open === "menu", pk = view.picks, dot = n > 0 || view.sort !== "featured" || !!pk;
  $("#fs").innerHTML = `<div class="fs-row-search"><div class="fs-bar">
      <button type="button" class="fs-icon fs-burger${dot ? " has-active" : ""}" data-open="menu" aria-expanded="${m}" aria-controls="fs-menu" aria-label="Filter and sort${n ? ` (${n} filter${n === 1 ? "" : "s"} on)` : ""}${pk ? ", showing your Quick menu picks" : ""}">${BURGER}</button>
      <input type="search" id="fs-q" class="fs-q" placeholder="Search dishes…" aria-label="Search dishes" autocomplete="off" value="${esc(view.q)}">
      <span class="fs-search-ic">${SEARCH}</span>
    </div>
    <button type="button" class="fs-icon fs-list" data-open-list aria-label="My list${lc ? ` (${lc} item${lc === 1 ? "" : "s"})` : ""}">${LIST_ICON}<span class="fs-list-t">My list</span><span class="fs-badge"${lc ? "" : " hidden"}>${lc}</span></button></div>
    <div class="fs-panel" id="fs-menu" ${m ? "" : "hidden"}>
      ${pk ? `<div class="fs-picks"><div class="fs-picks-info"><strong>Picked for you</strong><span>${pk.count} dish${pk.count === 1 ? "" : "es"} from your answers</span></div><button type="button" class="btn fs-picks-btn" data-full-menu>Show full menu</button></div>${pk.noted ? '<p class="fs-picks-note">Based on the ingredients and descriptions listed. Please tell our staff about any allergies.</p>' : ""}` : ""}
      <div class="fs-row"><span class="fs-label">Category</span>${["All", ...data.categories].map((c) => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${c === active}">${esc(c)}</button>`).join("")}</div>
      ${FILTERS.map(([label, chips]) => `<div class="fs-row"><span class="fs-label">${label}</span>${chips.map(([k, t]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${view[k]}">${t}</button>`).join("")}</div>`).join("")}
      ${n ? '<button type="button" class="linkbtn" data-clear>Clear all</button>' : ""}
      <div class="fs-sort" role="radiogroup" aria-label="Sort by"><span class="fs-label">Sort by</span>
        ${Object.entries(SORTS).map(([k, t]) => `<label class="radio"><input type="radio" name="sort" value="${k}" ${view.sort === k ? "checked" : ""}><span>${t}</span></label>`).join("")}
      </div>
    </div>`;
  if (key) { const el = $("#fs").querySelector(key); if (el) el.focus(); }
  if (searching) $("#fs .fs-bar")?.classList.add("is-searching");
  if (window.fsFloatUpdate) window.fsFloatUpdate();
}

// The gear is drawn once into the header (it does not float or scroll with the search bar)
function renderGear() {
  const slot = $("#gear-slot");
  if (!slot || slot.firstElementChild) return;
  const themePref = (window.menuTheme && window.menuTheme.pref()) || "auto", themeNow = (window.menuTheme && window.menuTheme.eff()) || "dark";
  slot.innerHTML = `<button type="button" class="fs-icon fs-gear" data-open-settings aria-haspopup="true" aria-expanded="${settingsOpen}" aria-controls="fs-settings" aria-label="Settings" title="Settings">${GEAR_ICON}</button>
        <div class="fs-settings" id="fs-settings" role="menu" ${settingsOpen ? "" : "hidden"}>
          <div class="fs-set-label" id="fs-theme-l">Theme</div>
          <div class="fs-seg" role="group" aria-labelledby="fs-theme-l">${THEMES.map(([k, t, ic]) => `<button type="button" class="fs-seg-b" data-theme-set="${k}" aria-pressed="${themePref === k}">${ic}<span>${t}</span></button>`).join("")}</div>
          <p class="fs-set-hint">${themeHint(themePref, themeNow)}</p>
          <div class="fs-set-sep"></div>
          <button type="button" class="fs-set-item" role="menuitem" data-open-qr>${QR_ICON}<span>QR code</span></button>
        </div>`;
}

function render() {
  $("#name").textContent = data.restaurant;
  document.title = `${data.restaurant} menu`;
  cancelSearchLoad();
  renderGear();
  renderBar();
  renderList();
}

// ---- Entering the Full menu: the rows load one after another ----
// Each row on screen first shows a shimmering placeholder inside its card, then fills in with its dish, top to bottom.
// Only quick.js calls this, when the person goes from the start screen to the Full menu (not for page turns or searches).
// menuIntro({ skeleton: false }) is for arriving straight on the Full menu: the page already showed its own skeleton rows while loading,
// so a second skeleton would be a repeat. The dishes just fade and rise in, one after another.
const INTRO_FIRST = 260, INTRO_STEP = 130, INTRO_STEP_FAST = 70, INTRO_ROWS = 12, INTRO_RISE = 14;
let introJobs = [];
function cleanIntroRow(row) {
  row.classList.remove("sk-hold", "sk-in");
  row.style.transform = "";
  row.style.removeProperty("--p");
  row.querySelector(":scope > .sk-ov")?.remove();
}
function cancelIntro() {
  for (const j of introJobs) { clearTimeout(j.timer); if (j.ctl) j.ctl.stop(); cleanIntroRow(j.row); }
  introJobs = [];
}
function menuIntro(opts) {
  cancelIntro();
  const withSk = !(opts && opts.skeleton === false);
  if (!window.Springs || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rows = Array.from(document.querySelectorAll("#menu .item"))
    .filter((n) => !n.closest(".pgr-off") && n.getBoundingClientRect().top < innerHeight).slice(0, INTRO_ROWS);
  rows.forEach((row, k) => {
    if (withSk) {
      const th = row.querySelector(".thumb"), w = (th && th.offsetWidth) || 56, h = (th && th.offsetHeight) || 56;
      row.insertAdjacentHTML("beforeend", `<div class="sk-ov" aria-hidden="true"><div class="thumb" style="width:${w}px;height:${h}px"></div><div class="sk-body"><span class="sk-line" style="width:${SK_NAME_W[k % SK_NAME_W.length]}%"></span></div><span class="sk-price"></span></div>`);
      row.classList.add("sk-hold");
    } else { // no skeleton: start see-through and a few pixels low, the spring below brings the row in
      row.classList.add("sk-in");
      row.style.setProperty("--p", "0");
      row.style.transform = `translate3d(0, ${INTRO_RISE}px, 0)`;
    }
    const job = { row, timer: 0, ctl: null };
    introJobs.push(job);
    job.timer = setTimeout(() => {
      if (withSk) {
        row.querySelector(":scope > .sk-ov")?.remove();
        row.classList.remove("sk-hold");
        row.classList.add("sk-in");
      }
      // the row's content fades in while the row rises a few pixels into place (a spring, like the rest of the app)
      job.ctl = Springs.spring({
        from: 0, to: 100, response: 0.5, damping: 0.9,
        onUpdate: (x) => { row.style.setProperty("--p", Math.max(0, Math.min(1, x / 100)).toFixed(3)); row.style.transform = `translate3d(0, ${((1 - x / 100) * INTRO_RISE).toFixed(2)}px, 0)`; },
        onDone: () => { cleanIntroRow(row); introJobs = introJobs.filter((j) => j !== job); },
      });
    }, withSk ? INTRO_FIRST + k * INTRO_STEP : k * INTRO_STEP_FAST);
  });
}
window.menuIntro = menuIntro;

function renderList() {
  cancelIntro();
  if (window.Pager) Pager.clear();
  const items = visibleItems();
  let html;
  if (!data.items.length) html = '<p class="empty">No items yet. Add some on the admin page.</p>';
  else if (!items.length) html = `<p class="empty">No ${view.picks ? "picks" : "dishes"} match these filters. <button type="button" class="linkbtn" data-clear>Clear filters</button></p>`;
  else {
    // Every view is split by category: one page per category that has a match. A sort (price, A to Z) orders the dishes
    // inside each category, it does not mix the categories together. Only plain browsing remembers which page you were on.
    const groups = data.categories.map((c) => ({ c, inCat: items.filter((i) => i.category === c) })).filter((g) => g.inCat.length);
    if (window.Pager) {
      const browse = active === "All" && !view.q.trim();
      Pager.show($("#menu"), { pages: groups.map((g) => ({ key: g.c, title: g.c, html: g.inCat.map((i) => itemHtml(i)).join("") })), current: pageCat, onChange: browse ? (k) => { pageCat = k; } : null });
      return;
    }
    html = groups.map((g) => `<section class="cat"><h2>${esc(g.c)}</h2>${g.inCat.map((i) => itemHtml(i)).join("")}</section>`).join("");
  }
  $("#menu").innerHTML = html;
}

$("#gear-slot")?.addEventListener("click", (e) => {
  const th = e.target.closest("[data-theme-set]");
  if (th) { window.menuTheme && window.menuTheme.set(th.dataset.themeSet); return syncSettings(); }
  if (e.target.closest("[data-open-settings]")) return syncSettings(!settingsOpen);
  if (e.target.closest("[data-open-qr]")) return syncSettings(false);
});
$("#fs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-open],[data-f],[data-c]");
  if (!t) return;
  if (t.dataset.c !== undefined) { if (t.dataset.c === "All" && active !== "All") pageCat = active; active = t.dataset.c; } // "All" lands back on the category you were viewing
  else if (t.dataset.open) view.open = view.open === t.dataset.open ? "" : t.dataset.open;
  else view[t.dataset.f] = !view[t.dataset.f];
  render();
});
document.addEventListener("click", (e) => {
  if (settingsOpen && !e.composedPath().some((n) => n.classList && n.classList.contains("fs-actions"))) syncSettings(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && settingsOpen) { syncSettings(false); document.querySelector("#gear-slot [data-open-settings]")?.focus(); }
});
// Typing only refreshes the dish list, so the search box keeps focus
$("#fs").addEventListener("input", (e) => {
  if (e.target.id !== "fs-q") return;
  view.q = e.target.value;
  // Typing shows the loading skeleton too, then the results once you pause. An empty box goes straight back to the full menu.
  if (!view.q.trim()) { cancelSearchLoad(); renderList(); return; }
  runSearchLoad(SEARCH_TYPE_MS);
});

// ---- Search loading: while you type (or press Enter) the icon spins, skeleton rows shimmer, results fade in ----
const SEARCH_LOAD_MS = 650;      // after pressing Enter
const SEARCH_TYPE_MS = 450;      // after the last keystroke
// One skeleton row, shaped like a real dish row: photo, name and price (menuIntro and index.html use the same shapes).
const SK_NAME_W = [62, 48, 70, 54, 66, 44]; // name widths, varied so the rows don't look copy-pasted
const skRowHtml = (k = 0) => `<article class="item sk" aria-hidden="true"><span class="thumb-wrap"><div class="thumb"></div></span><div class="info"><span class="sk-line" style="width:${SK_NAME_W[k % SK_NAME_W.length]}%"></span></div><span class="sk-price"></span></article>`;
function cancelSearchLoad() {
  if (!searching) return;
  clearTimeout(searchTimer);
  searching = false;
  $("#fs .fs-bar")?.classList.remove("is-searching");
  $("#menu").removeAttribute("aria-busy");
}
function runSearchLoad(ms = SEARCH_LOAD_MS) {
  const menu = $("#menu");
  if (searching) { // already showing the skeleton: just push the results back, so the shimmer doesn't restart on every key
    clearTimeout(searchTimer);
  } else {
    searching = true;
    $("#fs .fs-bar")?.classList.add("is-searching");
    menu.setAttribute("aria-busy", "true");
    menu.classList.remove("sk-results-in");
    // the bar is pinned, so you can search from far down the page: bring the list top into view so the skeleton is seen
    const barH = $("#fs").offsetHeight, top = menu.getBoundingClientRect().top + window.scrollY - barH - 8;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    menu.innerHTML = `<section class="cat sk-cat"><div class="pgr-box"><div class="pgr-list">${Array.from({ length: 3 }, (_, k) => skRowHtml(k)).join("")}</div></div></section>`;
  }
  searchTimer = setTimeout(() => {
    cancelSearchLoad();
    renderList();
    menu.classList.add("sk-results-in");
    menu.addEventListener("animationend", () => menu.classList.remove("sk-results-in"), { once: true });
  }, ms);
}
$("#fs").addEventListener("keydown", (e) => {
  if (e.target.id !== "fs-q" || e.key !== "Enter" || e.isComposing) return;
  e.preventDefault();
  if (!view.q.trim()) return;
  runSearchLoad(SEARCH_LOAD_MS);
  e.target.blur(); // closes the phone keyboard so the results are visible
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
// The card slides in and out with springs and follows a finger (see spring.js)
const sheetCard = Springs.bottomCard({ root: sheet, box: sheetBox, finish: finishSheet });
function openSheet(id, opener) {
  sheetItem = data.items.find((x) => x.id === id);
  if (!sheetItem) return;
  sheetOpener = opener || null;
  sheetBox.innerHTML = sheetHtml(sheetItem);
  sheetBox.scrollTop = 0;
  sheet.hidden = false;
  sheetCard.open();
  document.body.classList.add("no-scroll");
  sheetBox.querySelector(".sheet-close").focus({ preventScroll: true });
}
function closeSheet() {
  if (sheet.hidden || sheetCard.isClosing()) return;
  sheetCard.dismiss();
}
function finishSheet() {
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
  if (!qrBox.hidden) closeQr(); else closeSheet();
});

// ---- QR codes: scan with a phone to open this menu, or one dish (the link is ?item=ID) ----
const LOCAL_RE = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/;
let qrBasePromise = null;
const qrBase = () => qrBasePromise || (qrBasePromise = fetch("api/qr-url")
  .then((r) => { if (!r.ok) throw new Error("no api"); return r.json(); }).then((j) => j.url)
  .catch(() => location.origin + location.pathname.replace(/[^/]*$/, "")));
const qrBox = document.createElement("div");
qrBox.className = "qrm";
qrBox.hidden = true;
qrBox.innerHTML = `<div class="qrm-box" role="dialog" aria-modal="true" aria-labelledby="qrm-title">
  <button type="button" class="sheet-close qrm-x" aria-label="Close">\u00d7</button>
  <h2 id="qrm-title"></h2><p class="qrm-sub"></p>
  <img class="qrm-img" width="240" height="240" alt="">
  <p class="qrm-note" role="status"></p><p class="qrm-url"></p></div>`;
document.body.appendChild(qrBox);
let qrOpener = null;
async function openQr(title, sub, id, opener) {
  const u = new URL(await qrBase());
  u.searchParams.delete("item");
  if (id) u.searchParams.set("item", id);
  const img = qrBox.querySelector(".qrm-img"), note = qrBox.querySelector(".qrm-note");
  qrBox.querySelector("#qrm-title").textContent = title;
  qrBox.querySelector(".qrm-sub").textContent = sub;
  qrBox.querySelector(".qrm-url").textContent = u.href.replace(/^https?:\/\//, "");
  note.textContent = "";
  img.alt = `QR code: ${title}`;
  img.onerror = () => { img.removeAttribute("src"); note.textContent = "Could not make the QR code. Reload the page and try again."; };
  // Draw the QR in the browser so it also works on GitHub Pages (no server there); fall back to the server image.
  if (window.QRCode) {
    window.QRCode.toString(u.href, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }, (err, svg) => {
      if (err) return img.onerror();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  } else img.src = `qr.svg?url=${encodeURIComponent(u.href)}`;
  if (LOCAL_RE.test(u.hostname)) note.textContent = "This link only works on the computer running the menu. Use the public GitHub Pages link instead.";
  qrOpener = opener || null;
  qrBox.hidden = false;
  qrBox.querySelector(".qrm-x").focus();
}
function closeQr() { if (qrBox.hidden) return; qrBox.hidden = true; qrOpener?.focus?.(); qrOpener = null; }
qrBox.addEventListener("click", (e) => { if (e.target === qrBox || e.target.closest(".qrm-x")) closeQr(); });
document.addEventListener("click", (e) => {
  const top = e.target.closest("[data-open-qr]");
  if (top) return openQr(data.restaurant, "Scan with your phone to open this menu", null, top);
  const b = e.target.closest(".sheet-qr[data-qr-item]");
  const it = b && data.items.find((x) => x.id === b.dataset.qrItem);
  if (it) openQr(it.name, "Scan with your phone to open this dish", it.id, b);
});
// A QR on a table or a sign can point straight at one dish
function linkedItemId() {
  const id = new URLSearchParams(location.search).get("item");
  return id && typeof data !== "undefined" && data && data.items.some((x) => x.id === id) ? id : null;
}
function openLinkedItem() { const id = linkedItemId(); if (id) openSheet(id); }

// Load the menu: the local server first, then the published menu.json (retried, so a weak connection doesn't fail it)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchMenu() {
  try { const r = await fetch("api/menu"); if (r.ok) return await r.json(); } catch (e) { /* no local server: this is the published site */ }
  staticMode = true;
  let err;
  for (let n = 0; n < 3; n++) {
    try {
      const r = await fetch("menu.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("menu.json answered " + r.status);
      return await r.json();
    } catch (e) { err = e; await sleep(700 * (n + 1)); }
  }
  throw err;
}
fetchMenu()
  .then((d) => { data = d; render(); openLinkedItem(); })
  .catch((e) => {
    console.error("Menu failed to load:", e);
    $("#menu").innerHTML = `<p class="empty">Could not load the menu. <button type="button" class="linkbtn" data-retry>Try again</button><br><small>${esc(String((e && e.message) || e))}</small></p>`;
    window.bootHide && window.bootHide();
  });
$("#menu").addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) location.reload(); });

// Photo skeletons: each photo shimmers until it has loaded (or failed), then fades in
const imgDone = (img) => img.classList.add("ld");
document.addEventListener("load", (e) => { if (e.target.tagName === "IMG") imgDone(e.target); }, true);
document.addEventListener("error", (e) => { if (e.target.tagName === "IMG") imgDone(e.target); }, true);
const sweepImgs = (root) => root.querySelectorAll && root.querySelectorAll("img:not(.ld)").forEach((img) => { if (img.complete) imgDone(img); });
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.tagName === "IMG" && n.complete) imgDone(n); else sweepImgs(n); } }))).observe(document.body, { childList: true, subtree: true });

// ---- Food / hot drink / cold drink sorting (the Quick menu uses this) ----
// The rules live in quick-gen.js so the Quick menu and this file always agree.
function fxKind(it) { return typeof QuickGen !== "undefined" ? QuickGen.tempOf(it) : "food"; }
// ---- Effects: the customer picks one in the 3D viewer. It is added to the model on their phone (js/glb-tools.js), so the admin never has to place any. ----

// ---- "View in 3D / AR" on a dish card: opens the 3D view screen (js/viewer.js) with this dish ----
// (The old popup viewer that lived here was no longer reachable since the 3D view got its own screen, so it was removed.)
document.addEventListener("click", (e) => {
  const b = e.target.closest(".ar-open");
  if (!b || !window.Viewer) return;
  closeSheet();
  Viewer.openDish(b.dataset.id);
});

// The search bar + My list row is sticky (CSS). This only adds a class while it is pinned so it can look a little
// more solid and lift off the dishes scrolling underneath.
(() => {
  let was = false;
  const update = () => {
    const fs = document.getElementById("fs");
    if (!fs || !fs.getClientRects().length) return;
    const stuck = fs.getBoundingClientRect().top <= (parseFloat(getComputedStyle(fs).top) || 0) + 0.5;
    if (stuck !== was) { was = stuck; document.body.classList.toggle("fs-stuck", stuck); }
  };
  window.fsFloatUpdate = update;
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

// When Auto flips the theme (6 AM / 6 PM), refresh the hint text in the settings menu
window.menuThemeChanged = () => syncSettings();
