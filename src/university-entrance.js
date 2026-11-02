const seenKey = 'miyar-university-door-seen-v1';
let shown = false;

// Keep the entrance outside the app: catalogue refreshes must not restart it.
export function showUniversityEntrance({ replay = false } = {}) {
  if (document.querySelector('.university-entrance')) return;
  if (shown && !replay) return;
  shown = true;
  try {
    if (!replay && localStorage.getItem(seenKey)) return;
    localStorage.setItem(seenKey, '1');
  } catch { /* The in-memory guard still works when storage is unavailable. */ }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const entrance = document.createElement('div');
  entrance.className = 'university-entrance';
  entrance.setAttribute('aria-hidden', 'true');
  entrance.innerHTML = `<div class="entrance-caption"><span>مِعيار</span><small>من هنا، تبدأ رحلتك.</small></div><div class="entrance-doorway"><div class="entrance-light"></div><div class="entrance-door entrance-door-right"><span></span></div><div class="entrance-door entrance-door-left"><span></span></div></div><div class="entrance-floor"></div>`;
  document.body.append(entrance);
  const open = setTimeout(() => entrance.classList.add('is-opening'), 3000);
  const finish = setTimeout(cleanup, 4050);
  // Keyboard and touch users can continue immediately without waiting.
  function cleanup() {
    clearTimeout(open);
    clearTimeout(finish);
    entrance.remove();
    window.removeEventListener('keydown', cleanup);
    window.removeEventListener('pointerdown', cleanup);
  }
  window.addEventListener('keydown', cleanup, { once: true });
  window.addEventListener('pointerdown', cleanup, { once: true });
}
