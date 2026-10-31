// Flowchart view for the admin "Quick menu" tab. Draws the questions as a diagram.
// This file only draws; admin-quick.js handles the edits (typing, "+" buttons) and re-draws after each change.
const QuickFlow = (() => {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let last = null, ro = null;

  // o: { draft, stopAt, total, count(answer) }
  function draw(root, o) {
    const { draft, stopAt, total, count } = o;
    const live = draft.filter((q) => q.enabled), off = draft.filter((q) => !q.enabled);
    const by = Object.fromEntries(live.map((q) => [q.id, q]));
    // A question with a "when" hangs under its parent answer. If the parent is missing or switched off, customers get it every time.
    const gated = (q) => q.when && q.when.q !== q.id && by[q.when.q];
    const laneKey = (q) => q.when.q + "|" + q.when.opts.join(",");
    const edges = [];
    const link = (out, to) => {
      out.src.forEach((a) => edges.push({ t: "seq", a, b: to }));
      out.skips.forEach((a) => edges.push({ t: "skip", a, b: to }));
      out.gates.forEach((a) => edges.push({ t: "gate", a, b: to }));
    };

    function node(q) {
      const n = draft.indexOf(q) + 1;
      let tag = "";
      if (gated(q)) {
        const par = by[q.when.q], names = q.when.opts.map((id) => (par.opts.find((p) => p.id === id) || { label: id }).label);
        tag = `<div class="qf-if">Only if \u201c${esc(par.text)}\u201d is ${names.map((x) => `\u201c${esc(x)}\u201d`).join(" or ")}</div>`;
      }
      const chips = q.opts.map((p) => {
        const c = count(p);
        return `<div class="qf-chip${c === 0 ? " zero" : ""}" data-cid="${q.id}|${p.id}">
          <input class="qf-olabel" data-qid="${q.id}" data-oid="${p.id}" value="${esc(p.label)}" maxlength="60" aria-label="Answer ${esc(p.label)}">
          <em title="Dishes this answer matches">${c}</em>
          <button type="button" class="qf-add" data-act="follow" data-qid="${q.id}" data-oid="${p.id}" title="Add a follow-up question that only appears after this answer" aria-label="Add follow-up question after ${esc(p.label)}">+</button>
        </div>`;
      }).join("");
      const meta = (q.type === "multi" ? "Several answers" : "One answer") + (q.mode === "exclude" ? ", hides matching dishes" : "");
      return `<div class="qf-node" data-nid="${q.id}">${tag}
        <div class="qf-nh"><span class="qf-n">${n}</span><input class="qf-text" data-qid="${q.id}" value="${esc(q.text)}" maxlength="120" aria-label="Question ${n}"></div>
        <div class="qf-meta">${meta}</div>
        <div class="qf-chips">${chips}</div>
        <div class="qf-foot"><button type="button" class="qf-btn" data-act="edit" data-qid="${q.id}" title="Open this question in the list to set what each answer matches">Rules</button>
          <button type="button" class="qf-btn" data-act="ans" data-qid="${q.id}"${q.opts.length >= 12 ? " disabled" : ""}>+ Answer</button>
          <button type="button" class="qf-btn" data-act="off" data-qid="${q.id}">Switch off</button></div>
      </div>`;
    }

    // Lays out a list of questions top to bottom. "inc" says what feeds the first one. Returns the html and what feeds whatever comes next.
    function chain(qs, inc) {
      let html = "", out = inc;
      qs.forEach((q) => {
        link(out, q.id);
        const kids = live.filter((k) => gated(k) && k.when.q === q.id);
        const firstOpt = (k) => Math.max(0, q.opts.findIndex((p) => p.id === k.when.opts[0]));
        const lanes = [...new Set(kids.map(laneKey))].sort((x, y) => firstOpt(kids.find((k) => laneKey(k) === x)) - firstOpt(kids.find((k) => laneKey(k) === y))).map((key) => {
          const ks = kids.filter((k) => laneKey(k) === key);
          return chain(ks, { src: [], skips: [], gates: ks[0].when.opts.map((id) => q.id + "|" + id) });
        });
        html += `<div class="qf-q" data-q="${q.id}">${node(q)}${lanes.length ? `<div class="qf-lanes">${lanes.map((l) => `<div class="qf-lane">${l.html}</div>`).join("")}</div>` : ""}</div>`;
        if (lanes.length) {
          const used = new Set(kids.flatMap((k) => k.when.opts));
          out = { src: lanes.flatMap((l) => l.out.src), skips: lanes.flatMap((l) => l.out.skips), gates: [] };
          if (q.type === "multi" || q.opts.some((p) => !used.has(p.id))) out.skips.push(q.id); // other answers carry straight on
        } else out = { src: [q.id], skips: [], gates: [] };
      });
      return { html, out };
    }

    const keep = root.querySelector(".qf-scroll");
    const sx = keep ? keep.scrollLeft : 0, sy = keep ? keep.scrollTop : 0;
    if (!live.length) {
      root.innerHTML = `<p class="hint">No questions switched on. Press "Generate from menu" or "Add question" in the buttons above.</p>${offHtml(off)}`;
      last = null; return;
    }
    const main = chain(live.filter((q) => !gated(q)), { src: ["START"], skips: [], gates: [] });
    link(main.out, "END");
    const endNote = stopAt > 0 ? `Stops early once ${stopAt} dish${stopAt === 1 ? " is" : "es are"} or fewer left` : "Asks every question";
    root.innerHTML = `<div class="qf-scroll"><div class="qf">
      <svg class="qf-svg" aria-hidden="true"><defs>
        <marker id="qf-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" class="qf-ah"/></marker>
        <marker id="qf-g" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" class="qf-ah gate"/></marker></defs></svg>
      <div class="qf-chain"><div class="qf-pill" data-nid="START">Customer taps Quick menu</div>${main.html}
        <div class="qf-pill end" data-nid="END">Show matching dishes<small>${endNote} (${total} available)</small></div></div></div></div>
      <p class="hint qf-legend"><span class="qf-key gate"></span> Follow-up question that only appears after that answer. <span class="qf-key skip"></span> Other answers carry straight on. Questions that cannot narrow the dishes are skipped automatically. Press <b>+</b> on an answer to add a follow-up, or <b>Rules</b> to set what an answer matches.</p>
      ${offHtml(off)}`;
    last = { root, edges };
    const sc = root.querySelector(".qf-scroll"); sc.scrollLeft = sx; sc.scrollTop = sy;
    if (ro) ro.disconnect();
    if (window.ResizeObserver) { ro = new ResizeObserver(() => repaint()); ro.observe(root.querySelector(".qf")); }
    requestAnimationFrame(repaint);
  }

  function offHtml(off) {
    if (!off.length) return "";
    return `<div class="qf-off"><span>Switched off (customers never see these):</span>${off.map((q) => `<button type="button" class="qf-btn" data-act="on" data-qid="${q.id}">${esc(q.text)} \u00b7 Switch on</button>`).join("")}</div>`;
  }

  // Draws the lines between boxes. Needs the boxes to be on screen, so it runs after layout and whenever sizes change.
  function repaint() {
    if (!last) return;
    const inner = last.root.querySelector(".qf"), svg = inner && inner.querySelector(".qf-svg");
    if (!svg) return;
    const R = inner.getBoundingClientRect();
    if (!R.width) return;
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - R.left, r: r.right - R.left, t: r.top - R.top, b: r.bottom - R.top, cx: (r.left + r.right) / 2 - R.left, cy: (r.top + r.bottom) / 2 - R.top }; };
    const nid = (id) => inner.querySelector(`[data-nid="${id}"]`);
    let paths = "";
    last.edges.forEach((e) => {
      const to = nid(e.b); if (!to) return;
      const B = box(to);
      if (e.t === "seq") {
        const f = nid(e.a); if (!f) return;
        const A = box(f), dx = B.cx - A.cx;
        if (Math.abs(dx) < 8 || B.t - A.b < 40) { const k = Math.max(18, (B.t - A.b) / 2);
          paths += `<path class="qf-e" marker-end="url(#qf-a)" d="M${A.cx} ${A.b} C${A.cx} ${A.b + k} ${B.cx} ${B.t - k} ${B.cx} ${B.t}"/>`; }
        else { // a branch rejoining the main line: drop down its own column, then run along the gap above the target
          const ym = B.t - 18, r = Math.min(10, Math.abs(dx) / 2), sg = dx > 0 ? 1 : -1;
          paths += `<path class="qf-e" marker-end="url(#qf-a)" d="M${A.cx} ${A.b} V${ym - r} Q${A.cx} ${ym} ${A.cx + sg * r} ${ym} H${B.cx - sg * r} Q${B.cx} ${ym} ${B.cx} ${ym + r} V${B.t}"/>`; }
      } else if (e.t === "gate") {
        const chip = inner.querySelector(`[data-cid="${e.a}"]`); if (!chip) return;
        const C = box(chip), N = box(chip.closest(".qf-node")), dir = B.cx < N.cx - 20 ? -1 : 1, x = dir < 0 ? N.l : N.r;
        const reach = Math.min(60, 20 + Math.abs(B.cx - x) / 2);  // short hook when the follow-up sits right under the node
        paths += `<path class="qf-e gate" marker-end="url(#qf-g)" d="M${x} ${C.cy} C${x + dir * reach} ${C.cy} ${B.cx} ${B.t - 50} ${B.cx} ${B.t}"/>`;
      } else {
        const f = nid(e.a), w = inner.querySelector(`[data-q="${e.a}"]`); if (!f || !w) return;
        const A = box(f), L = box(w).l - 16;
        paths += `<path class="qf-e skip" marker-end="url(#qf-a)" d="M${A.l} ${A.cy} H${L} V${B.cy} H${B.l}"/>`;
      }
    });
    svg.setAttribute("width", inner.scrollWidth); svg.setAttribute("height", inner.scrollHeight);
    svg.querySelectorAll("path.qf-e").forEach((p) => p.remove());
    svg.insertAdjacentHTML("beforeend", paths);
  }

  return { draw, repaint };
})();
