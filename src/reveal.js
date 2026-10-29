const targets = '.welcome>div:first-child,.hero-art,.search-block,.college-selector,.quick-actions>.action-card,.stats>div,.section-heading,.doctor-card,.university-request,.bottom-banner,.page-title,.directory-actions,.college-tabs,.directory-search,.directory-major-heading,.panel,.study-course,.study-intro,.study-filters,.advisor-result-heading,.developer-card,.moderation-review,.university-introduction,.university-directory-tools,.uni-carousel,.university-directory-footer';

export function setupReveals() {
  const app = document.querySelector('#app');
  if (!app || !('IntersectionObserver' in window)) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet(), pending = new Set();
  const reveal = (node, delay = 0, immediate = false) => {
    pending.delete(node); observer.unobserve(node);
    if (immediate || motion.matches) { node.classList.remove('miyar-reveal-pending', 'miyar-reveal-shown'); return; }
    node.style.setProperty('--reveal-delay', `${delay}ms`);
    node.classList.add('miyar-reveal-shown');
  };
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting && pending.has(entry.target))
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || b.boundingClientRect.right - a.boundingClientRect.right)
      .forEach((entry, index) => reveal(entry.target, Math.min(index, 8) * 30));
  }, {rootMargin: '0px 0px -16px 0px', threshold: 0});
  const register = scope => {
    const nodes = [...(scope.matches(targets) ? [scope] : []), ...scope.querySelectorAll(targets)];
    for (const node of nodes) {
      if (!node.closest('main') || node.querySelector(targets) || seen.has(node)) continue;
      seen.add(node);
      if (motion.matches) continue;
      if (document.documentElement.classList.contains('hero-transition-active')) {
        const box = node.getBoundingClientRect();
        if (box.bottom > 0 && box.top < innerHeight) continue;
      }
      node.classList.add('miyar-reveal-pending'); pending.add(node); observer.observe(node);
    }
  };
  new MutationObserver(records => {
    let removed = false;
    for (const record of records) {
      if ([...record.removedNodes].some(node => node.nodeType === 1)) removed = true;
      for (const node of record.addedNodes) if (node.nodeType === 1) register(node);
    }
    if (removed) for (const node of pending) if (!node.isConnected) { observer.unobserve(node); pending.delete(node); }
  }).observe(app, {childList: true, subtree: true});
  app.addEventListener('animationend', event => {
    if (event.animationName === 'miyar-reveal') event.target.classList.remove('miyar-reveal-pending', 'miyar-reveal-shown');
  });
  app.addEventListener('focusin', event => {
    // Pointer focus must not jump the pressed button between down and up.
    if (!event.target.matches(':focus-visible')) return;
    for (let node = event.target; node && node !== app; node = node.parentElement) {
      if (node.classList.contains('miyar-reveal-pending')) reveal(node, 0, true);
    }
  });
  motion.addEventListener('change', () => { if (motion.matches) app.querySelectorAll('.miyar-reveal-pending').forEach(node => reveal(node, 0, true)); });
  register(app);
}
