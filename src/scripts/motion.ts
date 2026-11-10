/** Scroll reveals and number counters. Respects reduced-motion preferences. */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealEls = document.querySelectorAll<HTMLElement>('[data-reveal]');
if (reduce || !('IntersectionObserver' in window)) {
  revealEls.forEach((el) => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  revealEls.forEach((el) => io.observe(el));
}

const counters = document.querySelectorAll<HTMLElement>('[data-count]');
const run = (el: HTMLElement) => {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  if (reduce) {
    el.textContent = String(target);
    return;
  }
  const start = performance.now();
  const dur = 1400;
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
if ('IntersectionObserver' in window) {
  const co = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          run(e.target as HTMLElement);
          co.unobserve(e.target);
        }
      });
    },
    { threshold: 0.6 },
  );
  counters.forEach((c) => co.observe(c));
}
