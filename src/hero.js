let current = null;

function clear(request) {
  request.animations.forEach(animation => animation.cancel());
  request.layer?.remove();
  if (request.target) {
    request.target.style.position = request.position;
    request.target.style.zIndex = request.zIndex;
  }
  if (request.source.isConnected) request.source.removeAttribute('aria-busy');
  request.motion.removeEventListener('change', request.onMotion);
  if (current === request) { current = null; document.documentElement.classList.remove('hero-transition-active'); }
}

export function cancelHero() {
  if (!current) return;
  current.cancelled = true;
  clear(current);
}

function cloneIcon(icon) {
  if (!icon) return null;
  const clone = icon.cloneNode(true), ids = new Map();
  clone.className = 'hero-flight-icon';
  for (const node of clone.querySelectorAll('[id]')) {
    const id = `hero-${crypto.randomUUID()}`;
    ids.set(node.id, id); node.id = id;
  }
  for (const node of clone.querySelectorAll('*')) for (const attr of [...node.attributes]) {
    let value = attr.value;
    for (const [before, after] of ids) {
      value = value.replaceAll(`url(#${before})`, `url(#${after})`);
      if (value === `#${before}`) value = `#${after}`;
    }
    if (value !== attr.value) node.setAttribute(attr.name, value);
  }
  const styles = getComputedStyle(icon);
  for (const name of ['--object-accent', '--object-light', '--object-edge']) clone.style.setProperty(name, styles.getPropertyValue(name));
  return clone;
}

export async function heroTransition(source, update, destination) {
  if (current?.source === source) return;
  if (current) cancelHero();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!source?.isConnected || motion.matches || document.hidden || typeof source.animate !== 'function') return update();
  const start = source.getBoundingClientRect(), heading = source.querySelector('h2'), icon = source.querySelector('.action-icon');
  if (!start.width || !start.height) return update();
  const titleRect = heading?.getBoundingClientRect(), iconRect = icon?.getBoundingClientRect();
  const iconCopy = cloneIcon(icon), titleText = heading?.textContent || '';
  const titleStyles = heading ? getComputedStyle(heading) : null;
  const titleFont = titleStyles?.font, titleColor = titleStyles?.color, titleSpacing = titleStyles?.letterSpacing;
  const color = getComputedStyle(source.querySelector('.action-card-fill') || source).backgroundColor;
  const request = {source, motion, animations: [], layer: null, cancelled: false, onMotion: () => { if (motion.matches) cancelHero(); }};
  current = request; motion.addEventListener('change', request.onMotion);
  source.setAttribute('aria-busy', 'true');
  document.documentElement.classList.add('hero-transition-active');
  try {
    // Navigation starts immediately. Network checks for a dialog never freeze the page.
    await update();
    if (request.cancelled) return;
    const target = destination();
    if (!target?.isConnected) return;
    if (target.classList.contains('modal')) target.classList.add('hero-arrival');
    const end = target.getBoundingClientRect();
    if (!end.width || !end.height) return;
    const height = Math.min(end.height, innerHeight - Math.max(0, end.top));
    if (height <= 0) return;
    const layer = document.createElement('div'); layer.className = 'hero-flight'; layer.setAttribute('aria-hidden', 'true');
    request.target = target; request.position = target.style.position; request.zIndex = target.style.zIndex;
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    target.style.zIndex = '2';
    const surface = document.createElement('div'); surface.className = 'hero-flight-surface';
    Object.assign(surface.style, {left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`, backgroundColor: color});
    layer.append(surface);
    const copy = (node, bounds) => {
      if (!node || !bounds) return;
      Object.assign(node.style, {left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`});
      layer.append(node);
      request.animations.push(node.animate([{opacity: 1, transform: 'translateY(0)'}, {opacity: 0, transform: `translateY(${(end.top - start.top) * .15}px)`}], {duration: 220, easing: 'ease-out', fill: 'both'}));
    };
    request.layer = layer; target.parentElement.append(layer);
    copy(iconCopy, iconRect);
    const title = document.createElement('div'); title.className = 'hero-flight-title'; title.textContent = titleText;
    Object.assign(title.style, {font: titleFont, color: titleColor, letterSpacing: titleSpacing}); copy(title, titleRect);
    const sx = end.width / start.width, sy = height / start.height;
    const endingColor = getComputedStyle(target).backgroundColor;
    const fill = endingColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).getPropertyValue('--bg') : endingColor;
    request.animations.push(surface.animate([
      {transform: 'translate(0,0) scale(1,1)', borderRadius: '24px', opacity: 1, backgroundColor: color},
      {transform: `translate(${end.left - start.left}px,${end.top - start.top}px) scale(${sx},${sy})`, borderRadius: `${24 / sx}px / ${24 / sy}px`, opacity: 0, backgroundColor: fill},
    ], {duration: 460, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'}));
    request.animations.push(target.animate([{opacity: 0}, {opacity: 1}], {duration: 300, delay: 100, easing: 'ease-out', fill: 'both'}));
    await Promise.allSettled(request.animations.map(animation => animation.finished));
  } finally { clear(request); }
}

window.addEventListener('pagehide', cancelHero);
window.addEventListener('resize', cancelHero);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHero(); });
document.addEventListener('pointerdown', () => { if (current?.layer) cancelHero(); }, {capture: true, passive: true});
document.addEventListener('keydown', event => { if (current?.layer && ['Tab', 'Enter', ' '].includes(event.key)) cancelHero(); }, {capture: true});
