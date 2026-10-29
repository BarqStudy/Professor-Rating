const format = (value, prefix) => prefix + value.toLocaleString('ar');

export function statNumber(value, prefix = '') {
  const count = Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  prefix = prefix === '+' ? '+' : '';
  const label = format(count, prefix);
  return `<b><span class="stat-readable">${label}</span><span data-stat-value="${count}" data-stat-prefix="${prefix}" aria-hidden="true">${label}</span></b>`;
}

export function animateStats(box) {
  if (!box) return () => {};
  const values = [...box.querySelectorAll('[data-stat-value]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || !('IntersectionObserver' in window)) return () => {};
  let frame = 0, started = false;
  const paint = progress => values.forEach(element => {
    const count = Number(element.dataset.statValue);
    const label = format(Math.round(count * progress), element.dataset.statPrefix);
    if (element.textContent !== label) element.textContent = label;
  });
  const finish = () => { cancelAnimationFrame(frame); paint(1); };
  const observer = new IntersectionObserver(entries => {
    if (started || !entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .2)) return;
    started = true;
    observer.disconnect();
    const start = performance.now();
    const tick = now => {
      if (!box.isConnected) return;
      const progress = Math.max(0, Math.min(1, (now - start) / 1100));
      paint(1 - (1 - progress) ** 3);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }, {threshold: .2});
  paint(0);
  observer.observe(box);
  const preferenceChanged = () => { if (motion.matches) { observer.disconnect(); finish(); } };
  motion.addEventListener('change', preferenceChanged);
  return () => { observer.disconnect(); cancelAnimationFrame(frame); motion.removeEventListener('change', preferenceChanged); };
}
