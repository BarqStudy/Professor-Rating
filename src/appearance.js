import {storage} from './storage.js';
import {cancelHero} from './hero.js';

let active = null;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const root = document.documentElement;

function apply(theme) {
  root.dataset.theme = theme;
  storage.setItem('athar-theme', theme);
  document.querySelectorAll('[data-appearance]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.appearance === theme)));
}
function clear(request) {
  if (active !== request) return;
  active = null;
  clearTimeout(request.timer);
  root.classList.remove('theme-switching');
}
function stop(commit = true) {
  const request = active;
  if (!request) return;
  if (commit) apply(request.theme);
  request.animation?.cancel();
  request.transition?.skipTransition();
  clear(request);
}

export function setAppearance(theme, source) {
  if (!['light', 'dark'].includes(theme)) return;
  cancelHero();
  stop(false);
  const current = root.dataset.theme === 'dark' ? 'dark' : 'light';
  if (current === theme || motion.matches || document.hidden || typeof document.startViewTransition !== 'function') { apply(theme); return; }
  const box = source?.getBoundingClientRect();
  const x = Math.max(0, Math.min(innerWidth, box ? box.left + box.width / 2 : innerWidth / 2));
  const y = Math.max(0, Math.min(innerHeight, box ? box.top + box.height / 2 : innerHeight / 2));
  const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
  const request = {theme, transition: null, animation: null, timer: null, started: performance.now()};
  active = request;
  root.classList.add('theme-switching');
  try {
    request.transition = document.startViewTransition(() => { if (active === request) apply(theme); });
    // Never keep a captured page over the live UI if the browser stalls.
    request.timer = setTimeout(() => { if (active === request) stop(); }, Math.max(0, 550 - (performance.now() - request.started)));
  } catch { apply(theme); clear(request); return; }
  void (async () => {
    try {
      await request.transition.ready;
      if (active !== request) return;
      // Keep capture + animation within one short interaction, even when a
      // blurred dialog takes longer to capture than a normal page.
      const captured = performance.now() - request.started;
      if (captured > 300) { stop(); return; }
      request.animation = root.animate({clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]}, {
        duration: Math.min(280, 450 - captured), easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)',
      });
      await request.animation.finished;
    } catch { if (active === request) apply(theme); }
    finally {
      // Release snapshots at the visual finish; waiting for `finished` can
      // leave the near-complete circle stuck on slower mobile compositors.
      request.animation?.cancel();
      request.transition.skipTransition();
      clear(request);
    }
  })();
}

export function toggleAppearance(source) {
  setAppearance((active?.theme || root.dataset.theme) === 'dark' ? 'light' : 'dark', source);
}
// A new interaction can interrupt the visual without delaying navigation or typing.
document.addEventListener('pointerdown', () => stop(), {capture: true, passive: true});
document.addEventListener('keydown', () => stop(), {capture: true});
window.addEventListener('resize', () => stop());
window.addEventListener('popstate', () => stop());
document.addEventListener('wheel', () => stop(), {capture: true, passive: true});
window.addEventListener('pagehide', () => stop());
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
motion.addEventListener('change', () => { if (motion.matches) stop(); });
