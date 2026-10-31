// Flowchart view for the admin "Quick menu" tab. Draws the questions as a diagram.
// This file draws, and lets the owner drag the green arrows (see "Dragging arrows" below). admin-quick.js owns the data:
// it handles typing and the "+" buttons, applies arrow changes (onLink) and re-draws after each change.
const QuickFlow = (() => {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let last = null, ro = null, drag = null, selEdge = null;
  let cb = { canLink: () => true, onLink: () => {} };

  // o: { draft, stopAt, total, count(answer) }
  function draw(root, o) {
    const { draft, stopAt, total, count } = o;
    cb = { canLink: o.canLink || cb.canLink, onLink: o.onLink || cb.onLink };
    bind(root);
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
      last = null; selEdge = null; return;
    }
    const main = chain(live.filter((q) => !gated(q)), { src: ["START"], skips: [], gates: [] });
    link(main.out, "END");
    const endNote = stopAt > 0 ? `Stops early once ${stopAt} dish${stopAt === 1 ? " is" : "es are"} or fewer left` : "Asks every question";
    root.innerHTML = `<div class="qf-scroll"><div class="qf">
      <svg class="qf-svg" aria-hidden="true"><defs>
        <marker id="qf-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" class="qf-ah"/></marker>
        <marker id="qf-g" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" class="qf-ah gate"/></marker></defs></svg>
      <svg class="qf-hsvg" aria-hidden="true"></svg>
      <div class="qf-chain"><div class="qf-pill" data-nid="START">Customer taps Quick menu</div>${main.html}
        <div class="qf-pill end" data-nid="END">Show matching dishes<small>${endNote} (${total} available)</small></div></div></div></div>
      <p class="hint qf-legend"><span class="qf-key gate"></span> Follow-up question that only appears after that answer. <span class="qf-key skip"></span> Other answers carry straight on. Questions that cannot narrow the dishes are skipped automatically. Press <b>+</b> on an answer to add a follow-up, or <b>Rules</b> to set what an answer matches.<br>
        <b>Moving the green arrows:</b> drag the small circle on an answer\u2019s edge onto a question to connect it. Drag an arrow\u2019s round end onto another question, or its start onto another answer, to reconnect it. Click an arrow, then \u00d7, to remove it.</p>
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
  // Green arrows also get handles (drawn in a second layer on top, so they can be grabbed): a dot at the start, a ring at the tip.
  function repaint() {
    if (!last || drag) return; // never redraw under the finger mid-drag
    const inner = last.root.querySelector(".qf"), svg = inner && inner.querySelector(".qf-svg"), hsvg = inner && inner.querySelector(".qf-hsvg");
    if (!svg || !hsvg) return;
    const R = inner.getBoundingClientRect();
    if (!R.width) return;
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - R.left, r: r.right - R.left, t: r.top - R.top, b: r.bottom - R.top, cx: (r.left + r.right) / 2 - R.left, cy: (r.top + r.bottom) / 2 - R.top }; };
    const nid = (id) => inner.querySelector(`[data-nid="${id}"]`);
    // When several green arrows end at one box, fan their tips out so each keeps its own handle
    const perTo = {};
    last.edges.filter((e) => e.t === "gate").forEach((e) => (perTo[e.b] = perTo[e.b] || []).push(e));
    Object.values(perTo).forEach((a) => a.forEach((e, i) => { e.i = i; e.n = a.length; }));
    const geo = [], used = new Set();
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
        const chip = inner.querySelector(`.qf-chip[data-cid="${e.a}"]`); if (!chip) return;
        const C = box(chip), N = box(chip.closest(".qf-node")), dir = B.cx < N.cx - 20 ? -1 : 1, x = dir < 0 ? N.l : N.r;
        const tx = B.cx + ((e.i || 0) - ((e.n || 1) - 1) / 2) * 24;
        const reach = Math.min(60, 20 + Math.abs(tx - x) / 2);  // short hook when the follow-up sits right under the node
        const d = `M${x} ${C.cy} C${x + dir * reach} ${C.cy} ${tx} ${B.t - 50} ${tx} ${B.t}`, key = e.a + ">" + e.b;
        paths += `<path class="qf-e gate${selEdge === key ? " sel" : ""}" data-edge="${esc(key)}" marker-end="url(#qf-g)" d="${d}"/>`;
        geo.push({ key, cid: e.a, tid: e.b, sx: x, sy: C.cy, tx, ty: B.t, dir, d });
        used.add(e.a + "@" + (dir < 0 ? "l" : "r"));
      } else {
        const f = nid(e.a), w = inner.querySelector(`[data-q="${e.a}"]`); if (!f || !w) return;
        const A = box(f), L = box(w).l - 16;
        paths += `<path class="qf-e skip" marker-end="url(#qf-a)" d="M${A.l} ${A.cy} H${L} V${B.cy} H${B.l}"/>`;
      }
    });
    [svg, hsvg].forEach((v) => { v.setAttribute("width", inner.scrollWidth); v.setAttribute("height", inner.scrollHeight); });
    svg.querySelectorAll("path.qf-e").forEach((p) => p.remove());
    svg.insertAdjacentHTML("beforeend", paths);

    let hs = "";
    geo.forEach((g) => {
      let x = "";
      if (selEdge === g.key) { // the selected arrow shows a remove button halfway along
        const p = [...svg.querySelectorAll("path.qf-e.gate")].find((q) => q.dataset.edge === g.key);
        if (p) { const m = p.getPointAtLength(p.getTotalLength() / 2);
          x = `<g class="qf-x" data-unlink="${esc(g.key)}" transform="translate(${m.x} ${m.y})"><title>Remove this connection</title><circle r="11" class="qf-x-bg"/><path d="M-4 -4 4 4M4 -4-4 4" class="qf-x-t"/></g>`; }
      }
      hs += `<g class="qf-edge${selEdge === g.key ? " sel" : ""}" data-edge="${esc(g.key)}"><path class="qf-hit" d="${g.d}"/>
        <circle class="qf-hs" data-drag="start" data-edge="${esc(g.key)}" cx="${g.sx}" cy="${g.sy}" r="7"><title>Drag onto another answer to start this arrow from there</title></circle>
        <circle class="qf-he" data-drag="end" data-edge="${esc(g.key)}" cx="${g.tx}" cy="${g.ty - 10}" r="11"><title>Drag onto another question to point this arrow there</title></circle>${x}</g>`;
    });
    // A free "port" on each answer: drag from it to a question to draw a new connection
    inner.querySelectorAll(".qf-chip[data-cid]").forEach((chip) => {
      const cid = chip.dataset.cid, C = box(chip), N = box(chip.closest(".qf-node"));
      const side = !used.has(cid + "@r") ? 1 : !used.has(cid + "@l") ? -1 : 0;
      if (!side) return;
      const px = side > 0 ? N.r : N.l;
      hs += `<g class="qf-portg"><circle class="qf-port-hit" data-drag="new" data-cid="${esc(cid)}" data-dir="${side}" cx="${px}" cy="${C.cy}" r="12"><title>Drag onto a question to connect this answer to it</title></circle><circle class="qf-port" cx="${px}" cy="${C.cy}" r="5"/></g>`;
    });
    hsvg.innerHTML = hs;
    last.geo = geo;
  }

  // ---- Dragging arrows ----
  // Three drags, all ending on a box: from an answer's port (new connection), from an arrow's tip (point it at another
  // question), from an arrow's start dot (start it from another answer). Dropping anywhere else cancels. The actual
  // data change is done by admin-quick.js through cb.onLink; cb.canLink says whether a drop target is allowed.
  function bind(root) {
    if (root._qfBound) return;
    root._qfBound = true;
    root.addEventListener("pointerdown", (e) => {
      const h = e.target.closest && e.target.closest("[data-drag]");
      if (!h || !last || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      begin(h, e);
    });
    root.addEventListener("click", (e) => {
      const u = e.target.closest("[data-unlink]");
      if (u) { const [cid, to] = u.dataset.unlink.split(">"); selEdge = null; cb.onLink({ type: "unlink", cid, to }); return; }
      const hit = e.target.closest(".qf-hit");
      if (hit) { const k = hit.parentNode.dataset.edge; selEdge = selEdge === k ? null : k; repaint(); return; }
      if (selEdge && !e.target.closest("[data-drag]")) { selEdge = null; repaint(); }
    });
  }

  function begin(h, e) {
    const mode = h.dataset.drag, inner = last.root.querySelector(".qf"), hsvg = inner.querySelector(".qf-hsvg");
    const g = mode === "new" ? null : (last.geo || []).find((k) => k.key === h.dataset.edge);
    if (mode !== "new" && !g) return;
    drag = {
      mode, g, cid: g ? g.cid : h.dataset.cid, tid: g && g.tid,
      sx: g ? g.sx : Number(h.getAttribute("cx")), sy: g ? g.sy : Number(h.getAttribute("cy")), dir: g ? g.dir : Number(h.dataset.dir),
      x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, moved: false, hot: null, hit: null,
    };
    hsvg.insertAdjacentHTML("beforeend", '<path class="qf-ghost" marker-end="url(#qf-g)"/>');
    drag.ghost = hsvg.lastElementChild;
    if (g) { // fade the arrow being moved
      const grp = h.closest(".qf-edge"); if (grp) grp.classList.add("qf-lift");
      const p = [...inner.querySelectorAll(".qf-svg path.qf-e.gate")].find((q) => q.dataset.edge === g.key); if (p) p.classList.add("qf-lift");
    }
    inner.classList.add("qf-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    drag.raf = requestAnimationFrame(tick);
    update();
  }
  const onMove = (e) => { if (!drag) return; drag.cx = e.clientX; drag.cy = e.clientY; update(); };
  const onUp = (e) => { if (!drag) return; drag.cx = e.clientX; drag.cy = e.clientY; update(); finish(false); };
  const onCancel = () => finish(true);
  const onKey = (e) => { if (e.key === "Escape") finish(true); };

  // Near the edge of the screen or of the chart, scroll so far-away targets can be reached
  function tick() {
    if (!drag) return;
    const sc = last.root.querySelector(".qf-scroll"), r = sc.getBoundingClientRect(), m = 44;
    let dx = 0, dy = 0;
    if (drag.moved) {
      if (drag.cx < r.left + m) dx = -9; else if (drag.cx > r.right - m) dx = 9;
      if (drag.cy < m) dy = -9; else if (drag.cy > window.innerHeight - m) dy = 9;
    }
    if (dx || dy) { sc.scrollLeft += dx; window.scrollBy(0, dy); update(); }
    drag.raf = requestAnimationFrame(tick);
  }

  function update() {
    const inner = last.root.querySelector(".qf"), R = inner.getBoundingClientRect(), px = drag.cx - R.left, py = drag.cy - R.top;
    if (!drag.moved && Math.hypot(drag.cx - drag.x0, drag.cy - drag.y0) > 4) drag.moved = true;
    if (drag.hot) { drag.hot.classList.remove("qf-drop", "qf-nodrop"); drag.hot = null; }
    drag.hit = null;
    if (!drag.moved) { drag.ghost.setAttribute("d", ""); return; }
    if (drag.mode === "start") { // the tip stays put, the start follows the pointer
      const g = drag.g, dd = g.tx >= px ? 1 : -1;
      drag.ghost.setAttribute("d", `M${px} ${py} C${px + dd * 60} ${py} ${g.tx} ${g.ty - 50} ${g.tx} ${g.ty}`);
    } else {
      drag.ghost.setAttribute("d", `M${drag.sx} ${drag.sy} C${drag.sx + drag.dir * 60} ${drag.sy} ${px} ${py - 50} ${px} ${py}`);
    }
    const el = document.elementFromPoint(drag.cx, drag.cy), pq = drag.cid.split("|")[0];
    let target = null, ok = false, tid, newCid;
    if (drag.mode === "start") {
      target = el && el.closest(".qf-chip[data-cid]");
      if (target) { newCid = target.dataset.cid; ok = cb.canLink(newCid.split("|")[0], drag.tid); }
    } else {
      target = el && el.closest(".qf-node");
      if (target) { tid = target.dataset.nid; ok = cb.canLink(pq, tid); }
    }
    if (target) { target.classList.add(ok ? "qf-drop" : "qf-nodrop"); drag.hot = target; }
    if (ok) drag.hit = { tid, newCid };
  }

  function finish(cancelled) {
    const d = drag; if (!d) return;
    drag = null;
    cancelAnimationFrame(d.raf);
    window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel); window.removeEventListener("keydown", onKey);
    if (d.hot) d.hot.classList.remove("qf-drop", "qf-nodrop");
    if (d.ghost) d.ghost.remove();
    const inner = last && last.root.querySelector(".qf"); if (inner) inner.classList.remove("qf-dragging");
    if (!cancelled && !d.moved && d.g) selEdge = selEdge === d.g.key ? null : d.g.key; // a plain click on a handle selects the arrow
    else if (!cancelled && d.hit) {
      selEdge = null;
      if (d.mode === "new") cb.onLink({ type: "connect", cid: d.cid, to: d.hit.tid });
      else if (d.mode === "end") { if (d.hit.tid !== d.tid) cb.onLink({ type: "end", cid: d.cid, from: d.tid, to: d.hit.tid }); }
      else if (d.hit.newCid !== d.cid) cb.onLink({ type: "start", cid: d.cid, to: d.tid, newCid: d.hit.newCid });
    }
    repaint(); // puts back the faded arrow (or does nothing if onLink already re-drew)
  }

  return { draw, repaint };
})();
