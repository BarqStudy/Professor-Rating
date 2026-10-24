import "./style.css";
import { readJSON, storage } from "./storage.js";
import {
  api,
  configured,
  getGoogleSession,
  initializeAuth,
  signInGoogle,
  signOutGoogle,
} from "./cloud.js";
let googleSession = null;
let authNotice = "";
let cloudMe = null,
  cloudStatus = configured ? "loading" : "demo",
  cloudError = "",
  cloudCatalogue = null,
  cloudQueue = null;
let cloudAuthPending = null;
const demoAdmin = import.meta.env.DEV && !configured;
const icons = {
  settings:
    '<path d="m9 3-.5 3-2 1-2.8-1-2 3.5 2.3 2v2l-2.3 2 2 3.5 2.8-1 2 1 .5 3h4l.5-3 2-1 2.8 1 2-3.5-2.3-2v-2l2.3-2-2-3.5-2.8 1-2-1-.5-3Z"/><circle cx="11" cy="12" r="3"/>',
  logout: '<path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h14"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  star:
    '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  book:
    '<path d="M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Z M12 6v15"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  moon: '<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 11 7-4M8 13l7 4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  cap: '<path d="m2 8 10-5 10 5-10 5ZM6 10v7c4 3 8 3 12 0v-7m4-2v9"/>',
  filter: '<path d="M4 6h16M7 12h10m-7 6h4"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 8 15 8 15S25 10 20 5Z"/>',
  bell: '<path d="M5 17h14l-2-4V8a5 5 0 0 0-10 0v5Zm5 3h4"/>',
};
const ic = (n, c = "") =>
  `<svg class="icon ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${
    icons[n] || icons.star
  }</svg>`;
const logo =
  `<span class="miyar-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M32 10v43M14 22h36M22 53h20" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="m14 22-9 19h18l-9-19Zm36 0-9 19h18l-9-19Z" fill="currentColor" opacity=".22"/><path d="M5 41c3 8 15 8 18 0M41 41c3 8 15 8 18 0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="m32 3 5 6-5 6-5-6Z" fill="#bf9354"/></svg></span><span class="logo-type">مِعيار<span>MIYAR</span></span>`;
