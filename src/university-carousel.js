const wrap = (value, count) => ((value % count) + count) % count;
const offset = (index, position, count) => {
  if (count <= 2) return index - position;
  const distance = wrap(index - position, count);
  return distance > count / 2 ? distance - count : distance;
};

export function mountUniversityCarousel(root, { activeKey, onFocus } = {}) {
  const stage = root.querySelector('.uni-orbit-stage');
  const cards = [...root.querySelectorAll('.uni-card')];
  const count = cards.length;
  const controls = [...root.querySelectorAll('[data-uni-move]')];
  const confirm = root.querySelector('[data-uni-confirm]');
  const live = root.querySelector('.uni-carousel-live');
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let position = Math.max(0, cards.findIndex(card => card.dataset.selectUniversity === activeKey));
  let pointer = null, frame = 0, ignoreClickUntil = 0, announced = -1, disposed = false;
  const busy = () => root.closest('[aria-busy="true"]') !== null;
  const current = () => count ? wrap(Math.round(position), count) : 0;
  const spacing = () => Math.max(110, Math.min(stage.clientWidth * .52, 270));

  function paint() {
    frame = 0;
    if (disposed) return;
    root.classList.toggle('is-empty', !count);
    root.classList.toggle('is-dragging', !!pointer?.dragging);
    const focused = current();
    const radius = Math.min(470, stage.clientWidth * .86);
    const step = count > 2 && count < 7 ? 360 / count : 35;
    cards.forEach((card, index) => {
      const distance = offset(index, position, count), magnitude = Math.abs(distance);
      const angle = distance * step * Math.PI / 180;
      const visible = magnitude < 3.35;
      const x = -Math.sin(angle) * radius;
      const z = (Math.cos(angle) - 1) * 240;
      const y = (1 - Math.cos(angle)) * 38;
      const scale = Math.max(.5, 1 - magnitude * .14);
      card.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateY(${(distance * 23).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      card.style.opacity = visible ? String(Math.max(.12, 1 - magnitude * .23)) : '0';
      card.style.filter = magnitude > 1.2 ? `blur(${Math.min(2, (magnitude - 1.2) * 1.3).toFixed(2)}px)` : 'none';
      card.style.visibility = visible ? 'visible' : 'hidden';
      card.style.zIndex = String(100 - Math.round(magnitude * 10));
      card.style.pointerEvents = visible ? 'auto' : 'none';
      card.classList.toggle('is-front', index === focused);
      card.tabIndex = index === focused ? 0 : -1;
      card.setAttribute('aria-hidden', String(!visible));
      if (index === focused) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
    });
    controls.forEach(button => button.disabled = count < 2);
    confirm.disabled = !count;
    root.querySelector('.uni-carousel-navigation').hidden = !count;
    if (count && !pointer?.dragging && focused !== announced) {
      announced = focused;
      const card = cards[focused], name = card.querySelector('strong').textContent;
      stage.dataset.activeUniversity = card.dataset.selectUniversity;
      root.querySelector('.uni-carousel-counter').textContent = `${(focused + 1).toLocaleString('ar')} / ${count.toLocaleString('ar')}`;
      root.querySelector('.uni-carousel-progress span').style.width = `${100 * (focused + 1) / count}%`;
      confirm.querySelector('span').textContent = card.classList.contains('is-open') ? 'الدخول إلى الجامعة' : 'طلب إضافة الجامعة';
      live.textContent = `${name}، الجامعة ${(focused + 1).toLocaleString('ar')} من ${count.toLocaleString('ar')}`;
      onFocus?.(card.dataset.selectUniversity);
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
  function moveTo(index, focus = false) {
    if (!count || busy()) return;
    const target = wrap(index, count);
    position = count <= 2 ? target : position + offset(target, position, count);
    paint();
    if (focus) cards[current()].focus({ preventScroll: true });
  }
  function release(event, cancelled = false) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dragging = pointer.dragging;
    const velocity = performance.now() - pointer.time < 90 ? pointer.velocity : 0;
    const projected = cancelled ? position : position + Math.max(-1.1, Math.min(1.1, velocity * 140 / spacing()));
    pointer = null;
    if (dragging) {
      ignoreClickUntil = performance.now() + 400;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      moveTo(Math.round(projected));
    }
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }

  stage.addEventListener('pointerdown', event => {
    if (!count || busy() || pointer || !event.isPrimary || event.button !== 0) return;
    ignoreClickUntil = 0;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, base: position, lastX: event.clientX, time: performance.now(), velocity: 0, dragging: false };
  }, options);
  stage.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (count === 1 && Math.max(Math.abs(dx), Math.abs(dy)) > 8) { ignoreClickUntil = performance.now() + 400; pointer = null; return; }
    if (!pointer.dragging) {
      if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) { ignoreClickUntil = performance.now() + 400; pointer = null; return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      pointer.dragging = true;
      stage.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const now = performance.now(), elapsed = now - pointer.time;
    if (elapsed > 0) pointer.velocity = (event.clientX - pointer.lastX) / elapsed;
    pointer.lastX = event.clientX; pointer.time = now;
    position = pointer.base + dx / spacing();
    if (count === 2) position = Math.max(0, Math.min(1, position));
    schedule();
  }, options);
  stage.addEventListener('pointerup', event => release(event), options);
  stage.addEventListener('pointercancel', event => release(event, true), options);
  // A touch starts with implicit capture on the card. Transferring that capture
  // to the stage emits a bubbling loss event on the card, not on the stage.
  stage.addEventListener('lostpointercapture', event => { if (event.target === stage) release(event, true); }, options);
  stage.addEventListener('dragstart', event => event.preventDefault(), options);
  stage.addEventListener('click', event => {
    if (performance.now() < ignoreClickUntil && event.detail > 0) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const card = event.target.closest('.uni-card');
    if (card && cards.indexOf(card) !== current()) {
      event.preventDefault(); event.stopImmediatePropagation(); moveTo(cards.indexOf(card), true);
    }
  }, { ...options, capture: true });
  stage.addEventListener('keydown', event => {
    const actions = { ArrowLeft: current() + 1, ArrowRight: current() - 1, Home: 0, End: count - 1 };
    if (Object.hasOwn(actions, event.key)) {
      event.preventDefault(); moveTo(actions[event.key], event.target !== stage);
    } else if (event.target === stage && ['Enter', ' '].includes(event.key) && count && !busy()) {
      event.preventDefault(); cards[current()].click();
    }
  }, options);
  controls.forEach(button => button.addEventListener('click', () => moveTo(current() + Number(button.dataset.uniMove)), options));
  confirm.addEventListener('click', () => { if (count && !busy()) cards[current()].click(); }, options);
  const resize = new ResizeObserver(() => { if (root.isConnected) schedule(); else destroy(); });
  resize.observe(stage);
  const lifecycle = new MutationObserver(() => { if (!root.isConnected) destroy(); });
  lifecycle.observe(document.body, { childList: true, subtree: true });
  function destroy() {
    if (disposed) return;
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    if (pointer && stage.hasPointerCapture(pointer.id)) stage.releasePointerCapture(pointer.id);
    pointer = null;
    root.classList.remove('is-dragging');
    abort.abort(); resize.disconnect(); lifecycle.disconnect();
  }
  paint();
  return { destroy };
}
