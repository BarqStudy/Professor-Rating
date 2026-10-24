const projectUrl = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
export const configured = Boolean(projectUrl);
export const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "")
  .replace(/^@/, "");
export async function api(action, data = {}) {
  if (!configured) throw new Error("لم يتم ربط قاعدة البيانات بعد.");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl)) {
    throw new Error("تحقق من رابط مشروع Supabase في إعدادات النشر.");
  }
  const initData = window.Telegram?.WebApp?.initData || "";
  const response = await fetch(`${projectUrl}/functions/v1/miyar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, action, initData }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => {
    throw new Error("تعذّر الاتصال بالخدمة. تحقق من الإنترنت وحاول مجددًا.");
  });
  const result = await response.json().catch(() => {
    throw new Error("استجابة غير متوقعة من الخدمة.");
  });
  if (!response.ok) throw new Error(result.error || "تعذّر إكمال الطلب.");
  return result;
}
