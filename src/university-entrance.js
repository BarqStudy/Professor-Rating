let active = null;

// The loading gate lives outside #app, so auth/catalogue renders cannot reset it.
export function showUniversityEntrance({ loading = false } = {}) {
  if (active) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const entrance = document.createElement('div');
  entrance.className = 'university-entrance';
  entrance.setAttribute('aria-hidden', 'true');
  entrance.innerHTML = `<div class="entrance-caption"><span>مِعيار</span><small>${loading ? 'نجهّز مساحتك…' : 'من هنا، تبدأ رحلتك.'}</small></div><div class="entrance-doorway"><div class="entrance-light"></div><div class="entrance-door entrance-door-right"><span></span></div><div class="entrance-door entrance-door-left"><span></span></div></div><div class="entrance-motes"><i></i><i></i><i></i><i></i><i></i></div><div class="entrance-floor"></div>`;
  document.body.append(entrance);
  let opening = false, closeTimer;
  const gate = { loading, open };
  active = gate;
  // A slow/offline request must not trap the student behind the gate.
  const waitTimer = setTimeout(open, loading ? 6000 : 3000);
  function open() {
    if (opening) return;
    opening = true;
    clearTimeout(waitTimer);
    if (reduced) { cleanup(); return; }
    entrance.classList.add('is-opening');
    closeTimer = setTimeout(cleanup, 1050);
  }
  function cleanup() {
    clearTimeout(waitTimer);
    clearTimeout(closeTimer);
    entrance.remove();
    if (active === gate) active = null;
    window.removeEventListener('keydown', skip);
    window.removeEventListener('pointerdown', skip);
  }
  function skip() { if (!loading) cleanup(); }
  window.addEventListener('keydown', skip);
  window.addEventListener('pointerdown', skip);
}

export function finishUniversityLoading() {
  if (active?.loading) active.open();
}
