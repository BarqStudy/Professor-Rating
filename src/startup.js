// The green gate covers startup; this accessible fallback remains useful if
// a slow connection outlasts its short maximum display time.
export function startupSkeleton() {
  return `<div class="platform-startup startup-connection" aria-busy="true"><div role="status"><h1>نجهّز مساحتك في مِعيار</h1><p>الاتصال يأخذ وقتًا أطول من المعتاد. نحاول إكمال التحميل…</p></div><button type="button" class="secondary" id="startup-retry">إعادة المحاولة</button></div>`;
}
