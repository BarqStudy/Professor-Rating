import { createDatabase } from "./database.js";
import { createHandler } from "./handler.js";

// Values are configured in Supabase Edge Function Secrets, never in GitHub code.
const env = {
  TELEGRAM_BOT_TOKEN: Deno.env.get("TELEGRAM_BOT_TOKEN"),
  ADMIN_TELEGRAM_IDS: Deno.env.get("ADMIN_TELEGRAM_IDS"),
  ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS"),
};
const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
Deno.serve(createHandler({
  env,
  // Defer configuration errors so OPTIONS and errors still have CORS headers.
  db: (path: string, options = {}) =>
    createDatabase(url, serviceKey)(path, options),
}));
