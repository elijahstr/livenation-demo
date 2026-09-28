const slideData = Object.freeze({
  proofLinks: Object.freeze({
    databricks: Object.freeze({
      href: "https://dbc-da714a97-83a0.cloud.databricks.com/explore/data/workspace/livenation_demo/current_sales_evidence",
      target: "_blank",
      rel: "noreferrer",
    }),
    agentcore: Object.freeze({
      href: "https://console.aws.amazon.com/bedrock-agentcore/home?region=us-east-1#/",
      target: "_blank",
      rel: "noreferrer",
    }),
    repository: Object.freeze({
      href: "https://github.com/elijahstr/livenation-demo",
      target: "_blank",
      rel: "noreferrer",
    }),
    implementation: Object.freeze({
      href: "https://github.com/elijahstr/livenation-demo/blob/main/docs/plans/2026-09-28-west-region-sales-demo-implementation.md",
      target: "_blank",
      rel: "noreferrer",
    }),
  }),
});

const slides = [...document.querySelectorAll(".slide")];
const previous = document.querySelector("#previous-slide");
const next = document.querySelector("#next-slide");
const status = document.querySelector("#slide-status");
const swipeThreshold = 48;
let activeIndex = 0;
let touchStart = null;

const isEditable = (element) => element instanceof HTMLElement && (
  element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)
);

document.querySelectorAll("[data-proof-link]").forEach((link) => {
  if (!(link instanceof HTMLAnchorElement)) return;
  const details = slideData.proofLinks[link.dataset.proofLink];
  if (!details) return;
  link.href = details.href;
  link.target = details.target;
  link.rel = details.rel;
});

function updateSlides({ focus = false } = {}) {
  slides.forEach((slide, index) => {
    const isActive = index === activeIndex;
    slide.classList.toggle("is-active", isActive);
    slide.setAttribute("aria-hidden", String(!isActive));
    slide.querySelectorAll("a, button").forEach((control) => {
      control.tabIndex = isActive ? 0 : -1;
    });
  });
  previous.disabled = activeIndex === 0;
  next.disabled = activeIndex === slides.length - 1;
  status.textContent = `Slide ${activeIndex + 1} of ${slides.length}`;
  if (focus) slides[activeIndex].focus();
}

function goTo(index, options) {
  activeIndex = Math.max(0, Math.min(slides.length - 1, index));
  updateSlides(options);
}

previous.addEventListener("click", () => goTo(activeIndex - 1, { focus: true }));
next.addEventListener("click", () => goTo(activeIndex + 1, { focus: true }));

document.addEventListener("keydown", (event) => {
  if (isEditable(event.target)) return;
  if (event.key === "ArrowLeft") goTo(activeIndex - 1, { focus: true });
  if (event.key === "ArrowRight") goTo(activeIndex + 1, { focus: true });
  if (event.key === "Home") goTo(0, { focus: true });
  if (event.key === "End") goTo(slides.length - 1, { focus: true });
});

document.addEventListener("touchstart", (event) => {
  const touch = event.changedTouches[0];
  touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
}, { passive: true });

document.addEventListener("touchend", (event) => {
  const touch = event.changedTouches[0];
  if (!touchStart || !touch) return;
  const horizontalDistance = touch.clientX - touchStart.x;
  const verticalDistance = touch.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(horizontalDistance) < swipeThreshold || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return;
  goTo(activeIndex + (horizontalDistance < 0 ? 1 : -1), { focus: true });
}, { passive: true });

document.body.classList.add("interactive-deck");
updateSlides();
