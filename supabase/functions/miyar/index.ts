import { createDatabase } from "./database.js";
import { createHandler } from "./handler.js";
import { createGoogleVerifier } from "./auth.js";

// Values are configured in Supabase Edge Function Secrets, never in GitHub code.
const env = {
  SMTP_USER: Deno.env.get("SMTP_USER"),
  SMTP_PASSWORD: Deno.env.get("SMTP_PASSWORD"),
  R2_ACCOUNT_ID: Deno.env.get("R2_ACCOUNT_ID"),
  R2_BUCKET_NAME: Deno.env.get("R2_BUCKET_NAME"),
  R2_ACCESS_KEY_ID: Deno.env.get("R2_ACCESS_KEY_ID"),
  R2_SECRET_ACCESS_KEY: Deno.env.get("R2_SECRET_ACCESS_KEY"),
  ADMIN_AUTH_IDS: Deno.env.get("ADMIN_AUTH_IDS"),
  ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS"),
  GUEST_PEPPER: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  AI_PROVIDER: Deno.env.get("AI_PROVIDER"),
  AI_MODEL: Deno.env.get("AI_MODEL"),
  OPENAI_API_KEY: Deno.env.get("OPENAI_API_KEY"),
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY"),
};
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const edgeRuntime = (globalThis as typeof globalThis & {EdgeRuntime?: {waitUntil: (task: Promise<unknown>) => void}}).EdgeRuntime;
Deno.serve(createHandler({
  env,
  authenticate: createGoogleVerifier(url, serviceKey),
  mailTransport: async (options: object) => {
    const {default: nodemailer} = await import("npm:nodemailer@10.2.1");
    return nodemailer.createTransport(options);
  },
  background: edgeRuntime ? (task: Promise<unknown>) => edgeRuntime.waitUntil(task) : undefined,
  // Defer configuration errors so OPTIONS and errors still have CORS headers.
  db: (path: string, options = {}) =>
    createDatabase(url, serviceKey)(path, options),
}));
