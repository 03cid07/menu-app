// Quick menu brain, shared by the customer page, the admin page and server.js.
//  - generate(menu): builds a list of questions from what is actually on the menu
//  - next / filter:  walks a customer through the questions and narrows the dishes
//  - sanitize:       checks questions edited in the admin before they are saved
// A question option never points at dish ids. It holds a small "match" rule (type, hot/cold,
// category, tag, max price, words to look for), so saved questions keep working when dishes change.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QuickGen = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- Dish helpers (same rules as fxKind in menu.js) ----
  const DRINK_RE = /drink|beverage|juice|coffee|tea\b|shake|smoothie|soda|cocktail|beer|wine|\bwaters?\b|\bmilk\b|latte|espresso|frappe|lemonade/i;
  const COLD_RE = /iced|ice\b|cold|juice|shake|smoothie|soda|lemonade|frappe|cooler|beer|\bwater\b/i;
  // A dish is a drink when its category sounds like a drink, OR its name/description says "drink" or "beverage".
  // "Comes with a drink" does not count (that is a meal), so those words only count when the dish itself is the drink.
  const SAYS_DRINK_RE = /\b(drinks?|beverages?)\b/i;
  const WITH_DRINK_RE = /\b(with|plus|includes?|including|free|and|\+)\s+(a\s+|an\s+|your\s+|any\s+|one\s+|1\s+|choice of\s+)?(drinks?|beverages?)\b/i;
  const HOT_RE = /\b(hot|warm|steaming)\b/i;
  const COLD_WORDS_RE = /\b(cold|iced|ice cold|ice-cold|chilled|frozen)\b/i;
  const kindOf = (i) => {
    if (DRINK_RE.test(i.category || "")) return "drink";
    const t = (i.name || "") + " " + (i.description || "");
    return SAYS_DRINK_RE.test(t) && !WITH_DRINK_RE.test(t) ? "drink" : "food";
  };
  // Hot or cold: the name decides first, then the description ("cold water drink"), otherwise hot.
  const tempOf = (i) => {
    if (kindOf(i) === "food") return "food";
    const n = i.name || "", d = i.description || "";
    if (HOT_RE.test(n)) return "hot";
    if (COLD_RE.test(n)) return "cold";
    if (HOT_RE.test(d)) return "hot";
    return COLD_WORDS_RE.test(d) ? "cold" : "hot";
  };
  const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // "coconut milk" or "soy milk" is not dairy, so those words are dropped before looking for keywords
  const textOf = (i) => norm([i.name, i.description, i.ingredients].join(" ")).replace(/\b(coconut|almond|soy|oat|rice)\s+(milk|cream)\b/g, " ");
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Whole-word match with an optional plural ending. No lookbehind, so older phones can run it.
  const reCache = new Map();
  function wordsRe(list) {
    const key = list.join("|");
    if (!reCache.has(key)) reCache.set(key, new RegExp("(?:^|[^a-z0-9])(?:" + list.map((w) => esc(norm(w))).join("|") + ")(?:s|es)?(?![a-z0-9])", "i"));
    return reCache.get(key);
  }

  // One option's rule. Every part that is set must match.
  function matchOpt(i, m) {
    if (!m) return true;
    if (m.kind && kindOf(i) !== m.kind) return false;
    if (m.temp && tempOf(i) !== m.temp) return false;
    if (m.cats && m.cats.length && !m.cats.includes(norm(i.category).trim())) return false;
    if (m.labels && m.labels.length && !m.labels.includes(i.label)) return false;
    if (m.maxPrice != null && !(Number(i.price) <= m.maxPrice)) return false;
    if (m.any && m.any.length && !wordsRe(m.any).test(textOf(i))) return false;
    if (m.none && m.none.length && wordsRe(m.none).test(textOf(i))) return false;
    return true;
  }

  // ---- Word lists the generator uses to find out what is on the menu ----
  const MEAT = ["chicken", "manok", "beef", "baka", "steak", "tapa", "pork", "bacon", "ham", "lechon", "chorizo", "longganisa", "sausage", "bagnet", "sisig", "fish", "shrimp", "prawn", "crab", "squid", "calamari", "seafood", "tuna", "salmon", "bagoong", "anchovy", "lobster"];
  const AVOID = [
    ["pork", "Pork", ["pork", "bacon", "ham", "lechon", "chorizo", "longganisa", "sausage", "bagnet", "sisig"]],
    ["dairy", "Dairy (milk, cheese, cream)", ["milk", "cheese", "cream", "butter", "yogurt", "yoghurt", "whey", "ice cream", "custard"]],
    ["seafood", "Seafood", ["fish", "shrimp", "prawn", "crab", "squid", "calamari", "seafood", "oyster", "mussel", "clam", "tuna", "salmon", "bagoong", "anchovy", "lobster", "scallop"]],
    ["nuts", "Nuts", ["nut", "peanut", "almond", "cashew", "walnut", "pistachio", "pecan", "hazelnut", "pili"]],
    ["egg", "Eggs", ["egg", "mayo", "mayonnaise", "meringue", "custard"]],
    ["gluten", "Gluten (wheat, bread)", ["wheat", "flour", "bread", "noodle", "pasta", "cake", "pancake", "dough", "breadcrumb", "crust"]],
    ["spicy", "Spicy food", ["chili", "chilli", "chilies", "chillies", "spicy", "siling", "sili", "jalapeno", "sriracha", "hot sauce"]],
  ];
  const FOOD_GROUPS = [
    ["Chicken", ["chicken", "manok"]],
    ["Beef", ["beef", "baka", "steak", "tapa"]],
    ["Pork", ["pork", "bacon", "ham", "lechon", "chorizo", "longganisa", "sausage", "bagnet", "sisig"]],
    ["Seafood", ["fish", "shrimp", "prawn", "crab", "squid", "calamari", "seafood", "oyster", "mussel", "tuna", "salmon", "lobster"]],
    ["Eggs", ["egg"]],
    ["Noodles & pasta", ["noodle", "pasta", "spaghetti", "pancit", "ramen"]],
    ["Rice", ["rice", "sinangag"]],
    ["Cheesy", ["cheese", "mozzarella", "parmesan", "cheddar"]],
    ["Veggies", ["vegetable", "veggie", "cabbage", "carrot", "eggplant", "talong", "kangkong", "spinach", "mushroom", "lettuce", "broccoli"]],
    ["Something spicy", ["chili", "chilli", "spicy", "siling", "sili", "jalapeno", "sriracha", "hot sauce"]],
    ["Dessert", ["dessert", "cake", "ice cream", "brownie", "pudding", "flan", "halo-halo", "cookie", "pie"]],
  ];
  const DRINK_GROUPS = [
    ["Coffee", ["coffee", "espresso", "latte", "cappuccino", "americano", "mocha", "macchiato"]],
    ["Tea", ["tea", "matcha", "chai"]],
    ["Chocolate", ["chocolate", "cocoa", "mocha"]],
    ["Fruity", ["mango", "strawberry", "lemon", "orange", "berry", "apple", "pineapple", "fruit", "calamansi", "watermelon", "peach", "lychee", "banana", "melon"]],
    ["Milky & creamy", ["milk", "cream", "creamy", "yogurt"]],
    ["Sweet & syrupy", ["caramel", "vanilla", "hazelnut", "syrup", "honey"]],
  ];
  const NO_CAFFEINE = ["coffee", "espresso", "latte", "cappuccino", "americano", "mocha", "macchiato", "tea", "matcha", "chai", "cola"];
  const STOP = new Set(["salt", "pepper", "water", "oil", "sugar", "ice", "spices", "spice", "seasoning", "sauce", "broth", "stock", "vinegar", "soy", "garlic", "onion", "onions", "ginger", "syrup"]);

  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
  const pretty = (s) => { s = String(s).trim(); return s === s.toUpperCase() && /[A-Z]/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const money = (cur, n) => `${cur || ""}${Number(n).toLocaleString("en-US")}`;
  const count = (items, m) => items.filter((i) => matchOpt(i, m)).length;

  // Ingredients that show up in a few dishes but not all of them (and that no word list already covers)
  function spotlight(pool, groups, max) {
    const seen = new Map();
    pool.forEach((i) => {
      const own = new Set();
      String(i.ingredients || "").split(/[,;\/]|\band\b/i).forEach((t) => {
        t = norm(t).replace(/[^a-z\s-]/g, "").trim();
        if (t.length >= 3 && t.length <= 24 && t.split(/\s+/).length <= 2 && !STOP.has(t)) own.add(t);
      });
      own.forEach((t) => seen.set(t, (seen.get(t) || 0) + 1));
    });
    return [...seen]
      .filter(([t, n]) => n >= 2 && n <= Math.floor(pool.length * 0.6) && !groups.some(([, w]) => wordsRe(w).test(t)))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([t]) => [cap(t), { any: [t] }]);
  }

  // Menu fingerprint. The admin compares it to see if the menu changed since the questions were reviewed.
  function signature(menu) {
    const s = (menu.items || []).map((i) => [i.id, i.name, i.category, i.price, i.description, i.ingredients, i.label].join("~")).sort().join("|");
    let h = 5381;
    for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
    return (h >>> 0).toString(36) + "." + (menu.items || []).length;
  }

  // ---- Generator ----
  function generate(menu) {
    const items = menu.items || [], cur = menu.currency || "";
    const foods = items.filter((i) => kindOf(i) === "food"), drinks = items.filter((i) => kindOf(i) === "drink");
    const out = [];
    const q = (id, text, type, opts, extra) => out.push({
      id, text, type, mode: "include", enabled: true, note: false, when: null, source: "auto",
      opts: opts.map(([label, match], n) => ({ id: slug(label) + (opts.findIndex((o) => slug(o[0]) === slug(label)) === n ? "" : "-" + n), label, match })),
      ...extra,
    });
    const both = foods.length > 0 && drinks.length > 0;
    const whenKind = (k) => (both ? { q: "kind", opts: [k === "food" ? "something-to-eat" : "something-to-drink"] } : null);

    if (both) q("kind", "What are you in the mood for?", "single", [["Something to eat", { kind: "food" }], ["Something to drink", { kind: "drink" }], ["Surprise me", {}]]);

    if (drinks.some((i) => tempOf(i) === "hot") && drinks.some((i) => tempOf(i) === "cold"))
      q("temp", "Hot or cold?", "single", [["Hot", { temp: "hot" }], ["Cold", { temp: "cold" }], ["Either", {}]], { when: whenKind("drink") });

    const catsOf = (list) => { const m = new Map(); list.forEach((i) => { const k = norm(i.category).trim(); if (k && !m.has(k)) m.set(k, String(i.category).trim()); }); return [...m]; };
    const fc = catsOf(foods), dc = catsOf(drinks);
    if (fc.length >= 2) q("category", "Which kind of dish?", "single", [...fc.map(([k, name]) => [pretty(name), { cats: [k] }]), ["Anything", {}]], { when: whenKind("food") });
    if (dc.length >= 2) q("drink-category", "Which kind of drink?", "single", [...dc.map(([k, name]) => [pretty(name), { cats: [k] }]), ["Anything", {}]], { when: whenKind("drink") });

    // What are you craving? (food) and What flavor? (drinks): built from the ingredients actually used
    const pick = (pool, groups, spots) => {
      if (pool.length < 3) return [];
      const found = groups.map(([label, words]) => [label, { any: words }, count(pool, { any: words })]).filter(([, , n]) => n > 0 && n < pool.length);
      spots.forEach(([label, m]) => { if (!found.some(([l]) => l === label)) found.push([label, m, count(pool, m)]); });
      return found.sort((a, b) => b[2] - a[2]).slice(0, 7).map(([l, m]) => [l, m]);
    };
    const foodOpts = pick(foods, FOOD_GROUPS, spotlight(foods, FOOD_GROUPS, 3));
    const meatN = count(foods, { any: MEAT });
    if (foods.length >= 3 && meatN > 0 && meatN < foods.length) foodOpts.push(["No meat", { none: MEAT }]);
    if (foodOpts.length >= 2) q("craving", "What are you craving?", "multi", foodOpts.slice(0, 8), { when: whenKind("food") });

    const drinkOpts = pick(drinks, DRINK_GROUPS, spotlight(drinks, DRINK_GROUPS, 2));
    const cafN = count(drinks, { any: NO_CAFFEINE });
    if (drinks.length >= 3 && cafN > 0 && cafN < drinks.length) drinkOpts.push(["No caffeine", { none: NO_CAFFEINE }]);
    if (drinkOpts.length >= 2) q("flavor", "What flavor are you after?", "multi", drinkOpts.slice(0, 8), { when: whenKind("drink") });

    const avoid = AVOID.map(([, label, words]) => [label, { any: words }, count(items, { any: words })]).filter(([, , n]) => n > 0 && n < items.length);
    if (avoid.length) q("avoid", "Anything you'd rather avoid?", "multi", avoid.map(([l, m]) => [l, m]), { mode: "exclude", note: true });

    const tags = [["Crowd favorites", "popular"], ["Something new", "new"], ["Trending right now", "hot"]].filter(([, k]) => items.some((i) => i.label === k));
    if (tags.length) q("pick", "Popular or something new?", "single", [...tags.map(([l, k]) => [l, { labels: [k] }]), ["Anything", {}]]);

    const prices = items.map((i) => Number(i.price)).filter((n) => n > 0).sort((a, b) => a - b);
    if (prices.length >= 4) {
      const top = prices[prices.length - 1], step = top < 200 ? 10 : 50;
      const caps = [...new Set([prices[Math.floor((prices.length - 1) / 3)], prices[Math.floor(((prices.length - 1) * 2) / 3)]].map((v) => Math.ceil(v / step) * step))].filter((c) => c < top);
      if (caps.length) q("budget", "What's your budget per dish?", "single", [...caps.map((c) => [`Up to ${money(cur, c)}`, { maxPrice: c }]), ["Any price", {}]]);
    }
    return out;
  }

  // ---- Customer flow ----
  // answers: [{ q: questionId, opts: [optionIds], auto?: true }]. "auto" marks questions skipped because they could not narrow anything.
  const live = (cfg) => (cfg.questions || []).filter((q) => q.enabled);
  function filter(items, cfg, answers) {
    const by = Object.fromEntries(live(cfg).map((q) => [q.id, q]));
    return items.filter((i) => i.available && answers.every((a) => {
      const q = by[a.q];
      if (a.auto || !q) return true;
      const sel = q.opts.filter((o) => a.opts.includes(o.id));
      if (!sel.length) return true;
      return q.mode === "exclude" ? !sel.some((o) => matchOpt(i, o.match)) : sel.some((o) => matchOpt(i, o.match));
    }));
  }

  // Next question to ask, or { done: true }. Skips questions that cannot narrow the current list, and stops early when only a few dishes are left.
  function next(items, cfg, answers) {
    const qs = live(cfg), by = Object.fromEntries(qs.map((q) => [q.id, q]));
    const cands = filter(items, cfg, answers), stopAt = cfg.stopAt == null ? 3 : cfg.stopAt;
    let list = answers.slice();
    if (stopAt > 0 && answers.some((a) => !a.auto) && cands.length <= stopAt) return { done: true, answers: list };
    for (const q of qs) {
      if (list.some((a) => a.q === q.id)) continue;
      if (q.when && by[q.when.q]) {
        const a = list.find((x) => x.q === q.when.q);
        if (!a || !a.opts.some((o) => q.when.opts.includes(o))) continue;
      }
      const opts = q.opts.map((o) => ({ ...o, n: count(cands, o.match) })).filter((o) => o.n > 0);
      const narrows = opts.some((o) => o.n < cands.length);
      if (!narrows) { list = list.concat({ q: q.id, opts: q.type === "single" ? opts.map((o) => o.id) : [], auto: true }); continue; }
      return { q, opts, answers: list };
    }
    return { done: true, answers: list };
  }

  // ---- Checking edited questions (used by server.js before saving) ----
  const str = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const words = (a, n, len) => (Array.isArray(a) ? [...new Set(a.map((x) => norm(str(x, len)).trim()).filter(Boolean))].slice(0, n) : []);
  const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
  function cleanMatch(m) {
    m = m && typeof m === "object" ? m : {};
    const r = {};
    if (m.kind === "food" || m.kind === "drink") r.kind = m.kind;
    if (m.temp === "hot" || m.temp === "cold") r.temp = m.temp;
    const cats = words(m.cats, 8, 40); if (cats.length) r.cats = cats;
    const labels = (Array.isArray(m.labels) ? m.labels : []).filter((l) => ["popular", "new", "hot"].includes(l)); if (labels.length) r.labels = [...new Set(labels)];
    if (m.maxPrice != null && m.maxPrice !== "" && Number.isFinite(Number(m.maxPrice)) && Number(m.maxPrice) >= 0) r.maxPrice = Number(m.maxPrice);
    const any = words(m.any, 12, 30); if (any.length) r.any = any;
    const none = words(m.none, 12, 30); if (none.length) r.none = none;
    return r;
  }
  function sanitize(input) {
    if (!input || !Array.isArray(input.questions)) throw new Error("Questions must be a list");
    if (input.questions.length > 15) throw new Error("Please keep it to 15 questions or fewer");
    const ids = new Set();
    const questions = input.questions.map((q, n) => {
      const label = `Question ${n + 1}`;
      let id = str(q.id, 40).toLowerCase();
      if (!ID_RE.test(id) || ids.has(id)) id = "custom-" + Date.now().toString(36) + n;
      ids.add(id);
      const text = str(q.text, 120);
      if (!text) throw new Error(`${label} needs some text`);
      if (!Array.isArray(q.opts) || q.opts.length < 1 || q.opts.length > 12) throw new Error(`${label} needs 1 to 12 answers`);
      const oids = new Set();
      const opts = q.opts.map((o, k) => {
        const lab = str(o && o.label, 60);
        if (!lab) throw new Error(`${label}, answer ${k + 1} needs a label`);
        let oid = str(o.id, 40).toLowerCase();
        if (!ID_RE.test(oid) || oids.has(oid)) oid = slug(lab) + "-" + k;
        oids.add(oid);
        return { id: oid, label: lab, match: cleanMatch(o.match) };
      });
      const type = q.type === "multi" ? "multi" : "single";
      const w = q.when && typeof q.when === "object" && ID_RE.test(str(q.when.q, 40)) && Array.isArray(q.when.opts) ? { q: str(q.when.q, 40), opts: q.when.opts.map((x) => str(x, 40)).filter(Boolean).slice(0, 12) } : null;
      return { id, text, type, mode: type === "multi" && q.mode === "exclude" ? "exclude" : "include", enabled: q.enabled !== false, note: !!q.note, when: w && w.opts.length ? w : null, source: q.source === "custom" ? "custom" : "auto", opts };
    });
    const stopAt = Math.max(0, Math.min(10, parseInt(input.stopAt, 10) || 0));
    return { version: 1, stopAt, questions };
  }

  // Keeps saved questions in step when a category is renamed, merged or deleted (to === null deletes it)
  function renameCategory(quick, from, to) {
    if (!quick || !Array.isArray(quick.questions)) return;
    const a = norm(from).trim(), b = to == null ? null : norm(to).trim();
    quick.questions.forEach((q) => q.opts.forEach((o) => {
      const c = o.match && o.match.cats;
      if (!c || !c.includes(a)) return;
      o.match.cats = [...new Set(c.map((x) => (x === a ? b : x)).filter(Boolean))];
      if (!o.match.cats.length) delete o.match.cats;
    }));
  }

  return { generate, signature, matchOpt, count, next, filter, sanitize, renameCategory, kindOf, tempOf };
});
