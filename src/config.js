// Public project identifiers supplied by the owner. These are safe in browser code.
// Privileged keys and OAuth client secrets must never be added here.
export const projectUrl = (import.meta.env.VITE_SUPABASE_URL ||
  "https://bbnsorjxgehvoddluvyo.supabase.co").replace(/\/$/, "");
export const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_2usxAWt5YkSt11yV_H41oA_w191iF6o";
export const configured = import.meta.env.VITE_DEMO_MODE !== "true" &&
  Boolean(projectUrl && publishableKey);
