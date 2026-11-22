// Adding dishes from inside the 3D view, so nobody has to leave it (and lose the scene) to add another model.
//   VwAdd.open(mode)   a bottom card listing the dishes that have a 3D model. mode "add" puts the tapped dish next to the ones already
//                      in view; mode "replace" swaps the single dish for the tapped one.
//   VwAdd.scan()       camera scanner: point it at a dish's QR code (the one made in the admin QR tab, link ?item=ID) and that dish is added.
//   VwAdd.close()      closes whichever of the two is showing
//   VwAdd.arUi(host)   the "+ Add dish" button and list shown inside the AR session (see below)
// Uses Viewer (js/viewer.js) for what is in view and for adding, and $ / esc / money / data from js/menu.js.
// The scanner uses the phone's own QR reader when it has one (BarcodeDetector, Chrome / Android). Everything else (iPhone Safari,
// desktop Firefox) uses js/jsqr.min.js, which is only downloaded the first time someone scans.
(() => {
  const V = window.Viewer;
  if (!V) return;

  let mode = "add", pending = null, opener = null;

  // ---- short message at the bottom (same look as the rest of the app's messages) ----
  const toast = document.createElement("div");
  toast.className = "vwa-toast";
  toast.setAttribute("role", "status");
  toast.hidden = true;
  document.body.appendChild(toast);
  let toastTimer = 0;
  const say = (msg) => { toast.textContent = msg; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 2600); };

  const withModel = () => data.items.filter((x) => x.model);
  const nameOf = (i) => i.name.trim();

  // ================= The picker (a bottom card, same motion as the dish card) =================
  const pick = document.createElement("div");
  pick.className = "vwa";
  pick.hidden = true;
  pick.innerHTML = `<div class="vwa-box" role="dialog" aria-modal="true" aria-labelledby="vwa-title">
      <div class="vwa-head">
        <div class="vwa-top"><h2 id="vwa-title">Add a 3D model</h2><button type="button" class="vwa-x" aria-label="Close">\u00d7</button></div>
        <input type="search" class="vwa-search" placeholder="Search dishes" aria-label="Search dishes that have a 3D model" autocomplete="off" enterkeyhint="search">
      </div>
      <div class="vwa-list"></div>
      <div class="vwa-foot"><button type="button" class="btn ghost vwa-scan-btn">Scan a dish QR instead</button></div>
    </div>`;
  document.body.appendChild(pick);
  const box = pick.querySelector(".vwa-box"), title = pick.querySelector("#vwa-title"), search = pick.querySelector(".vwa-search"), list = pick.querySelector(".vwa-list");

  const card = Springs.bottomCard({ root: pick, box, finish: finishPick });

  function renderList() {
    const q = search.value.trim().toLowerCase(), inView = V.ids();
    const rows = withModel().filter((i) => !q || `${nameOf(i)} ${i.category}`.toLowerCase().includes(q));
    if (!rows.length) { list.innerHTML = `<p class="vwa-none">${q ? "No dish matches that." : "No dishes have a 3D model yet."}</p>`; return; }
    list.innerHTML = rows.map((i) => {
      const on = inView.includes(i.id);
      const thumb = i.image ? `<img class="vwa-thumb" src="${esc(i.image)}" alt="" loading="lazy">` : `<span class="vwa-thumb vwa-ph" aria-hidden="true">${esc(nameOf(i).charAt(0).toUpperCase())}</span>`;
      return `<button type="button" class="vwa-row" data-id="${esc(i.id)}"${on ? " disabled" : ""}>${thumb}<span class="vwa-txt"><strong>${esc(nameOf(i))}</strong><small>${esc(i.category)} \u00b7 ${money(i.price)}</small></span><span class="vwa-act${on ? " in" : ""}">${on ? "In view" : mode === "replace" ? "Show" : "+ Add"}</span></button>`;
    }).join("");
  }

  function openPicker(m) {
    if (!V.isOpen() || !pick.hidden) return;
    closeScanner();
    mode = m === "replace" ? "replace" : "add";
    title.textContent = mode === "replace" ? "Choose a 3D model" : "Add a 3D model";
    search.value = "";
    pick.querySelector(".vwa-foot").hidden = typeof qrOn === "function" && !qrOn(); // no "Scan a dish QR" while QR is turned off in the admin
    renderList();
    opener = document.activeElement;
    pick.hidden = false;
    V.root.inert = true;
    card.open();
    pick.querySelector(".vwa-x").focus({ preventScroll: true });   // not the search box: that would pop the keyboard up straight away
  }
  function closePicker() { if (!pick.hidden) card.dismiss(); }
  function finishPick() {
    pick.hidden = true;
    V.root.inert = false;
    const run = pending; pending = null;
    if (run) run(); else if (opener && opener.isConnected) opener.focus?.({ preventScroll: true });
    opener = null;
  }

  // Result of adding a dish, as words
  function report(it, how) {
    if (how === "ok") say(`${nameOf(it)} added`);
    else if (how === "dup") say(`${nameOf(it)} is already in view`);
    else if (how === "full") say(`The 3D view holds ${V.max} dishes. Remove one first.`);
  }

  list.addEventListener("click", (e) => {
    const b = e.target.closest(".vwa-row");
    if (!b || b.disabled) return;
    const it = data.items.find((x) => x.id === b.dataset.id);
    if (!it) return;
    pending = () => { if (!V.isOpen()) return; if (mode === "replace") V.replace(it.id); else report(it, V.add(it.id)); };
    closePicker();
  });
  search.addEventListener("input", renderList);
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") search.blur(); });
  pick.addEventListener("click", (e) => { if (e.target === pick || e.target.closest(".vwa-x")) closePicker(); });
  pick.querySelector(".vwa-scan-btn").addEventListener("click", () => { pending = () => openScanner(); closePicker(); });

  // ================= The scanner =================
  const scanEl = document.createElement("div");
  scanEl.className = "vws";
  scanEl.hidden = true;
  scanEl.setAttribute("role", "dialog");
  scanEl.setAttribute("aria-modal", "true");
  scanEl.setAttribute("aria-label", "Scan a dish QR code");
  scanEl.innerHTML = `<video class="vws-video" playsinline muted></video>
    <div class="vws-shade" aria-hidden="true"><i class="vws-frame"></i></div>
    <button type="button" class="vws-x" aria-label="Close the scanner">\u00d7</button>
    <div class="vws-bottom"><p class="vws-msg" role="status" aria-live="polite">Starting the camera\u2026</p><button type="button" class="btn ghost vws-list" hidden>Pick from the list instead</button></div>`;
  document.body.appendChild(scanEl);
  const video = scanEl.querySelector(".vws-video"), msg = scanEl.querySelector(".vws-msg"), listBtn = scanEl.querySelector(".vws-list");

  let stream = null, timer = 0, run = 0, scanOpener = null, lastRaw = "", lastAt = 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const setMsg = (t, bad) => { msg.textContent = t; msg.classList.toggle("bad", !!bad); };
  const loadJsQR = () => window.jsQR ? Promise.resolve() : new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = "js/jsqr.min.js?v=1";
    s.onload = ok;
    s.onerror = () => no(new Error("The QR reader could not be loaded. Check your connection."));
    document.head.appendChild(s);
  });

  // What a QR code means here: the dish link (...?item=ID) from the admin QR tab. A bare dish id also works.
  function dishFromCode(raw) {
    const t = String(raw || "").trim();
    let id = t;
    try { const u = new URL(t); id = u.searchParams.get("item") || ""; } catch { /* not a link: maybe a bare id */ }
    return data.items.find((x) => x.id === id) || null;
  }

  function handleCode(raw) {
    const now = Date.now();
    if (raw === lastRaw && now - lastAt < 2500) return false;           // the same code is still in front of the camera: keep the message that is already showing
    lastRaw = raw; lastAt = now;
    const it = dishFromCode(raw);
    if (!it) { setMsg("That QR code is not a dish from this menu.", true); return false; }
    if (!it.model) { setMsg(`${nameOf(it)} has no 3D model.`, true); return false; }
    if (V.ids().includes(it.id)) { setMsg(`${nameOf(it)} is already in view.`, true); return false; }
    if (V.ids().length >= V.max) { setMsg(`The 3D view holds ${V.max} dishes. Remove one first.`, true); return false; }
    if (navigator.vibrate) try { navigator.vibrate(30); } catch { /* not allowed: fine */ }
    closeScanner(true);
    report(it, V.add(it.id));
    return true;
  }

  async function openScanner() {
    if (typeof qrOn === "function" && !qrOn()) return; // QR turned off in the admin
    if (!V.isOpen() || !scanEl.hidden) return;
    closePicker();
    const my = ++run;
    scanOpener = document.activeElement;
    lastRaw = ""; lastAt = 0;
    scanEl.hidden = false;
    V.root.inert = true;
    listBtn.hidden = true;
    setMsg("Starting the camera\u2026");
    scanEl.querySelector(".vws-x").focus({ preventScroll: true });

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMsg(window.isSecureContext ? "This browser cannot open the camera." : "The camera needs a secure (https) link.", true);
      listBtn.hidden = false; return;
    }
    let detector = null;
    try {
      if ("BarcodeDetector" in window && (!BarcodeDetector.getSupportedFormats || (await BarcodeDetector.getSupportedFormats()).includes("qr_code"))) detector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch { detector = null; }
    try {
      if (!detector) await loadJsQR();
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      if (my !== run) { s.getTracks().forEach((t) => t.stop()); return; }   // closed while the camera was starting
      stream = s;
      video.srcObject = s;
      await video.play();
    } catch (e) {
      if (my !== run) return;
      const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
      const none = e && (e.name === "NotFoundError" || e.name === "OverconstrainedError");
      setMsg(denied ? "Camera access is blocked. Allow it in your browser settings, then try again." : none ? "No camera was found on this device." : (e && e.message) || "The camera could not start.", true);
      listBtn.hidden = false; stopCamera(); return;
    }
    setMsg("Point the camera at a dish QR code.");
    listBtn.hidden = false;

    const tick = async () => {
      if (my !== run) return;
      let raw = "";
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          if (detector) { const c = await detector.detect(video); raw = c[0] ? c[0].rawValue : ""; }
          else {
            const k = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * k); canvas.height = Math.round(video.videoHeight * k);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            raw = r ? r.data : "";
          }
        }
      } catch (e) { /* a bad frame: try the next one */ }
      if (my !== run) return;
      if (raw && handleCode(raw)) return;
      timer = setTimeout(tick, 180);
    };
    tick();
  }

  function stopCamera() {
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }
  function closeScanner(keepViewerLive) {
    if (scanEl.hidden) return;
    run++;
    stopCamera();
    scanEl.hidden = true;
    if (pick.hidden) V.root.inert = false;
    if (!keepViewerLive && scanOpener && scanOpener.isConnected) scanOpener.focus?.({ preventScroll: true });
    scanOpener = null;
  }

  scanEl.querySelector(".vws-x").addEventListener("click", () => closeScanner());
  listBtn.addEventListener("click", () => { closeScanner(true); openPicker("add"); });

  // ================= Inside the AR session ("View on your table") =================
  // Only a page element that sits inside <model-viewer> can be shown over the camera (WebXR DOM overlay: Android Chrome). iPhone (Quick Look) and
  // Android Scene Viewer draw their own screen, so no button can appear there. The camera is in use by AR, so scanning is not offered here; the list is.
  // host = { ids(): dish ids in the scene, add(id): Promise<boolean> }. Returns the element, with show() / hide(); viewer.js puts it in and out of the model-viewer.
  function arUi(host) {
    const el = document.createElement("div");
    el.className = "ar-add";
    el.hidden = true;
    el.innerHTML = `<button type="button" class="ar-add-btn" aria-expanded="false">+ Add dish</button><div class="ar-add-panel" role="group" aria-label="Add a dish" hidden></div><p class="ar-add-msg" role="status" hidden></p>`;
    const btn = el.querySelector(".ar-add-btn"), panel = el.querySelector(".ar-add-panel"), note = el.querySelector(".ar-add-msg");
    panel.dataset.rb = "off";
    let busy = false, nt = 0;
    const flash = (t) => { note.textContent = t; note.hidden = false; clearTimeout(nt); nt = setTimeout(() => { note.hidden = true; }, 2400); };
    const render = () => {
      const inView = host.ids(), left = withModel().filter((i) => !inView.includes(i.id));
      panel.innerHTML = inView.length >= V.max ? `<span class="ar-add-none">Full: ${V.max} dishes</span>`
        : left.length ? left.map((i) => `<button type="button" class="ar-add-row" data-id="${esc(i.id)}">${esc(nameOf(i))}</button>`).join("")
        : `<span class="ar-add-none">Every dish is already here</span>`;
    };
    const setOpen = (on) => { if (on) render(); panel.hidden = !on; btn.setAttribute("aria-expanded", String(on)); };
    btn.addEventListener("click", () => setOpen(panel.hidden));
    panel.addEventListener("click", async (e) => {
      const r = e.target.closest(".ar-add-row");
      if (!r || busy) return;
      busy = true; r.disabled = true;
      const it = data.items.find((x) => x.id === r.dataset.id);
      let ok = false;
      try { ok = await host.add(r.dataset.id); } catch { ok = false; }
      busy = false;
      setOpen(false);
      flash(ok ? `${it ? nameOf(it) : "Dish"} added` : "Could not add that dish");
    });
    // Touches on these controls must not turn the model or place it (same guards as the Effects tray)
    [el, btn, panel].forEach((n) => n.addEventListener("beforexrselect", (e) => e.preventDefault()));
    ["pointerdown", "pointermove", "pointerup", "mousedown", "touchstart", "touchmove", "touchend", "wheel"].forEach((t) => el.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
    el.show = () => { el.hidden = false; };
    el.hide = () => { el.hidden = true; setOpen(false); note.hidden = true; };
    return el;
  }

  // ---- housekeeping ----
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!scanEl.hidden) { closeScanner(); e.stopPropagation(); }
    else if (!pick.hidden) { closePicker(); e.stopPropagation(); }
  }, true);
  document.addEventListener("viewer:close", () => { closeScanner(true); if (!pick.hidden) { pending = null; card.cancel(); pick.hidden = true; V.root.inert = false; } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) closeScanner(true); });   // never leave the camera running in the background

  window.VwAdd = { arUi, open: openPicker, scan: openScanner, close: () => { closeScanner(); closePicker(); }, dishFromCode };
})();
