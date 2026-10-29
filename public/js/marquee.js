// Long names scroll like a train so the whole name can be read.
// mqHtml(name) returns the markup; names that already fit stay still.
(function () {
  const SPEED = 40;   // px per second: slow enough to read comfortably
  const GAP = 48;     // space between the end of the name and its repeat
  const PAUSE = 1.8;  // seconds the name rests at the start so the beginning can be read
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  window.mqHtml = (text) => `<span class="mq"><span class="mq-in"><span class="mq-txt">${esc(text)}</span></span></span>`;

  function setup(mq) {
    const inner = mq.firstElementChild, txt = inner && inner.firstElementChild;
    if (!txt) return;
    mq.dataset.mq = "1";
    inner.getAnimations().forEach((a) => a.cancel());
    inner.querySelector(".mq-copy")?.remove();
    mq.classList.remove("mq-run");
    if (reduce.matches) return;
    const w = txt.offsetWidth;
    if (!w || w <= mq.clientWidth + 1) return;
    const copy = txt.cloneNode(true);
    copy.className = "mq-copy";
    copy.setAttribute("aria-hidden", "true");
    inner.appendChild(copy);
    const dist = w + GAP, move = dist / SPEED, total = move + PAUSE;
    mq.classList.add("mq-run");
    inner.animate(
      [{ transform: "translateX(0)", offset: 0 }, { transform: "translateX(0)", offset: PAUSE / total }, { transform: `translateX(-${dist}px)`, offset: 1 }],
      { duration: total * 1000, iterations: Infinity }
    );
  }

  const ro = "ResizeObserver" in window ? new ResizeObserver((es) => es.forEach((e) => setup(e.target))) : null;
  function scan() {
    document.querySelectorAll(".mq:not([data-mq])").forEach((mq) => { setup(mq); ro && ro.observe(mq); });
  }
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => document.querySelectorAll(".mq").forEach(setup));
  reduce.addEventListener && reduce.addEventListener("change", () => document.querySelectorAll(".mq").forEach(setup));
  scan();
})();
