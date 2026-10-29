let current = null, intent = null;
const intentLifetime = 5000;

// Remember the clicked surface before its handler replaces the DOM. Only an
// actual page/dialog update consumes this; typing and cosmetic toggles do not.
export function rememberHero(source) {
  if (!source?.isConnected) return;
  const start = source.getBoundingClientRect();
  if (!start.width || !start.height) return;
  const heading = source.querySelector('h1,h2,h3') || source.querySelector('span:not([aria-hidden])') || source;
  const icon = source.querySelector('.action-icon,.avatar,.college-tab-icon,.icon,svg');
  const styles = getComputedStyle(heading);
  const fill = getComputedStyle(source.querySelector('.action-card-fill') || source).backgroundColor;
  intent = {source, start, titleRect: heading.getBoundingClientRect(), iconRect: icon?.getBoundingClientRect(),
    iconCopy: cloneIcon(icon), titleText: heading.textContent.trim(), titleFont: styles.font,
    titleColor: styles.color, titleSpacing: styles.letterSpacing,
    color: fill === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).getPropertyValue('--surface') : fill,
    at: performance.now()};
}

export function heroUpdate(update, destination) {
  const origin = intent; intent = null;
  if (!origin || performance.now() - origin.at > intentLifetime) {
    const result = update();
    // Loading placeholders may be replaced by the fetched page/dialog while
    // it is expanding. Continue the same flight instead of starting it again.
    if (current?.target && !current.target.isConnected) retarget(current, destination());
    return result;
  }
  const request = beginHero(origin);
  // Keep DOM updates, form bindings and their errors synchronous. The visual
  // starts in a microtask after callers have restored focus and scroll.
  let result;
  try { result = update(); }
  catch (error) { if (request) cancelHero(); throw error; }
  if (request) void animateHero(request, destination).catch(error => console.error(error));
  return result;
}

export function setupHero() {
  document.addEventListener('click', event => {
    cancelHero();
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const control = event.target.closest?.('button,a[href^="#"],[role="button"]');
    if (!control || !control.closest('#app') || control.matches(':disabled,[aria-disabled="true"],.close-modal,.theme-toggle,.mobile-theme,.carousel-control,[data-save],#save-detail,#entry-theme') || control.closest('[inert]')) return;
    if (control.matches('button') && control.type === 'submit' && control.form) return;
    const source = control.closest('.doctor-card,.study-course,.advisor-doctor') || control;
    rememberHero(source);
  }, {capture: true});
  // An intervening edit/submit must never lend its origin to a later response.
  for (const name of ['input', 'change', 'submit']) document.addEventListener(name, () => { intent = null; }, {capture: true});
}

function clear(request) {
  if (request.cleared) return;
  request.cleared = true;
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

export function cancelHero(preserveIntent = false) {
  if (preserveIntent !== true) intent = null;
  if (!current) return;
  current.cancelled = true;
  clear(current);
}

function cloneIcon(icon) {
  if (!icon) return null;
  const clone = document.createElement('div'), ids = new Map();
  clone.className = 'hero-flight-icon';
  clone.append(icon.cloneNode(true));
  Object.assign(clone.firstElementChild.style, {width: '100%', height: '100%', margin: '0'});
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
  clone.style.color = styles.color;
  for (const name of ['--object-accent', '--object-light', '--object-edge']) clone.style.setProperty(name, styles.getPropertyValue(name));
  return clone;
}

function endingBounds(target) {
  const bounds = target.getBoundingClientRect();
  return {left: bounds.left, top: bounds.top, width: bounds.width,
    height: Math.min(bounds.height, innerHeight - Math.max(0, bounds.top))};
}

function attachTarget(request, target) {
  request.target = target; request.position = target.style.position; request.zIndex = target.style.zIndex;
  if (target.classList.contains('modal')) target.classList.add('hero-arrival');
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
  target.style.zIndex = '2';
}

function surfaceFrames(request, target, end) {
  const {start, color} = request.origin, sx = end.width / start.width, sy = end.height / start.height;
  const endingColor = getComputedStyle(target).backgroundColor;
  const fill = endingColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).getPropertyValue('--bg') : endingColor;
  return [
    {transform: 'translate(0,0) scale(1,1)', borderRadius: '24px', opacity: 1, backgroundColor: color},
    {transform: `translate(${end.left - start.left}px,${end.top - start.top}px) scale(${sx},${sy})`, borderRadius: `${24 / sx}px / ${24 / sy}px`, opacity: 0, backgroundColor: fill},
  ];
}

function retarget(request, target) {
  if (!request.layer || !target?.isConnected) { cancelHero(); return; }
  const end = endingBounds(target);
  if (!end.width || end.height <= 0) { cancelHero(); return; }
  request.target.style.position = request.position; request.target.style.zIndex = request.zIndex;
  attachTarget(request, target);
  target.parentElement.append(request.layer);
  request.contentAnimation.effect.target = target;
  request.surfaceAnimation.effect.setKeyframes(surfaceFrames(request, target, end));
}

function beginHero(origin) {
  if (current) cancelHero(true);
  const {source} = origin;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || document.hidden || typeof source.animate !== 'function') return null;
  const request = {origin, source, motion, animations: [], layer: null, cancelled: false, onMotion: () => { if (motion.matches) cancelHero(); }};
  current = request; motion.addEventListener('change', request.onMotion);
  source.setAttribute('aria-busy', 'true');
  document.documentElement.classList.add('hero-transition-active');
  return request;
}

async function animateHero(request, destination) {
  const {start, titleRect, iconRect, iconCopy, titleText, titleFont, titleColor, titleSpacing, color} = request.origin;
  try {
    await Promise.resolve();
    if (request.cancelled) return;
    const target = destination();
    if (!target?.isConnected) return;
    const end = endingBounds(target);
    if (!end.width || end.height <= 0) return;
    const layer = document.createElement('div'); layer.className = 'hero-flight'; layer.setAttribute('aria-hidden', 'true');
    attachTarget(request, target);
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
    request.surfaceAnimation = surface.animate(surfaceFrames(request, target, end), {duration: 460, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'});
    request.contentAnimation = target.animate([{opacity: 0}, {opacity: 1}], {duration: 300, delay: 100, easing: 'ease-out', fill: 'both'});
    request.animations.push(request.surfaceAnimation, request.contentAnimation);
    await Promise.allSettled(request.animations.map(animation => animation.finished));
  } finally { clear(request); }
}

window.addEventListener('pagehide', () => cancelHero());
window.addEventListener('resize', () => cancelHero());
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelHero(); });
document.addEventListener('pointerdown', () => { if (current?.layer) cancelHero(); }, {capture: true, passive: true});
document.addEventListener('keydown', event => { if (current?.layer && ['Tab', 'Enter', ' '].includes(event.key)) cancelHero(); }, {capture: true});
