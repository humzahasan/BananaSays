// Page interactions outside the 3D hero: menu tabs, signature carousel, footer year.
document.getElementById("year").textContent = new Date().getFullYear();

// ---------- Menu tabs (WAI-ARIA tabs pattern) ----------
const tablist = document.querySelector(".menu-tabs");
if (tablist) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };
  tabs.forEach((t) => t.addEventListener("click", () => select(t)));
  tablist.addEventListener("keydown", (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length], true);
  });
}

// ---------- Signature carousel ----------
const track = document.getElementById("sig-track");
if (track) {
  const step = () => (track.querySelector(".sig")?.getBoundingClientRect().width || 300) + 24;
  document.querySelectorAll(".sig-btn").forEach((b) =>
    b.addEventListener("click", () => track.scrollBy({ left: step() * Number(b.dataset.dir), behavior: "smooth" }))
  );
  const update = () => {
    const [prev, next] = document.querySelectorAll(".sig-btn");
    prev.disabled = track.scrollLeft < 8;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
  };
  track.addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  update();

  // Mouse drag to scroll (touch already scrolls natively).
  let down = false, startX = 0, startLeft = 0, moved = false;
  track.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "mouse") return;
    down = true; moved = false; startX = ev.clientX; startLeft = track.scrollLeft;
    track.classList.add("dragging");
  });
  addEventListener("pointermove", (ev) => {
    if (!down) return;
    const dx = ev.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    track.scrollLeft = startLeft - dx;
  });
  addEventListener("pointerup", () => { down = false; track.classList.remove("dragging"); });
  track.addEventListener("click", (ev) => { if (moved) ev.preventDefault(); }, true);
}
