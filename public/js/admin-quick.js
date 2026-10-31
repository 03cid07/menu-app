// Admin "Quick menu" tab: the simple editor.
// Uses $, esc, api, refresh and data from admin.js, and QuickGen from quick-gen.js.
// The saved format is unchanged (see quick-gen.js), so the customer side and server.js need no changes.
//
// Design rules for this screen ("don't make me think"):
//  - Every question is one tidy card. Tap it to open it, tap again to close. Only one is open at a time.
//  - Plain words only. No "rules", "match", "include/exclude", "when to ask".
//  - Every answer says in a sentence what it shows, with a live dish count.
//  - One Save button that appears only when something changed.
(() => {
  const list = $("#qm-list"), statusEl = $("#qm-status"), stopEl = $("#qm-stop"), bar = $("#qm-savebar");
  let draft = [], saved = null, savedSig = "", dirty = false, loaded = false;
  let openQ = null;            // id of the question card that is open
  let focusSel = null;         // what to focus after the next redraw
  const openA = new Set();     // "questionId|answerId" whose "what does this show" panel is open

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const newId = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
  const sayQ = (t, err) => { const m = $("#qm-msg"); m.textContent = t; m.className = "msg" + (err ? " error" : ""); };
  const mark = (d = true) => { dirty = d; status(); };
  const dishes = (n) => `${n} ${n === 1 ? "dish" : "dishes"}`;
  function flash(btn, text) {
    if (btn._t) clearTimeout(btn._t); else { btn._label = btn.textContent; btn.style.minWidth = btn.offsetWidth + "px"; }
    btn.textContent = text; btn.classList.add("done");
    btn._t = setTimeout(() => { btn.textContent = btn._label; btn.classList.remove("done"); btn.style.minWidth = ""; btn._t = null; }, 1500);
  }

  const items = () => data.items.filter((i) => i.available);
  const total = () => items().length;
  const hitsOf = (o) => items().filter((i) => QuickGen.matchOpt(i, o.match));
  const catName = (k) => data.categories.find((c) => c.toLowerCase() === k) || k;

  // ---- Plain-language helpers ----
  const MODES = [
    ["one", "Pick one", "The customer taps one answer."],
    ["many", "Pick many", "The customer can tap more than one answer."],
    ["skip", "Things to skip", "The customer taps what they do NOT want. Dishes that match are hidden."],
  ];
  const modeOf = (q) => (q.type === "multi" ? (q.mode === "exclude" ? "skip" : "many") : "one");
  function setMode(q, k) {
    if (k === "one") { q.type = "single"; q.mode = "include"; q.note = false; }
    else if (k === "many") { q.type = "multi"; q.mode = "include"; q.note = false; }
    else { q.type = "multi"; q.mode = "exclude"; q.note = true; }
  }
  // "Food only, in Mains, with chicken or manok, without pork"
  function describe(m) {
    m = m || {};
    const p = [], cur = data.currency || "";
    if (m.kind === "food") p.push("food only"); else if (m.kind === "drink") p.push("drinks only");
    if (m.temp) p.push(m.temp === "hot" ? "hot drinks" : "cold drinks");
    if (m.cats && m.cats.length) p.push("in " + m.cats.map((c) => cap(String(catName(c)).toLowerCase())).join(" or "));
    if (m.labels && m.labels.length) p.push("tagged " + m.labels.join(" or "));
    if (m.maxPrice != null) p.push(`up to ${cur}${m.maxPrice}`);
    if (m.any && m.any.length) p.push("with " + m.any.join(" or "));
    if (m.none && m.none.length) p.push("without " + m.none.join(", "));
    return p.length ? cap(p.join(", ")) : "Every dish";
  }
  const showsText = (q, o) => `${modeOf(q) === "skip" ? "Hides" : "Shows"}: ${describe(o.match)} \u00b7 ${dishes(hitsOf(o).length)}`;
  function previewHtml(o) {
    const hits = hitsOf(o);
    if (!hits.length) return "No dishes match yet.";
    const names = hits.slice(0, 8).map((i) => esc(i.name)).join(", ");
    return `<b>${hits.length} of ${total()} dishes:</b> ${names}${hits.length > 8 ? `, and ${hits.length - 8} more` : ""}`;
  }

  // ---- Status banner and save bar ----
  function status() {
    const stale = saved && savedSig !== QuickGen.signature(data);
    bar.hidden = !dirty;
    statusEl.hidden = dirty;
    if (dirty) return;
    if (!saved) { statusEl.className = "qm-banner info"; statusEl.innerHTML = "<span>Right now customers get questions made automatically from your menu. To change them, tap a question below, then press Save.</span>"; }
    else if (stale) { statusEl.className = "qm-banner warn"; statusEl.innerHTML = '<span>Your menu changed since you last saved.</span><button type="button" class="btn" id="qm-missing">Add questions for new dishes</button>'; }
    else { statusEl.className = "qm-banner ok"; statusEl.innerHTML = "<span>\u2713 Saved. Customers see these questions.</span>"; }
  }

  // ---- Loading ----
  async function load() {
    const r = await (await fetch("/api/quick")).json();
    saved = r.quick; savedSig = saved ? saved.sig : "";
    draft = clone(saved ? saved.questions : QuickGen.generate(data));
    stopEl.value = saved ? saved.stopAt : 3;
    dirty = false; loaded = true; openQ = null; openA.clear(); render(); status();
  }

  // ---- Drawing ----
  const seg = (items, cur, attrs) => `<div class="qm-seg" role="group">${items.map(([v, l]) => `<button type="button" aria-pressed="${v === cur}" ${attrs} data-v="${esc(v)}">${esc(l)}</button>`).join("")}</div>`;
  const chip = (label, on, attrs) => `<button type="button" class="chip" aria-pressed="${on}" ${attrs}>${esc(label)}</button>`;
  const tags = (r, words, hint) => `<div class="qm-tags" data-tags="${r}">${words.map((w) => `<span class="qm-tag">${esc(w)}<button type="button" data-act="rmword" data-r="${r}" data-w="${esc(w)}" aria-label="Remove ${esc(w)}">\u00d7</button></span>`).join("")}<input data-f="word" data-r="${r}" placeholder="${esc(hint)}" aria-label="${esc(hint)}"><button type="button" class="qm-link" data-act="addword">Add</button></div>`;

  function rulesHtml(q, o) {
    const m = o.match || {}, skip = modeOf(q) === "skip";
    const cats = data.categories.length ? `<p class="qm-h">Only these categories <small>(pick none for all)</small></p><div class="qm-chips">${data.categories.map((c) => chip(c, (m.cats || []).includes(c.toLowerCase()), `data-act="tog" data-r="cats" data-v="${esc(c.toLowerCase())}"`)).join("")}</div>` : "";
    return `<div class="qm-rules">
      <p class="qm-h">What should this answer ${skip ? "hide" : "show"}?</p>
      ${seg([["", "Every dish"], ["food", "Food only"], ["drink", "Drinks only"]], m.kind || "", 'data-act="rule" data-r="kind"')}
      ${cats}
      <p class="qm-h">Only dishes with these words <small>(in the name, description or ingredients)</small></p>
      ${tags("any", m.any || [], "Type a word, like chicken")}
      <p class="qm-h">Leave out dishes with these words</p>
      ${tags("none", m.none || [], "Type a word, like pork")}
      <details class="qm-more"><summary>More ways to narrow it down</summary>
        <p class="qm-h">Hot or cold drinks</p>
        ${seg([["", "Any"], ["hot", "Hot"], ["cold", "Cold"]], m.temp || "", 'data-act="rule" data-r="temp"')}
        <p class="qm-h">Dish tags</p>
        <div class="qm-chips">${["popular", "new", "hot"].map((t) => chip(cap(t), (m.labels || []).includes(t), `data-act="tog" data-r="labels" data-v="${t}"`)).join("")}</div>
        <p class="qm-h">Highest price</p>
        <input class="qm-price" type="number" min="0" step="1" data-f="price" value="${m.maxPrice == null ? "" : esc(m.maxPrice)}" placeholder="No limit" aria-label="Highest price">
      </details>
      <p class="qm-preview">${previewHtml(o)}</p>
    </div>`;
  }

  function answerHtml(q, o, oi) {
    const n = hitsOf(o).length, open = openA.has(q.id + "|" + o.id);
    return `<div class="qm-ans" data-oid="${esc(o.id)}">
      <div class="qm-ansrow">
        <input data-f="olabel" value="${esc(o.label)}" maxlength="60" aria-label="Answer ${oi + 1}">
        <div class="qm-mv">
          <button type="button" class="pb" data-act="oup" aria-label="Move answer up"${oi === 0 ? " disabled" : ""}>\u2191</button>
          <button type="button" class="pb" data-act="odown" aria-label="Move answer down"${oi === q.opts.length - 1 ? " disabled" : ""}>\u2193</button>
          <button type="button" class="pb danger" data-act="odel" aria-label="Delete answer"${q.opts.length <= 1 ? " disabled" : ""}>\u00d7</button>
        </div>
      </div>
      <div class="qm-shows${n === 0 ? " zero" : ""}"><span>${esc(showsText(q, o))}</span><button type="button" class="qm-link" data-act="rules" aria-expanded="${open}">${open ? "Done" : "Change"}</button></div>
      <p class="qm-warn"${n ? " hidden" : ""}>No dish matches yet, so customers will not see this answer.</p>
      ${open ? rulesHtml(q, o) : ""}
    </div>`;
  }

  function whenHtml(q, qi) {
    if (qi === 0) return "";
    const opts = [["", "Everyone (always ask)"]];
    draft.slice(0, qi).forEach((p) => p.opts.forEach((a) => opts.push([p.id + "|" + a.id, `Only after they pick \u201c${a.label}\u201d for \u201c${p.text}\u201d`])));
    const cur = q.when ? q.when.q + "|" + q.when.opts[0] : "";
    const bad = q.when && draft.findIndex((p) => p.id === q.when.q) > qi;
    return `<p class="qm-h">Who sees this question?</p>
      <select data-f="when" aria-label="Who sees this question">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
      ${bad ? '<p class="qm-warn">This question depends on one that comes after it. Move it down.</p>' : ""}`;
  }

  function cardHtml(q, qi) {
    const open = openQ === q.id, mk = modeOf(q), modeLabel = MODES.find((m) => m[0] === mk);
    const anyZero = q.opts.some((o) => hitsOf(o).length === 0);
    const head = `<div class="qm-top">
      <label class="qm-switch" title="Customers only see this question when it is On"><input type="checkbox" data-f="enabled" aria-label="Show this question to customers"${q.enabled ? " checked" : ""}><span class="qm-slider"></span><span class="qm-swt">${q.enabled ? "On" : "Off"}</span></label>
      <button type="button" class="qm-title" data-act="toggle" aria-expanded="${open}"><span class="qm-num">${qi + 1}</span><span class="qm-ttext">${esc(q.text) || "(write a question)"}</span><span class="qm-caret" aria-hidden="true">\u25be</span></button>
      <div class="qm-mv">
        <button type="button" class="pb" data-act="up" aria-label="Move question up"${qi === 0 ? " disabled" : ""}>\u2191</button>
        <button type="button" class="pb" data-act="down" aria-label="Move question down"${qi === draft.length - 1 ? " disabled" : ""}>\u2193</button>
      </div></div>`;
    if (!open) {
      return `<div class="qm-card${q.enabled ? "" : " off"}" data-id="${esc(q.id)}">${head}
        <div class="qm-pills">${q.opts.map((o) => `<span class="qm-pill${hitsOf(o).length === 0 ? " zero" : ""}">${esc(o.label)}</span>`).join("")}<span class="qm-pill meta">${esc(modeLabel[1])}</span></div>
        ${anyZero ? '<p class="qm-warn qm-cardwarn">An answer here shows no dishes. Tap the question to fix it.</p>' : ""}</div>`;
    }
    return `<div class="qm-card open${q.enabled ? "" : " off"}" data-id="${esc(q.id)}">${head}
      <div class="qm-body">
        <p class="qm-h">Question</p>
        <input class="qm-text" data-f="text" value="${esc(q.text)}" maxlength="120" aria-label="Question ${qi + 1}">
        <p class="qm-h">How do customers answer?</p>
        ${seg(MODES.map((m) => [m[0], m[1]]), mk, 'data-act="mode"')}
        <p class="qm-desc">${esc(modeLabel[2])}</p>
        ${mk === "skip" ? `<label class="qm-note"><input type="checkbox" data-f="note"${q.note ? " checked" : ""}> Remind customers to tell staff about allergies</label>` : ""}
        <p class="qm-h">Answers</p>
        ${q.opts.map((o, oi) => answerHtml(q, o, oi)).join("")}
        <button type="button" class="btn ghost qm-addans" data-act="oadd"${q.opts.length >= 12 ? " disabled" : ""}>+ Add an answer</button>
        ${whenHtml(q, qi)}
        <div class="qm-foot"><button type="button" class="btn ghost danger" data-act="del">Delete this question</button><button type="button" class="btn" data-act="toggle">Done</button></div>
      </div></div>`;
  }

  function render() {
    if (!draft.length) {
      list.innerHTML = '<div class="qm-empty"><p>No questions yet.</p><button type="button" class="btn" data-act="gen">Make questions from my menu</button></div>';
      return;
    }
    list.innerHTML = draft.map(cardHtml).join("");
    if (focusSel) { const el = list.querySelector(focusSel); if (el) { el.focus(); if (el.select) el.select(); } focusSel = null; }
  }

  // ---- Editing ----
  function ctx(el) {
    const c = el.closest("[data-id]"), a = el.closest("[data-oid]");
    const qi = draft.findIndex((q) => q.id === (c && c.dataset.id)), q = draft[qi];
    const oi = q && a ? q.opts.findIndex((o) => o.id === a.dataset.oid) : -1;
    return { q, qi, o: oi >= 0 ? q.opts[oi] : null, oi };
  }
  const move = (a, i, d) => { const j = i + d; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; };
  const M = (o) => (o.match = o.match || {});
  function setRule(o, k, v) { const m = M(o); if (v === "" || v == null || (Array.isArray(v) && !v.length)) delete m[k]; else m[k] = v; }
  function addWords(o, k, text) {
    const w = String(text).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!w.length) return false;
    setRule(o, k, [...new Set([...(M(o)[k] || []), ...w])].slice(0, 12));
    return true;
  }
  const focusWord = (q, o, r) => `[data-id="${CSS.escape(q.id)}"] [data-oid="${CSS.escape(o.id)}"] [data-tags="${r}"] input`;
  // Typing a price changes the sentence and dish count in place (no redraw, so the cursor stays)
  function paintCounts(el, q, o) {
    const ans = el.closest(".qm-ans"), n = hitsOf(o).length;
    ans.querySelector(".qm-shows span").textContent = showsText(q, o);
    ans.querySelector(".qm-shows").classList.toggle("zero", n === 0);
    ans.querySelector(".qm-warn").hidden = n > 0;
    const pv = ans.querySelector(".qm-preview"); if (pv) pv.innerHTML = previewHtml(o);
  }

  list.addEventListener("input", (e) => {
    const t = e.target, f = t.dataset.f, { q, o } = ctx(t);
    if (!q) return;
    if (f === "text") { q.text = t.value; const tt = t.closest(".qm-card").querySelector(".qm-ttext"); tt.textContent = t.value || "(write a question)"; }
    else if (f === "olabel" && o) o.label = t.value;
    else if (f === "price" && o) { setRule(o, "maxPrice", t.value === "" ? "" : Math.max(0, Number(t.value))); paintCounts(t, q, o); }
    else return;
    mark();
  });

  list.addEventListener("change", (e) => {
    const t = e.target, f = t.dataset.f, { q, o } = ctx(t);
    if (!q) return;
    if (f === "enabled") q.enabled = t.checked;
    else if (f === "note") q.note = t.checked;
    else if (f === "when") { const [id, opt] = t.value.split("|"); q.when = t.value ? { q: id, opts: [opt] } : null; }
    else if (f === "word" && o) { if (!addWords(o, t.dataset.r, t.value)) return; }
    else return;
    mark(); render();
  });

  list.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t.dataset.f !== "word") return;
    const { q, o } = ctx(t), r = t.dataset.r;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (addWords(o, r, t.value)) { focusSel = focusWord(q, o, r); mark(); render(); }
    } else if (e.key === "Backspace" && !t.value && (M(o)[r] || []).length) {
      setRule(o, r, M(o)[r].slice(0, -1)); focusSel = focusWord(q, o, r); mark(); render();
    }
  });

  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "gen") return generate();
    const { q, qi, o, oi } = ctx(b);
    if (!q) return;
    if (act === "toggle") { openQ = openQ === q.id ? null : q.id; return render(); }
    if (act === "rules") { const k = q.id + "|" + o.id; if (openA.has(k)) openA.delete(k); else openA.add(k); return render(); }
    sayQ("");
    if (act === "up") move(draft, qi, -1);
    else if (act === "down") move(draft, qi, 1);
    else if (act === "del") {
      if (!confirm("Delete this question?")) return;
      draft.splice(qi, 1); openQ = null;
      draft.forEach((x) => { if (x.when && x.when.q === q.id) x.when = null; });
    }
    else if (act === "mode") setMode(q, b.dataset.v);
    else if (act === "oup") move(q.opts, oi, -1);
    else if (act === "odown") move(q.opts, oi, 1);
    else if (act === "odel") {
      q.opts.splice(oi, 1);
      draft.forEach((x) => { if (x.when && x.when.q === q.id) { x.when.opts = x.when.opts.filter((id) => id !== o.id); if (!x.when.opts.length) x.when = null; } });
    }
    else if (act === "oadd") {
      const id = newId("answer-");
      q.opts.push({ id, label: "New answer", match: {} });
      focusSel = `[data-id="${CSS.escape(q.id)}"] [data-oid="${CSS.escape(id)}"] [data-f="olabel"]`;
    }
    else if (act === "rule") setRule(o, b.dataset.r, b.dataset.v);
    else if (act === "tog") {
      const arr = (M(o)[b.dataset.r] || []).slice(), i = arr.indexOf(b.dataset.v);
      if (i >= 0) arr.splice(i, 1); else arr.push(b.dataset.v);
      setRule(o, b.dataset.r, arr);
    }
    else if (act === "addword") {
      const inp = b.closest("[data-tags]").querySelector("input"), r = inp.dataset.r;
      if (addWords(o, r, inp.value)) focusSel = focusWord(q, o, r); else return inp.focus();
    }
    else if (act === "rmword") setRule(o, b.dataset.r, (M(o)[b.dataset.r] || []).filter((w) => w !== b.dataset.w));
    else return;
    mark(); render();
  });

  // ---- Buttons outside the cards ----
  function generate() {
    if (draft.length && !confirm("Replace the questions below with new ones made from your menu? You can still press Undo before you save.")) return;
    draft = QuickGen.generate(data); openQ = null; openA.clear(); mark(); render();
    sayQ(`Made ${draft.length} question${draft.length === 1 ? "" : "s"} from your menu. Look them over, then press Save.`);
    flash($("#qm-generate"), "\u2713 Done");
  }
  function addMissing() {
    const have = new Set(draft.map((q) => q.id)), add = QuickGen.generate(data).filter((q) => !have.has(q.id));
    if (!add.length) { sayQ("Nothing new to add. Every suggestion is already in your list."); return; }
    draft.push(...add); mark(); render();
    sayQ(`Added ${add.length} new question${add.length === 1 ? "" : "s"} at the end. Move them where you like, then Save.`);
  }
  statusEl.addEventListener("click", (e) => { if (e.target.id === "qm-missing") addMissing(); });
  $("#qm-generate").addEventListener("click", generate);
  $("#qm-add").addEventListener("click", () => {
    if (draft.length >= 15) return sayQ("Please keep it to 15 questions or fewer.", true);
    const id = newId("custom-");
    draft.push({ id, text: "New question", type: "single", mode: "include", enabled: true, note: false, when: null, source: "custom", opts: [{ id: "answer-1", label: "Anything", match: {} }] });
    openQ = id; focusSel = `[data-id="${CSS.escape(id)}"] .qm-text`; sayQ(""); mark(); render();
    const c = list.querySelector(`[data-id="${CSS.escape(id)}"]`); if (c) c.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  stopEl.addEventListener("input", () => mark());

  $("#qm-save").addEventListener("click", async () => {
    try {
      sayQ("Saving\u2026");
      const r = await api("PUT", "/api/quick", { questions: draft, stopAt: stopEl.value });
      saved = r.quick; savedSig = r.sig; draft = clone(saved.questions); dirty = false; render(); status();
      sayQ("Saved. Customers see these questions now. Push to GitHub to update the live site.");
      flash($("#qm-save"), "\u2713 Saved");
    } catch (err) { sayQ(err.message, true); }
  });
  $("#qm-discard").addEventListener("click", () => {
    if (!confirm("Undo all the changes you have not saved?")) return;
    load().then(() => sayQ("")).catch((e) => sayQ(e.message, true));
  });
  $("#qm-reset").addEventListener("click", async () => {
    if (!confirm("Delete your saved questions? Customers will get automatic questions made from the menu.")) return;
    try { await api("DELETE", "/api/quick"); await load(); sayQ("Back to automatic questions."); } catch (err) { sayQ(err.message, true); }
  });

  // Load when the tab opens (and again if the menu changed in the meantime and nothing is being edited)
  document.querySelector('[data-tab="quick"]').addEventListener("click", async () => {
    try { await refresh(); if (!loaded || !dirty) await load(); else { render(); status(); } } catch (err) { sayQ(err.message, true); }
  });
  if (location.hash === "#quick") refresh().then(load).catch((err) => sayQ(err.message, true));
})();
