// Start screen: "Full menu" or "Quick menu" (a few questions that narrow the dishes to the customer's mood).
// Uses helpers from menu.js: data, esc, money, itemHtml, fxKind, openSheet.
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
  nav.innerHTML = `<div class="bottomnav-in">${NAV.map(([k, t, icon]) => `<button type="button" class="navlink" data-nav="${k}" aria-label="${t}" title="${t}">${icon}</button>`).join("")}<button type="button" class="navlink nav-list" data-open-list aria-label="My list" title="My list">${SVG('<path d="M4 6h11M4 12h8M4 18h6M17 14v8M13 18h8"/>')}<span class="fs-badge" hidden>0</span></button></div>`;
  document.body.appendChild(nav);
  const setNav = (on) => nav.querySelectorAll(".navlink").forEach((b) => (b.dataset.nav === on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  setNav("home");
  const kindOf = (i) => (fxKind(i) === "food" ? "food" : "drink");
  const avail = () => data.items.filter((i) => i.available);
  const cats = (items) => { const m = new Map(); items.forEach((i) => { const k = i.category.trim().toLowerCase(); if (!m.has(k)) m.set(k, i.category.trim()); }); return [...m]; };
  // Things a customer may want to skip. Worked out from each dish's name, description and ingredients.
  const AVOID = [
    ["pork", "Pork", /\b(pork|bacon|ham|lechon|chorizo|longganisa|sausage|bagnet|sisig)\b/i],
    ["dairy", "Dairy (milk, cheese, cream)", /\b(milk|cheese|cream|butter|yogh?urt|whey|ice cream|custard)\b/i],
    ["seafood", "Seafood", /\b(fish|shrimps?|prawns?|crabs?|squid|calamari|seafood|oysters?|mussels?|clams?|tuna|salmon|bagoong|anchov\w*|lobster|scallops?)\b/i],
    ["nuts", "Nuts", /\b(nuts?|peanuts?|almonds?|cashews?|walnuts?|pistachios?|pecans?|hazelnuts?|pili)\b/i],
    ["egg", "Eggs", /\b(eggs?|mayo|mayonnaise|meringue|custard)\b/i],
    ["gluten", "Gluten (wheat, bread)", /\b(wheat|flour|bread|noodles?|pasta|cake|pancakes?|dough|breadcrumbs?|crust)\b/i],
    ["spicy", "Spicy food", /\b(chil(?:i|li|ies|lies)|spicy|siling|sili|jalape[n\u00f1]o|sriracha|hot sauce)\b/i],
  ];
  const AVOID_RE = Object.fromEntries(AVOID.map(([k, , re]) => [k, re]));
  // "coconut milk" or "soy milk" is not dairy, so those words are ignored for the check
  const hits = (i, re) => re.test([i.name, i.description, i.ingredients].join(" ").replace(/\b(coconut|almond|soy|oat|rice)\s+(milk|cream)\b/gi, " "));
  const PICKS = [["popular", "Crowd favorites"], ["new", "Something new"], ["hot", "Trending right now"]];
  const match = (items, a) => items.filter((i) =>
    (!a.kind || a.kind === "any" || kindOf(i) === a.kind) &&
    (!a.temp || a.temp === "any" || fxKind(i) === a.temp) &&
    (!a.cat || a.cat === "any" || i.category.trim().toLowerCase() === a.cat) &&
    (!a.pick || a.pick === "any" || i.label === a.pick) &&
    !(a.avoid || []).some((k) => hits(i, AVOID_RE[k])) &&
    i.price <= (a.budget ?? Infinity));

  // Next question for these answers. A question that can't narrow anything is skipped ("auto").
  function nextQuestion(a) {
    const pool = avail();
    if (!a.kind) {
      return new Set(pool.map(kindOf)).size < 2 ? { key: "kind", auto: "any" }
        : { key: "kind", text: "What are you in the mood for?", opts: [["food", "Something to eat"], ["drink", "Something to drink"], ["any", "Surprise me"]] };
    }
    if (a.kind === "drink" && !a.temp) {
      return new Set(match(pool, a).map(fxKind)).size < 2 ? { key: "temp", auto: "any" }
        : { key: "temp", text: "Hot or cold?", opts: [["hot", "Hot"], ["cold", "Cold"], ["any", "Either"]] };
    }
    if (a.kind === "food" && !a.cat) {
      const c = cats(match(pool, a));
      return c.length < 2 ? { key: "cat", auto: "any" } : { key: "cat", text: "Which kind of dish?", opts: [...c, ["any", "Anything"]] };
    }
    if (a.avoid === undefined) {
      const cand = match(pool, a);
      const opts = AVOID.filter(([, , re]) => { const n = cand.filter((i) => hits(i, re)).length; return n > 0 && n < cand.length; }).map(([k, label]) => [k, label]);
      return opts.length ? { key: "avoid", multi: true, text: "Anything you'd rather avoid?", opts } : { key: "avoid", auto: [] };
    }
    if (a.pick === undefined) {
      const cand = match(pool, a);
      const opts = PICKS.filter(([k]) => { const n = cand.filter((i) => i.label === k).length; return n > 0 && n < cand.length; });
      return opts.length ? { key: "pick", text: "Popular or something new?", opts: [...opts, ["any", "Anything"]] } : { key: "pick", auto: "any" };
    }
    if (a.budget === undefined) {
      const p = match(pool, a).map((i) => i.price).sort((x, y) => x - y);
      const cap = Math.ceil(p[Math.floor((p.length - 1) / 2)] / 10) * 10;
      return p.length < 3 || cap >= p[p.length - 1] ? { key: "budget", auto: Infinity }
        : { key: "budget", text: "What's your budget per dish?", opts: [[cap, `Up to ${money(cap)}`], [Infinity, "Any price"]] };
    }
    return null;
  }

  const landing = () => {
    home.innerHTML = `<div class="home-box"><h1>${esc(data.restaurant)}</h1><p class="home-sub">How would you like to order?</p>
      <button type="button" class="home-card" data-go="full"><strong>Full menu</strong><span>Browse every dish</span></button>
      <button type="button" class="home-card" data-go="quick"><strong>Quick menu</strong><span>Answer a few questions and we'll find what suits you</span></button></div>`;
    home.hidden = false; home.scrollTop = 0; setNav("home");
  };

  function show(a) {
    let q;
    while ((q = nextQuestion(a)) && "auto" in q) a = { ...a, [q.key]: q.auto };
    if (!q) return results(a);
    cur = { a, q, sel: new Set() };
    home.hidden = false; setNav("quick");
    home.innerHTML = `<div class="home-box"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${esc(q.text)}</h2>
      ${q.multi
        ? `<p class="home-sub">Pick all that apply, or just continue.</p>${q.opts.map(([, label], n) => `<button type="button" class="home-card pick" data-multi="${n}" aria-pressed="false"><strong>${esc(label)}</strong></button>`).join("")}<div class="home-actions"><button type="button" class="btn" data-continue>Continue</button></div>`
        : q.opts.map(([, label], n) => `<button type="button" class="home-card" data-opt="${n}"><strong>${esc(label)}</strong></button>`).join("")}</div>`;
    home.scrollTop = 0;
  }

  function results(a) {
    const items = match(avail(), a).sort((x, y) => (y.label === "popular") - (x.label === "popular") || (y.rating?.avg || 0) - (x.rating?.avg || 0) || x.price - y.price);
    home.hidden = false; setNav("quick");
    home.innerHTML = `<div class="home-box"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${items.length ? "Here's what we picked for you" : "Nothing matched that"}</h2>
      <p class="home-sub">${items.length ? "Tap a dish for details." : "Try different answers or browse the full menu."}</p>
      ${items.length && a.avoid && a.avoid.length ? '<p class="home-note">Based on the ingredients and descriptions listed. Please tell our staff about any allergies.</p>' : ""}
      <section class="cat">${items.map((i) => itemHtml(i)).join("")}</section>
      <div class="home-actions"><button type="button" class="btn" data-go="full">See full menu</button><button type="button" class="btn ghost" data-restart>Start over</button></div></div>`;
    home.scrollTop = 0;
    cur = { a, q: null };
  }

  home.addEventListener("click", (e) => {
    if (e.target.closest(".add-btn")) return; // + is handled by list.js
    const card = e.target.closest(".item[data-id]");
    if (card) return openSheet(card.dataset.id, card.querySelector(".item-open"));
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.go === "full") { home.hidden = true; setNav("full"); window.scrollTo(0, 0); }
    else if (b.dataset.go === "quick" || b.hasAttribute("data-restart")) { hist = []; show({}); }
    else if (b.dataset.multi !== undefined) { const k = cur.q.opts[b.dataset.multi][0]; if (cur.sel.has(k)) cur.sel.delete(k); else cur.sel.add(k); b.setAttribute("aria-pressed", String(cur.sel.has(k))); }
    else if (b.hasAttribute("data-continue")) { hist.push(cur.a); show({ ...cur.a, [cur.q.key]: [...cur.sel] }); }
    else if (b.dataset.opt !== undefined) { hist.push(cur.a); show({ ...cur.a, [cur.q.key]: cur.q.opts[b.dataset.opt][0] }); }
    else if (b.hasAttribute("data-back")) { hist.length ? show(hist.pop()) : landing(); }
  });

  // The bottom nav is created once above and stays visible on every screen
  document.addEventListener("click", (e) => {
    const n = e.target.closest("[data-nav]");
    if (!n) return;
    if (n.dataset.nav === "home") landing();
    else if (n.dataset.nav === "full") { home.hidden = true; setNav("full"); window.scrollTo(0, 0); }
    else { hist = []; show({}); }
  });

  // Wait for menu.js to finish loading the menu, then show the start screen
  const t = setInterval(() => { if (typeof data !== "undefined" && data) { clearInterval(t); if (linkedItemId()) { home.hidden = true; setNav("full"); } else landing(); } }, 50);
})();
