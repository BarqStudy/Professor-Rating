import { createClient } from "@supabase/supabase-js";
import { configured, projectUrl, publishableKey } from "./config.js";
export { configured } from "./config.js";

const callbackParams = typeof location === "undefined"
  ? null
  : new URLSearchParams(location.hash.slice(1));
const oauthError = callbackParams?.has("error") ||
  (typeof location !== "undefined" &&
    new URL(location.href).searchParams.has("error"));
const client = configured
  ? createClient(projectUrl, publishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  : null;
let cachedSession = null;
client?.auth.onAuthStateChange((event, session) => {
  cachedSession = session;
  // Never await another auth method inside the SDK's auth-state callback.
  queueMicrotask(() =>
    window.dispatchEvent(
      new CustomEvent("miyar-auth", { detail: { event, session } }),
    )
  );
});
export async function initializeAuth() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error || oauthError) {
    throw new Error("تعذّر إكمال تسجيل الدخول باستخدام Google. حاول مجددًا.");
  }
  cachedSession = data.session;
  return cachedSession;
}
export async function getGoogleSession() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error("انتهت جلسة الدخول. سجّل الدخول باستخدام Google مجددًا.");
  }
  cachedSession = data.session;
  return cachedSession;
}
export async function signInGoogle() {
  if (!client) throw new Error("لم يكتمل إعداد تسجيل الدخول بعد.");
  // Give an in-app error while Google is not yet enabled, rather than navigating to an error JSON page.
  let settings;
  try {
    const response = await fetch(`${projectUrl}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error();
    settings = await response.json();
  } catch {
    throw new Error("تعذّر الاتصال بخدمة الدخول. حاول مجددًا.");
  }
  if (!settings.external?.google) {
    throw new Error("تسجيل الدخول باستخدام Google لم يُفعّل بعد. جرّب لاحقًا.");
  }
  const redirectTo = new URL(import.meta.env.BASE_URL, location.href).href;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error) throw new Error("تعذّر بدء تسجيل الدخول باستخدام Google.");
}
export async function signOutGoogle() {
  if (!client) return;
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("تعذّر تسجيل الخروج. حاول مجددًا.");
  cachedSession = null;
}
export async function api(action, data = {}) {
  if (!configured) throw new Error("لم يتم ربط قاعدة البيانات بعد.");
  const isGuest = action.startsWith("guest.");
  const isPublic = isGuest || action === "catalogue" || action === "reviews" || action === "doctor.summary" || action === "doctor.grades" || action === "course.doctors" || action === "ai.status";
  const session = isPublic ? cachedSession : await getGoogleSession();
  if (!isPublic && !session) {
    throw new Error("سجّل الدخول باستخدام Google لإكمال العملية.");
  }
  const headers = {
    "Content-Type": "application/json",
    apikey: publishableKey,
  };
  if(isGuest && readGuestToken()) headers["x-miyar-guest"]=readGuestToken();
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const response = await fetch(`${projectUrl}/functions/v1/miyar`, {
    method: "POST",
    keepalive: action === "guest.presence",
    headers,
    body: JSON.stringify({ ...data, action }),
    signal: AbortSignal.timeout(action === 'guest.ai.ask' ? 45000 : 20000),
  }).catch(() => {
    throw new Error("تعذّر الاتصال بالخدمة. تحقق من الإنترنت وحاول مجددًا.");
  });
  const result = await response.json().catch(() => {
    throw new Error("استجابة غير متوقعة من الخدمة.");
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("المنصة قيد التجهيز؛ خدمة التقييمات لم تُفعّل بعد.");
    }
    const error = new Error(result.error || "تعذّر إكمال الطلب.");
    error.status=response.status;
    throw error;
  }
  return result;
}

let guestTokenMemory='';
let guestSessionPromise=null;
function readGuestToken(){try{return localStorage.getItem('miyar-guest-token')||guestTokenMemory;}catch{return guestTokenMemory;}}
function writeGuestToken(token){guestTokenMemory=token;try{localStorage.setItem('miyar-guest-token',token);}catch{}}
export async function ensureGuestSession(){
 if(guestSessionPromise)return guestSessionPromise;
 const open=async()=>{
  const token=readGuestToken();
  if(token){try{return await api('guest.me');}catch(error){if(error.status!==401)throw error;writeGuestToken('');}}
  const profile=await api('guest.start');
  if(!/^[a-f0-9]{64}$/.test(profile.token||''))throw new Error('تعذّر إنشاء جلسة الزائر. أعد المحاولة.');
  writeGuestToken(profile.token);
  return {id:profile.id,university_id:profile.university_id,status:profile.status};
 };
 guestSessionPromise=(async()=>{if(navigator.locks?.request)return navigator.locks.request('miyar-guest-session',open);return open();})().finally(()=>{guestSessionPromise=null;});
 return guestSessionPromise;
}
