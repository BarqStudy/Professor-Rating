import { ApiError, uuid } from "./security.js";

// Supabase Auth verifies the access token, its expiry and the actual Auth user.
// Neither a decoded JWT, client-supplied email nor user_metadata grants access.
export function createGoogleVerifier(projectUrl, serviceKey, fetcher = fetch) {
  return async function authenticate(request) {
    const authorization = request.headers.get("authorization") || "";
    if (
      !/^Bearer [^\s]+$/i.test(authorization) || authorization.length > 16384
    ) throw new ApiError(401, "سجّل الدخول باستخدام Google أو Apple.");
    if (!projectUrl || !serviceKey) {
      throw new ApiError(503, "لم يكتمل إعداد تسجيل الدخول.");
    }
    let response;
    try {
      response = await fetcher(
        `${projectUrl.replace(/\/$/, "")}/auth/v1/user`,
        {
          headers: { apikey: serviceKey, Authorization: authorization },
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new ApiError(503, "تعذّر التحقق من جلسة الدخول. حاول مجددًا.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        401,
        "انتهت الجلسة أو أنها غير صالحة. سجّل الدخول مجددًا.",
      );
    }
    if (!response.ok) {
      throw new ApiError(503, "خدمة تسجيل الدخول غير متاحة مؤقتًا.");
    }
    const user = await response.json().catch(() => null);
    const provider=['google','apple'].find(provider=>user?.identities?.some(identity=>identity.provider===provider)&&(user?.app_metadata?.providers?.includes(provider)||user?.app_metadata?.provider===provider));
    if (!user?.email_confirmed_at || !provider) {
      throw new ApiError(403, "استخدم تسجيل الدخول باستخدام Google أو Apple.");
    }
    let id;
    try {
      id = uuid(user.id);
    } catch {
      throw new ApiError(401, "جلسة دخول غير صالحة.");
    }
    // Decode claims only after Auth accepted this exact token. Password sessions
    // for a linked account must not enable the OAuth-only API.
    let claims;
    try {
      const encoded = authorization.split(" ")[1].split(".")[1];
      claims = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      throw new ApiError(401, "جلسة دخول غير صالحة.");
    }
    if (
      claims.sub !== id ||
      !claims.amr?.some((method) => method.method === "oauth") ||
      user.is_anonymous
    ) throw new ApiError(403, "استخدم تسجيل الدخول باستخدام Google أو Apple.");
    const name = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim().slice(0, 60)
      : "";
    return { id, name: name || "طالب" };
  };
}
