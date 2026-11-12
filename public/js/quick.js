// Start screen: "Full menu" or "Quick menu" (a few questions that narrow the dishes to the customer's mood).
// Questions come from quick-gen.js (saved in the admin, or made from the menu). Uses helpers from menu.js: data, esc, itemHtml, openSheet.
(() => {
  const home = document.createElement("div");
  home.className = "home";
  home.hidden = true;
  document.body.appendChild(home);

  let hist = [], cur = null;
  // ---- Motion: Springs.spring from spring.js (README, "Motion and feel"), no CSS easing ----
  // A value runs 0-100 (the spring stops when it is within 0.4 of its target, so 0-1 would stop at once) and is
  // written to a CSS variable as 0-1. A new tween on the same variable takes over from where the last one got to.
  const spring = window.Springs ? Springs.spring : ({ to, onUpdate, onDone }) => { onUpdate && onUpdate(to); onDone && onDone(); return { stop() {} }; };
  const tween = (el, name, to, { delay = 0, response = 0.45, done } = {}) => {
    const t = (el._tw = el._tw || {})[name] || (el._tw[name] = { v: 100 * parseFloat(el.style.getPropertyValue(name) || (name === "--away" || name === "--p" ? 0 : 1)) });
    clearTimeout(t.timer); if (t.ctl) t.ctl.stop();
    const put = (x) => { t.v = x; el.style.setProperty(name, (x / 100).toFixed(4)); };
    const run = () => { t.ctl = spring({ from: t.v, to: to * 100, response, damping: 1, onUpdate: put, onDone: done }); };
    if (delay) t.timer = setTimeout(run, delay); else run();
  };
  const snap = (el, name, to) => { const t = (el._tw = el._tw || {})[name] || (el._tw[name] = { v: 0 }); clearTimeout(t.timer); if (t.ctl) t.ctl.stop(); t.v = to * 100; el.style.setProperty(name, String(to)); };
  // Showing the start / quick screens fades them in; leaving them fades them out before they are hidden
  const openHome = () => {
    home.classList.remove("leaving");
    if (home.hidden) { home.hidden = false; snap(home, "--h", 0); tween(home, "--h", 1, { response: 0.4 }); }
    else tween(home, "--h", 1, { response: 0.3 });
  };
  const leaveHome = () => {
    if (home.hidden || home.classList.contains("leaving")) return;
    home.classList.add("leaving");
    tween(home, "--h", 0, { response: 0.3, done: () => { home.hidden = true; home.classList.remove("leaving"); snap(home, "--h", 1); } });
  };
  // Going from the start screen to the Full menu: the dishes load in one after another (menuIntro in menu.js).
  // Tapping "Full menu" while already in it does nothing new, so only the start screen counts.
  const enterFull = () => {
    const fromHome = !home.hidden && !home.classList.contains("leaving");
    leaveHome(); setNav("full"); window.scrollTo(0, 0);
    if (fromHome && window.menuIntro) window.menuIntro();
  };
  // Content of the current screen rises into place each time a new screen is drawn
  const rise = () => { const box = home.firstElementChild; if (box) { snap(box, "--r", 0); tween(box, "--r", 1, { response: 0.5 }); } };

  // Bottom nav with an expanding label: the active tab grows into a pill and its label slides out, the others shrink to icons.
  const SVG = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const NAV = [
    ["home", "Home", SVG('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>')],
    ["full", "Full menu", SVG('<path d="M4 4h11a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z"/><path d="M8 9h7"/><path d="M8 13h5"/>')],
    ["viewer", "3D view", SVG('<path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><path d="M4 7l8 4.5L20 7M12 11.5v10"/>')],
    ["quick", "Quick menu", SVG('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>')],
  ];
  const nav = document.createElement("nav");
  nav.className = "bottomnav";
  nav.setAttribute("aria-label", "Main");
  nav.innerHTML = `<div class="bottomnav-in">${NAV.map(([k, t, icon]) => `<button type="button" class="navlink" data-nav="${k}" aria-label="${t}" title="${t}">${icon}<span class="nav-label" aria-hidden="true">${t}</span></button>`).join("")}</div>`;
  document.body.appendChild(nav);
  // The start screen has no bottom bar; it slides up once the customer picks Full menu or Quick menu
  // On the start screen the bar slides down out of sight (and back up later). The active tab opens into a pill with its label.
  let navReady = false;
  const setNav = (on) => {
    const away = on === "home", first = !navReady;
    navReady = true;
    nav.inert = away;
    if (first) snap(nav, "--away", away ? 1 : 0); else tween(nav, "--away", away ? 1 : 0, { delay: away ? 150 : 0, response: 0.5 });
    nav.querySelectorAll(".navlink").forEach((b) => {
      const active = b.dataset.nav === on;
      if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      if (first) snap(b, "--p", active ? 1 : 0); else tween(b, "--p", active ? 1 : 0, { response: 0.4 });
    });
  };
  setNav("home");
  // Questions: the ones the owner reviewed in the admin (data.quick), or ones made live from the menu
  const cfg = () => (data.quick && Array.isArray(data.quick.questions) && data.quick.questions.length ? data.quick : { stopAt: 3, questions: QuickGen.generate(data) });
  const PICK_SORT = (x, y) => (y.label === "popular") - (x.label === "popular") || (y.rating?.avg || 0) - (x.rating?.avg || 0) || x.price - y.price;

  // The 3D viewer has its own page (viewer.html). Its card sits between Full menu and Quick menu.
  const viewerCard = () => data.items.some((x) => x.model) ? `<button type="button" class="home-card" data-go="viewer"><strong>3D view</strong><span>Spin a dish around or see it on your table</span></button>` : "";

  const landing = () => {
    home.innerHTML = `<div class="home-box"><h1>${esc(data.restaurant)}</h1><p class="home-sub">How would you like to order?</p>
      <button type="button" class="home-card" data-go="full"><strong>Full menu</strong><span>Browse every dish</span></button>
      ${viewerCard()}
      <button type="button" class="home-card" data-go="quick"><strong>Quick menu</strong><span>Answer a few questions and we'll find what suits you</span></button></div>`;
    openHome(); home.scrollTop = 0; setNav("home"); rise();
  };

  function show(answers) {
    const r = QuickGen.next(data.items, cfg(), answers);
    if (r.done) return results(r.answers);
    const q = r.q;
    cur = { answers: r.answers, q, opts: r.opts, sel: new Set() };
    openHome(); setNav("quick");
    home.innerHTML = `<div class="home-box"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${esc(q.text)}</h2>
      ${q.type === "multi"
        ? `<p class="home-sub">Pick all that apply, or just continue.</p>${r.opts.map((o, n) => `<button type="button" class="home-card pick" data-multi="${n}" aria-pressed="false"><strong>${esc(o.label)}</strong></button>`).join("")}<div class="home-actions"><button type="button" class="btn" data-continue>Continue</button></div>`
        : r.opts.map((o, n) => `<button type="button" class="home-card" data-opt="${n}"><strong>${esc(o.label)}</strong></button>`).join("")}</div>`;
    home.scrollTop = 0; rise();
  }

  function results(answers) {
    const c = cfg();
    const items = QuickGen.filter(data.items, c, answers).sort(PICK_SORT);
    const noted = answers.some((a) => !a.auto && a.opts.length && (c.questions.find((q) => q.id === a.q) || {}).note);
    openHome(); setNav("quick");
    home.innerHTML = `<div class="home-box results"><button type="button" class="home-back" data-back>\u2039 Back</button>
      <h2 class="home-q">${items.length ? "Here's what we picked for you" : "Nothing matched that"}</h2>
      <p class="home-sub">${items.length ? "Tap a dish for details." : "Try different answers or browse the full menu."}</p>
      ${items.length && noted ? '<p class="home-note">Based on the ingredients and descriptions listed. Please tell our staff about any allergies.</p>' : ""}
      ${items.length ? `<div class="home-results"><div class="home-results-in"><section class="cat">${items.map((i) => itemHtml(i)).join("")}</section></div></div>` : ""}
      <div class="home-actions"><button type="button" class="btn" data-go="full">See full menu</button><button type="button" class="btn ghost" data-restart>Start over</button></div></div>`;
    home.scrollTop = 0; rise();
    // Soft blur at the bottom of the box while there are more dishes below (see .home-results.more in the CSS)
    const hr = home.querySelector(".home-results-in");
    if (hr) {
      const more = () => hr.classList.toggle("more", hr.scrollTop + hr.clientHeight < hr.scrollHeight - 2);
      hr.addEventListener("scroll", more, { passive: true });
      // Fill the room with whole dishes and cut the last one at about half way, so the list clearly goes on
      // The box takes all the room between the text above it and the buttons under it (the buttons end just above the bottom
      // bar), measured from the real layout instead of a fixed guess, so no space is wasted. Then the last dish is cut at half.
      fitResults = () => {
        const it = Array.from(hr.querySelectorAll(".item"));
        DishFit.reset(it); hr.style.maxHeight = "none";
        const box = hr.parentElement, actions = home.querySelector(".home-actions");
        const frameBelow = box.offsetHeight - (hr.offsetTop - box.offsetTop) - hr.offsetHeight; // padding + border under the list
        const actionsH = actions ? actions.offsetHeight + (parseFloat(getComputedStyle(actions).marginTop) || 0) : 0;
        const navTop = home.clientHeight - nav.offsetHeight;
        const budget = Math.floor(navTop - 16 - actionsH - hr.offsetTop - frameBelow);
        if (it.length && budget > 60) { const h = DishFit.apply(it, budget); hr.style.maxHeight = (h || budget) + "px"; } else hr.style.maxHeight = "";
        more();
      };
      requestAnimationFrame(fitResults); setTimeout(fitResults, 400);
    } else fitResults = null;
    cur = { answers, q: null };
  }

  let fitResults = null;
  window.addEventListener("resize", () => { if (fitResults) fitResults(); });
  const answer = (ids) => { hist.push(cur.answers); show(cur.answers.concat({ q: cur.q.id, opts: ids })); };
  home.addEventListener("click", (e) => {
    if (e.target.closest(".add-btn")) return; // + is handled by list.js
    const card = e.target.closest(".item[data-id]");
    if (card) return openSheet(card.dataset.id, card.querySelector(".item-open"));
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.go === "full") enterFull();
    else if (b.dataset.go === "viewer") location.href = "viewer.html";
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
    else if (n.dataset.nav === "full") enterFull();
    else if (n.dataset.nav === "viewer") location.href = "viewer.html";
    else { hist = []; show([]); }
  });

  // Wait for menu.js to finish loading the menu, then show the start screen
  const t = setInterval(() => { if (typeof data !== "undefined" && data) { clearInterval(t); const to = location.hash.slice(1); if (linkedItemId() || to === "full") { home.hidden = true; setNav("full"); } else if (to === "quick") { hist = []; show([]); } else landing(); requestAnimationFrame(() => requestAnimationFrame(() => window.bootHide && window.bootHide())); } }, 50);
})();
