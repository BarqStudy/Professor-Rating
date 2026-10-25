// One delegated listener survives catalogue refreshes and page navigation.
export function setupInteractions() {
  const enabled = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  const surfaces = '.doctor-card, .action-card, .nav-item, .primary, .icon-btn, .assistant-launcher';
  const fading = new Map();
  let surface = null, frame = 0, previousTime = 0;
  let x = 50, y = 50, targetX = 50, targetY = 50;

  const clear = (element) => {
    clearTimeout(fading.get(element));
    fading.delete(element);
    element.style.removeProperty('--pointer-x');
    element.style.removeProperty('--pointer-y');
  };
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (surface) {
      const last = surface;
      clearTimeout(fading.get(last));
      // Keep the last light position until the opacity transition has finished.
      if (enabled.matches && last.isConnected && !document.hidden) {
        fading.set(last, setTimeout(() => clear(last), 650));
      } else clear(last);
    }
    surface = null;
  };
  const paint = (time) => {
    frame = 0;
    if (!enabled.matches || !surface?.isConnected || document.hidden) return reset();
    const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;
    const blend = 1 - Math.exp(-elapsed / 65);
    x += (targetX - x) * blend;
    y += (targetY - y) * blend;
    surface.style.setProperty('--pointer-x', `${x.toFixed(2)}%`);
    surface.style.setProperty('--pointer-y', `${y.toFixed(2)}%`);
    if (Math.abs(targetX - x) + Math.abs(targetY - y) > .1) frame = requestAnimationFrame(paint);
    else previousTime = 0;
  };
  const move = (event) => {
    if (!enabled.matches || event.pointerType !== 'mouse') return reset();
    const next = event.target instanceof Element ? event.target.closest(surfaces) : null;
    if (!next || next.matches(':disabled, [aria-disabled=true]') || next.closest('[inert]')) return reset();
    if (next !== surface) {
      reset();
      clearTimeout(fading.get(next));
      fading.delete(next);
      surface = next;
      x = parseFloat(next.style.getPropertyValue('--pointer-x'));
      y = parseFloat(next.style.getPropertyValue('--pointer-y'));
      if (!Number.isFinite(x)) x = 50;
      if (!Number.isFinite(y)) y = 50;
    }
    const bounds = next.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return reset();
    targetX = Math.max(0, Math.min(100, 100 * (event.clientX - bounds.left) / bounds.width));
    targetY = Math.max(0, Math.min(100, 100 * (event.clientY - bounds.top) / bounds.height));
    if (!frame) frame = requestAnimationFrame(paint);
  };

  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerout', (event) => {
    if (surface && !(event.relatedTarget instanceof Node && surface.contains(event.relatedTarget))) reset();
  }, { passive: true });
  const stop = () => {
    reset();
    for (const element of fading.keys()) clear(element);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('blur', stop);
  window.addEventListener('pagehide', stop);
  window.addEventListener('scroll', reset, { passive: true, capture: true });
  enabled.addEventListener('change', stop);
}