const initial = [{
  id: 1,
  name: "أحمد محمد العتيبي",
  major: "الهندسة المدنية",
  subjects: ["ميكانيكا هندسية", "تحليل إنشائي"],
  score: 96,
  count: 128,
  color: "olive",
  initials: "أ ع",
  verified: true,
  quote: "شرح واضح وأسلوب يخلّيك تحب المادة، ومتعاون جدًا مع الطلاب.",
}, {
  id: 2,
  name: "خالد عبدالله القحطاني",
  major: "الهندسة الكهربائية",
  subjects: ["دوائر كهربائية", "إلكترونيات ١"],
  score: 94,
  count: 96,
  color: "sand",
  initials: "خ ق",
  verified: true,
  quote: "دكتور متمكن، يربط الجانب النظري بالتطبيق بشكل جميل.",
}, {
  id: 3,
  name: "محمد علي الغامدي",
  major: "الهندسة الميكانيكية",
  subjects: ["ديناميكا حرارية", "ميكانيكا الموائع"],
  score: 92,
  count: 84,
  color: "blue",
  initials: "م غ",
  verified: false,
  quote: "يهتم بفهم الطالب، والأمثلة في المحاضرة تساعد كثيرًا.",
}, {
  id: 4,
  name: "عبدالرحمن سعد الحربي",
  major: "الهندسة الصناعية",
  subjects: ["بحوث العمليات", "إدارة الجودة"],
  score: 90,
  count: 72,
  color: "rose",
  initials: "ع ح",
  verified: true,
  quote: "من أفضل الدكاترة تعاملًا وتنظيمًا للمحتوى.",
}];
let saved = readJSON("athar-saved", []);
let reviews = configured ? [] : readJSON("athar-reviews", []);
let requests = configured ? [] : readJSON("athar-requests", []);
let doctors = configured ? [] : readJSON("athar-doctors", initial);
let colleges = configured ? [] : readJSON("athar-colleges", ["كلية الهندسة"]);
let majors = configured ? [] : readJSON("athar-majors", [
  "الهندسة المدنية",
  "الهندسة الكهربائية",
  "الهندسة الميكانيكية",
  "الهندسة الصناعية",
  "هندسة الحاسب",
]);
let studentProfile = configured ? null : readJSON("miyar-profile", null);
let signedOut = storage.getItem("miyar-session") === "signed-out";
let fontScale = Number(storage.getItem("miyar-font-scale")) || 1;
fontScale = Math.min(1.3, Math.max(.9, fontScale));
document.documentElement.style.setProperty("--font-scale", fontScale);
function displayName() {
  return studentProfile?.name ||
    ((storage.getItem("miyar-session") === "guest" || signedOut)
      ? "طالبنا"
      : "طالبنا");
}
let majorColleges = configured ? {} : readJSON("athar-major-colleges", {});
for (const m of majors) majorColleges[m] ??= "كلية الهندسة";
let activeCollege = "كلية الهندسة";
const pageNames = ["home", "ratings", "review", "developer", "admin"];
let page = pageNames.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home", query = "", activeMajor = "الكل", savedOnly = false;
let collegeSelected = false;
const persist = () => {
  storage.setItem("athar-major-colleges", JSON.stringify(majorColleges));
  for (
    const [k, v] of Object.entries({
      saved,
      reviews,
      requests,
      doctors,
      colleges,
      majors,
    })
  ) storage.setItem("athar-" + k, JSON.stringify(v));
};
if (configured) {
  doctors = [];
  reviews = [];
  requests = [];
  colleges = [];
  majors = [];
  majorColleges = {};
  studentProfile = null;
}
if (storage.getItem("athar-theme") === "dark") {
  document.documentElement.dataset.theme = "dark";
}
function nav() {
  return `<nav>${
    [["home", "home", "الرئيسية"], ["ratings", "star", "التقييمات"], [
      "developer",
      "users",
      "من نحن",
    ]].map(([p, i, t]) =>
      `<button data-page="${p}" class="nav-item ${
        page === p ? "active" : ""
      }">${ic(i)}<span>${t}</span>${page === p ? "<i></i>" : ""}</button>`
    ).join("")
  }${
    (configured ? cloudMe?.isAdmin : demoAdmin)
      ? `<button data-page="admin" class="nav-item ${
        page === "admin" ? "active" : ""
      }">${ic("shield")}<span>${
        configured ? "لوحة الإدارة" : "إدارة تجريبية"
      }</span></button>`
      : ""
  }</nav>`;
}
function setPage(next) {
  page = next;
  const hash = next === "home" ? "" : `#${next}`;
  if (location.hash !== hash) history.pushState(null, "", location.pathname + location.search + hash);
}
function render() {
  if (signedOut) {
    renderSignedOut();
    return;
  }
  document.querySelector("#app").innerHTML =
    `<aside><a class="brand" href="#" aria-label="مِعيار الرئيسية">${logo}</a><div class="nav-label">مساحتك الجامعية</div>${nav()}<div class="sidebar-bottom"><div class="side-note">${
      ic("cap")
    }<strong>رأيك يصنع فرقًا</strong><p>تجربتك اليوم، دليل زميلك بكرة.</p><span>صُنع للطلاب، من أجل الطلاب</span></div><button class="theme-toggle">${
      ic("moon")
    }<span>تبديل المظهر</span><span class="switch"></span></button><div class="user"><span class="user-avatar">${
      ic("users")
    }</span><div><b>${escapeHtml(displayName())}</b>${
      googleSession ? "" : "<small>زائر · تصفّح بحرية</small>"
    }</div><span class="online"></span></div></div></aside><div class="main-wrap"><header><div class="mobile-brand" aria-label="مِعيار">${logo}</div><div class="breadcrumb">مساحتك الجامعية <span>/</span> <b>${
      ({
        home: "الرئيسية",
        ratings: "التقييمات",
        developer: "من نحن",
        review: "أضف تقييمًا",
        admin: "لوحة الإدارة",
      })[page]
    }</b></div><div class="header-actions">${
      !googleSession
        ? `<button class="google-account-button" id="google-account"><span class="google-g" aria-hidden="true">G</span><span>دخول Google</span></button>`
        : ""
    }<button class="icon-btn settings-trigger" id="open-settings" aria-label="الإعدادات" title="الإعدادات">${
      ic("settings")
    }</button><span class="semester"><i></i> الفصل الدراسي الثاني ١٤٤٧</span><button class="icon-btn" id="notice" aria-label="الإشعارات">${
      ic("bell")
    }<em></em></button><button class="icon-btn mobile-theme" aria-label="تبديل المظهر">${
      ic("moon")
    }</button></div></header><main>${
      page !== "home"
        ? `<button class="page-close" id="page-close" aria-label="إغلاق الصفحة">${
          ic("close")
        } إغلاق</button>`
        : ""
    }${
      page === "home"
        ? home()
        : page === "ratings"
        ? ratings()
        : page === "review"
        ? reviewPage()
        : page === "admin"
        ? admin()
        : developer()
    }</main><footer><span>مِعيار © ٢٠٢٦ <i>·</i> كل تجربة تستحق أن تُروى</span><span>بُني بشغف لرحلتك الجامعية ${
      ic("heart")
    }</span></footer></div><div id="modal-root"></div><div id="toast" role="status"></div>`;
  bind();
}
function home() {
  return `${connectionBanner()}<section class="welcome"><div><div class="eyebrow"><span></span> معك في كل خطوة جامعية</div><h1>أهلًا ${
    escapeHtml(displayName())
  } <span class="wave">✦</span><br>اختيارك اليوم، <em>يبدأ بمِعيار.</em></h1><div class="welcome-tags"><span>${
    ic("shield")
  } هويتك لا تظهر في التقييم</span><span>${
    ic("users")
  } من الطلاب للطلاب</span></div></div><div class="hero-art" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="spark s1">✧</span><span class="spark s2">✦</span><div class="art-dot d1"></div><div class="art-dot d2"></div><div class="float-note note-one">${
    ic("check")
  } اختيار موفّق</div><div class="big-star">${
    ic("star")
  }</div><div class="art-card"><div class="art-card-icon">${
    ic("cap")
  }</div><div class="art-lines"><b></b><i></i></div><div class="art-stars">★★★★★</div><span>تجارب صادقة، بمعيارك</span></div><div class="float-note note-two">${
    ic("heart")
  } رأيك يهمّنا</div></div></section><section class="search-block"><div class="search-input">${
    ic("search")
  }<input id="search" placeholder="ابحث باسم الدكتور أو المادة…" aria-label="ابحث باسم الدكتور أو المادة" value="${
    escapeHtml(query)
  }"><kbd>⌕</kbd></div><button class="filter-button" id="filter">${
    ic("filter")
  }<span>${
    escapeHtml(collegeSelected ? activeCollege : "كل الكليات")
  }</span><span class="chevron">⌄</span></button></section><section class="quick-actions"><button class="action-card new-review" id="new-review"><span class="action-icon">${
    ic("plus")
  }</span><div><span class="tiny-label">تجربتك تستحق المشاركة</span><h2>أضف تقييمًا جديدًا</h2><p>شارك تجربتك، وساعد زملاءك في الاختيار</p></div><span class="action-arrow">${
    ic("arrow")
  }</span><span class="action-decoration">✳</span></button><button class="action-card browse" data-page="ratings"><span class="action-icon">${
    ic("book")
  }</span><div><span class="tiny-label">قرار أفضل يبدأ من هنا</span><h2>استكشف التقييمات</h2><p>كليتك، تخصصك، ودكتورك… في مكان واحد</p></div><span class="action-arrow">${
    ic("arrow")
  }</span></button></section><section class="stats"><div><span class="stat-icon">${
    ic("cap")
  }</span><div><b>+${
    configured
      ? doctors.length.toLocaleString("ar")
      : doctors.length === 4
      ? "٤٨"
      : doctors.length
  }</b><span>دكتور في انتظار اكتشافك</span></div></div><div><span class="stat-icon">${
    ic("star")
  }</span><div><b>+${
    (configured ? (cloudCatalogue?.stats?.reviews || 0) : 1240 + reviews.length)
      .toLocaleString("ar")
  }</b><span>تجربة طلابية ملهمة</span></div></div><div><span class="stat-icon">${
    ic("users")
  }</span><div><b>${
    configured ? colleges.length.toLocaleString("ar") : "+٨٥٠"
  }</b><span>${
    configured ? "كلية في مِعيار" : "طالب يصنعون الأثر"
  }</span></div></div><span class="demo-data">${
    configured ? "تقييمات منشورة فقط" : "إحصاءات توضيحية"
  }</span></section>${listSection()}<section class="bottom-banner"><div class="banner-symbol">${
    ic("shield")
  }</div><div><h3>مساحة آمنة. آراء صادقة. أثر حقيقي.</h3><p>نحترم خصوصيتك، ونؤمن أن النقد البنّاء هو بداية التطوير.</p></div><button id="privacy">تعرّف على معاييرنا ${
    ic("arrow")
  }</button></section>`;
}
function listSection() {
  const expanded = collegeSelected || page === "ratings";
  return `<section class="doctors-section"><div class="section-heading"><div><span class="eyebrow">تجارب تستحق الاطلاع</span><h2>${
    page === "ratings" ? "دليل الدكاترة والتقييمات" : "دكاترة تركوا أثرًا"
  } <span class="small-star">✦</span></h2><p>اختر كليتك، ثم تخصصك، واكتشف تجارب زملائك</p></div><div class="section-tools"><button class="text-button" ${
    page === "home" ? 'data-page="ratings"' : 'id="saved-filter"'
  }>${
    page === "home"
      ? "عرض جميع الدكاترة"
      : savedOnly
      ? "عرض الجميع"
      : "المحفوظات"
  } ${
    ic(page === "home" ? "arrow" : "bookmark")
  }</button><div class="carousel-controls"><button class="carousel-control previous" id="doctors-previous" aria-label="الدكاترة السابقون" aria-controls="doctor-grid">${
    ic("arrow")
  }</button><button class="carousel-control" id="doctors-next" aria-label="الدكاترة التاليون" aria-controls="doctor-grid">${
    ic("arrow")
  }</button></div></div></div><div class="college-tabs" role="group" aria-label="الكليات">${
    colleges.map((college) =>
      `<button class="college-tab ${
        expanded && college === activeCollege ? "selected" : ""
      }" data-college="${escapeHtml(college)}" aria-pressed="${
        expanded && college === activeCollege
      }" aria-expanded="${
        expanded && college === activeCollege
      }" aria-controls="major-options"><span class="college-tab-icon">${
        ic("cap")
      }</span><span>${escapeHtml(college)}</span><small>${
        doctors.filter((d) => (d.college || "كلية الهندسة") === college).length
          .toLocaleString("ar")
      } دكتور</small></button>`
    ).join("")
  }</div><div id="major-options">${
    expanded
      ? `<div class="major-filter"><span class="filter-caption">تخصصات ${
        escapeHtml(activeCollege)
      }</span><div class="chips" role="group" aria-label="التخصصات">${
        ["الكل", ...majors.filter((m) => majorBelongs(m, activeCollege))].map(
          (m) =>
            `<button class="chip ${
              activeMajor === m ? "selected" : ""
            }" data-major="${escapeHtml(m)}" aria-pressed="${
              activeMajor === m
            }">${escapeHtml(m)}</button>`,
        ).join("")
      }</div></div>`
      : '<p class="college-hint">اختر كلية لعرض تخصصاتها</p>'
  }</div><div class="doctor-carousel" id="doctor-grid" role="region" aria-label="بطاقات الدكاترة" tabindex="0">${cards()}</div></section>`;
}
function selectCollege(college) {
  activeCollege = college;
  activeMajor = "الكل";
  collegeSelected = true;
  render();
}
function updateCarouselControls() {
  const track = document.querySelector("#doctor-grid");
  if (!track) return;
  const maximum = Math.max(0, track.scrollWidth - track.clientWidth),
    offset = Math.abs(track.scrollLeft);
  const previous = document.querySelector("#doctors-previous"),
    next = document.querySelector("#doctors-next");
  if (previous) previous.disabled = offset <= 2;
  if (next) next.disabled = offset >= maximum - 2;
}
function bindCarousel() {
  const track = document.querySelector("#doctor-grid");
  if (!track) return;
  const move = (direction) => {
    const card = track.querySelector(".doctor-card");
    if (!card) return;
    const step = card.getBoundingClientRect().width +
      parseFloat(getComputedStyle(track).gap || 0);
    track.scrollBy({
      left: direction * step,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  document.querySelector("#doctors-next").onclick = () => move(-1);
  document.querySelector("#doctors-previous").onclick = () => move(1);
  track.addEventListener("scroll", updateCarouselControls, { passive: true });
  requestAnimationFrame(updateCarouselControls);
}
function cards() {
  let filtered = doctors.filter((d) =>
    (!(collegeSelected || page === "ratings") ||
      (d.college || "كلية الهندسة") === activeCollege) &&
    (activeMajor === "الكل" || d.major === activeMajor) &&
    (!savedOnly || saved.includes(d.id)) &&
    (!query || [d.name, ...d.subjects].some((s) => s.includes(query)))
  );
  return filtered.length
    ? filtered.map((d) =>
      `<article class="doctor-card"><div class="card-top"><span class="avatar ${d.color}">${
        escapeHtml(d.initials)
      }</span><button class="save-button ${
        saved.includes(d.id) ? "is-saved" : ""
      }" data-save="${d.id}" aria-label="حفظ الدكتور">${
        ic("bookmark")
      }</button></div><div class="doctor-name"><button data-doctor="${d.id}">د. ${
        escapeHtml(d.name)
      }</button>${
        d.verified
          ? `<span class="verified" title="موثق من الإدارة">${
            ic("check")
          }</span>`
          : ""
      }</div><span class="major-label">${
        escapeHtml(d.major)
      }</span><div class="subject-tags">${
        d.subjects.map((s) => `<span>${escapeHtml(s)}</span>`).join("")
      }</div><div class="rating-row"><span class="rating-score">${d.score}<small>/100</small></span><div><span class="stars">${
        d.count
          ? "★".repeat(Math.round(d.score / 20)) +
            "☆".repeat(5 - Math.round(d.score / 20))
          : "—"
      }</span><small>${
        (configured
          ? d.count
          : d.count + reviews.filter((r) => r.doctor === d.id).length)
          .toLocaleString("ar")
      } تقييمًا</small></div><span class="excellent" data-tier="${
        d.count ? labelScore(d.score) : "بدون تقييم"
      }">${
        d.count ? labelScore(d.score) : "بدون تقييم"
      }</span></div><button class="card-detail" data-doctor="${d.id}">استعرض التقييمات ${
        ic("arrow")
      }</button></article>`
    ).join("")
    : '<div class="empty">لم نجد نتائج مطابقة. جرّب اسمًا آخر أو أضف الدكتور من نموذج التقييم.</div>';
}
function ratings() {
  return `${connectionBanner()}<div class="page-title"><div class="eyebrow">تجارب زملائك، بين يديك</div><h1>اكتشف دكتورك القادم</h1><p>ابدأ بالكلية، ثم تخصصك، واختر الدكتور.</p></div><section class="directory-filters"><label>الكلية<select id="college-filter">${
    colleges.map((c) =>
      `<option ${activeCollege === c ? "selected" : ""}>${
        escapeHtml(c)
      }</option>`
    ).join("")
  }</select></label><label>التخصص<select id="major-filter"><option>الكل</option>${
    majors.filter((m) => majorBelongs(m, activeCollege)).map((m) =>
      `<option ${m === activeMajor ? "selected" : ""}>${escapeHtml(m)}</option>`
    ).join("")
  }</select></label><label>الدكتور أو المادة<input id="search" placeholder="اكتب للبحث…" value="${
    escapeHtml(query)
  }"></label><button class="primary" id="new-review">${
    ic("plus")
  } تقييم جديد</button></section>${listSection()}`;
}
function developer() {
  return `<div class="page-title"><div class="eyebrow">خلف كل تجربة، فكرة</div><h1>مِعيار لاختيارك القادم</h1><p>منصة عربية تجعل تجارب الطلاب دليلًا لاختيارات أفضل.</p></div><section class="developer-card"><div class="brand">${logo}</div><h2>من الطلاب، من أجل الطلاب.</h2><p>مِعيار مساحة لتبادل التجارب الجامعية باحترام وشفافية. نبدأ بكلية الهندسة، ونتطلع لأن نرافق كل طالب في رحلته.</p><div class="dev-badges"><span>${
    ic("shield")
  } خصوصيتك أولًا</span><span>${ic("heart")} تجربة عربية</span><span>${
    ic("code")
  } نسخة تجريبية</span></div><p class="muted">${
    configured
      ? "تُحفظ التقييمات والملفات الشخصية في قاعدة بيانات مِعيار. الإرسال متاح بعد تسجيل الدخول باستخدام Google، وتُنشر التعليقات بعد مراجعتها. المحفوظات والمظهر وحجم الخط محفوظة على جهازك."
      : "هذه نسخة عرض تفاعلية. لم يكتمل ربط قاعدة البيانات بعد؛ البيانات والإرسال محليان على هذا الجهاز."
  }</p><button class="primary" id="share-platform">${
    ic("share")
  } شارك مِعيار</button></section>`;
}
function admin() {
  if (configured) return cloudAdmin();
  if (!demoAdmin) return '<div class="empty">هذه الصفحة مخصّصة للأدمن.</div>';
  return `<div class="page-title"><div class="eyebrow">إدارة تجريبية محلية</div><h1>لوحة تحكم مِعيار</h1><p>للتجربة فقط. يلزم التحقق من هوية الأدمن على الخادم قبل الإطلاق.</p></div><div class="admin-grid"><section class="panel"><h2>الكليات والتخصصات</h2><form id="add-college"><label>إضافة كلية<input name="name" required placeholder="اسم الكلية"></label><button class="primary">إضافة</button></form>${
    colleges.map((c, i) =>
      `<div class="admin-row">${
        escapeHtml(c)
      }<button data-delete-college="${i}" class="danger">حذف</button></div>`
    ).join("")
  }<form id="add-major"><label>إضافة تخصص<select name="college">${
    colleges.map((c) => `<option>${escapeHtml(c)}</option>`).join("")
  }</select><input name="name" required placeholder="اسم التخصص"></label><button class="primary">إضافة</button></form>${
    majors.map((m, i) =>
      `<div class="admin-row">${
        escapeHtml(m)
      }<button data-delete-major="${i}" class="danger">حذف</button></div>`
    ).join("")
  }</section><section class="panel"><h2>إدارة الدكاترة</h2><button class="primary" id="add-doctor">${
    ic("plus")
  } إضافة دكتور</button>${bulkDoctorForm()}${
    doctors.map((d) =>
      `<div class="admin-row"><span>د. ${
        escapeHtml(d.name)
      }</span><div><button data-verify="${d.id}">${
        d.verified ? "إلغاء التوثيق" : "توثيق"
      }</button><button data-delete-doctor="${d.id}" class="danger">حذف</button></div></div>`
    ).join("")
  }<h2>طلبات إضافة الدكاترة</h2>${
    requests.length
      ? requests.map((r, i) =>
        `<div class="admin-row"><span>${escapeHtml(r.name)}<small>${
          escapeHtml(r.major)
        }</small></span><div><button data-approve="${i}">قبول</button><button data-reject="${i}" class="danger">رفض</button></div></div>`
      ).join("")
      : '<p class="muted">لا توجد طلبات معلّقة.</p>'
  }</section><section class="panel"><h2>إدارة المستخدمين</h2><form id="user-action"><label>معرّف الطالب<input name="user" required placeholder="معرّف الحساب"></label><label>الإجراء<select name="action"><option>حظر</option><option>تقييد</option><option>فك الحظر أو التقييد</option></select></label><button class="primary">تطبيق تجريبي</button></form><p class="muted">تُحفظ الحالة محليًا للعرض؛ لا تمنع وصول مستخدم حقيقي.</p></section></div>`;
}
function bulkDoctorForm() {
  const options = configured
    ? (cloudCatalogue?.majors || []).map((m) => `<option value="${m.id}">${escapeHtml(m.name)} · ${escapeHtml(cloudCatalogue.colleges.find((c) => c.id === m.college_id)?.name || "")}</option>`).join("")
    : majors.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  return `<form id="bulk-doctors" class="bulk-doctors"><h3>إضافة دكاترة دفعة واحدة</h3><p class="muted">اختر التخصص واكتب اسم كل دكتور الثلاثي في سطر مستقل. يُضافون بدون تقييمات.</p><label>الكلية والتخصص<select name="major" required>${options}</select></label><label>أسماء الدكاترة<textarea name="names" rows="6" maxlength="10100" required placeholder="أحمد محمد العتيبي&#10;خالد عبدالله الحربي"></textarea></label><small>حتى ١٠٠ اسم في الدفعة. تُستبعد الأسماء المكررة في التخصص.</small><p class="bulk-result" role="status" aria-live="polite"></p><button class="primary" type="submit">${ic("plus")} إضافة الدفعة</button></form>`;
}
function bindBulkDoctors() {
  const form = document.querySelector("#bulk-doctors");
  if (!form) return;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (configured ? !cloudMe?.isAdmin : !demoAdmin) return;
    const major = form.elements.major.value;
    const names = [...new Set(form.elements.names.value.split(/\r?\n/).map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean))];
    const status = form.querySelector(".bulk-result");
    if (!names.length || names.length > 100 || names.some((n) => n.length < 8 || n.length > 100 || n.split(/\s+/).length < 3)) {
      status.textContent = "اكتب من ١ إلى ١٠٠ اسم ثلاثي، كل اسم بين ٨ و١٠٠ حرف في سطر مستقل.";
      return;
    }
    const majorName = configured ? cloudCatalogue.majors.find((m) => m.id === Number(major))?.name : major;
    const majorCollege = configured ? cloudCatalogue.colleges.find((c) => c.id === cloudCatalogue.majors.find((m) => m.id === Number(major))?.college_id)?.name : majorColleges[major];
    const existing = new Set(doctors.filter((d) => d.major === majorName && d.college === majorCollege).map((d) => d.name.trim().replace(/\s+/g, " ")));
    const pending = names.filter((n) => !existing.has(n));
    const controls = [...form.querySelectorAll("input,select,textarea,button")];
    controls.forEach((el) => el.disabled = true);
    let added = 0;
    let failure = "";
    for (const name of pending) {
      status.textContent = `جارٍ الإضافة… ${added} / ${pending.length}`;
      try {
        if (configured) await api("admin", { operation: "doctor.add", name, majorId: Number(major) });
        else doctors.push({ id: Date.now() + added, name, college: majorCollege, major, subjects: [], score: 0, count: 0, color: "blue", initials: name.slice(0, 2), verified: false, quote: "لم تُضف تجارب بعد." });
        added++;
      } catch (error) { failure = error.message; break; }
    }
    form.elements.names.value = pending.slice(added).join("\n");
    if (configured) { try { await refreshCloudCatalogue(); } catch {} }
    else persist();
    controls.forEach((el) => el.disabled = false);
    status.textContent = `تمت إضافة ${added} دكتور بدون تقييمات. تم تجاوز ${names.length - pending.length} اسم موجود مسبقًا.${failure ? ` توقفت الإضافة: ${failure}. الأسماء المتبقية محفوظة لإعادة المحاولة.` : ""}`;
  };
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]),
  );
}
function toast(s) {
  const el = document.querySelector("#toast");
  el.textContent = s;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 3200);
}
let modalTrigger = null;
function modal(title, body) {
  if (!document.querySelector(".modal-backdrop")) modalTrigger = document.activeElement;
  document.querySelector("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="modal-heading"><div><span class="eyebrow">تجارب صادقة، بمعيارك</span><h2>${title}</h2></div><button class="icon-btn close-modal" aria-label="إغلاق">${
      ic("close")
    }</button></div>${body}</section></div>`;
  document.body.classList.add("modal-open");
  document.querySelectorAll("#app > aside,#app > .main-wrap").forEach((el) => el.inert = true);
  document.querySelector(".modal").addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const elements = [...event.currentTarget.querySelectorAll("button,input,select,textarea,a[href],[tabindex='0']")].filter((el) => !el.disabled && el.getClientRects().length);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.querySelector(".close-modal").onclick = closeModal;
  document.querySelector(".modal-backdrop").onclick = (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeModal();
  };
  document.querySelector(".modal input,.modal button")?.focus();
}
function closeModal() {
  const b = document.querySelector(".modal-backdrop");
  b?.classList.add("closing");
  setTimeout(() => {
    document.querySelector("#modal-root").innerHTML = "";
    document.body.classList.remove("modal-open");
    document.querySelectorAll("#app > aside,#app > .main-wrap").forEach((el) => el.inert = false);
    modalTrigger?.focus();
    if (page === "review") { setPage("home"); render(); }
  }, 180);
}
function scoreColor(value) {
  return value < 50
    ? "#dc655c"
    : value <= 65
    ? "#d2a145"
    : value <= 80
    ? "#7d9748"
    : value <= 89
    ? "#4c916d"
    : "#22835e";
}
function labelScore(v) {
  return v < 50
    ? "سيئ"
    : v <= 65
    ? "مقبول"
    : v <= 80
    ? "جيد"
    : v <= 89
    ? "جيد جدًا"
    : "ممتاز";
}
function reviewPage() {
  return `<section class="review-landing"><div class="page-title"><div class="eyebrow">مساحة لتجربتك</div><h1>أضف تقييمًا</h1><p>تجربة واحدة منك تساعد زملاءك في الاختيار.</p></div><div class="panel review-intro">${ic("star")}<h2>شارك تجربتك بمعيارك</h2><p>قيّم الشرح والتعامل والمساعدة بالدرجات بكل خصوصية.</p><button class="primary" id="new-review">ابدأ التقييم</button></div></section>`;
}
function reviewForm(id) {
  setPage("review");
  render();
  if (configured && !requireCloudAccount(() => reviewForm(id))) return;
  window.scrollTo({ top: 0, behavior: "smooth" });
  const selectedDoctor = doctors.find((d) => d.id === id);
  const reviewCollege = selectedDoctor?.college || activeCollege || colleges[0];
  modal(
    "شارك تجربتك",
    `<p class="muted">تقييمك يساعد طالبًا آخر على اتخاذ القرار المناسب.</p><form id="review-form"><div class="form-grid"><label>الكلية<select name="college" required>${
      colleges.map((c) =>
        `<option ${c === reviewCollege ? "selected" : ""}>${
          escapeHtml(c)
        }</option>`
      ).join("")
    }</select></label><label>التخصص<select name="major" id="review-major" required>${
      majors.filter((m) => majorBelongs(m, reviewCollege)).map((m) =>
        `<option ${
          doctors.find((d) => d.id === id)?.major === m
            ? "selected"
            : ""
        }>${escapeHtml(m)}</option>`
      ).join("")
    }</select></label></div><label>اسم الدكتور الثلاثي<input name="doctor" list="doctor-names" required minlength="8" placeholder="مثال: أحمد محمد العتيبي" value="${
      escapeHtml(doctors.find((d) => d.id === id)?.name || "")
    }"><datalist id="doctor-names">${
      doctors.map((d) => `<option>${escapeHtml(d.name)}</option>`).join("")
    }</datalist></label><div class="form-grid"><label>المادة<input name="subject" required placeholder="اسم المادة"></label><label>درجتك في المادة<input name="grade" type="number" min="0" max="100" required placeholder="من ١٠٠"></label></div><div class="privacy-note">${
      ic("shield")
    } لا تُعرض هويتك أو درجتك مع التقييم.<small>${
      configured
        ? "تُحفظ الدرجة في قاعدة البيانات المحمية ولا تظهر للطلاب أو في شاشة المراجعة."
        : "في هذه النسخة التجريبية لا تُخزّن الدرجة."
    }</small></div><div class="sliders">${
      ["الشرح", "التعامل", "المساعدة بالدرجات"].map((t, i) =>
        `<label class="slider-label"><span>${t}<output id="out-${i}">٨٠ <small>جيد</small></output></span><input type="range" name="score${i}" min="0" max="100" value="80" aria-valuetext="80 من 100، جيد" data-range="${i}" style="--range-color:${
          scoreColor(80)
        }"><span class="range-labels"><small>٠ · سيئ</small><small>١٠٠ · ممتاز</small></span></label>`
      ).join("")
    }</div><label>تعليقك عن الدكتور<textarea name="comment" rows="3" maxlength="600" required placeholder="كيف كانت تجربتك؟ شارك رأيك بموضوعية واحترام…"></textarea></label><small class="muted">نرحّب بالنقد البنّاء. تُرفض العبارات المسيئة، ولا تُنشر معلومات شخصية.</small><div class="form-error" role="alert"></div><button class="primary submit-review">${
      ic("plus")
    } إرسال التقييم</button><p class="local-note">${
      configured
        ? "يُرسل تقييمك للمراجعة قبل النشر. خمسة تقييمات يوميًا كحد أقصى، وتقييم واحد لكل دكتور ومادة."
        : "نسخة تجريبية: يُحفظ تقييمك على هذا الجهاز فقط. الدكتور الجديد يُرسل للمراجعة المحلية."
    }</p></form>`,
  );
  document.querySelector("#review-form [name=college]").addEventListener(
    "change",
    (e) => {
      document.querySelector("#review-major").innerHTML = majors.filter((m) =>
        majorBelongs(m, e.target.value)
      ).map((m) => `<option>${escapeHtml(m)}</option>`).join("");
    },
  );
  document.querySelectorAll("[data-range]").forEach((el) =>
    el.oninput = () => {
      const v = +el.value;
      el.style.setProperty("--range-color", scoreColor(v));
      el.setAttribute("aria-valuetext", `${v} من 100، ${labelScore(v)}`);
      document.querySelector("#out-" + el.dataset.range).innerHTML = `${
        v.toLocaleString("ar")
      } <small>${labelScore(v)}</small>`;
    }
  );
  document.querySelector("#review-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      name = f.get("doctor").trim(),
      comment = f.get("comment").trim();
    let error = "";
    if (name.split(/\s+/).length < 3) error = "يرجى كتابة اسم الدكتور الثلاثي.";
    if (/(غبي|حمار|كلب|حقير|تافه|لعنة|fuck|shit)/i.test(comment)) {
      error = "يرجى تعديل التعليق وإزالة الكلمات المسيئة.";
    }
    if (error) {
      document.querySelector(".form-error").textContent = error;
      return;
    }
    const scores = [0, 1, 2].map((i) => +f.get("score" + i));
    let d = doctors.find((x) => x.name === name);
    const data = {
      doctor: d?.id,
      name,
      major: f.get("major"),
      college: f.get("college"),
      subject: f.get("subject").trim(),
      comment,
      scores,
      date: new Date().toISOString(),
    };
    if (configured) {
      const button = e.target.querySelector(".submit-review");
      button.disabled = true;
      try {
        await api("submit", { ...data, grade: Number(f.get("grade")) });
        document.body.classList.remove("modal-open");
        setPage("home");
        render();
        toast("وصل تقييمك، وسيظهر بعد موافقة الإدارة.");
      } catch (error) {
        const el = document.querySelector(".form-error");
        if (el) el.textContent = error.message;
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (d) {
      reviews.push(data);
      if (!d.subjects.includes(data.subject)) d.subjects.push(data.subject);
      d.score = Math.round(
        (d.score * d.count + scores.reduce((a, b) => a + b) / 3) /
          (d.count + 1),
      );
    } else {requests.push({
        ...data,
        score: Math.round(scores.reduce((a, b) => a + b) / 3),
      });}
    persist();
    closeModal();
    setTimeout(() => {
      render();
      toast(
        d
          ? "شكرًا! تم حفظ تجربتك على هذا الجهاز."
          : "تم إرسال طلب إضافة الدكتور للمراجعة التجريبية.",
      );
    }, 200);
  };
}
async function detail(id) {
  if (configured) {
    await cloudDoctorDetail(id);
    return;
  }
  const d = doctors.find((x) => x.id === id);
  const rr = reviews.filter((r) => r.doctor === id);
  modal(
    "تقييمات الدكتور",
    `<div class="detail-person"><span class="avatar ${d.color}">${
      escapeHtml(d.initials)
    }</span><div><h2>د. ${escapeHtml(d.name)} ${
      d.verified ? '<span class="verified">✓</span>' : ""
    }</h2><p>${
      escapeHtml(d.major)
    }</p></div><strong>${d.score}<small>/100</small></strong></div><div class="detail-scores">${
      ["الشرح", "التعامل", "المساعدة بالدرجات"].map((s, i) =>
        `<div><span>${escapeHtml(s)}</span><div><i style="width:${
          d.score - i * 3
        }%"></i></div><b>${d.score - i * 3}</b></div>`
      ).join("")
    }</div><h3>ماذا يقول الطلاب؟</h3><div class="review-comment"><span class="stars">★★★★★</span><p>«${
      escapeHtml(d.quote)
    }»</p><small>طالب مجهول · تقييم توضيحي</small></div>${
      rr.map((r) =>
        `<div class="review-comment"><b>${escapeHtml(r.subject)}</b><p>${
          escapeHtml(r.comment)
        }</p><small>طالب مجهول · ${
          new Date(r.date).toLocaleDateString("ar")
        }</small></div>`
      ).join("")
    }<div class="detail-actions"><button class="primary" id="detail-rate">${
      ic("plus")
    } أضف تجربتك</button><button class="secondary" id="share-doctor">${
      ic("share")
    } مشاركة</button><button class="secondary" id="save-detail">${
      ic("bookmark")
    } ${saved.includes(id) ? "محفوظ" : "حفظ"}</button></div>`,
  );
  document.querySelector("#detail-rate").onclick = () => reviewForm(id);
  document.querySelector("#save-detail").onclick = () => {
    toggleSave(id);
    document.querySelector("#save-detail").innerHTML = ic("bookmark") +
      (saved.includes(id) ? "محفوظ" : "حفظ");
  };
  document.querySelector("#share-doctor").onclick = () =>
    share(`تعرّف على تقييمات د. ${escapeHtml(d.name)} في مِعيار`, id);
}
function toggleSave(id) {
  saved = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
  persist();
  document.querySelectorAll(`[data-save="${id}"]`).forEach((b) =>
    b.classList.toggle("is-saved", saved.includes(id))
  );
  toast(
    saved.includes(id) ? "تمت الإضافة إلى المحفوظات" : "تمت الإزالة من المحفوظات",
  );
}
async function share(text, id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("doctor", id);
  try {
    if (navigator.share) {
      await navigator.share({ title: "مِعيار", text, url: url.href });
    } else {
      await navigator.clipboard.writeText(url.href);
      toast("تم نسخ رابط المشاركة");
    }
  } catch (e) {
    if (e.name !== "AbortError") {
      toast("تعذّرت المشاركة. يمكنك نسخ رابط الصفحة.");
    }
  }
}
function bind() {
  document.querySelector("#dismiss-auth-notice")?.addEventListener(
    "click",
    () => {
      authNotice = "";
      render();
    },
  );
  document.querySelector("#google-account")?.addEventListener(
    "click",
    () => googleSession ? openSettings() : openGoogleMessage(),
  );

  document.querySelector("#retry-cloud")?.addEventListener(
    "click",
    () => loadCloud(),
  );
  document.querySelector("#open-settings")?.addEventListener(
    "click",
    openSettings,
  );
  document.querySelector("#page-close")?.addEventListener("click", () => {
    setPage("home");
    render();
  });
  document.querySelector(".brand").onclick = (e) => {
    e.preventDefault();
    setPage("home");
    render();
  };
  document.querySelectorAll("[data-page]").forEach((b) =>
    b.onclick = () => {
      setPage(b.dataset.page);
      query = "";
      savedOnly = false;
      render();
      if (page === "admin" && configured) loadCloudQueue();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  );
  document.querySelectorAll(".theme-toggle,.mobile-theme").forEach((b) =>
    b.onclick = () => {
      let dark = document.documentElement.dataset.theme !== "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      storage.setItem("athar-theme", dark ? "dark" : "light");
    }
  );
  document.querySelector("#new-review")?.addEventListener(
    "click",
    () => reviewForm(),
  );
  document.querySelector("#search")?.addEventListener("input", (e) => {
    query = e.target.value;
    document.querySelector("#doctor-grid").innerHTML = cards();
    bindCards();
    bindCarousel();
  });
  document.querySelectorAll("[data-college]").forEach((b) =>
    b.onclick = () => selectCollege(b.dataset.college)
  );
  bindCarousel();
  document.querySelectorAll("[data-major]").forEach((b) =>
    b.onclick = () => {
      activeMajor = b.dataset.major;
      render();
    }
  );
  bindCards();
  document.querySelector("#filter")?.addEventListener("click", () => {
    setPage("ratings");
    render();
  });
  document.querySelector("#major-filter")?.addEventListener("change", (e) => {
    activeMajor = e.target.value;
    render();
  });
  document.querySelector("#college-filter")?.addEventListener("change", (e) => {
    selectCollege(e.target.value);
  });
  document.querySelector("#saved-filter")?.addEventListener("click", () => {
    savedOnly = !savedOnly;
    render();
  });
  document.querySelector("#privacy")?.addEventListener(
    "click",
    () =>
      modal(
        "معايير مجتمع مِعيار",
        `<div class="policy"><p>١. تحدّث عن تجربتك الفعلية، وناقش الشرح والتعامل والدرجات بموضوعية.</p><p>٢. لا تشارك بياناتك الشخصية أو بيانات الآخرين. لا تُعرض هويتك أو درجتك مع التعليق.</p><p>٣. تُرفض الكلمات المسيئة الظاهرة في الفلتر المحلي. تُراجع التعليقات على الخادم قبل النشر عند تفعيل الاتصال.</p><p>٤. ${
          configured
            ? "يمكن للإدارة استخدام معرّف الحساب لتطبيق الحظر والتقييد؛ لا يظهر مع التقييمات العامة. الدرجة غير متاحة في العرض العام أو شاشة مراجعة التعليقات."
            : "هذه نسخة تجريبية ببيانات نموذجية وتخزين محلي."
        }</p></div>`,
      ),
  );
  document.querySelector("#notice").onclick = () =>
    toast("أهلًا بك في مِعيار! لا توجد إشعارات جديدة.");
  document.querySelector("#share-platform")?.addEventListener(
    "click",
    () => share("مِعيار — تجارب حقيقية، لاختيارات أفضل"),
  );
  bindAdmin();
  bindBulkDoctors();
}
function bindCards() {
  document.querySelectorAll("[data-doctor]").forEach((b) =>
    b.onclick = () => detail(+b.dataset.doctor)
  );
  document.querySelectorAll("[data-save]").forEach((b) =>
    b.onclick = () => toggleSave(+b.dataset.save)
  );
}
function bindAdmin() {
  if (configured) {
    bindCloudAdmin();
    return;
  }
  if (!demoAdmin) return;
  for (
    const [form, array] of [["add-college", colleges], ["add-major", majors]]
  ) {
    document.getElementById(form)?.addEventListener("submit", (e) => {
      e.preventDefault();
      let n = new FormData(e.target).get("name").trim();
      if (n && !array.includes(n)) {
        array.push(n);
        if (form === "add-major") {
          majorColleges[n] = new FormData(e.target).get("college");
        }
        persist();
        render();
        toast("تمت الإضافة");
      }
    });
  }
  for (const [attr, array] of [["college", colleges], ["major", majors]]) {
    document.querySelectorAll(`[data-delete-${attr}]`).forEach((b) =>
      b.onclick = () => {
        array.splice(
          +b.dataset[attr === "college" ? "deleteCollege" : "deleteMajor"],
          1,
        );
        persist();
        render();
      }
    );
  }
  document.querySelectorAll("[data-verify]").forEach((b) =>
    b.onclick = () => {
      let d = doctors.find((x) => x.id === +b.dataset.verify);
      d.verified = !d.verified;
      persist();
      render();
    }
  );
  document.querySelectorAll("[data-delete-doctor]").forEach((b) =>
    b.onclick = () => {
      doctors = doctors.filter((d) => d.id !== +b.dataset.deleteDoctor);
      persist();
      render();
    }
  );
  document.querySelectorAll("[data-reject]").forEach((b) =>
    b.onclick = () => {
      requests.splice(+b.dataset.reject, 1);
      persist();
      render();
    }
  );
  document.querySelectorAll("[data-approve]").forEach((b) =>
    b.onclick = () => {
      const r = requests.splice(+b.dataset.approve, 1)[0];
      const id = Date.now();
      doctors.push({
        id,
        name: r.name,
        college: r.college,
        major: r.major,
        subjects: [r.subject],
        score: r.score,
        count: 1,
        color: "olive",
        initials: r.name.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0])
          .join(" "),
        verified: false,
        quote: r.comment,
      });
      reviews.push({ ...r, doctor: id });
      persist();
      render();
    }
  );
  document.querySelector("#add-doctor")?.addEventListener("click", () => {
    modal(
      "إضافة دكتور",
      `<form id="doctor-form"><label>الاسم الثلاثي<input name="name" required></label><label>التخصص<select name="major">${
        majors.map((m) => `<option>${escapeHtml(m)}</option>`).join("")
      }</select></label><label>المادة<input name="subject" required></label><button class="primary">إضافة الدكتور</button></form>`,
    );
    document.querySelector("#doctor-form").onsubmit = (e) => {
      e.preventDefault();
      let f = new FormData(e.target);
      doctors.push({
        id: Date.now(),
        name: f.get("name"),
        college: majorColleges[f.get("major")],
        major: f.get("major"),
        subjects: [f.get("subject")],
        score: 0,
        count: 0,
        color: "blue",
        initials: f.get("name").slice(0, 2),
        verified: false,
        quote: "لم تُضف تجارب بعد.",
      });
      persist();
      closeModal();
      setTimeout(render, 200);
    };
  });
  document.querySelector("#user-action")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    storage.setItem("athar-user-" + f.get("user"), f.get("action"));
    toast("تم حفظ الإجراء محليًا للتجربة");
  });
}

function openSettings() {
  const profile = studentProfile ||
    {
      name: signedOut ? "" : displayName() === "طالبنا" ? "" : displayName(),
      major: majors[0] || "",
      level: 1,
    };
  modal(
    "إعداداتك في مِعيار",
    `<form id="settings-form"><div class="settings-intro"><span class="settings-avatar">${
      ic("users")
    }</span><div><h3>مساحتك، على طريقتك</h3><p>خصّص بياناتك وتجربة القراءة بما يناسبك.</p></div></div><label>اسم الطالب<input name="name" required maxlength="60" autocomplete="name" placeholder="كيف تحب أن نناديك؟" value="${
      escapeHtml(profile.name)
    }"></label><div class="form-grid"><label>التخصص<select name="major" required>${
      configured
        ? (cloudCatalogue?.majors || []).map((m) =>
          `<option value="${m.id}" ${
            cloudMe?.major_id === m.id ? "selected" : ""
          }>${escapeHtml(m.name)} · ${
            escapeHtml(
              cloudCatalogue.colleges.find((c) => c.id === m.college_id)
                ?.name || "",
            )
          }</option>`
        ).join("")
        : [...new Set([profile.major, ...majors])].filter(Boolean).map((m) =>
          `<option ${profile.major === m ? "selected" : ""}>${
            escapeHtml(m)
          }</option>`
        ).join("")
    }</select></label><label>المستوى الدراسي<select name="level" required>${
      Array.from({ length: 12 }, (_, i) => i + 1).map((l) =>
        `<option value="${l}" ${
          +profile.level === l ? "selected" : ""
        }>المستوى ${l.toLocaleString("ar")}</option>`
      ).join("")
    }</select></label></div><section class="font-settings"><div><h3>حجم الخط</h3><p>اختر الحجم الأريح لك. يُحفظ اختيارك تلقائيًا.</p></div><div class="font-stepper"><button type="button" id="font-smaller" aria-label="تصغير الخط">−</button><output id="font-size-value" aria-live="polite">${
      Math.round(fontScale * 100).toLocaleString("ar")
    }٪</output><button type="button" id="font-larger" aria-label="تكبير الخط">+</button></div><div class="font-preview">مِعيار… لاختيارٍ أوضح وتجربةٍ أفضل.</div><button type="button" id="font-reset" class="text-button">استعادة الحجم الافتراضي</button></section><div class="form-error" role="alert"></div>${
      configured
        ? `<p class="cloud-identity">${
          cloudMe
            ? "معرّف حسابك: " + cloudMe.id
            : "تعديل الملف يتطلب تسجيل الدخول باستخدام Google."
        }</p>`
        : ""
    }<button class="primary settings-save">${
      ic("check")
    } حفظ الإعدادات</button><p class="local-note">${
      configured
        ? "يُحفظ اسمك وتخصصك ومستواك في حسابك؛ المظهر وحجم الخط محفوظان على جهازك. لا يظهر اسمك مع التقييمات."
        : "تُحفظ إعداداتك على هذا الجهاز. لا يظهر اسمك مع التقييمات."
    }</p>${
      signedOut
        ? ""
        : `<div class="logout-section"><button type="button" id="logout" class="logout-button">${
          ic("logout")
        } تسجيل الخروج</button><small>${
          configured
            ? "إنهاء جلسة مِعيار على هذا الجهاز."
            : "الخروج من ملفك المحلي في مِعيار."
        }</small></div>`
    }</form>`,
  );
  const updateFont = (delta) => {
    fontScale =
      Math.round(Math.max(.9, Math.min(1.3, fontScale + delta)) * 100) / 100;
    storage.setItem("miyar-font-scale", fontScale);
    document.documentElement.style.setProperty("--font-scale", fontScale);
    document.querySelector("#font-size-value").textContent =
      Math.round(fontScale * 100).toLocaleString("ar") + "٪";
    document.querySelector("#font-smaller").disabled = fontScale <= .9;
    document.querySelector("#font-larger").disabled = fontScale >= 1.3;
  };
  document.querySelector("#font-smaller").onclick = () => updateFont(-.1);
  document.querySelector("#font-larger").onclick = () => updateFont(.1);
  document.querySelector("#font-reset").onclick = () => {
    fontScale = 1;
    updateFont(0);
  };
  updateFont(0);
  document.querySelector("#settings-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get("name").trim();
    if (!name) {
      e.target.elements.name.setCustomValidity("اكتب اسمك أولًا");
      e.target.elements.name.reportValidity();
      e.target.elements.name.oninput = () =>
        e.target.elements.name.setCustomValidity("");
      return;
    }
    if (configured) {
      const button = e.target.querySelector(".settings-save");
      button.disabled = true;
      try {
        if (!(await getGoogleSession())) {
          throw new Error("سجّل الدخول باستخدام Google أولًا.");
        }
        if (!cloudMe) await connectCloudAccount(false);
        if (!cloudMe) throw new Error("تعذّر التحقق من حسابك.");
        const majorId = Number(f.get("major"));
        await api("profile", { name, majorId, level: Number(f.get("level")) });
        cloudMe = {
          ...cloudMe,
          name,
          major_id: majorId,
          level: Number(f.get("level")),
        };
        studentProfile = {
          name,
          major: cloudCatalogue?.majors.find((m) => m.id === majorId)?.name ||
            "",
          level: Number(f.get("level")),
        };
      } catch (error) {
        const errorBox = document.querySelector(".form-error");
        if (errorBox) errorBox.textContent = error.message;
        return;
      } finally {
        button.disabled = false;
      }
    } else {studentProfile = {
        name,
        major: f.get("major"),
        level: +f.get("level"),
      };}
    storage.setItem("miyar-profile", JSON.stringify(studentProfile));
    storage.setItem("miyar-session", "active");
    signedOut = false;
    document.body.classList.remove("modal-open");
    render();
    toast("تم حفظ إعداداتك، يا " + studentProfile.name);
  };
  document.querySelector("#logout")?.addEventListener("click", () => {
    modal(
      "تسجيل الخروج",
      `<div class="logout-confirm"><span class="settings-avatar">${
        ic("logout")
      }</span><h3>هل تريد تسجيل الخروج؟</h3><p>سنزيل اسمك وتخصصك ومستواك من هذا الجهاز. ستبقى تفضيلات المظهر وحجم الخط.</p><button class="primary" id="confirm-logout">تسجيل الخروج</button><button class="secondary" id="cancel-logout">البقاء في مِعيار</button></div>`,
    );
    document.querySelector("#cancel-logout").onclick = openSettings;
    document.querySelector("#confirm-logout").onclick = async () => {
      const button = document.querySelector("#confirm-logout");
      button.disabled = true;
      if (configured) {
        try {
          await signOutGoogle();
          googleSession = null;
        } catch (error) {
          button.disabled = false;
          toast(error.message);
          return;
        }
      }

      studentProfile = null;
      cloudMe = null;
      cloudQueue = null;
      signedOut = true;
      setPage("home");
      query = "";
      activeMajor = "الكل";
      savedOnly = false;
      storage.removeItem("miyar-profile");
      storage.setItem("miyar-session", "signed-out");
      document.body.classList.remove("modal-open");
      render();
    };
  });
}
function renderSignedOut() {
  document.querySelector("#app").innerHTML =
    `<main class="signed-out-page"><section class="signed-out-card"><div class="brand">${logo}</div><span class="settings-avatar">${
      ic("check")
    }</span><h1>تم تسجيل خروجك</h1><p>نراك قريبًا في مِعيار.<br>${
      configured
        ? "يمكنك الدخول باستخدام Google أو التصفح كزائر."
        : "يمكنك إنشاء ملفك المحلي من جديد أو التصفح كزائر."
    }</p><button class="primary" id="sign-in">الدخول مجددًا</button><button class="secondary" id="browse-guest">التصفح كزائر</button></section></main><div id="modal-root"></div><div id="toast" role="status"></div>`;
  document.querySelector("#sign-in").onclick = () =>
    configured ? startGoogleLogin() : openSettings();
  document.querySelector("#browse-guest").onclick = () => {
    signedOut = false;
    setPage("home");
    storage.setItem("miyar-session", "guest");
    render();
  };
}
function majorBelongs(name, college) {
  return configured
    ? Boolean(
      cloudCatalogue?.majors.some((m) =>
        m.name === name &&
        cloudCatalogue.colleges.find((c) => c.id === m.college_id)?.name ===
          college
      ),
    )
    : majorColleges[name] === college;
}
function connectionBanner() {
  const notice = authNotice
    ? `<div class="connection-banner error" role="alert">${
      escapeHtml(authNotice)
    }<button id="dismiss-auth-notice" aria-label="إغلاق تنبيه الدخول">إغلاق</button></div>`
    : "";
  if (!configured) {
    return notice +
      '<div class="connection-banner demo">نسخة عرض تجريبية · التقييمات الحالية نموذجية والحفظ محلي.</div>';
  }
  if (cloudStatus === "loading") {
    return notice +
      '<div class="connection-banner" role="status">جارٍ تحميل تقييمات مِعيار…</div>';
  }
  if (cloudStatus === "error") {
    return notice +
      `<div class="connection-banner error" role="alert">${
        escapeHtml(cloudError)
      }<button id="retry-cloud">إعادة المحاولة</button></div>`;
  }
  return notice +
    '<div class="connection-banner live"><span></span>تقييمات مشتركة بين الطلاب · تُراجع المشاركات قبل النشر</div>';
}
async function refreshCloudCatalogue() {
  const data = await api("catalogue");
  if (
    !Array.isArray(data.colleges) || !Array.isArray(data.majors) ||
    !Array.isArray(data.doctors)
  ) throw new Error("تعذّر قراءة دليل المنصة.");
  cloudCatalogue = data;
  colleges = data.colleges.map((c) => c.name);
  majors = [...new Set(data.majors.map((m) => m.name))];
  doctors = data.doctors.map((d) => ({
    ...d,
    color: ["olive", "sand", "blue", "rose"][d.id % 4],
    initials: d.name.split(/\s+/).slice(0, 2).map((s) => s[0]).join(" "),
  }));
  if (!colleges.includes(activeCollege)) activeCollege = colleges[0] || "";
  cloudStatus = "ready";
  cloudError = "";
}
async function loadCloud() {
  cloudStatus = "loading";
  cloudError = "";
  try {
    googleSession = await initializeAuth();
  } catch (error) {
    authNotice = error.message;
  }
  try {
    await refreshCloudCatalogue();
    if (googleSession) await connectCloudAccount(false);
  } catch (error) {
    cloudStatus = "error";
    cloudError = error.message;
  }
  if (!document.querySelector(".modal-backdrop")) render();
  const id = Number(new URLSearchParams(location.search).get("doctor"));
  if (doctors.some((d) => d.id === id)) detail(id);
}
async function connectCloudAccount(update = true) {
  let session;
  try {
    session = await getGoogleSession();
  } catch (error) {
    cloudMe = null;
    if (update) toast(error.message);
    return null;
  }
  googleSession = session;
  if (!session) {
    cloudMe = null;
    return null;
  }
  if (!cloudAuthPending) {
    cloudAuthPending = api("me").then((me) => {
      // Ignore responses for a session that was signed out or replaced while loading.
      if (googleSession?.user.id !== session.user.id) return null;
      cloudMe = me;
      const major = cloudCatalogue?.majors.find((m) => m.id === me.major_id);
      studentProfile = {
        name: me.name,
        major: major?.name || "",
        level: me.level || 1,
      };
      signedOut = false;
      storage.setItem("miyar-session", "active");
      return me;
    }).catch((error) => {
      cloudMe = null;
      if (update) toast(error.message);
      return null;
    }).finally(() => {
      cloudAuthPending = null;
    });
  }
  const me = await cloudAuthPending;
  if (
    me && update && !document.querySelector(".modal-backdrop") && !signedOut
  ) render();
  return me;
}
async function startGoogleLogin() {
  const button = document.querySelector("#google-signin") ||
    document.querySelector("#sign-in");
  if (button) button.disabled = true;
  try {
    await signInGoogle();
  } catch (error) {
    const box = document.querySelector(".google-login-error");
    if (box) box.textContent = error.message;
    else toast(error.message);
    if (button) button.disabled = false;
  }
}
function openGoogleMessage() {
  modal(
    "الدخول إلى مِعيار",
    `<div class="login-explainer"><span class="settings-avatar">${
      ic("shield")
    }</span><h3>تجربتك تبدأ بخطوة بسيطة</h3><p>سجّل الدخول بحساب Google لتشارك تقييمك وتحفظ ملفك. لا يظهر اسمك أو بريدك مع تقييماتك.</p><button class="google-signin-button" id="google-signin"><span class="google-g" aria-hidden="true">G</span>الدخول باستخدام Google</button><p class="google-login-error form-error" role="alert"></p><small class="muted">يمكنك تصفّح الدكاترة دون تسجيل الدخول.</small></div>`,
  );
  document.querySelector("#google-signin").onclick = startGoogleLogin;
}
function requireCloudAccount(next) {
  if (!googleSession) {
    openGoogleMessage();
    return false;
  }
  if (cloudStatus !== "ready") {
    toast("انتظر اكتمال تحميل المنصة، أو أعد المحاولة.");
    return false;
  }
  if (!cloudMe) {
    connectCloudAccount(false).then((me) => {
      if (!me) {
        toast("تعذّر التحقق من الحساب. حاول مجددًا.");
        return;
      }
      render();
      next?.();
    });
    return false;
  }
  if (cloudMe.status !== "active") {
    toast("حسابك مقيّد عن إضافة التقييمات.");
    return false;
  }
  return true;
}
async function cloudDoctorDetail(id) {
  const d = doctors.find((d) => d.id === id);
  if (!d) return;
  modal(
    "تقييمات الدكتور",
    '<p class="muted" role="status">جارٍ تحميل التجارب…</p>',
  );
  try {
    const rows = await api("reviews", { doctor: id });
    if (!document.querySelector(".modal-backdrop")) return;
    modal(
      "تقييمات الدكتور",
      `<div class="detail-person"><span class="avatar ${d.color}">${
        escapeHtml(d.initials)
      }</span><div><h2>د. ${escapeHtml(d.name)} ${
        d.verified ? '<span class="verified">✓</span>' : ""
      }</h2><p>${escapeHtml(d.major)}</p></div><strong>${
        d.count ? d.score : "—"
      }<small>/100</small></strong></div><div class="detail-scores">${
        ["الشرح", "التعامل", "المساعدة بالدرجات"].map((s, i) =>
          `<div><span>${s}</span><div><i style="width:${
            Number(d.scores[i])
          }%"></i></div><b>${d.count ? Number(d.scores[i]) : "—"}</b></div>`
        ).join("")
      }</div><h3>تجارب الطلاب · ${d.count.toLocaleString("ar")} تقييمًا</h3>${
        rows.length
          ? rows.map((r) =>
            `<div class="review-comment"><b>${escapeHtml(r.subject)}</b><p>${
              escapeHtml(r.comment)
            }</p><small>طالب مجهول · ${
              new Date(r.date).toLocaleDateString("ar")
            }</small></div>`
          ).join("")
          : '<p class="empty">لا توجد تجارب منشورة بعد. كن أول من يشارك تجربته.</p>'
      }<div class="detail-actions"><button class="primary" id="detail-rate">${
        ic("plus")
      } أضف تجربتك</button><button class="secondary" id="share-doctor">${
        ic("share")
      } مشاركة</button><button class="secondary" id="save-detail">${
        ic("bookmark")
      } ${saved.includes(id) ? "محفوظ" : "حفظ"}</button></div>`,
    );
    document.querySelector("#detail-rate").onclick = () => reviewForm(id);
    document.querySelector("#share-doctor").onclick = () =>
      share(`تعرّف على تقييمات د. ${d.name} في مِعيار`, id);
    document.querySelector("#save-detail").onclick = () => {
      toggleSave(id);
      document.querySelector("#save-detail").innerHTML = ic("bookmark") +
        (saved.includes(id) ? "محفوظ" : "حفظ");
    };
  } catch (error) {
    if (document.querySelector(".modal-backdrop")) {
      modal(
        "تعذّر تحميل التقييمات",
        `<p class="muted">${escapeHtml(error.message)}</p>`,
      );
    }
  }
}
async function loadCloudQueue(update = true) {
  if (!cloudMe?.isAdmin) return;
  try {
    cloudQueue = await api("admin", { operation: "queue" });
  } catch (error) {
    cloudQueue = { error: error.message, doctors: [], reviews: [] };
  }
  if (update && page === "admin") render();
}
function cloudAdmin() {
  if (!cloudMe?.isAdmin) {
    return '<div class="empty">هذه الصفحة متاحة للأدمن بعد التحقق من حسابه.</div>';
  }
  const records = cloudCatalogue || { colleges: [], majors: [] };
  const majorOptions = records.majors.map((m) =>
    `<option value="${m.id}">${escapeHtml(m.name)} · ${
      escapeHtml(
        records.colleges.find((c) => c.id === m.college_id)?.name || "",
      )
    }</option>`
  ).join("");
  const queue = cloudQueue;
  return `<div class="page-title"><div class="eyebrow">إدارة مِعيار</div><h1>لوحة التحكم</h1><p>المشاركات لا تُنشر تلقائيًا. راجع التعليقات وطلبات الدكاترة من هنا.</p><button class="secondary" id="refresh-cloud-admin">تحديث الطلبات</button></div><div class="admin-grid"><section class="panel"><h2>الكليات والتخصصات</h2><form id="cloud-add-college"><label>إضافة كلية<input name="name" required minlength="2" maxlength="100" placeholder="اسم الكلية"></label><button class="primary">إضافة</button></form>${
    records.colleges.map((c) =>
      `<div class="admin-row"><span>${
        escapeHtml(c.name)
      }</span><button class="danger" data-cloud-operation="college.delete" data-id="${c.id}">حذف</button></div>`
    ).join("")
  }<form id="cloud-add-major"><label>إضافة تخصص<select name="collegeId" required>${
    records.colleges.map((c) =>
      `<option value="${c.id}">${escapeHtml(c.name)}</option>`
    ).join("")
  }</select><input name="name" required minlength="2" maxlength="100" placeholder="اسم التخصص"></label><button class="primary">إضافة</button></form>${
    records.majors.map((m) =>
      `<div class="admin-row"><span>${escapeHtml(m.name)}<small>${
        escapeHtml(
          records.colleges.find((c) => c.id === m.college_id)?.name || "",
        )
      }</small></span><button class="danger" data-cloud-operation="major.delete" data-id="${m.id}">حذف</button></div>`
    ).join("")
  }</section><section class="panel"><h2>إدارة الدكاترة</h2>${bulkDoctorForm()}<form id="cloud-add-doctor"><label>اسم الدكتور الثلاثي<input name="name" required minlength="8" maxlength="100"><select name="majorId" required>${majorOptions}</select></label><button class="primary">إضافة</button></form>${
    doctors.map((d) =>
      `<div class="admin-row"><span>د. ${escapeHtml(d.name)}<small>${
        escapeHtml(d.major)
      }</small></span><div><button data-cloud-operation="doctor.verify" data-id="${d.id}" data-verified="${!d
        .verified}">${
        d.verified ? "إلغاء التوثيق" : "توثيق"
      }</button><button class="danger" data-cloud-operation="doctor.delete" data-id="${d.id}">إزالة</button></div></div>`
    ).join("")
  }<h2>إدارة المستخدمين</h2><form id="cloud-user-status"><label>معرّف حساب الطالب<input name="userId" required placeholder="UUID الظاهر مع الطلب"><select name="status"><option value="banned">حظر</option><option value="restricted">تقييد الإرسال</option><option value="active">فك الحظر أو التقييد</option></select></label><button class="primary">تطبيق</button></form></section><section class="panel moderation-panel"><h2>طلبات إضافة دكتور</h2>${
    !queue
      ? '<p class="muted">جارٍ التحميل…</p>'
      : queue.error
      ? `<p role="alert">${escapeHtml(queue.error)}</p>`
      : queue.doctors.length
      ? queue.doctors.map((d) =>
        `<div class="admin-row"><span>${escapeHtml(d.name)}<small>${
          escapeHtml(
            records.majors.find((m) => m.id === d.major_id)?.name || "",
          )
        } · الطالب ${
          escapeHtml(d.submitted_by || "حساب سابق")
        }</small></span><div><button data-cloud-operation="doctor.approve" data-id="${d.id}">قبول</button><button class="danger" data-cloud-operation="doctor.reject" data-id="${d.id}">رفض</button></div></div>`
      ).join("")
      : '<p class="muted">لا توجد طلبات معلّقة.</p>'
  }<h2>مراجعة التقييمات</h2>${
    queue?.reviews?.length
      ? queue.reviews.map((r) =>
        `<div class="moderation-review"><b>د. ${
          escapeHtml(
            doctors.find((d) => d.id === r.doctor_id)?.name ||
              queue.doctors.find((d) =>
                d.id === r.doctor_id
              )?.name ||
              "دكتور غير متاح",
          )
        }</b><small>المادة: ${escapeHtml(r.subject)} · الطالب ${
          escapeHtml(r.user_id || "حساب سابق")
        }</small><p>${
          escapeHtml(r.comment)
        }</p><span>الشرح ${r.explanation} · التعامل ${r.treatment} · المساعدة ${r.grading}</span><div><button class="secondary" data-cloud-operation="review.approve" data-id="${r.id}">نشر التقييم</button><button class="secondary danger" data-cloud-operation="review.reject" data-id="${r.id}">رفض</button></div></div>`
      ).join("")
      : '<p class="muted">لا توجد تقييمات بانتظار المراجعة.</p>'
  }</section></div>`;
}
async function cloudAdminAction(operation, data) {
  try {
    await api("admin", { operation, ...data });
    await Promise.all([refreshCloudCatalogue(), loadCloudQueue(false)]);
    render();
    toast("تم حفظ التغيير في المنصة.");
  } catch (error) {
    toast(error.message);
  }
}
function bindCloudAdmin() {
  if (!cloudMe?.isAdmin) return;
  document.querySelector("#refresh-cloud-admin")?.addEventListener(
    "click",
    () => loadCloudQueue(),
  );
  for (
    const [selector, operation] of [
      ["#cloud-add-college", "college.add"],
      ["#cloud-add-major", "major.add"],
      ["#cloud-add-doctor", "doctor.add"],
      ["#cloud-user-status", "user.status"],
    ]
  ) {
    document.querySelector(selector)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.target));
      for (const field of ["collegeId", "majorId"]) {
        if (field in values) values[field] = Number(values[field]);
      }
      const button = e.target.querySelector("button");
      button.disabled = true;
      await cloudAdminAction(operation, values);
      button.disabled = false;
    });
  }
  document.querySelectorAll("[data-cloud-operation]").forEach((b) =>
    b.onclick = () => {
      const operation = b.dataset.cloudOperation;
      const data = { id: Number(b.dataset.id) };
      if (operation === "doctor.verify") {
        data.verified = b.dataset.verified === "true";
      }
      if (operation.endsWith(".delete")) {
        modal(
          "تأكيد الإزالة",
          `<p class="muted">هل تريد إزالة هذا السجل من المنصة؟ الكليات والتخصصات المرتبطة بسجلات أخرى لا تُحذف.</p><button class="primary" id="confirm-cloud-delete">تأكيد الإزالة</button>`,
        );
        document.querySelector("#confirm-cloud-delete").onclick = async () => {
          document.querySelector("#confirm-cloud-delete").disabled = true;
          document.body.classList.remove("modal-open");
          await cloudAdminAction(operation, data);
          document.querySelector("#modal-root").innerHTML = "";
        };
      } else {
        b.disabled = true;
        cloudAdminAction(operation, data).finally(() => b.disabled = false);
      }
    }
  );
}

window.addEventListener("miyar-auth", async ({ detail }) => {
  const previous = googleSession;
  googleSession = detail.session;
  if (!detail.session) {
    cloudMe = null;
    cloudQueue = null;
    studentProfile = null;
    storage.removeItem("miyar-profile");
    if (detail.event === "SIGNED_OUT") {
      storage.setItem("miyar-session", signedOut ? "signed-out" : "guest");
    }
  } else if (!previous || previous.user.id !== detail.session.user.id) {
    cloudMe = null;
    cloudQueue = null;
    studentProfile = null;
    signedOut = false;
    storage.setItem("miyar-session", "active");
    if (cloudStatus === "ready") await connectCloudAccount(false);
  }
  if (
    detail.event !== "TOKEN_REFRESHED" &&
    !document.querySelector(".modal-backdrop")
  ) render();
});
window.addEventListener("popstate", () => {
  document.body.classList.remove("modal-open");
  page = pageNames.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  render();
});
window.addEventListener("resize", updateCarouselControls);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
render();
if (configured) loadCloud();
const sharedId = +new URLSearchParams(location.search).get("doctor");
if (doctors.some((d) => d.id === sharedId)) detail(sharedId);
