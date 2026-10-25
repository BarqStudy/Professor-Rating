import { REVIEW_TAGS } from "../supabase/functions/miyar/tags.js";
import { createAssistant } from './assistant.js';
import { createDoctorCard } from "./doctor-card.js";
import { setupPwa, installPlatform } from "./pwa.js";
import "./style.css";
import { readJSON, storage } from "./storage.js";
import {
  api,
  configured,
  ensureGuestSession,
  getGoogleSession,
  initializeAuth,
  signInGoogle,
  signOutGoogle,
} from "./cloud.js";
let googleSession = null;
let guestProfile = null, presenceCount = null, presenceBusy = false;
const presenceTabId = crypto.randomUUID();
let compareIds = [];
let savedUpdates = [];
let requestUpdates = [];
let myRequestsData = [], requestsOwner = "", requestsLoading = false, requestsError = "";
let noticeOwner = "";
let authNotice = "";
let cloudMe = null,
  cloudStatus = configured ? "loading" : "demo",
  cloudError = "",
  cloudCatalogue = null,
  cloudQueue = null;
let cloudAuthPending = null;
let cloudQueueLoading = false;
const miyarAssistant = createAssistant({
  api,
  ensureGuestSession: async () => {
    guestProfile = await ensureGuestSession();
    const university = currentUniversityId();
    if (university && guestProfile.university_id !== university) guestProfile = await api('guest.university', { universityId: university });
    return guestProfile;
  },
  universityId: () => currentUniversityId(), universityName: () => selectedUniversity()?.name,
  configured: () => configured,
});
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
const pageNames = ["home", "ratings", "review", "saved", "requests", "developer", "admin", "ambassador", "assistant"];
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
const platformColors = [
  { id: "blue", name: "أزرق", hue: 218 },
  { id: "green", name: "أخضر", hue: 155 },
  { id: "pink", name: "وردي", hue: 330 },
  { id: "apple", name: "تفاحي", hue: 90 },
];
function applyPlatformColor(id) {
  const color = platformColors.find((item) => item.id === id) || platformColors[0];
  document.documentElement.dataset.color = color.id;
  document.documentElement.style.setProperty("--brand-hue", color.hue);
  storage.setItem("miyar-color", color.id);
}
applyPlatformColor(storage.getItem("miyar-color"));
function appearanceSettings() {
  return `<section class="appearance-settings"><h3>ألوان المنصة</h3><p>اختر لونك المفضل؛ يُحفظ تلقائيًا ويعمل بالنهار والليل.</p><div class="color-options" role="group" aria-label="لون المنصة">${platformColors.map((color) => `<button type="button" class="color-option" data-color-option="${color.id}" aria-pressed="${document.documentElement.dataset.color === color.id}" style="--swatch-hue:${color.hue}"><span class="color-swatch" aria-hidden="true">${ic("check")}</span>${color.name}</button>`).join("")}</div><h3>المظهر</h3><div class="appearance-modes" role="group" aria-label="مظهر المنصة"><button type="button" data-appearance="light" aria-pressed="${document.documentElement.dataset.theme !== 'dark'}">${ic("sun")} نهاري</button><button type="button" data-appearance="dark" aria-pressed="${document.documentElement.dataset.theme === 'dark'}">${ic("moon")} ليلي</button></div></section>`;
}
function nav() {
  return `<nav>${
    [["home", "home", "الرئيسية"], ["ratings", "star", "التقييمات"], ["saved", "bookmark", "المحفوظات"], [
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
      : cloudMe?.ambassadorUniversities?.length ? `<button data-page="ambassador" class="nav-item ${page === 'ambassador' ? 'active' : ''}">${ic('cap')}<span>مساحة السفير</span></button>` : ""
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
        saved: "المحفوظات",
        requests: "متابعة الطلبات",
        admin: "لوحة الإدارة",
        ambassador: "مساحة السفير",
        assistant: "مساعد مِعيار",
      })[page]
    }</b></div><div class="header-actions">${
      !googleSession
        ? `<button class="google-account-button" id="google-account"><span class="google-g" aria-hidden="true">G</span><span>دخول Google</span></button>`
        : ""
    }<button class="icon-btn settings-trigger" id="open-settings" aria-label="الإعدادات" title="الإعدادات">${
      ic("settings")
    }</button><span class="semester"><i></i> الفصل الدراسي الأول ١٤٤٨ هـ</span><button class="icon-btn" id="notice" aria-label="الإشعارات">${
      ic("bell")
    }${notificationBadge()}</button><button class="icon-btn mobile-theme" aria-label="تبديل المظهر">${
      ic("moon")
    }</button></div></header><main>${
      page !== "home"
        ? `<button class="page-close" id="page-close" aria-label="رجوع">${
          ic("arrow")
        } رجوع</button>`
        : ""
    }${
      page === "home"
        ? home()
        : page === "ratings"
        ? ratings()
        : page === "requests"
        ? requestsPage()
        : page === "saved"
        ? savedPage()
        : page === "review"
        ? reviewPage()
        : page === "admin"
        ? admin()
        : page === "ambassador"
        ? ambassadorPage()
        : page === "assistant"
        ? miyarAssistant.page()
        : developer()
    }</main><footer><span>مِعيار © ٢٠٢٦ <i>·</i> كل تجربة تستحق أن تُروى</span><span>بُني بشغف لرحلتك الجامعية</span></footer>${page !== 'assistant' ? `<button type="button" class="assistant-launcher" data-page="assistant" aria-label="مساعد مِعيار"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z"/></svg><span>مساعد مِعيار</span></button>` : ''}</div><div id="modal-root"></div><div id="comparison-root"></div><div id="toast" role="status"></div>`;
  bind();
  if (page === 'assistant') miyarAssistant.bind();
  if (page === 'admin' && cloudMe?.isAdmin && !cloudQueue && !cloudQueueLoading) loadCloudQueue();
  if (page === "requests" && googleSession && requestsOwner !== googleSession.user.id && !requestsLoading) loadMyRequests();
  if (needsUniversity()) openUniversityChoice(true);
}
function home() {
  return `${connectionBanner()}<section class="welcome"><div><div class="eyebrow"><span></span> معك في كل خطوة جامعية</div><h1>أهلًا ${
    escapeHtml(displayName().trim().split(/\s+/)[0])
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
  }"><button type="button" id="clear-search" class="clear-search" aria-label="مسح البحث" title="مسح البحث" ${query ? "" : "hidden"}>${ic("close")}</button></div><button class="filter-button" id="filter">${
    ic("filter")
  }<span>${
    escapeHtml(collegeSelected ? activeCollege : "كل الكليات")
  }</span><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></section><section class="quick-actions"><button class="action-card browse rate-existing" data-page="ratings"><span class="action-icon">${
    ic("book")
  }</span><div><span class="tiny-label">قرار أفضل يبدأ من هنا</span><h2>تقييم دكتور</h2><p>اختر الدكتور من كليتك وشارك تجربتك</p></div><span class="action-arrow">${
    ic("arrow")
  }</span></button><button class="action-card new-review add-new-doctor" id="new-review"><span class="action-icon">${
    ic("plus")
  }</span><div><span class="tiny-label">تجربتك تستحق المشاركة</span><h2>إضافة دكتور بتقييم</h2><p>دكتور غير مضاف في الأقسام</p></div><span class="action-arrow">${
    ic("arrow")
  }</span><span class="action-decoration" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><path d="M50 8v84M8 50h84M20 20l60 60M20 80l60-60" stroke="currentColor" stroke-width="12"/></svg></span></button></section><button class="doctor-request-start secondary" data-request-doctor>${ic("plus")} طلب إضافة دكتور بدون تقييم</button><section class="stats"><div><span class="stat-icon">${
    ic("cap")
  }</span><div><b>+${
    configured
      ? Number(cloudCatalogue?.stats?.doctors ?? cloudCatalogue?.doctors.length ?? 0).toLocaleString("ar")
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
    configured ? (cloudCatalogue?.colleges.length || 0).toLocaleString("ar") : "+٨٥٠"
  }</b><span>${
    configured ? "كلية في مِعيار" : "طالب يصنعون الأثر"
  }</span></div></div><span class="demo-data">${
    configured ? "إحصائيات جميع الجامعات · تقييمات منشورة فقط" : "إحصاءات توضيحية"
  }</span></section>${universityRequestSection()}<div id="home-doctors-slot">${topDoctorsSection()}</div><section class="bottom-banner"><div class="banner-symbol">${
    ic("shield")
  }</div><div><h3>مساحة آمنة. آراء صادقة. أثر حقيقي.</h3><p>نحترم خصوصيتك، ونؤمن أن النقد البنّاء هو بداية التطوير.</p></div><button id="privacy">تعرّف على معاييرنا ${
    ic("arrow")
  }</button></section>`;
}
function needsUniversity() {
  return Boolean(googleSession && cloudMe && cloudCatalogue?.universities?.length && !cloudMe.university_id);
}
function currentUniversityId() { return googleSession ? cloudMe?.university_id : guestProfile?.university_id; }
function selectedUniversity() {
  return cloudCatalogue?.universities?.find((university) => university.id === currentUniversityId());
}
function studentMajors() {
  const data = cloudCatalogue;
  if (!data) return [];
  const collegeIds = new Set(data.colleges.filter((college) => !currentUniversityId() || college.university_id === currentUniversityId()).map((college) => college.id));
  return data.majors.filter((major) => collegeIds.has(major.college_id));
}
function scopeCatalogue() {
  if (!cloudCatalogue) return;
  const data = cloudCatalogue;
  const visibleColleges = data.colleges.filter((college) => !currentUniversityId() || college.university_id === currentUniversityId());
  const collegeIds = new Set(visibleColleges.map((college) => college.id));
  const majorIds = new Set(data.majors.filter((major) => collegeIds.has(major.college_id)).map((major) => major.id));
  colleges = [...new Set(visibleColleges.map((college) => college.name))];
  majors = [...new Set(data.majors.filter((major) => majorIds.has(major.id)).map((major) => major.name))];
  doctors = data.doctors.filter((doctor) => majorIds.has(doctor.major_id)).map((doctor) => ({ ...doctor, color: ["olive", "sand", "blue", "rose"][doctor.id % 4], initials: doctor.name.split(/\s+/).slice(0,2).map((word) => word[0]).join(" ") }));
  compareIds = compareIds.filter((id) => doctors.some((doctor) => doctor.id === id));
  if (!colleges.includes(activeCollege)) activeCollege = colleges[0] || "";
  if (!majors.includes(activeMajor)) activeMajor = "الكل";
}
function openUniversityChoice(required = false, onSelected) {
  const universities = cloudCatalogue?.universities || [];
  modal("اختر جامعتك", `<form id="university-choice"><p>اختر جامعتك لنعرض لك كلياتها ودكاترتها فقط. يمكنك تغييرها لاحقًا من الإعدادات.</p><label>الجامعة<select name="university" required><option value="">اختر الجامعة</option>${universities.map((university) => `<option value="${university.id}" ${university.id === currentUniversityId() ? "selected" : ""}>${escapeHtml(university.name)}${university.city ? ` · ${escapeHtml(university.city)}` : ""}</option>`).join("")}</select></label><p class="form-error" role="alert"></p><button class="primary" type="submit">حفظ الجامعة والمتابعة</button></form>`);
  if (required) {
    document.querySelector(".modal").classList.add("mandatory-university");
    document.querySelector(".close-modal").remove();
    document.querySelector(".modal-backdrop").onclick = null;
    document.querySelector("#university-choice select").focus();
  }
  document.querySelector("#university-choice").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const universityId = Number(new FormData(event.target).get("university"));
      if(googleSession){
        await api("university", { universityId });
        cloudMe = { ...cloudMe, university_id: universityId, major_id: null };
      } else {
        guestProfile = await ensureGuestSession();
        guestProfile = await api("guest.university", { universityId });
      }
      if (studentProfile) studentProfile.major = "";
      query = ""; activeMajor = "الكل"; savedOnly = false; collegeSelected = false;
      scopeCatalogue();
      setPage("home");
      document.body.classList.remove("modal-open");
      render();
      refreshSavedUpdates();
      toast("تم اختيار " + selectedUniversity().name);
      if(onSelected) onSelected();
    } catch (error) {
      event.target.querySelector(".form-error").textContent = error.message;
      button.disabled = false;
    }
  };
}
function universityRequestSection() {
  return `<section class="university-request panel"><div><span class="eyebrow">مِعيار يكبر بكم</span><h2>إضافة جامعة أو كلية جديدة</h2><p>جامعتك أو كليتك غير موجودة؟ أرسل لنا طلب إضافتها إلى مِعيار.</p></div><a class="primary email-request" href="mailto:info@miyar.website?subject=${encodeURIComponent('طلب إضافة جامعة أو كلية إلى معيار')}"><span>راسلنا عبر البريد</span><bdi>info@miyar.website</bdi>${ic("arrow")}</a></section>`;
}
function topDoctorsSection() {
  return `<section class="doctors-section top-doctors"><div class="section-heading"><div><span class="eyebrow">بناءً على تقييمات الطلاب المنشورة</span><h2 id="home-doctors-title">${query ? "نتائج البحث" : "أعلى الدكاترة تقييمًا"} <span class="small-star">✦</span></h2><p>${query ? "اكتشف الدكتور أو المادة التي تبحث عنها." : "الأعلى في متوسط التقييم، وعند التعادل نقدّم الأكثر تقييمات."}</p></div><div class="section-tools"><button class="text-button" data-page="ratings">عرض جميع التقييمات ${ic("arrow")}</button><div class="carousel-controls"><button class="carousel-control previous" id="doctors-previous" aria-label="الدكاترة السابقون" aria-controls="doctor-grid">${ic("arrow")}</button><button class="carousel-control" id="doctors-next" aria-label="الدكاترة التاليون" aria-controls="doctor-grid">${ic("arrow")}</button></div></div></div><div class="doctor-carousel" id="doctor-grid" role="region" aria-label="بطاقات الدكاترة" tabindex="0">${cards()}</div></section>`;
}
function syncHomeSearch() {
  if (page !== "home") return;
  const section = document.querySelector(".top-doctors");
  const search = document.querySelector(".search-block");
  const slot = document.querySelector("#home-doctors-slot");
  if (!section || !search || !slot) return;
  const searching = Boolean(query.trim());
  if (searching) search.after(section);
  else slot.append(section);
  section.classList.toggle("search-results", searching);
  section.querySelector("h2").textContent = searching ? "نتائج البحث" : "أعلى الدكاترة تقييمًا ✦";
  section.querySelector(".eyebrow").textContent = searching ? "الدكاترة والمواد المطابقة لبحثك" : "بناءً على تقييمات الطلاب المنشورة";
  section.querySelector(".section-heading p").textContent = searching ? "اختر الدكتور لاستعراض تقييماته أو إضافة تجربتك." : "الأعلى في متوسط التقييم، وعند التعادل نقدّم الأكثر تقييمات.";
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
  const next = document.querySelector("#doctors-next"), previous = document.querySelector("#doctors-previous");
  if (next) next.onclick = () => move(-1);
  if (previous) previous.onclick = () => move(1);
  track.addEventListener("scroll", updateCarouselControls, { passive: true });
  requestAnimationFrame(updateCarouselControls);
}
function cards() {
  let filtered = doctors.filter((d) =>
    (page === "home" || page === "saved" || !(collegeSelected || page === "ratings") ||
      (d.college || "كلية الهندسة") === activeCollege) &&
    (page === "home" || page === "saved" || activeMajor === "الكل" || d.major === activeMajor) &&
    (!(savedOnly || page === "saved") || saved.includes(d.id)) &&
    (!query || [d.name, ...d.subjects].some((s) => s.includes(query)))
  );
  if (page === "home" && !query) {
    filtered = filtered.filter((doctor) => doctor.count > 0)
      .sort((a, b) => b.score - a.score || b.count - a.count || a.id - b.id)
      .slice(0, 10);
  }
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
      }</span></div><button class="compare-toggle" data-compare="${d.id}" aria-pressed="${compareIds.includes(d.id)}">${ic("users")} ${compareIds.includes(d.id) ? "مضاف للمقارنة" : "قارن الدكتور"}</button><button class="card-detail" data-doctor="${d.id}">استعرض التقييمات ${
        ic("arrow")
      }</button></article>`
    ).join("")
    : `<div class="empty">${page === 'saved' ? 'لم تحفظ أي دكتور بعد. اضغط علامة الحفظ على بطاقة الدكتور ليظهر هنا.' : selectedUniversity() && !colleges.length ? 'لم تُضف كليات جامعتك بعد. يمكنك إرسال طلب الإضافة عبر البريد أو تغيير الجامعة من الإعدادات.' : page === 'home' && !query ? 'ستظهر هنا أعلى تقييمات الدكاترة بعد نشر أول تقييمات الطلاب.' : 'لم نجد نتائج مطابقة. جرّب اسمًا آخر أو أضف الدكتور من نموذج التقييم.'}</div>`;
}
function ratings() {
  return `${connectionBanner()}<div class="directory-actions"><button class="secondary" data-request-doctor>${ic("plus")} طلب إضافة دكتور بدون تقييم</button><button class="secondary" id="my-requests-page">${ic("bell")} متابعة طلباتي</button><button class="secondary" id="my-reviews-page">${ic("star")} تقييماتي وطلبات التعديل</button></div>${listSection()}`;
}
function savedPage() {
  return `${connectionBanner()}<div class="page-title"><div class="eyebrow">اختياراتك في مكان واحد</div><h1>المحفوظات</h1><p>الدكاترة الذين حفظتهم للرجوع إليهم لاحقًا.</p></div><section class="doctors-section"><div class="doctor-carousel" id="doctor-grid" role="region" aria-label="الدكاترة المحفوظون" tabindex="0">${cards()}</div></section>`;
}
function developer() {
  return `<div class="page-title"><div class="eyebrow">خلف كل تجربة، فكرة</div><h1>مِعيار لاختيارك القادم</h1><p>منصة سعودية تجعل تجارب الطلاب دليلًا لاختيارات أفضل.</p></div><section class="developer-card"><div class="brand">${logo}</div><h2>من الطلاب، من أجل الطلاب.</h2><p>مِعيار مساحة لتبادل التجارب الجامعية باحترام وشفافية. نبدأ بكلية الهندسة، ونتطلع لأن نرافق كل طالب في رحلته.</p><div class="dev-badges"><span>${
    ic("shield")
  } خصوصيتك أولًا</span><span>${ic("heart")} تجربة عربية</span></div><p class="muted">نؤمن أن التجربة تستحق أن تُشارك. يساعدك مِعيار على مقارنة تجارب زملائك في الشرح والتعامل والمساعدة بالدرجات، لتختار ما يناسبك. شارك رأيك بموضوعية واحترام؛ فقد تكون تجربتك سببًا في اختيار أفضل لطالب آخر.</p><button class="primary" id="share-platform">${
    ic("share")
  } شارك مِعيار</button><button class="university-request-button secondary" data-university-request>${ic("cap")} أضف جامعتك أو كليتك لمِعيار ${ic("arrow")}</button></section>`;
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
    ? (cloudCatalogue?.majors || []).map((m) => `<option value="${m.id}">${escapeHtml(m.name)} · ${escapeHtml(cloudCatalogue.colleges.find((c) => c.id === m.college_id)?.name || "")} · ${escapeHtml(cloudCatalogue.universities?.find((u) => u.id === cloudCatalogue.colleges.find((c) => c.id === m.college_id)?.university_id)?.name || "")}</option>`).join("")
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
    const existing = new Set((configured ? cloudCatalogue.doctors.filter((d) => d.major_id === Number(major)) : doctors.filter((d) => d.major === majorName && d.college === majorCollege)).map((d) => d.name.trim().replace(/\s+/g, " ")));
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
  if (document.querySelector(".mandatory-university")) return;
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
async function reviewForm(id, pledged = false) {
  setPage("review");
  render();
  if(configured){
    if(googleSession){if(!requireCloudAccount(()=>reviewForm(id)))return;}
    else {
      try{if(!pledged || !guestProfile) guestProfile=await ensureGuestSession();scopeCatalogue();}
      catch(error){modal("تعذّر بدء التقييم",`<p role="alert">${escapeHtml(error.message)}</p><button class="primary" id="retry-guest-review">إعادة المحاولة</button>`);document.querySelector('#retry-guest-review').onclick=()=>reviewForm(id);return;}
      if(!guestProfile.university_id){openUniversityChoice(true,()=>reviewForm(id));return;}
      if(guestProfile.status!=='active'){toast('جلسة الزائر مقيّدة عن إضافة التقييمات.');return;}
    }
  }
  if(!pledged){reviewPledge(()=>reviewForm(id,true));return;}
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
    }</div>${ratingTagPicker()}<label>تعليقك عن الدكتور (اختياري)<textarea name="comment" rows="3" maxlength="600" placeholder="كيف كانت تجربتك؟ شارك رأيك بموضوعية واحترام…"></textarea></label><small class="muted">نرحّب بالنقد البنّاء. تُرفض العبارات المسيئة، ولا تُنشر معلومات شخصية.</small><div class="form-error" role="alert"></div><button class="primary submit-review">${
      ic("plus")
    } إرسال التقييم</button><p class="local-note">${
      configured
        ? (googleSession ? "يُرسل تقييمك للمراجعة قبل النشر. خمسة تقييمات يوميًا كحد أقصى، وتقييم واحد لكل دكتور ومادة." : "يمكنك التقييم كزائر دون Google. يرتبط التقييم بجلسة هذا المتصفح ويُرسل للمراجعة قبل النشر. خمسة تقييمات يوميًا كحد أقصى.")
        : "نسخة تجريبية: يُحفظ تقييمك على هذا الجهاز فقط. الدكتور الجديد يُرسل للمراجعة المحلية."
    }</p></form>`,
  );
  bindRatingTags(document.querySelector("#review-form"));
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
      tags: chosenRatingTags(e.target),
      pledged: true,
    };
    if (configured) {
      const button = e.target.querySelector(".submit-review");
      button.disabled = true;
      try {
        await api(googleSession ? "submit" : "guest.submit", { ...data, grade: Number(f.get("grade")) });
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
  const adding = !saved.includes(id);
  const times = bookmarkTimes();
  if (adding) times[id] = new Date().toISOString();
  else delete times[id];
  storage.setItem(bookmarkKey(), JSON.stringify(times));
  saved = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
  persist();
  refreshSavedUpdates();
  document.querySelectorAll(`[data-save="${id}"]`).forEach((b) =>
    b.classList.toggle("is-saved", saved.includes(id))
  );
  if (page === "saved") {
    document.querySelector("#doctor-grid").innerHTML = cards();
    bindCards();
    bindCarousel();
  }
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
    query = e.target.value.trim();
    const clear = document.querySelector("#clear-search");
    if (clear) clear.hidden = !e.target.value;
    syncHomeSearch();
    document.querySelector("#doctor-grid").innerHTML = cards();
    bindCards();
    bindCarousel();
  });
  document.querySelector("#clear-search")?.addEventListener("click", () => {
    const input = document.querySelector("#search");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus({ preventScroll: true });
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
  document.querySelector("#notice").onclick = openNotifications;
  document.querySelector("#share-platform")?.addEventListener(
    "click",
    () => share("مِعيار — تجارب حقيقية، لاختيارات أفضل"),
  );
  document.querySelectorAll("[data-university-request]").forEach((button) => {
    button.onclick = () => modal("أضف جامعتك أو كليتك لمِعيار", `<div class="university-request-message"><p>أرسل طلب إضافة جامعتك أو كليتك عبر الإيميل:</p><a class="primary email-request" href="mailto:info@miyar.website?subject=${encodeURIComponent('طلب إضافة جامعة أو كلية إلى معيار')}"><bdi>info@miyar.website</bdi>${ic("arrow")}</a><p class="muted">اذكر اسم الجامعة والكلية والتخصصات التي ترغب بإضافتها.</p></div>`);
  });
  document.querySelectorAll("[data-request-doctor]").forEach((button) => button.onclick = requestDoctorForm);
  document.querySelector("#my-requests-page")?.addEventListener("click", openRequests);
  bindAmbassadorPage();
  document.querySelector("#requests-refresh")?.addEventListener("click", loadMyRequests);
  document.querySelector("#requests-login")?.addEventListener("click", openGoogleMessage);
  document.querySelector("#my-reviews-page")?.addEventListener("click", () => myReviews());
  syncHomeSearch();
  bindAdmin();
  bindBulkDoctors();
}
function bindCards() {
  document.querySelectorAll("[data-compare]").forEach((button) => button.onclick = () => {
    const id = Number(button.dataset.compare);
    if (compareIds.includes(id)) compareIds = compareIds.filter((value) => value !== id);
    else if (compareIds.length < 3) compareIds.push(id);
    else return toast("يمكنك مقارنة ثلاثة دكاترة كحد أقصى.");
    document.querySelectorAll("[data-compare]").forEach((item) => {
      const selected = compareIds.includes(Number(item.dataset.compare));
      item.setAttribute("aria-pressed", String(selected));
      item.innerHTML = ic("users") + (selected ? " مضاف للمقارنة" : " قارن الدكتور");
    });
    updateComparison();
  });
  updateComparison();
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
    `<form id="settings-form"><button type="button" class="secondary my-reviews-settings" id="my-reviews-settings">${ic("star")} تقييماتي وطلبات التعديل</button><button type="button" class="secondary my-reviews-settings" id="my-requests-settings">${ic("bell")} متابعة طلباتي وقرارات الإدارة</button><button type="button" class="secondary my-reviews-settings" id="install-app">${ic("plus")} تثبيت مِعيار على الجهاز</button>${configured && (cloudMe || guestProfile) && cloudCatalogue?.universities?.length ? `<section class="university-settings"><h3>جامعتك</h3><p>${escapeHtml(selectedUniversity()?.name || "لم تحدد جامعتك")}</p><button type="button" class="secondary" id="change-university">${ic("cap")} تغيير الجامعة</button></section>` : ""}<div class="settings-intro"><span class="settings-avatar">${
      ic("users")
    }</span><div><h3>مساحتك، على طريقتك</h3><p>خصّص بياناتك وتجربة القراءة بما يناسبك.</p></div></div><label>اسم الطالب<input name="name" required maxlength="60" autocomplete="name" placeholder="كيف تحب أن نناديك؟" value="${
      escapeHtml(profile.name)
    }"></label><div class="form-grid"><label>التخصص<select name="major" ${!configured || studentMajors().length ? "required" : ""}>${
      configured
        ? (studentMajors().length ? studentMajors().map((m) =>
          `<option value="${m.id}" ${
            cloudMe?.major_id === m.id ? "selected" : ""
          }>${escapeHtml(m.name)} · ${
            escapeHtml(
              cloudCatalogue.colleges.find((c) => c.id === m.college_id)
                ?.name || "",
            )
          }</option>`
        ).join("") : '<option value="">لم تُضف تخصصات لهذه الجامعة بعد</option>')
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
    }</select></label></div>${appearanceSettings()}<section class="font-settings"><div><h3>حجم الخط</h3><p>اختر الحجم الأريح لك. يُحفظ اختيارك تلقائيًا.</p></div><div class="font-stepper"><button type="button" id="font-smaller" aria-label="تصغير الخط">−</button><output id="font-size-value" aria-live="polite">${
      Math.round(fontScale * 100).toLocaleString("ar")
    }٪</output><button type="button" id="font-larger" aria-label="تكبير الخط">+</button></div><div class="font-preview">مِعيار… لاختيارٍ أوضح وتجربةٍ أفضل.</div><button type="button" id="font-reset" class="text-button">استعادة الحجم الافتراضي</button></section><div class="form-error" role="alert"></div>${
      configured
        ? `<p class="cloud-identity">${
          cloudMe
            ? "معرّف حسابك: " + cloudMe.id
            : "تسجيل الدخول اختياري لحفظ ملفك ومتابعة طلباتك."
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
  document.querySelector("#my-requests-settings")?.addEventListener("click", openRequests);
  document.querySelector("#install-app")?.addEventListener("click", () => installPlatform(modal,toast));
  document.querySelector("#my-reviews-settings")?.addEventListener("click", () => myReviews());
  document.querySelector("#change-university")?.addEventListener("click", () => openUniversityChoice(false));
  document.querySelectorAll("[data-color-option]").forEach((button) => {
    button.onclick = () => {
      applyPlatformColor(button.dataset.colorOption);
      document.querySelectorAll("[data-color-option]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    };
  });
  document.querySelectorAll("[data-appearance]").forEach((button) => {
    button.onclick = () => {
      document.documentElement.dataset.theme = button.dataset.appearance;
      storage.setItem("athar-theme", button.dataset.appearance);
      document.querySelectorAll("[data-appearance]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    };
  });
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
        const majorId = f.get("major") ? Number(f.get("major")) : null;
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
      studentMajors().some((m) =>
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
    `<div class="connection-banner live"><span></span>${escapeHtml(selectedUniversity()?.name || "مِعيار")} · <span data-online-count title="جلسات المنصة النشطة في جميع الجامعات خلال آخر ٩٠ ثانية">${onlineCountText()}</span></div>`;
}
async function refreshCloudCatalogue() {
  const data = await api("catalogue");
  if (
    !Array.isArray(data.colleges) || !Array.isArray(data.majors) ||
    !Array.isArray(data.doctors)
  ) throw new Error("تعذّر قراءة دليل المنصة.");
  cloudCatalogue = data;
  scopeCatalogue();
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
    try{guestProfile=await ensureGuestSession();if(!googleSession)scopeCatalogue();}catch{presenceCount=null;}
    refreshPresence();
  } catch (error) {
    cloudStatus = "error";
    cloudError = error.message;
  }
  if (!document.querySelector(".modal-backdrop")) render();
  const id = Number(new URLSearchParams(location.search).get("doctor"));
  if (!needsUniversity() && doctors.some((d) => d.id === id)) detail(id);
  refreshSavedUpdates();
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
      scopeCatalogue();
      queueMicrotask(refreshSavedUpdates);
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
    }</span><h3>تجربتك تبدأ بخطوة بسيطة</h3><p>يمكنك التقييم كزائر. سجّل الدخول بحساب Google لحفظ ملفك ومتابعة طلباتك. لا يظهر اسمك أو بريدك مع التقييمات.</p><button class="google-signin-button" id="google-signin"><span class="google-g" aria-hidden="true">G</span>الدخول باستخدام Google</button><p class="google-login-error form-error" role="alert"></p><small class="muted">يمكنك تصفّح الدكاترة دون تسجيل الدخول.</small></div>`,
  );
  document.querySelector("#google-signin").onclick = startGoogleLogin;
}
function requireCloudAccount(next) {
  if (needsUniversity()) { openUniversityChoice(true); return false; }
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
async function cloudDoctorDetail(id, subject = "") {
  const doctor = doctors.find((item) => item.id === id);
  if (!doctor) return;
  modal("تقييمات الدكتور", '<p class="muted" data-detail-loading>جارٍ تحميل التجارب…</p>');
  const loading = document.querySelector("[data-detail-loading]");
  try {
    const [rows, summary] = await Promise.all([api("reviews", {doctor:id, ...(subject ? {subject} : {})}), api("doctor.summary", {doctor:id, ...(subject ? {subject} : {})}).catch(() => null)]);
    if (!loading.isConnected) return;
    modal("تقييمات الدكتور", `<div class="detail-person"><span class="avatar ${doctor.color}">${escapeHtml(doctor.initials)}</span><div><h2>د. ${escapeHtml(doctor.name)} ${doctor.verified?'<span class="verified" title="موثق من الإدارة">✓</span>':""}</h2><p>${escapeHtml(doctor.major)}</p></div><strong>${doctor.count ? doctor.score : "—"}<small>/100</small></strong></div><p class="muted">المتوسط العام لجميع المواد · ${doctor.count} تقييمًا</p><div class="detail-scores">${["الشرح","التعامل","المساعدة بالدرجات"].map((label,index) => `<div><span>${label}</span><div><i style="width:${Number(doctor.scores?.[index] || 0)}%"></i></div><b>${doctor.count ? Number(doctor.scores?.[index] || 0) : "—"}</b></div>`).join("")}</div>${summaryPanel(summary)}<label class="subject-filter">فلترة التقييمات حسب المادة<select id="review-subject-filter"><option value="">جميع المواد</option>${[...new Set([...(doctor.subjects||[]), ...rows.map((row) => row.subject)])].map((name) => `<option value="${escapeHtml(name)}" ${subject===name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label><div id="published-reviews">${rows.length ? rows.map((row) => `<article class="review-comment"><b>${escapeHtml(row.subject)}</b><p>${escapeHtml(row.comment)}</p>${reviewTagLabels(row.tags)}<small>طالب مجهول · ${new Date(row.date).toLocaleDateString("ar")}</small><div class="review-tools"><button class="text-button" data-report-review="${row.id}">الإبلاغ عن التقييم</button></div></article>`).join("") : '<p class="empty">لا توجد تقييمات منشورة لهذه المادة بعد.</p>'}</div><div class="detail-actions"><button class="primary" id="detail-rate">${ic("plus")} أضف تجربتك</button><button class="secondary" id="share-doctor">${ic("share")} مشاركة الرابط</button><button class="secondary" id="share-doctor-card">${ic("share")} مشاركة بطاقة الدكتور</button><button class="secondary" id="save-detail">${ic("bookmark")} ${saved.includes(id) ? "محفوظ" : "حفظ"}</button><button class="secondary" id="detail-mine">تعديل تقييمي</button></div>`);
    document.querySelector("#review-subject-filter").onchange = (event) => cloudDoctorDetail(id,event.target.value);
    document.querySelectorAll("[data-report-review]").forEach((button) => button.onclick = () => reportReview(Number(button.dataset.reportReview)));
    document.querySelector("#detail-rate").onclick = () => reviewForm(id);
    document.querySelector("#detail-mine").onclick = () => myReviews(id);
    const correction = document.createElement('button');
    correction.type = 'button'; correction.className = 'secondary';
    correction.id = 'suggest-doctor-correction'; correction.textContent = 'اقتراح تصحيح بيانات الدكتور';
    correction.onclick = () => doctorCorrectionForm(id);
    document.querySelector('.detail-actions').append(correction);
    document.querySelector("#share-doctor-card").onclick = () => shareDoctorCard(doctor);
    document.querySelector("#share-doctor").onclick = () => share(`تعرّف على تقييمات د. ${doctor.name} في مِعيار`,id);
    document.querySelector("#save-detail").onclick = (event) => { toggleSave(id); event.currentTarget.innerHTML=ic("bookmark")+(saved.includes(id)?" محفوظ":" حفظ"); };
  } catch(error) { if (loading.isConnected) modal("تعذّر تحميل التقييمات",`<p role="alert">${escapeHtml(error.message)}</p>`); }
}
async function loadCloudQueue(update = true) {
  if (!cloudMe?.isAdmin || cloudQueueLoading) return;
  const owner = cloudMe.id;
  cloudQueueLoading = true;
  try {
    const queue = await api("admin", { operation: "queue" });
    if (cloudMe?.id === owner && cloudMe.isAdmin) cloudQueue = queue;
  } catch (error) {
    if (cloudMe?.id === owner && cloudMe.isAdmin) cloudQueue = { error: error.message, doctors: [], reviews: [] };
  } finally {
    cloudQueueLoading = false;
  }
  if (update && page === "admin" && cloudMe?.id === owner) render();
}
function cloudAdmin() {
  if (!cloudMe?.isAdmin) {
    return '<div class="empty">هذه الصفحة متاحة للأدمن بعد التحقق من حسابه.</div>';
  }
  const records = cloudCatalogue || { colleges: [], majors: [] };
  const majorOptions = records.majors.map((m) =>
    `<option value="${m.id}">${escapeHtml(m.name)} · ${
      escapeHtml(
        (records.colleges.find((c) => c.id === m.college_id)?.name || "") + " · " + (records.universities?.find((u) => u.id === records.colleges.find((c) => c.id === m.college_id)?.university_id)?.name || ""),
      )
    }</option>`
  ).join("");
  const queue = cloudQueue;
  const allDoctors = records.doctors || [];
  initAdminFilters();
  return `<div class="page-title"><div class="eyebrow">إدارة مِعيار</div><h1>لوحة التحكم</h1><p>المشاركات لا تُنشر تلقائيًا. راجع التعليقات وطلبات الدكاترة من هنا.</p><button class="secondary" id="refresh-cloud-admin">تحديث الطلبات</button></div><div class="admin-grid"><section class="panel academic-management"><h2>الجامعات والكليات والتخصصات</h2><p class="admin-context-hint">نحتفظ بآخر جامعة وكلية اخترتها لتكمل الإضافة دون إعادة الاختيار.</p><h3 class="admin-step-title"><span>١</span> الجامعات</h3><form id="cloud-add-university"><label>إضافة جامعة<input name="name" required minlength="2" maxlength="100" placeholder="اسم الجامعة"></label><button class="primary">إضافة جامعة</button></form><h3 class="admin-step-title"><span>٢</span> الكليات</h3><form id="cloud-add-college"><label>إضافة كلية<select name="universityId" required><option value="">اختر الجامعة</option>${(records.universities || []).map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("")}</select><input name="name" required minlength="2" maxlength="100" placeholder="اسم الكلية"></label><button class="primary">إضافة الكلية</button></form><div class="admin-record-list" aria-label="الكليات المضافة">${
    records.colleges.map((c) =>
      `<div class="admin-row"><span>${
        escapeHtml(c.name)
      }<small>${escapeHtml(records.universities?.find((u) => u.id === c.university_id)?.name || "")}</small></span><button class="danger" data-cloud-operation="college.delete" data-id="${c.id}">حذف</button></div>`
    ).join("")
  }</div><h3 class="admin-step-title"><span>٣</span> التخصصات</h3><form id="cloud-add-major"><label>إضافة تخصص<select name="collegeId" required>${
    records.colleges.map((c) =>
      `<option value="${c.id}">${escapeHtml(c.name)} · ${escapeHtml(records.universities?.find((u) => u.id === c.university_id)?.name || "")}</option>`
    ).join("")
  }</select><input name="name" required minlength="2" maxlength="100" placeholder="اسم التخصص"></label><button class="primary">إضافة التخصص</button></form><div class="admin-record-list" aria-label="التخصصات المضافة">${
    records.majors.map((m) =>
      `<div class="admin-row"><span>${escapeHtml(m.name)}<small>${
        escapeHtml(
          (records.colleges.find((c) => c.id === m.college_id)?.name || "") + " · " + (records.universities?.find((u) => u.id === records.colleges.find((c) => c.id === m.college_id)?.university_id)?.name || ""),
        )
      }</small></span><button class="danger" data-cloud-operation="major.delete" data-id="${m.id}">حذف</button></div>`
    ).join("")
  }</div></section><section class="panel"><h2>إدارة الدكاترة</h2>${bulkDoctorForm()}<form id="cloud-add-doctor"><label>اسم الدكتور الثلاثي<input name="name" required minlength="8" maxlength="100"><select name="majorId" required>${majorOptions}</select></label><button class="primary">إضافة</button></form>${adminDirectoryControls()}<div class="admin-record-list admin-doctor-list" role="region" aria-label="قائمة الدكاترة" tabindex="0">${adminDoctorRows()}</div><h2>إدارة المستخدمين</h2><form id="cloud-user-status"><label>معرّف حساب الطالب<input name="userId" required placeholder="UUID الظاهر مع الطلب"><select name="identityType" aria-label="نوع الحساب"><option value="google">حساب Google</option><option value="guest">جلسة زائر</option></select><select name="status"><option value="banned">حظر</option><option value="restricted">تقييد الإرسال</option><option value="active">فك الحظر أو التقييد</option></select></label><button class="primary">تطبيق</button></form></section><section class="panel moderation-panel"><h2>طلبات إضافة دكتور</h2>${
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
        } · ${d.identity_type === "guest" ? "زائر" : "الطالب"} ${
          escapeHtml(d.submitted_by || "حساب سابق")
        }</small></span><div><button data-cloud-operation="doctor.approve" data-id="${d.id}">قبول</button><button class="danger" data-cloud-operation="doctor.reject" data-id="${d.id}">رفض</button></div></div>`
      ).join("")
      : '<p class="muted">لا توجد طلبات معلّقة.</p>'
  }<h2>مراجعة التقييمات</h2>${
    queue?.reviews?.length
      ? queue.reviews.map((r) =>
        `<div class="moderation-review"><b>د. ${
          escapeHtml(
            allDoctors.find((d) => d.id === r.doctor_id)?.name ||
              queue.doctors.find((d) =>
                d.id === r.doctor_id
              )?.name ||
              "دكتور غير متاح",
          )
        }</b><small>المادة: ${escapeHtml(r.subject)} · ${r.identity_type === "guest" ? "زائر" : "الطالب"} ${
          escapeHtml(r.user_id || "حساب سابق")
        }</small><p>${
          escapeHtml(r.comment)
        }</p>${reviewTagLabels(r.tags)}<span>الشرح ${r.explanation} · التعامل ${r.treatment} · المساعدة ${r.grading}</span><div><button class="secondary" data-cloud-operation="review.approve" data-id="${r.id}">نشر التقييم</button><button class="secondary danger" data-cloud-operation="review.reject" data-id="${r.id}">رفض</button></div></div>`
      ).join("")
      : '<p class="muted">لا توجد تقييمات بانتظار المراجعة.</p>'
  }</section>${communityAdminPanel(queue)}${ambassadorAdminPanel(queue)}</div>`;
}
async function cloudAdminAction(operation, data) {
  const scrollTop = window.scrollY;
  try {
    await api("admin", { operation, ...data });
    await Promise.all([refreshCloudCatalogue(), loadCloudQueue(false)]);
    requestsOwner="";
    document.body.classList.remove("modal-open");
    render();
    window.scrollTo({ top: scrollTop, behavior: "instant" });
    refreshSavedUpdates();
    toast("تم حفظ التغيير في المنصة.");
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}
function bindCloudAdmin() {
  if (!cloudMe?.isAdmin) return;
  const key = `miyar-admin-selections-${cloudMe.id}`;
  const stored = readJSON(key, {});
  const selections = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  for (const selector of ["#cloud-add-college [name=universityId]", "#cloud-add-major [name=collegeId]", "#cloud-add-doctor [name=majorId]", "#bulk-doctors [name=major]"]) {
    const select = document.querySelector(selector);
    if (!select) continue;
    const value = selections[selector];
    if ([...select.options].some((option) => option.value === String(value))) select.value = String(value);
    else delete selections[selector];
    select.addEventListener("change", () => {
      selections[selector] = select.value;
      storage.setItem(key, JSON.stringify(selections));
    });
  }
  storage.setItem(key, JSON.stringify(selections));
  document.querySelector("#refresh-cloud-admin")?.addEventListener(
    "click",
    () => loadCloudQueue(),
  );
  for (
    const [selector, operation] of [
      ["#cloud-add-university", "university.add"],
      ["#cloud-add-college", "college.add"],
      ["#cloud-add-major", "major.add"],
      ["#cloud-add-doctor", "doctor.add"],
      ["#cloud-user-status", "user.status"],
    ]
  ) {
    document.querySelector(selector)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.target));
      for (const field of ["collegeId", "majorId", "universityId"]) {
        if (field in values) values[field] = Number(values[field]);
      }
      const button = e.target.querySelector("button");
      button.disabled = true;
      const saved = await cloudAdminAction(operation, values);
      button.disabled = false;
      if (saved && ["university.add", "college.add", "major.add", "doctor.add"].includes(operation)) {
        document.querySelector(`${selector} [name=name]`)?.focus({ preventScroll: true });
      }
    });
  }
  bindAdminDirectory();
  bindAmbassadorAdmin();
  bindCloudOperations();
}
function bindCloudOperations(root = document) {
  root.querySelectorAll("[data-cloud-operation]").forEach((b) =>
    b.onclick = () => {
      const operation = b.dataset.cloudOperation;
      const data = { id: Number(b.dataset.id) };
      if (operation === "doctor.verify") {
        data.verified = b.dataset.verified === "true";
      }
      if (["doctor.reject", "edit.reject", "catalogue.reject"].includes(operation)) {
        rejectionForm(operation, data.id);
      } else if (operation.endsWith(".delete")) {
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

function updateComparison() {
  const root = document.querySelector('#comparison-root');
  if (!root) return;
  compareIds = compareIds.filter((id) => doctors.some((doctor) => doctor.id===id));
  root.innerHTML = compareIds.length ? `<section class="comparison-bar" aria-label="مقارنة الدكاترة"><span aria-live="polite">${compareIds.length} / ٣ دكاترة للمقارنة</span><button class="primary" id="compare-now" ${compareIds.length<2?'disabled':''}>عرض المقارنة</button><button class="icon-btn" id="compare-clear" aria-label="مسح المقارنة">${ic('close')}</button></section>` : '';
  root.querySelector('#compare-now')?.addEventListener('click',showComparison);
  root.querySelector('#compare-clear')?.addEventListener('click',()=>{
    compareIds=[];
    document.querySelectorAll('[data-compare]').forEach((button)=>{button.setAttribute('aria-pressed','false');button.innerHTML=ic('users')+' قارن الدكتور';});
    updateComparison();
  });
}
function showComparison() {
  const selected=compareIds.map((id)=>doctors.find((doctor)=>doctor.id===id)).filter(Boolean);
  if(selected.length<2)return;
  const labels=['الشرح','التعامل','المساعدة بالدرجات','عدد التقييمات'];
  modal('مقارنة الدكاترة',`<p class="muted">المؤشرات من تقييمات الطلاب المنشورة، وليست ضمانًا لتجربتك الشخصية.</p><div class="comparison-table-wrap"><table class="comparison-table"><caption>مقارنة مؤشرات الدكاترة</caption><thead><tr><th scope="col">المؤشر</th>${selected.map((doctor)=>`<th scope="col">د. ${escapeHtml(doctor.name)}<small>${escapeHtml(doctor.major)}</small></th>`).join('')}</tr></thead><tbody>${labels.map((label,index)=>`<tr><th scope="row">${label}</th>${selected.map((doctor)=>`<td>${index===3?doctor.count:doctor.count?`${Number(doctor.scores?.[index]||0)} / ١٠٠`:'بدون تقييم'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
}
async function submitCommunityForm(form,action,payload,message) {
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try {
    const result=await api(action,payload);
    requestsOwner="";
    if(form.isConnected) modal('تم استلام طلبك',`<div class="community-success">${ic('check')}<p>${escapeHtml(action==='doctor.request'&&result.existing?(result.status==='approved'?'الدكتور موجود بالفعل. يمكنك البحث عنه في التقييمات.':result.status==='pending'?'يوجد طلب سابق لإضافة هذا الدكتور قيد المراجعة.':'للدكتور سجل سابق غير متاح حاليًا. تواصل مع الإدارة لمراجعته.'):message)}</p></div>`);
  } catch(error) { if(form.isConnected) form.querySelector('.form-error').textContent=error.message; }
  finally {button.disabled=false;}
}
function requestDoctorForm() {
  if(!configured || !requireCloudAccount(requestDoctorForm))return;
  const options=studentMajors();
  modal('طلب إضافة دكتور',`<p>طلب مستقل دون كتابة تقييم. سيُضاف الدكتور إلى القائمة بعد موافقة الإدارة.</p>${options.length?`<form id="doctor-request-form"><label>اسم الدكتور الثلاثي<input name="name" minlength="8" maxlength="100" required></label><label>الكلية والتخصص<select name="majorId" required>${options.map((major)=>`<option value="${major.id}">${escapeHtml(major.name)} · ${escapeHtml(cloudCatalogue.colleges.find((college)=>college.id===major.college_id)?.name||'')}</option>`).join('')}</select></label><p class="form-error" role="alert"></p><button type="submit" class="primary">إرسال طلب إضافة الدكتور</button></form>`:'<p class="empty">لم تُضف تخصصات جامعتك بعد. راسلنا لطلب إضافتها.</p>'}`);
  document.querySelector('#doctor-request-form')?.addEventListener('submit',(event)=>{
    event.preventDefault();const form=event.target;const data=new FormData(form);
    submitCommunityForm(form,'doctor.request',{name:data.get('name').trim(),majorId:Number(data.get('majorId'))},'وصل طلب إضافة الدكتور إلى الإدارة دون إنشاء أي تقييم.');
  });
}
const reviewStatus={published:'منشور',pending:'قيد المراجعة',rejected:'لم يُنشر'};
async function myReviews(doctorId) {
  if(!configured || !requireCloudAccount(()=>myReviews(doctorId)))return;
  modal('تقييماتي وطلبات التعديل','<p data-mine-loading>جارٍ تحميل تقييماتك…</p>');
  const loading=document.querySelector('[data-mine-loading]');
  try {
    const rows=await api('mine');if(!loading.isConnected)return;
    const list=doctorId?rows.filter((row)=>row.doctor_id===doctorId):rows;
    modal('تقييماتي وطلبات التعديل',`<p class="muted">التعديل يُرسل للإدارة، ويظل تقييمك المنشور كما هو حتى الموافقة.</p>${list.length?list.map((row)=>`<article class="my-review"><h3>د. ${escapeHtml(row.doctor_name)}</h3><b>${escapeHtml(row.subject)}</b><p>${escapeHtml(row.comment)}</p>${reviewTagLabels(row.tags)}<small>${reviewStatus[row.status]||''}${row.edit_status==='pending'?' · طلب تعديل قيد المراجعة':row.edit_status==='rejected'?' · رُفض طلب التعديل السابق':row.edit_status==='approved'?' · تمت الموافقة على التعديل':''}</small>${row.status==='published'?`<button class="secondary" data-edit-review="${row.id}" ${row.edit_status==='pending'?'disabled':''}>${row.edit_status==='pending'?'التعديل بانتظار الإدارة':'طلب تعديل التقييم'}</button>`:''}</article>`).join(''):'<p class="empty">لا توجد تقييمات لك في جامعتك الحالية.</p>'}`);
    document.querySelectorAll('[data-edit-review]').forEach((button)=>button.onclick=()=>editReview(list.find((row)=>row.id===Number(button.dataset.editReview))));
  } catch(error) {if(loading.isConnected)modal('تعذّر تحميل تقييماتك',`<p role="alert">${escapeHtml(error.message)}</p>`);}
}
function editReview(row, pledged = false) {
  if(!row)return;
  if(!pledged){reviewPledge(()=>editReview(row,true));return;}
  modal('طلب تعديل التقييم',`<p>سيبقى التقييم القديم ظاهرًا حتى توافق الإدارة على التعديل الجديد.</p><form id="edit-review-form"><label>المادة<input name="subject" required minlength="2" maxlength="120" value="${escapeHtml(row.subject)}"></label>${['الشرح','التعامل','المساعدة بالدرجات'].map((label,index)=>`<label class="slider-label"><span>${label}<output>${row[['explanation','treatment','grading'][index]]}</output></span><input aria-label="${label}" name="score${index}" type="range" min="0" max="100" value="${row[['explanation','treatment','grading'][index]]}" style="--range-color:${scoreColor(Number(row[['explanation','treatment','grading'][index]]))}"></label>`).join('')}${ratingTagPicker(row.tags)}<label>التعليق الجديد (اختياري)<textarea name="comment" maxlength="600" rows="4">${escapeHtml(row.comment)}</textarea></label><p class="form-error" role="alert"></p><button class="primary" type="submit">إرسال التعديل للمراجعة</button></form>`);
  bindRatingTags(document.querySelector("#edit-review-form"));
  document.querySelectorAll('#edit-review-form input[type=range]').forEach((input)=>input.oninput=()=>{input.closest('label').querySelector('output').textContent=input.value;input.style.setProperty('--range-color',scoreColor(Number(input.value)));});
  document.querySelector('#edit-review-form').onsubmit=(event)=>{
    event.preventDefault();const form=event.target;const data=new FormData(form);
    submitCommunityForm(form,'edit',{review:row.id,subject:data.get('subject'),comment:data.get('comment'),tags:chosenRatingTags(form),pledged:true,scores:[0,1,2].map((index)=>Number(data.get('score'+index)))},'وصل طلب التعديل. يبقى تقييمك القديم كما هو إلى أن توافق الإدارة على البديل.');
  };
}
function reportReview(id) {
  if(!requireCloudAccount(()=>reportReview(id)))return;
  modal('الإبلاغ عن تقييم',`<form id="report-review-form"><p>يصل البلاغ إلى الإدارة للمراجعة، ولا يحذف التقييم تلقائيًا.</p><label>سبب البلاغ<select name="reason" required><option value="abuse">إساءة أو تجريح</option><option value="personal">معلومات شخصية</option><option value="irrelevant">محتوى غير مرتبط بالتجربة</option></select></label><label>تفاصيل إضافية (اختياري)<textarea name="details" rows="3" maxlength="600"></textarea></label><p class="form-error" role="alert"></p><button class="primary" type="submit">إرسال البلاغ</button></form>`);
  document.querySelector('#report-review-form').onsubmit=(event)=>{event.preventDefault();const data=new FormData(event.target);submitCommunityForm(event.target,'report',{review:id,reason:data.get('reason'),details:data.get('details')},'وصل بلاغك إلى الإدارة لمراجعة التقييم.');};
}
function communityAdminPanel(queue) {
  const edits=queue?.edits||[],reports=queue?.reports||[];
  const scores=(row,prefix='')=>`${row[prefix+'explanation']} · ${row[prefix+'treatment']} · ${row[prefix+'grading']}`;
  const reasons={abuse:'إساءة',personal:'معلومات شخصية',irrelevant:'محتوى غير مرتبط'};
  return `<section class="panel community-admin-panel"><h2>طلبات تعديل التقييمات</h2><p class="muted">موافقتك تستبدل المحتوى المنشور بالجديد. الرفض يُبقي القديم.</p>${edits.length?edits.map((edit)=>`<article class="moderation-review"><h3>د. ${escapeHtml(edit.doctor_name)}</h3><div class="edit-diff"><div><b>التقييم الحالي · ${escapeHtml(edit.old_subject)}</b><p>${escapeHtml(edit.old_comment)}</p>${reviewTagLabels(edit.old_tags)}<small>الشرح · التعامل · الدرجات: ${scores(edit,'old_')}</small></div><div><b>التعديل المقترح · ${escapeHtml(edit.subject)}</b><p>${escapeHtml(edit.comment)}</p>${reviewTagLabels(edit.tags)}<small>الشرح · التعامل · الدرجات: ${scores(edit)}</small></div></div><div class="review-tools"><button class="primary" data-cloud-operation="edit.approve" data-id="${edit.id}">موافقة واستبدال القديم</button><button class="secondary danger" data-cloud-operation="edit.reject" data-id="${edit.id}">رفض التعديل</button></div></article>`).join(''):'<p class="muted">لا توجد طلبات تعديل معلّقة.</p>'}<h2>بلاغات التقييمات</h2>${reports.length?reports.map((report)=>`<article class="moderation-review"><h3>د. ${escapeHtml(report.doctor_name)}</h3><b>${reasons[report.reason]||''} · ${escapeHtml(report.subject)}</b><p>${escapeHtml(report.comment)}</p>${report.details?`<p class="muted">تفاصيل البلاغ: ${escapeHtml(report.details)}</p>`:''}<div class="review-tools"><button class="secondary danger" data-cloud-operation="report.remove" data-id="${report.id}">إخفاء التقييم</button><button class="secondary" data-cloud-operation="report.dismiss" data-id="${report.id}">رفض البلاغ وإبقاء التقييم</button></div></article>`).join(''):'<p class="muted">لا توجد بلاغات معلّقة.</p>'}</section>`;
}
function bookmarkKey(){return 'miyar-bookmark-times-'+(googleSession?.user.id||'guest');}
function bookmarkTimes(){const value=readJSON(bookmarkKey(),{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function seenKey(){return 'miyar-seen-publications-'+(googleSession?.user.id||'guest');}
function seenPublications(){const value=readJSON(seenKey(),[]);return Array.isArray(value)?value:[];}
function notificationOwner(){return `${googleSession?.user.id||''}:${cloudMe?.university_id||''}`;}
function notificationBadge(){const count=savedUpdates.length+requestUpdates.length;return noticeOwner===notificationOwner()&&count?`<span class="notification-badge">${Math.min(count,99)}</span>`:'';}
function updateNotificationBadge(){const button=document.querySelector('#notice');if(button){button.querySelectorAll('em,.notification-badge').forEach((element)=>element.remove());button.insertAdjacentHTML('beforeend',notificationBadge());}}
let updatesRequest=null,updatesOwner='',notificationError='';
async function refreshSavedUpdates(){
  if(!configured||!googleSession||!cloudMe?.university_id){savedUpdates=[];requestUpdates=[];noticeOwner='';updateNotificationBadge();return;}
  const owner=notificationOwner();
  if(updatesRequest&&updatesOwner===owner)return updatesRequest;
  if(noticeOwner!==owner){savedUpdates=[];requestUpdates=[];noticeOwner=owner;updateNotificationBadge();}
  updatesOwner=owner;
  const times=bookmarkTimes();
  for(const id of saved) if(!times[id])times[id]=new Date().toISOString();
  storage.setItem(bookmarkKey(),JSON.stringify(times));
  const seen=new Set(seenPublications());
  updatesRequest=(async()=>{
    await Promise.resolve();
    try{
      const watched=saved.filter((id)=>doctors.some((doctor)=>doctor.id===id));
      const batches=Array.from({length:Math.ceil(watched.length/100)},(_,index)=>watched.slice(index*100,(index+1)*100));
      const [publications, decisions]=await Promise.all([Promise.all(batches.map((batch)=>api('notifications',{doctors:batch}))),api('request.updates')]);
      const rows=publications.flat();
      if(owner!==notificationOwner())return;
      savedUpdates=(Array.isArray(rows)?rows:[]).filter((row)=>saved.includes(row.doctor_id)&&Date.parse(row.published_at)>Date.parse(times[row.doctor_id])&&!seen.has(row.review_id));
      const seenDecisions=new Set(readJSON(decisionSeenKey(),[]));
      requestUpdates=(Array.isArray(decisions)?decisions:[]).filter((decision)=>!seenDecisions.has(decision.id));
      notificationError='';updateNotificationBadge();
    }catch(error){if(owner===notificationOwner())notificationError=error.message;}
    finally{if(updatesOwner===owner)updatesRequest=null;}
  })();
  return updatesRequest;
}
async function openNotifications(){
  if(!googleSession){openGoogleMessage();return;}
  if(updatesRequest) await updatesRequest;
  await refreshSavedUpdates();
  const count=savedUpdates.length+requestUpdates.length;
  modal('الإشعارات',`${notificationError?`<p role="alert">${escapeHtml(notificationError)}</p><button class="secondary" id="retry-notifications">إعادة المحاولة</button>`:''}${count?`${requestUpdates.map((request)=>`<button class="notification-row" data-open-requests><span>طلب ${escapeHtml(requestKindName(request))} ${escapeHtml(request.title)} · ${request.status==='approved'?'تمت الموافقة':'تم الرفض'}${request.reason?`<small>السبب: ${escapeHtml(request.reason)}</small>`:''}</span>${ic('arrow')}</button>`).join('')}${savedUpdates.map((row)=>`<button class="notification-row" data-notice-doctor="${row.doctor_id}"><span>تقييم جديد للدكتور ${escapeHtml(row.doctor_name)}</span><small>${new Date(row.published_at).toLocaleDateString('ar')}</small>${ic('arrow')}</button>`).join('')}<button class="secondary" id="read-notifications">تحديد الكل كمقروء</button>`:'<p class="empty">لا توجد تقييمات جديدة لدكاترتك المحفوظين حتى الآن.</p><p class="muted">ستظهر هنا أيضًا قرارات الإدارة بشأن طلباتك.</p>'}`);
  document.querySelectorAll('[data-notice-doctor]').forEach((button)=>button.onclick=()=>cloudDoctorDetail(Number(button.dataset.noticeDoctor)));
  document.querySelectorAll('[data-open-requests]').forEach((button)=>button.onclick=openRequests);
  document.querySelector('#retry-notifications')?.addEventListener('click',openNotifications);
  document.querySelector('#read-notifications')?.addEventListener('click',()=>{
    storage.setItem(seenKey(),JSON.stringify([...new Set([...seenPublications(),...savedUpdates.map((row)=>row.review_id)])].slice(-1000)));
    storage.setItem(decisionSeenKey(),JSON.stringify([...new Set([...readJSON(decisionSeenKey(),[]),...requestUpdates.map((request)=>request.id)])].slice(-1000)));
    savedUpdates=[];requestUpdates=[];updateNotificationBadge();openNotifications();
  });
}
function summaryPanel(summary){
 if(!summary||!Array.isArray(summary.themes))return '';
 const count=Number(summary.reviewCount||0),total=Number(summary.totalPublished||0);
 return `<section class="doctor-summary"><h3>ملخص تجربة الدكتور</h3><p class="muted">${total>count?`يستند إلى أحدث ${count} تقييمات من أصل ${total}`:`يستند إلى ${count} تقييمات منشورة`} · أوصاف متكررة في التجارب</p>${summary.insufficient?'<p>نحتاج ثلاث تجارب منشورة على الأقل لإظهار ملخص.</p>':summary.themes.length?`<div class="summary-themes">${summary.themes.map((theme)=>`<span>${escapeHtml(theme.label)}<small>وردت في ${Number(theme.count)} تقييمات</small></span>`).join('')}</div>`:'<p>لا توجد عبارات متكررة بما يكفي لإظهار نقاط واضحة حتى الآن.</p>'}</section>`;
}
function decisionSeenKey(){return 'miyar-seen-decisions-'+(googleSession?.user.id||'guest');}
function requestsPage(){
 if(!googleSession)return '<div class="page-title"><h1>متابعة طلباتي</h1><p>سجّل الدخول لمتابعة طلباتك وقرارات الإدارة.</p><button class="primary" id="requests-login">الدخول باستخدام Google</button></div>';
 const statuses={pending:'قيد المراجعة',approved:'تمت الموافقة',rejected:'تم الرفض',archived:'غير متاح'};
 const own=requestsOwner===googleSession.user.id?myRequestsData:[];
 return `<div class="page-title"><h1>متابعة طلباتي</h1><p>طلبات الإضافة والتعديل وتصحيح البيانات، مع حالة كل طلب وسبب القرار.</p><button class="secondary" id="requests-refresh">تحديث الطلبات</button></div>${requestsLoading?'<p role="status">جارٍ تحميل طلباتك…</p>':requestsError?`<p role="alert">${escapeHtml(requestsError)}</p>`:own.length?`<div class="request-history">${own.map((request)=>`<article class="panel request-history-card"><span class="request-status" data-status="${escapeHtml(request.status)}">${statuses[request.status]||''}</span><h2>طلب ${escapeHtml(requestKindName(request))}</h2><h3>${escapeHtml(request.title)}</h3><p>${escapeHtml(request.university||'')}</p><small>أُرسل ${new Date(request.created_at).toLocaleDateString('ar')}${request.decided_at?` · القرار ${new Date(request.decided_at).toLocaleDateString('ar')}`:''}</small>${request.reason?`<p class="decision-reason">سبب القرار: ${escapeHtml(request.reason)}</p>`:request.status==='rejected'?'<p class="muted">لم يُسجّل سبب لهذا القرار السابق.</p>':''}</article>`).join('')}</div>`:'<p class="empty">لم ترسل طلبات حتى الآن.</p>'}`;
}
async function loadMyRequests(){
 if(!googleSession||requestsLoading)return;
 const owner=googleSession.user.id;
 requestsLoading=true;requestsError='';
 if(requestsOwner!==owner)myRequestsData=[];
 try{const rows=await api('requests');if(googleSession?.user.id===owner){myRequestsData=Array.isArray(rows)?rows:[];requestsOwner=owner;}}
 catch(error){if(googleSession?.user.id===owner){requestsError=error.message;requestsOwner=owner;}}
 finally{requestsLoading=false;if(page==='requests'&&!document.querySelector('.modal-backdrop'))render();}
}
function openRequests(){
 if(!googleSession){openGoogleMessage();return;}
 document.body.classList.remove('modal-open');setPage('requests');render();loadMyRequests();
}
function rejectionForm(operation,id){
 modal('سبب رفض الطلب',`<form id="request-rejection-form"><p>سيظهر السبب لصاحب الطلب مع قرار الرفض.</p><label>سبب الرفض<textarea name="reason" minlength="3" maxlength="300" rows="4" required placeholder="اكتب سببًا واضحًا يساعد الطالب على تصحيح طلبه"></textarea></label><button type="submit" class="primary">تأكيد الرفض وإرسال السبب</button></form>`);
 document.querySelector('#request-rejection-form').onsubmit=async(event)=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;await cloudAdminAction(operation,{id,reason:new FormData(event.target).get('reason')});button.disabled=false;};
}
const proposalNames = {
 'doctor.add':'إضافة دكتور','college.add':'إضافة كلية','major.add':'إضافة تخصص',
 'doctor.correct':'تصحيح بيانات دكتور','college.correct':'تصحيح بيانات كلية','major.correct':'تصحيح بيانات تخصص',
};
function requestKindName(request) {
 return request.kind==='catalogue'?(proposalNames[request.proposal_kind]||'تحديث بيانات الدليل'):request.kind==='doctor'?'إضافة دكتور':'تعديل تقييم';
}
function doctorCorrectionForm(id) {
 if(!requireCloudAccount(()=>doctorCorrectionForm(id)))return;
 const doctor=doctors.find((item)=>item.id===id);
 if(!doctor){toast('الدكتور غير متاح في جامعتك الحالية.');return;}
 modal('اقتراح تصحيح بيانات الدكتور',`<p>صحّح الاسم أو التخصص. تبقى البيانات الحالية كما هي حتى تعتمد الإدارة طلبك.</p><form id="doctor-correction-form"><label>اسم الدكتور الثلاثي<input name="name" value="${escapeHtml(doctor.name)}" minlength="8" maxlength="100" required></label><label>الكلية والتخصص<select name="parentId" required>${studentMajors().map((major)=>`<option value="${major.id}" ${major.id===doctor.major_id?'selected':''}>${escapeHtml(major.name)} · ${escapeHtml(cloudCatalogue.colleges.find((college)=>college.id===major.college_id)?.name||'')}</option>`).join('')}</select></label><label>توضيح التصحيح (اختياري)<textarea name="details" rows="3" maxlength="600" placeholder="اشرح الخطأ والمعلومة الصحيحة دون إضافة بيانات شخصية"></textarea></label><p class="form-error" role="alert"></p><button class="primary" type="submit">إرسال التصحيح للمراجعة</button></form>`);
 document.querySelector('#doctor-correction-form').onsubmit=(event)=>{
  event.preventDefault();const form=event.target,data=new FormData(form);
  submitCommunityForm(form,'doctor.correction',{targetId:id,name:data.get('name'),parentId:Number(data.get('parentId')),details:data.get('details')},'وصل اقتراح التصحيح. يمكنك متابعة حالته وسبب القرار في «متابعة طلباتي».');
 };
}
function ambassadorPage() {
 const ids=cloudMe?.ambassadorUniversities||[];
 if(!configured||!googleSession||!ids.length)return '<div class="empty">مساحة السفير متاحة للحسابات التي تعيّنها الإدارة. أعد تسجيل الدخول إذا مُنحت الصلاحية حديثًا.</div>';
 const universities=(cloudCatalogue?.universities||[]).filter((university)=>ids.includes(university.id));
 const stored=readJSON('miyar-ambassador-context-'+cloudMe.id,{});
 const context=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
 if(!universities.some((university)=>university.id===Number(context.university)))context.university=universities[0]?.id;
 if(!proposalNames[context.kind])context.kind='doctor.add';
 return `<div class="page-title"><div class="eyebrow">سفراء مِعيار</div><h1>مساحة السفير</h1><p>ساهم في ترتيب دليل جامعتك. جميع الإضافات والتصحيحات تُراجعها الإدارة قبل النشر.</p><div class="directory-actions"><button class="secondary" id="ambassador-refresh">تحديث الصلاحيات والبيانات</button><button class="secondary" id="ambassador-requests">متابعة مقترحاتي</button></div></div><section class="panel ambassador-workspace"><h2>إضافة أو تصحيح بيانات</h2><div class="form-grid"><label>الجامعة<select id="ambassador-university">${universities.map((university)=>`<option value="${university.id}" ${university.id===Number(context.university)?'selected':''}>${escapeHtml(university.name)}</option>`).join('')}</select></label><label>نوع المقترح<select id="ambassador-kind">${Object.entries(proposalNames).map(([kind,label])=>`<option value="${kind}" ${kind===context.kind?'selected':''}>${label}</option>`).join('')}</select></label></div><p class="muted">لإضافة تخصص أو دكتور إلى قسم جديد، انتظر اعتماد الكلية أو التخصص أولًا. لا تتيح صلاحية السفير نشر التقييمات أو حذف السجلات أو إدارة الحسابات.</p><div id="ambassador-fields"></div></section>`;
}
function bindAmbassadorPage() {
 const root=document.querySelector('#ambassador-fields');
 if(!root||!cloudMe?.ambassadorUniversities?.length)return;
 const university=document.querySelector('#ambassador-university'),kind=document.querySelector('#ambassador-kind');
 const key='miyar-ambassador-context-'+cloudMe.id,stored=readJSON(key,{});
 const context=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
 const save=()=>storage.setItem(key,JSON.stringify({...context,university:Number(university.value),kind:kind.value}));
 const fill=(targetChanged=false)=>{
  const data=cloudCatalogue;
  const colleges=data.colleges.filter((college)=>college.university_id===Number(university.value));
  const majors=data.majors.filter((major)=>colleges.some((college)=>college.id===major.college_id));
  const faculty=data.doctors.filter((doctor)=>majors.some((major)=>major.id===doctor.major_id));
  const category=kind.value.split('.')[0],correcting=kind.value.endsWith('.correct');
  const targets=category==='college'?colleges:category==='major'?majors:faculty;
  const target=correcting?targets.find((item)=>item.id===Number(context.target)):null;
  if(!target)context.target='';
  const parents=category==='major'?colleges:category==='doctor'?majors:[];
  const parentName=(item)=>category==='doctor'?`${item.name} · ${colleges.find((college)=>college.id===item.college_id)?.name||''}`:item.name;
  let parent=context.parent;
  if(targetChanged&&target)parent=category==='doctor'?target.major_id:target.college_id;
  if(!parents.some((item)=>item.id===Number(parent)))parent=parents[0]?.id;
  context.parent=parent;
  root.innerHTML=`<form id="ambassador-proposal-form">${correcting?`<label>السجل الحالي<select name="targetId" required><option value="">اختر السجل المطلوب تصحيحه</option>${targets.map((item)=>`<option value="${item.id}" ${target?.id===item.id?'selected':''}>${escapeHtml(item.name)}${category==='doctor'?' · '+escapeHtml(majors.find((major)=>major.id===item.major_id)?.name||''):category==='major'?' · '+escapeHtml(colleges.find((college)=>college.id===item.college_id)?.name||''):''}</option>`).join('')}</select></label>`:''}<label>${category==='doctor'?'اسم الدكتور الثلاثي':category==='college'?'اسم الكلية':'اسم التخصص'}<input name="name" required minlength="${category==='doctor'?8:2}" maxlength="100" value="${escapeHtml(target?.name||'')}"></label>${category!=='college'?`<label>${category==='doctor'?'الكلية والتخصص':'الكلية'}<select name="parentId" required>${parents.length?parents.map((item)=>`<option value="${item.id}" ${item.id===Number(parent)?'selected':''}>${escapeHtml(parentName(item))}</option>`).join(''):'<option value="">لا يوجد قسم معتمد؛ أرسل طلب إضافته أولًا</option>'}</select></label>`:''}<label>تفاصيل المقترح (اختياري)<textarea name="details" rows="3" maxlength="600"></textarea></label><p class="form-error" role="alert"></p><button class="primary" type="submit">إرسال المقترح لاعتماد الإدارة</button></form>`;
  save();
  root.querySelector('[name=targetId]')?.addEventListener('change',(event)=>{context.target=event.target.value;fill(true);});
  root.querySelector('[name=parentId]')?.addEventListener('change',(event)=>{context.parent=event.target.value;save();});
  root.querySelector('form').onsubmit=(event)=>{
   event.preventDefault();const form=event.target,values=new FormData(form);
   submitCommunityForm(form,'ambassador.propose',{kind:kind.value,universityId:Number(university.value),targetId:correcting?Number(values.get('targetId')):null,parentId:category==='college'?null:Number(values.get('parentId')),name:values.get('name'),details:values.get('details')},'وصل مقترحك للإدارة. تبقى البيانات الحالية كما هي حتى الموافقة، وتجد القرار في «متابعة طلباتي».');
  };
 };
 for(const select of [university,kind])select.onchange=()=>{context.target='';context.parent='';fill();};
 fill();
 document.querySelector('#ambassador-requests').onclick=openRequests;
 document.querySelector('#ambassador-refresh').onclick=async(event)=>{
  event.currentTarget.disabled=true;
  try{await Promise.all([connectCloudAccount(false),refreshCloudCatalogue()]);render();}
  catch(error){toast(error.message);if(event.target.isConnected)event.target.disabled=false;}
 };
}
function ambassadorAdminPanel(queue) {
 const records=cloudCatalogue||{universities:[],colleges:[],majors:[]};
 const rows=queue?.catalogueRequests||[],members=queue?.ambassadors||[];
 const parentLabel=(kind,id)=>kind.startsWith('doctor.')?records.majors.find((item)=>item.id===id)?.name||'تخصص غير متاح':kind.startsWith('major.')?records.colleges.find((item)=>item.id===id)?.name||'كلية غير متاحة':'';
 return `<section class="panel ambassador-management"><h2>سفراء مِعيار</h2><p class="muted">عيّن سفيرًا لجامعة محددة باستخدام بريد حسابه في Google. يجب أن يكون قد دخل إلى مِعيار مرة واحدة. لا تُنشر مقترحاته دون موافقتك.</p><form id="assign-ambassador"><label>بريد حساب السفير<input name="email" type="email" required maxlength="254" dir="ltr" autocomplete="off" placeholder="student@example.com"></label><label>الجامعة<select name="universityId" required>${(records.universities||[]).map((university)=>`<option value="${university.id}">${escapeHtml(university.name)}</option>`).join('')}</select></label><p class="form-error" role="alert"></p><button class="primary" type="submit">تعيين سفير</button></form><div class="admin-record-list" aria-label="السفراء المعيّنون">${!queue?'<p role="status">جارٍ التحميل…</p>':members.length?members.map((member)=>`<div class="admin-row"><span>${escapeHtml(member.name)}<small><bdi>${escapeHtml(member.email)}</bdi> · ${escapeHtml(records.universities?.find((university)=>university.id===member.university_id)?.name||'')}${member.status!=='active'?' · الحساب مقيّد أو محظور':''}</small></span><button class="danger" data-revoke-ambassador="${escapeHtml(member.email)}" data-university="${member.university_id}">سحب الصلاحية</button></div>`).join(''):'<p class="muted">لم تعيّن سفراء بعد.</p>'}</div></section><section class="panel catalogue-moderation"><h2>تصحيحات البيانات ومقترحات السفراء</h2><p class="muted">الموافقة تطبّق التغيير على الدليل. لا تتأثر تقييمات الدكتور أو توثيقه بتصحيح اسمه أو تخصصه.</p><div class="catalogue-proposal-list" role="region" tabindex="0" aria-label="مقترحات تحديث الدليل">${!queue?'<p role="status">جارٍ التحميل…</p>':queue.error?`<p role="alert">${escapeHtml(queue.error)}</p>`:rows.length?rows.map((row)=>`<article class="moderation-review"><h3>${proposalNames[row.kind]||''} · ${escapeHtml(row.name)}</h3><p class="muted">${escapeHtml(row.university)} · ${row.ambassador?'مقترح سفير':'تصحيح من طالب'} · ${escapeHtml(row.author_name)}<small>معرّف الحساب: ${escapeHtml(row.account_id)}</small></p><div class="edit-diff">${row.kind.endsWith('.correct')?`<div><b>البيانات عند إرسال الطلب</b><p>${escapeHtml(row.original?.name||'')}</p><small>${escapeHtml(parentLabel(row.kind,row.original?.parent_id))}</small></div>`:''}<div><b>البيانات المقترحة</b><p>${escapeHtml(row.name)}</p><small>${escapeHtml(parentLabel(row.kind,row.parent_id))}</small></div></div>${row.details?`<p>توضيح صاحب الطلب: ${escapeHtml(row.details)}</p>`:''}<div class="review-tools"><button class="primary" data-cloud-operation="catalogue.approve" data-id="${row.id}">اعتماد وتطبيق التغيير</button><button class="secondary danger" data-cloud-operation="catalogue.reject" data-id="${row.id}">رفض مع السبب</button></div></article>`).join(''):'<p class="muted">لا توجد مقترحات بانتظار المراجعة.</p>'}</div></section>`;
}
function bindAmbassadorAdmin() {
 const form=document.querySelector('#assign-ambassador');
 if(!form||!cloudMe?.isAdmin)return;
 const key='miyar-ambassador-admin-university-'+cloudMe.id,university=form.querySelector('[name=universityId]'),previous=storage.getItem(key);
 if([...university.options].some((option)=>option.value===previous))university.value=previous;
 university.onchange=()=>storage.setItem(key,university.value);
 form.onsubmit=async(event)=>{
  event.preventDefault();const data=new FormData(form),button=form.querySelector('[type=submit]');button.disabled=true;
  storage.setItem(key,university.value);
  try{await cloudAdminAction('ambassador.set',{email:data.get('email'),universityId:Number(data.get('universityId')),active:true});}
  finally{button.disabled=false;}
 };
 document.querySelectorAll('[data-revoke-ambassador]').forEach((button)=>button.onclick=()=>{
  modal('سحب صلاحية السفير',`<p>سيُمنع هذا الحساب من إرسال مقترحات السفراء لهذه الجامعة فورًا. تبقى الطلبات السابقة في سجل المراجعة.</p><button class="primary" id="confirm-revoke-ambassador">تأكيد سحب الصلاحية</button>`);
  document.querySelector('#confirm-revoke-ambassador').onclick=async(event)=>{
   event.currentTarget.disabled=true;
   await cloudAdminAction('ambassador.set',{email:button.dataset.revokeAmbassador,universityId:Number(button.dataset.university),active:false});
  };
 });
}
async function shareDoctorCard(doctor){
 modal('بطاقة مشاركة الدكتور','<p data-card-loading>جارٍ تجهيز الصورة…</p>');
 const loading=document.querySelector('[data-card-loading]');
 try{
  const major=cloudCatalogue?.majors.find((item)=>item.id===doctor.major_id);
  const college=cloudCatalogue?.colleges.find((item)=>item.id===major?.college_id);
  const university=cloudCatalogue?.universities?.find((item)=>item.id===college?.university_id)?.name||'';
  const card=await createDoctorCard(doctor,Number(document.documentElement.style.getPropertyValue('--brand-hue'))||218,university);
  if(!loading.isConnected)return;
  modal('بطاقة مشاركة الدكتور',`<img class="share-card-preview" src="${card.dataUrl}" alt="بطاقة الدكتور ${escapeHtml(doctor.name)} ومؤشراته وعدد تقييماته"><div class="detail-actions"><a class="primary" id="download-doctor-card" href="${card.dataUrl}" download="miyar-doctor-${doctor.id}.png">حفظ الصورة</a><button class="secondary" id="native-share-card">مشاركة الصورة</button></div><p class="muted">${escapeHtml(card.url)}</p>`);
  document.querySelector('#native-share-card').onclick=async()=>{
   const file=new File([card.blob],`miyar-doctor-${doctor.id}.png`,{type:'image/png'});
   try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:`مِعيار — ${doctor.name}`,text:card.url});else document.querySelector('#download-doctor-card').click();}
   catch(error){if(error.name!=='AbortError')toast('يمكنك حفظ الصورة ومشاركتها من جهازك.');}
  };
 }catch(error){if(loading.isConnected)modal('تعذّر تجهيز البطاقة',`<p role="alert">${escapeHtml(error.message)}</p>`);}
}
let adminFilters={},adminFiltersOwner='',adminChosen=new Set();
const cleanAdminSearch=(value)=>String(value||'').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
function adminFilterKey(){return 'miyar-admin-filters-'+cloudMe.id;}
function initAdminFilters(){
 if(adminFiltersOwner!==cloudMe.id){const stored=readJSON(adminFilterKey(),{});adminFilters=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};adminFiltersOwner=cloudMe.id;adminChosen=new Set();}
 adminFilters.q=typeof adminFilters.q==='string'?adminFilters.q.slice(0,100):'';
 const data=cloudCatalogue;
 if(!data.universities?.some((item)=>String(item.id)===String(adminFilters.university)))adminFilters.university='';
 const colleges=data.colleges.filter((item)=>!adminFilters.university||String(item.university_id)===String(adminFilters.university));
 if(!colleges.some((item)=>String(item.id)===String(adminFilters.college)))adminFilters.college='';
 const collegeIds=new Set(colleges.filter((item)=>!adminFilters.college||String(item.id)===String(adminFilters.college)).map((item)=>item.id));
 if(!data.majors.some((item)=>collegeIds.has(item.college_id)&&String(item.id)===String(adminFilters.major)))adminFilters.major='';
 if(!['verify','unverify','archive'].includes(adminFilters.operation))adminFilters.operation='verify';
}
function adminDoctorRowsData(){
 const data=cloudCatalogue,q=cleanAdminSearch(adminFilters.q);
 return (data?.doctors||[]).filter((doctor)=>{const major=data.majors.find((item)=>item.id===doctor.major_id),college=data.colleges.find((item)=>item.id===major?.college_id);return (!q||cleanAdminSearch(doctor.name).includes(q))&&(!adminFilters.university||String(college?.university_id)===String(adminFilters.university))&&(!adminFilters.college||String(college?.id)===String(adminFilters.college))&&(!adminFilters.major||String(major?.id)===String(adminFilters.major));});
}
function adminDoctorRows(){
 const rows=adminDoctorRowsData();
 adminChosen=new Set([...adminChosen].filter((id)=>rows.some((doctor)=>doctor.id===id)));
 return rows.length?rows.map((doctor)=>`<div class="admin-row"><label class="admin-select-doctor"><input type="checkbox" data-admin-check="${doctor.id}" aria-label="تحديد ${escapeHtml(doctor.name)}" ${adminChosen.has(doctor.id)?'checked':''}><span>د. ${escapeHtml(doctor.name)}<small>${escapeHtml(doctor.major)}</small></span></label><div><button data-cloud-operation="doctor.verify" data-id="${doctor.id}" data-verified="${!doctor.verified}">${doctor.verified?'إلغاء التوثيق':'توثيق'}</button><button class="danger" data-cloud-operation="doctor.delete" data-id="${doctor.id}">إزالة</button></div></div>`).join(''):'<p class="empty">لا توجد أسماء مطابقة للفلاتر.</p>';
}
function adminFilterOptions(field){
 const data=cloudCatalogue;
 let rows=[];
 if(field==='university')rows=data.universities||[];
 if(field==='college')rows=data.colleges.filter((item)=>!adminFilters.university||String(item.university_id)===String(adminFilters.university));
 if(field==='major')rows=data.majors.filter((item)=>{const college=data.colleges.find((c)=>c.id===item.college_id);return (!adminFilters.university||String(college?.university_id)===String(adminFilters.university))&&(!adminFilters.college||String(college?.id)===String(adminFilters.college));});
 return '<option value="">الكل</option>'+rows.map((item)=>`<option value="${item.id}" ${String(adminFilters[field])===String(item.id)?'selected':''}>${escapeHtml(item.name)}${field==='college'?` · ${escapeHtml(data.universities?.find((u)=>u.id===item.university_id)?.name||'')}`:''}</option>`).join('');
}
function adminDirectoryControls(){
 return `<section class="admin-directory-controls"><h3>بحث وإدارة الدكاترة</h3><div class="admin-filter-grid"><label>اسم الدكتور<input id="admin-doctor-search" type="search" maxlength="100" value="${escapeHtml(adminFilters.q)}" placeholder="اكتب اسم الدكتور…"></label>${[['university','الجامعة'],['college','الكلية'],['major','التخصص']].map(([key,label])=>`<label>${label}<select data-admin-filter="${key}">${adminFilterOptions(key)}</select></label>`).join('')}</div><p id="admin-results-count" role="status"></p><div class="admin-bulk-tools"><label class="admin-check-all"><input type="checkbox" id="admin-select-all">تحديد حتى ١٠٠ نتيجة</label><span id="admin-selected-count" aria-live="polite"></span><select id="admin-bulk-operation" aria-label="الإجراء الجماعي">${[['verify','توثيق المحددين'],['unverify','إلغاء توثيق المحددين'],['archive','إخفاء المحددين']].map(([value,label])=>`<option value="${value}" ${adminFilters.operation===value?'selected':''}>${label}</option>`).join('')}</select><button class="secondary" id="admin-apply-bulk" type="button">تنفيذ الإجراء</button></div></section>`;
}
function updateAdminSelection(){
 const rows=adminDoctorRowsData();const count=document.querySelector('#admin-selected-count');if(!count)return;
 count.textContent=`${adminChosen.size} محدد`;
 document.querySelector('#admin-results-count').textContent=`${rows.length} دكتور مطابق`;
 document.querySelector('#admin-apply-bulk').disabled=!adminChosen.size;
 const all=document.querySelector('#admin-select-all'),eligible=rows.slice(0,100);
 all.checked=!!eligible.length&&eligible.every((doctor)=>adminChosen.has(doctor.id));all.indeterminate=!!adminChosen.size&&!all.checked;
}
function bindAdminChecks(){
 document.querySelectorAll('[data-admin-check]').forEach((checkbox)=>checkbox.onchange=()=>{const id=Number(checkbox.dataset.adminCheck);if(checkbox.checked){if(adminChosen.size>=100){checkbox.checked=false;toast('الحد الأقصى ١٠٠ دكتور في الإجراء الواحد.');return;}adminChosen.add(id);}else adminChosen.delete(id);updateAdminSelection();});
 updateAdminSelection();
}
function refreshAdminDirectory(){
 const root=document.querySelector('.admin-doctor-list');if(!root)return;
 root.innerHTML=adminDoctorRows();root.scrollTop=0;bindCloudOperations(root);bindAdminChecks();
}
function bindAdminDirectory(){
 const search=document.querySelector('#admin-doctor-search');if(!search)return;
 search.oninput=()=>{adminFilters.q=search.value;adminChosen.clear();storage.setItem(adminFilterKey(),JSON.stringify(adminFilters));refreshAdminDirectory();};
 document.querySelectorAll('[data-admin-filter]').forEach((select)=>select.onchange=()=>{
  const field=select.dataset.adminFilter;adminFilters[field]=select.value;
  if(field==='university'){adminFilters.college='';adminFilters.major='';}else if(field==='college')adminFilters.major='';
  initAdminFilters();adminChosen.clear();storage.setItem(adminFilterKey(),JSON.stringify(adminFilters));
  document.querySelectorAll('[data-admin-filter]').forEach((item)=>{item.innerHTML=adminFilterOptions(item.dataset.adminFilter);});refreshAdminDirectory();
 });
 document.querySelector('#admin-bulk-operation').onchange=(event)=>{adminFilters.operation=event.target.value;storage.setItem(adminFilterKey(),JSON.stringify(adminFilters));};
 document.querySelector('#admin-select-all').onchange=(event)=>{adminChosen=event.target.checked?new Set(adminDoctorRowsData().slice(0,100).map((doctor)=>doctor.id)):new Set();document.querySelectorAll('[data-admin-check]').forEach((checkbox)=>checkbox.checked=adminChosen.has(Number(checkbox.dataset.adminCheck)));updateAdminSelection();};
 document.querySelector('#admin-apply-bulk').onclick=()=>{
  const ids=[...adminChosen];if(!ids.length)return;
  const operation=document.querySelector('#admin-bulk-operation').value;
  const labels={verify:'توثيق',unverify:'إلغاء توثيق',archive:'إخفاء'};
  modal('تأكيد الإجراء الجماعي',`<p>سيتم ${labels[operation]} ${ids.length} دكتورًا محددًا.</p><ul>${adminDoctorRowsData().filter((doctor)=>ids.includes(doctor.id)).slice(0,5).map((doctor)=>`<li>${escapeHtml(doctor.name)}</li>`).join('')}</ul><button class="primary" id="confirm-doctor-bulk">تأكيد التنفيذ</button>`);
  document.querySelector('#confirm-doctor-bulk').onclick=async(event)=>{event.target.disabled=true;const saved=await cloudAdminAction('doctor.bulk',{ids,operationType:operation});if(saved){adminChosen.clear();refreshAdminDirectory();}else if(event.target.isConnected)event.target.disabled=false;};
 };
 bindAdminChecks();
}

function reviewPledge(next){
 modal('تنبيه!',`<div class="pledge-copy"><p>نرجو مخافة الله في التقييم.</p><p>تتم مراجعة التقييم قبل نشره.</p><p>التقييمات غير الملائمة تعرّض صاحبها للحظر أو التقييد.</p><p class="muted">أتعهد بأن تقييمي يعبّر عن تجربتي بصدق واحترام، دون إساءة أو معلومات شخصية.</p><button class="primary" type="button" id="accept-review-pledge">موافق وأتعهّد</button></div>`);
 document.querySelector('.modal').classList.add('pledge-card');
 document.querySelector('#accept-review-pledge').onclick=next;
}
function ratingTagPicker(selected=[]){
 return `<fieldset class="rating-tag-picker"><legend>أوصاف تجربتك (اختياري)</legend><p class="muted">اختر حتى ستة أوصاف تعبّر عن تجربتك.</p><div class="rating-tag-options">${REVIEW_TAGS.map((tag)=>`<button type="button" class="rating-tag-choice" data-rating-tag="${escapeHtml(tag.label)}" data-tone="${tag.tone}" aria-pressed="${Array.isArray(selected)&&selected.includes(tag.label)}"><i aria-hidden="true"></i><span>${tag.label}</span></button>`).join('')}</div><small class="tag-count" aria-live="polite"></small></fieldset>`;
}
function chosenRatingTags(form){return [...form.querySelectorAll('[data-rating-tag][aria-pressed=true]')].map((button)=>button.dataset.ratingTag);}
function bindRatingTags(form){
 const update=()=>{const count=chosenRatingTags(form).length;form.querySelector('.tag-count').textContent=`${count} / ٦ أوصاف`;};
 form.querySelectorAll('[data-rating-tag]').forEach((button)=>button.onclick=()=>{
  const selected=button.getAttribute('aria-pressed')==='true';
  if(!selected&&chosenRatingTags(form).length>=6){toast('اختر ستة أوصاف كحد أقصى.');return;}
  if(!selected&&['محاضرة ممتعة','محاضرة مملة'].includes(button.dataset.ratingTag))form.querySelectorAll('[data-rating-tag]').forEach((other)=>{if(other!==button&&['محاضرة ممتعة','محاضرة مملة'].includes(other.dataset.ratingTag))other.setAttribute('aria-pressed','false');});
  button.setAttribute('aria-pressed',String(!selected));update();
 });update();
}
function reviewTagLabels(tags){
 return Array.isArray(tags)&&tags.length?`<div class="published-tags">${REVIEW_TAGS.filter((tag)=>tags.includes(tag.label)).map((tag)=>`<span data-tone="${tag.tone}"><i aria-hidden="true"></i>${tag.label}</span>`).join('')}</div>`:'';
}
function onlineCountText(){return presenceCount===null?(presenceBusy?'جارٍ حساب المتصلين…':'عدد المتصلين غير متاح حاليًا'):`عدد المتصلين حاليًا ${presenceCount.toLocaleString('ar')}`;}
async function refreshPresence(visible=!document.hidden){
 if(!configured||presenceBusy||(!visible&&!guestProfile))return;
 presenceBusy=true;
 try{
  if(!guestProfile)guestProfile=await ensureGuestSession();
  const result=await api('guest.presence',{tabId:presenceTabId,visible});
  presenceCount=Number.isSafeInteger(result.online)&&result.online>=0?result.online:null;
 }catch{presenceCount=null;}
 finally{presenceBusy=false;document.querySelectorAll('[data-online-count]').forEach((element)=>element.textContent=onlineCountText());}
}

window.addEventListener("miyar-auth", async ({ detail }) => {
  const previous = googleSession;
  if (previous?.user.id !== detail.session?.user.id) miyarAssistant.reset();
  googleSession = detail.session;
  if (!detail.session) {
    cloudMe = null;
    scopeCatalogue();
    cloudQueue = null;
    studentProfile = null;
    storage.removeItem("miyar-profile");
    if (detail.event === "SIGNED_OUT") {
      storage.setItem("miyar-session", signedOut ? "signed-out" : "guest");
    }
  } else if (!previous || previous.user.id !== detail.session.user.id) {
    cloudMe = null;
    scopeCatalogue();
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
window.addEventListener("focus", () => { if (!document.hidden) {refreshSavedUpdates();refreshPresence();} });
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshSavedUpdates();refreshPresence(); });
window.addEventListener("pagehide",()=>refreshPresence(false));
setInterval(()=>{if(!document.hidden)refreshPresence();},30000);
setInterval(() => { if (!document.hidden) refreshSavedUpdates(); }, 60000);
window.addEventListener("resize", updateCarouselControls);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
setupPwa();
render();
if (configured) loadCloud();
const sharedId = +new URLSearchParams(location.search).get("doctor");
if (doctors.some((d) => d.id === sharedId)) detail(sharedId);
