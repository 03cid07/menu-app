// Start screen: "Full menu" or "Quick menu" (a few questions that narrow the dishes to the customer's mood).
// Uses helpers from menu.js: data, esc, money, itemHtml, fxKind, openSheet.
(() => {
  const home = document.createElement("div");
  home.className = "home";
  home.hidden = true;
  document.body.appendChild(home);

  let hist = [], cur = null;
  const NAV = [["home", "Home"], ["full", "Full menu"], ["quick", "Quick menu"]];
  const navHtml = (on) => `<nav class="topnav" aria-label="Main"><div class="topnav-in">${NAV.map(([k, t]) => `<button type="button" class="navlink" data-nav="${k}"${k === on ? ' aria-current="page"' : ""}>${t}</button>`).join("")}</div></nav>`;
  const kindOf = (i) => (fxKind(i) === "food" ? "food" : "drink");
  const avail = () => data.items.filter((i) => i.available);
  const cats = (items) => { const m = new Map(); items.forEach((i) => { const k = i.category.trim().toLowerCase(); if (!m.has(k)) m.set(k, i.category.trim()); }); return [...m]; };
  const match = (items, a) => items.filter((i) =>
    (!a.kind || a.kind === "any" || kindOf(i) === a.kind) &&
    (!a.temp || a.temp === "any" || fxKind(i) === a.temp) &&
    (!a.cat || a.cat === "any" || i.category.trim().toLowerCase() === a.cat) &&
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
    home.hidden = false; home.scrollTop = 0;
  };

  function show(a) {
    let q;
    while ((q = nextQuestion(a)) && "auto" in q) a = { ...a, [q.key]: q.auto };
    if (!q) return results(a);
    cur = { a, q };
    home.hidden = false;
    home.innerHTML = navHtml("quick") + `<div class="home-box"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${esc(q.text)}</h2>
      ${q.opts.map(([, label], n) => `<button type="button" class="home-card" data-opt="${n}"><strong>${esc(label)}</strong></button>`).join("")}</div>`;
    home.scrollTop = 0;
  }

  function results(a) {
    const items = match(avail(), a).sort((x, y) => (y.rating?.avg || 0) - (x.rating?.avg || 0) || x.price - y.price);
    home.hidden = false;
    home.innerHTML = navHtml("quick") + `<div class="home-box"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${items.length ? "Here's what we picked for you" : "Nothing matched that"}</h2>
      <p class="home-sub">${items.length ? "Tap a dish for details." : "Try different answers or browse the full menu."}</p>
      <section class="cat">${items.map((i) => itemHtml(i)).join("")}</section>
      <div class="home-actions"><button type="button" class="btn" data-go="full">See full menu</button><button type="button" class="btn ghost" data-restart>Start over</button></div></div>`;
    home.scrollTop = 0;
    cur = { a, q: null };
  }

  home.addEventListener("click", (e) => {
    const card = e.target.closest(".item[data-id]");
    if (card) return openSheet(card.dataset.id, card.querySelector(".item-open"));
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.go === "full") { home.hidden = true; window.scrollTo(0, 0); }
    else if (b.dataset.go === "quick" || b.hasAttribute("data-restart")) { hist = []; show({}); }
    else if (b.dataset.opt !== undefined) { hist.push(cur.a); show({ ...cur.a, [cur.q.key]: cur.q.opts[b.dataset.opt][0] }); }
    else if (b.hasAttribute("data-back")) { hist.length ? show(hist.pop()) : landing(); }
  });

  // Nav bar under the title (the same bar also sits at the top of the Quick menu screens)
  document.querySelector("header.top").insertAdjacentHTML("afterend", navHtml("full"));
  document.addEventListener("click", (e) => {
    const n = e.target.closest("[data-nav]");
    if (!n) return;
    if (n.dataset.nav === "home") landing();
    else if (n.dataset.nav === "full") { home.hidden = true; window.scrollTo(0, 0); }
    else { hist = []; show({}); }
  });

  // Wait for menu.js to finish loading the menu, then show the start screen
  const t = setInterval(() => { if (typeof data !== "undefined" && data) { clearInterval(t); landing(); } }, 50);
})();
