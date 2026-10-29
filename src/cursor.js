export function setupCursor() {
  const supported = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  let cursor, ring, dot, frame = 0, visible = false, x = 0, y = 0, targetX = 0, targetY = 0, previousTime = 0;
  const hide = () => {
    visible = false;
    cancelAnimationFrame(frame); frame = 0; previousTime = 0;
    document.documentElement.classList.remove('custom-cursor-active');
    cursor?.removeAttribute('data-visible');
    cursor?.removeAttribute('data-pressed');
  };
  const paint = time => {
    frame = 0;
    if (!visible || !supported.matches) return hide();
    const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;
    const blend = 1 - Math.exp(-elapsed / 65);
    x += (targetX - x) * blend; y += (targetY - y) * blend;
    ring.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
    dot.style.transform = `translate3d(${targetX}px,${targetY}px,0) translate(-50%,-50%)`;
    cursor.dataset.visible = 'true';
    document.documentElement.classList.add('custom-cursor-active');
    if (Math.abs(targetX - x) + Math.abs(targetY - y) > .1) frame = requestAnimationFrame(paint);
    else previousTime = 0;
  };
  document.addEventListener('pointermove', event => {
    const editable = event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox],:disabled,[aria-disabled=true],[inert],iframe');
    if (!supported.matches || event.pointerType !== 'mouse' || editable || event.clientX < 4 || event.clientX > document.documentElement.clientWidth - 4) return hide();
    if (!cursor) {
      cursor = document.createElement('div'); cursor.className = 'custom-cursor'; cursor.setAttribute('aria-hidden', 'true');
      cursor.innerHTML = '<span class="custom-cursor-ring"></span><span class="custom-cursor-dot"></span>';
      document.body.append(cursor); ring = cursor.firstElementChild; dot = cursor.lastElementChild;
    }
    targetX = event.clientX; targetY = event.clientY;
    if (!visible) { x = targetX; y = targetY; visible = true; }
    cursor.toggleAttribute('data-interactive', Boolean(event.target.closest?.('button,a,[role=button],summary,label')));
    if (!frame) frame = requestAnimationFrame(paint);
  }, {passive: true});
  document.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse' || event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')) hide(); else if (visible) cursor.setAttribute('data-pressed', ''); }, {passive: true});
  document.addEventListener('pointerup', () => cursor?.removeAttribute('data-pressed'), {passive: true});
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); }, {passive: true});
  document.addEventListener('pointercancel', hide, {passive: true});
  document.addEventListener('contextmenu', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Tab' || event.key === 'Escape') hide(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.addEventListener('blur', hide);
  window.addEventListener('pagehide', hide);
  supported.addEventListener('change', hide);
}
