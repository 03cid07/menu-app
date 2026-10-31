// Admin "Quick menu" tab. Uses $, esc, api and data from admin.js and QuickGen from quick-gen.js.
(() => {
  const list = $("#qm-list"), statusEl = $("#qm-status"), stopEl = $("#qm-stop");
  let draft = [], saved = null, savedSig = "", dirty = false, loaded = false;
  const openRules = new Set();   // option rule editors left open while re-rendering
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const sayQ = (t, err) => { $("#qm-msg").textContent = t; $("#qm-msg").className = "msg" + (err ? " error" : ""); };
  const mark = (d = true) => { dirty = d; status(); };
  // Brief "pressed" confirmation on the button itself (the message below the list is easy to miss)
  function flash(btn, text) {
    if (btn._t) clearTimeout(btn._t);
    else { btn._label = btn.textContent; btn.style.minWidth = btn.offsetWidth + "px"; }
    btn.textContent = text; btn.classList.add("done");
    btn._t = setTimeout(() => { btn.textContent = btn._label; btn.classList.remove("done"); btn.style.minWidth = ""; btn._t = null; }, 1500);
  }

  const items = () => data.items.filter((i) => i.available);
  const total = () => items().length;
  const withCount = (o) => QuickGen.count(items(), o.match);

  function status() {
    const stale = saved && savedSig !== QuickGen.signature(data);
    statusEl.className = "qm-status" + (dirty || stale || !saved ? " warn" : " ok");
    statusEl.textContent = dirty ? "You have unsaved changes."
      : !saved ? "Nothing saved yet. Customers currently get automatic questions made from the menu. Review the ones below and press Save to keep your version."
      : stale ? "The menu changed since you last saved. Press \"Add new suggestions\" to pick up new dishes, or \"Generate from menu\" to start over."
      : "Saved. These questions match your current menu.";
  }

  // ---- Loading ----
  async function load() {
    const r = await (await fetch("/api/quick")).json();
    saved = r.quick; savedSig = saved ? saved.sig : "";
    draft = clone(saved ? saved.questions : QuickGen.generate(data));
    stopEl.value = saved ? saved.stopAt : 3;
    dirty = false; loaded = true; render(); status();
  }

  // ---- Rendering ----
  const sel = (name, value, opts, attrs = "") => `<select ${attrs} data-f="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const csv = (a) => (a && a.length ? a.join(", ") : "");

  function whenOptions(qi) {
    const o = [["", "Always ask"]];
    draft.slice(0, qi).forEach((q) => q.opts.forEach((p) => o.push([q.id + "|" + p.id, `Only if "${q.text}" is "${p.label}"`])));
    return o;
  }
  function optRules(q, o, qi, oi) {
    const m = o.match || {}, key = qi + ":" + oi;
    const cats = data.categories.map((c) => c.toLowerCase());
    return `<details class="qm-rules" data-key="${key}"${openRules.has(key) ? " open" : ""}><summary>Rules: what this answer matches</summary>
      <div class="qm-grid">
        <label>Type of item${sel("kind", m.kind || "", [["", "Food and drinks"], ["food", "Food only"], ["drink", "Drinks only"]], `data-r="kind"`)}</label>
        <label>Serving${sel("temp", m.temp || "", [["", "Any"], ["hot", "Hot drinks"], ["cold", "Cold drinks"]], `data-r="temp"`)}</label>
        <label>Highest price<input type="number" min="0" step="1" data-r="maxPrice" data-f="rule" value="${m.maxPrice == null ? "" : esc(m.maxPrice)}" placeholder="no limit"></label>
      </div>
      <div class="qm-checks"><span>Categories</span>${data.categories.map((c) => `<label><input type="checkbox" data-r="cats" value="${esc(c.toLowerCase())}"${(m.cats || []).includes(c.toLowerCase()) ? " checked" : ""}> ${esc(c)}</label>`).join("") || "<em>none yet</em>"}</div>
      <div class="qm-checks"><span>Tags</span>${["popular", "new", "hot"].map((t) => `<label><input type="checkbox" data-r="labels" value="${t}"${(m.labels || []).includes(t) ? " checked" : ""}> ${t}</label>`).join("")}</div>
      <label>Name, description or ingredients contain any of <small>(comma separated)</small><input data-r="any" data-f="rule" value="${esc(csv(m.any))}" placeholder="e.g. chicken, manok"></label>
      <label>...but contain none of<input data-r="none" data-f="rule" value="${esc(csv(m.none))}" placeholder="e.g. pork, bacon"></label>
      <p class="hint">Leave everything empty and the answer matches every dish (good for "Anything").</p>
    </details>`;
  }

  function render() {
    if (!draft.length) { list.innerHTML = '<p class="hint">No questions yet. Press "Generate from menu" or "Add question".</p>'; return; }
    list.innerHTML = draft.map((q, qi) => `<div class="qm-card${q.enabled ? "" : " off"}" data-qi="${qi}">
      <div class="qm-head">
        <label class="qm-on"><input type="checkbox" data-f="enabled"${q.enabled ? " checked" : ""}> On</label>
        <input class="qm-text" data-f="text" value="${esc(q.text)}" maxlength="120" aria-label="Question ${qi + 1}">
        <div class="qm-move">
          <button type="button" class="pb" data-act="up" aria-label="Move up"${qi === 0 ? " disabled" : ""}>\u2191</button>
          <button type="button" class="pb" data-act="down" aria-label="Move down"${qi === draft.length - 1 ? " disabled" : ""}>\u2193</button>
          <button type="button" class="pb danger" data-act="del" aria-label="Delete question">\u00d7</button>
        </div>
      </div>
      <div class="qm-grid">
        <label>Customer picks${sel("type", q.type, [["single", "One answer"], ["multi", "Several answers"]])}</label>
        ${q.type === "multi" ? `<label>Chosen answers${sel("mode", q.mode, [["include", "Show only matching dishes"], ["exclude", "Hide matching dishes"]])}</label>` : "<span></span>"}
        <label>When to ask${sel("when", q.when ? q.when.q + "|" + q.when.opts[0] : "", whenOptions(qi))}</label>
      </div>
      ${q.mode === "exclude" ? `<label class="qm-note"><input type="checkbox" data-f="note"${q.note ? " checked" : ""}> Remind customers to tell staff about allergies</label>` : ""}
      <div class="qm-opts">${q.opts.map((o, oi) => {
        const n = withCount(o), t = total();
        return `<div class="qm-opt" data-oi="${oi}">
          <div class="qm-optrow"><input data-f="olabel" value="${esc(o.label)}" maxlength="60" aria-label="Answer ${oi + 1}">
            <span class="qm-count${n === 0 ? " zero" : ""}" title="Available dishes this answer matches">${n} of ${t}</span>
            <button type="button" class="pb" data-act="oup" aria-label="Move answer up"${oi === 0 ? " disabled" : ""}>\u2191</button>
            <button type="button" class="pb" data-act="odown" aria-label="Move answer down"${oi === q.opts.length - 1 ? " disabled" : ""}>\u2193</button>
            <button type="button" class="pb danger" data-act="odel" aria-label="Delete answer"${q.opts.length <= 1 ? " disabled" : ""}>\u00d7</button></div>
          ${n === 0 ? '<p class="qm-warn">No available dish matches this answer. Customers will not see it.</p>' : ""}
          ${optRules(q, o, qi, oi)}
        </div>`;
      }).join("")}
        <button type="button" class="btn ghost qm-addopt" data-act="oadd">Add answer</button>
      </div>
    </div>`).join("");
  }

  // ---- Editing ----
  const qOf = (el) => draft[Number(el.closest("[data-qi]").dataset.qi)];
  const oOf = (el) => qOf(el).opts[Number(el.closest("[data-oi]").dataset.oi)];
  const move = (a, i, d) => { const j = i + d; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; };
  const splitWords = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean);

  // Typing updates the draft without redrawing, so the cursor stays where it is
  list.addEventListener("input", (e) => {
    const t = e.target, f = t.dataset.f;
    if (!f) return;
    if (f === "text") qOf(t).text = t.value;
    else if (f === "olabel") oOf(t).label = t.value;
    else if (f === "rule") applyRule(t);
    else return;
    mark();
  });
  function applyRule(t) {
    const o = oOf(t), r = t.dataset.r, m = (o.match = o.match || {});
    if (r === "maxPrice") { if (t.value === "") delete m.maxPrice; else m.maxPrice = Number(t.value); }
    else if (r === "any" || r === "none") { const w = splitWords(t.value); if (w.length) m[r] = w; else delete m[r]; }
  }
  // Choosing from a menu or a checkbox redraws (counts and warnings change)
  list.addEventListener("change", (e) => {
    const t = e.target, f = t.dataset.f, r = t.dataset.r;
    if (r === "cats" || r === "labels") {
      const o = oOf(t), m = (o.match = o.match || {});
      m[r] = [...t.closest(".qm-checks").querySelectorAll("input:checked")].map((x) => x.value);
      if (!m[r].length) delete m[r];
    } else if (r === "kind" || r === "temp") {
      const o = oOf(t), m = (o.match = o.match || {});
      if (t.value) m[r] = t.value; else delete m[r];
    } else if (r) {
      // Text rules: update the draft and this answer's count only, so a click on another button is not lost to a redraw
      applyRule(t);
      const row = t.closest(".qm-opt"), n = withCount(oOf(t)), c = row.querySelector(".qm-count");
      c.textContent = `${n} of ${total()}`; c.classList.toggle("zero", n === 0);
      mark(); return;
    }
    else if (f === "enabled") qOf(t).enabled = t.checked;
    else if (f === "note") qOf(t).note = t.checked;
    else if (f === "type") { const q = qOf(t); q.type = t.value; if (q.type === "single") { q.mode = "include"; q.note = false; } }
    else if (f === "mode") { const q = qOf(t); q.mode = t.value; if (q.mode === "include") q.note = false; }
    else if (f === "when") { const q = qOf(t), [id, opt] = t.value.split("|"); q.when = t.value ? { q: id, opts: [opt] } : null; }
    else return;
    mark(); render();
  });
  list.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.classList && d.classList.contains("qm-rules")) { if (d.open) openRules.add(d.dataset.key); else openRules.delete(d.dataset.key); }
  }, true);

  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act, qi = Number(b.closest("[data-qi]").dataset.qi), q = draft[qi];
    const oi = b.closest("[data-oi]") ? Number(b.closest("[data-oi]").dataset.oi) : -1;
    openRules.clear();
    if (act === "up") move(draft, qi, -1);
    else if (act === "down") move(draft, qi, 1);
    else if (act === "del") { if (!confirm("Delete this question?")) return; draft.splice(qi, 1); }
    else if (act === "oup") move(q.opts, oi, -1);
    else if (act === "odown") move(q.opts, oi, 1);
    else if (act === "odel") q.opts.splice(oi, 1);
    else if (act === "oadd") q.opts.push({ id: "answer-" + Date.now().toString(36), label: "New answer", match: {} });
    else return;
    mark(); render();
  });

  // ---- Toolbar ----
  $("#qm-generate").addEventListener("click", () => {
    if (draft.length && !confirm("Replace all questions with fresh ones made from the menu? Your edits will be lost.")) return;
    draft = QuickGen.generate(data); openRules.clear(); mark(); render();
    flash($("#qm-generate"), "\u2713 Generated");
    sayQ(`Made ${draft.length} question${draft.length === 1 ? "" : "s"} from your menu. Review them, then save.`);
  });
  $("#qm-missing").addEventListener("click", () => {
    const have = new Set(draft.map((q) => q.id));
    const add = QuickGen.generate(data).filter((q) => !have.has(q.id));
    if (!add.length) { flash($("#qm-missing"), "Nothing new"); return sayQ("Nothing new to add. Every suggestion is already in the list."); }
    draft.push(...add); mark(); render();
    flash($("#qm-missing"), `\u2713 Added ${add.length}`);
    sayQ(`Added ${add.length} new question${add.length === 1 ? "" : "s"} at the end. Move them where you like.`);
  });
  $("#qm-add").addEventListener("click", () => {
    if (draft.length >= 15) return sayQ("Please keep it to 15 questions or fewer.", true);
    draft.push({ id: "custom-" + Date.now().toString(36), text: "New question", type: "single", mode: "include", enabled: true, note: false, when: null, source: "custom", opts: [{ id: "answer-1", label: "Anything", match: {} }] });
    mark(); render(); sayQ("");
    flash($("#qm-add"), "\u2713 Added");
    list.lastElementChild.querySelector(".qm-text").select();
  });
  stopEl.addEventListener("input", () => mark());

  $("#qm-save").addEventListener("click", async () => {
    try {
      sayQ("Saving…");
      const r = await api("PUT", "/api/quick", { questions: draft, stopAt: stopEl.value });
      saved = r.quick; savedSig = r.sig; draft = clone(saved.questions); dirty = false; render(); status();
      sayQ("Saved. Customers see these questions now. Push to GitHub to update the live site.");
      flash($("#qm-save"), "\u2713 Saved");
    } catch (err) { sayQ(err.message, true); }
  });
  $("#qm-discard").addEventListener("click", () => {
    if (dirty && !confirm("Throw away your unsaved changes?")) return;
    openRules.clear(); flash($("#qm-discard"), "\u2713 Discarded"); load().then(() => sayQ("")).catch((e) => sayQ(e.message, true));
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
