// Start screen: "Full menu" or "Quick menu" (a few questions that narrow the dishes to the customer's mood).
// Questions come from quick-gen.js (saved in the admin, or made from the menu). Uses helpers from menu.js: data, esc, itemHtml, openSheet.
(() => {
  const home = document.createElement("div");
  home.className = "home";
  home.hidden = true;
  document.body.appendChild(home);

  let hist = [], cur = null;
  // Icon-only bottom nav. Labels stay available to screen readers and as tooltips.
  const SVG = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const NAV = [
    ["home", "Home", SVG('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>')],
    ["full", "Full menu", SVG('<path d="M4 4h11a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/><path d="M8 9h7"/><path d="M8 13h5"/>')],
    ["quick", "Quick menu", SVG('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>')],
  ];
  const nav = document.createElement("nav");
  nav.className = "bottomnav";
  nav.setAttribute("aria-label", "Main");
  nav.innerHTML = `<div class="bottomnav-in">${NAV.map(([k, t, icon]) => `<button type="button" class="navlink" data-nav="${k}" aria-label="${t}" title="${t}">${icon}</button>`).join("")}</div>`;
  document.body.appendChild(nav);
  // The start screen has no bottom bar; it appears once the customer picks Full menu or Quick menu
  const setNav = (on) => { nav.hidden = on === "home"; nav.querySelectorAll(".navlink").forEach((b) => (b.dataset.nav === on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"))); };
  setNav("home");
  // Questions: the ones the owner reviewed in the admin (data.quick), or ones made live from the menu
  const cfg = () => (data.quick && Array.isArray(data.quick.questions) && data.quick.questions.length ? data.quick : { stopAt: 3, questions: QuickGen.generate(data) });
  const PICK_SORT = (x, y) => (y.label === "popular") - (x.label === "popular") || (y.rating?.avg || 0) - (x.rating?.avg || 0) || x.price - y.price;

  const landing = () => {
    home.innerHTML = `<div class="home-box"><h1>${esc(data.restaurant)}</h1><p class="home-sub">How would you like to order?</p>
      <button type="button" class="home-card" data-go="full"><strong>Full menu</strong><span>Browse every dish</span></button>
      <button type="button" class="home-card" data-go="quick"><strong>Quick menu</strong><span>Answer a few questions and we'll find what suits you</span></button></div>`;
    home.hidden = false; home.scrollTop = 0; setNav("home");
  };

  function show(answers) {
    const r = QuickGen.next(data.items, cfg(), answers);
    if (r.done) return results(r.answers);
    const q = r.q;
    cur = { answers: r.answers, q, opts: r.opts, sel: new Set() };
    home.hidden = false; setNav("quick");
    home.innerHTML = `<div class="home-box"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${esc(q.text)}</h2>
      ${q.type === "multi"
        ? `<p class="home-sub">Pick all that apply, or just continue.</p>${r.opts.map((o, n) => `<button type="button" class="home-card pick" data-multi="${n}" aria-pressed="false"><strong>${esc(o.label)}</strong></button>`).join("")}<div class="home-actions"><button type="button" class="btn" data-continue>Continue</button></div>`
        : r.opts.map((o, n) => `<button type="button" class="home-card" data-opt="${n}"><strong>${esc(o.label)}</strong></button>`).join("")}</div>`;
    home.scrollTop = 0;
  }

  function results(answers) {
    const c = cfg();
    const items = QuickGen.filter(data.items, c, answers).sort(PICK_SORT);
    const noted = answers.some((a) => !a.auto && a.opts.length && (c.questions.find((q) => q.id === a.q) || {}).note);
    home.hidden = false; setNav("quick");
    home.innerHTML = `<div class="home-box"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${items.length ? "Here's what we picked for you" : "Nothing matched that"}</h2>
      <p class="home-sub">${items.length ? "Tap a dish for details." : "Try different answers or browse the full menu."}</p>
      ${items.length && noted ? '<p class="home-note">Based on the ingredients and descriptions listed. Please tell our staff about any allergies.</p>' : ""}
      <section class="cat">${items.map((i) => itemHtml(i)).join("")}</section>
      <div class="home-actions"><button type="button" class="btn" data-go="full">See full menu</button><button type="button" class="btn ghost" data-restart>Start over</button></div></div>`;
    home.scrollTop = 0;
    cur = { answers, q: null };
  }

  const answer = (ids) => { hist.push(cur.answers); show(cur.answers.concat({ q: cur.q.id, opts: ids })); };
  home.addEventListener("click", (e) => {
    if (e.target.closest(".add-btn")) return; // + is handled by list.js
    const card = e.target.closest(".item[data-id]");
    if (card) return openSheet(card.dataset.id, card.querySelector(".item-open"));
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.go === "full") { home.hidden = true; setNav("full"); window.scrollTo(0, 0); }
    else if (b.dataset.go === "quick" || b.hasAttribute("data-restart")) { hist = []; show([]); }
    else if (b.dataset.multi !== undefined) { const k = cur.opts[b.dataset.multi].id; if (cur.sel.has(k)) cur.sel.delete(k); else cur.sel.add(k); b.setAttribute("aria-pressed", String(cur.sel.has(k))); }
    else if (b.hasAttribute("data-continue")) answer([...cur.sel]);
    else if (b.dataset.opt !== undefined) answer([cur.opts[b.dataset.opt].id]);
    else if (b.hasAttribute("data-back")) { hist.length ? show(hist.pop()) : landing(); }
  });

  // The bottom nav is created once above and stays visible on every screen
  document.addEventListener("click", (e) => {
    const n = e.target.closest("[data-nav]");
    if (!n) return;
    if (n.dataset.nav === "home") landing();
    else if (n.dataset.nav === "full") { home.hidden = true; setNav("full"); window.scrollTo(0, 0); }
    else { hist = []; show([]); }
  });

  // Wait for menu.js to finish loading the menu, then show the start screen
  const t = setInterval(() => { if (typeof data !== "undefined" && data) { clearInterval(t); if (linkedItemId()) { home.hidden = true; setNav("full"); } else landing(); } }, 50);
})();
