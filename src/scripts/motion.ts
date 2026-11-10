/**
 * Site-wide motion: scroll reveals, split-word headings, number counters,
 * pointer spotlight on cards and magnetic buttons.
 * Everything degrades to a static page when reduced motion is requested.
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Split section headings into words so they can rise in one after another. */
const splitTargets = document.querySelectorAll<HTMLElement>('h1[data-reveal], h2[data-reveal]');
if (!reduce) {
  splitTargets.forEach((el) => {
    // Only split plain-text headings; leave headings with markup alone.
    if (el.children.length > 0) return;
    const text = el.textContent?.trim() ?? '';
    if (!text) return;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    text.split(/\s+/).forEach((word, i, arr) => {
      const outer = document.createElement('span');
      outer.className = 'split-word';
      outer.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.style.setProperty('--w', String(i));
      inner.textContent = word;
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.add('is-split');
  });
}

/* Reveal on scroll. */
const revealEls = document.querySelectorAll<HTMLElement>('[data-reveal], [data-line]');
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

/* Count numbers up when they come into view. */
const counters = document.querySelectorAll<HTMLElement>('[data-count]');
const run = (el: HTMLElement) => {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  if (reduce) {
    el.textContent = String(target);
    return;
  }
  const start = performance.now();
  const dur = 1600;
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 4);
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

if (finePointer && !reduce) {
  /* Spotlight: one delegated listener feeds the pointer position to the card under it. */
  document.addEventListener(
    'pointermove',
    (e) => {
      const card = (e.target as Element | null)?.closest?.<HTMLElement>('.spotlight');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );

  /* Magnetic buttons: primary actions lean a few pixels toward the pointer. */
  document.querySelectorAll<HTMLElement>('.btn:not(.btn--block), .hbtn, [data-magnetic]').forEach((el) => {
    const strength = 0.22;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * strength;
      const y = (e.clientY - (r.top + r.height / 2)) * strength * 1.4;
      el.style.setProperty('--mag-x', `${x.toFixed(1)}px`);
      el.style.setProperty('--mag-y', `${y.toFixed(1)}px`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--mag-x', '0px');
      el.style.setProperty('--mag-y', '0px');
    });
  });
}
