// Seeds the Supabase project sq-keys-mock with the demo clients and the simulated sanctions list. Idempotent.
// Usage: npm run seed   (reads .env.local; prints client ids only, never a value from the environment)
import { existsSync } from "node:fs";
import { seedDemoData } from "../lib/seed";
import { SupabaseStore } from "../lib/store.supabase";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { SQ_SUPABASE_URL: url, SQ_SUPABASE_SERVICE_ROLE_KEY: key, SQ_DEMO_PASSWORD: password } = process.env;
const missing = Object.entries({ SQ_SUPABASE_URL: url, SQ_SUPABASE_SERVICE_ROLE_KEY: key, SQ_DEMO_PASSWORD: password }).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) { console.error(`Missing in .env.local: ${missing.join(", ")}`); process.exit(1); }

seedDemoData(new SupabaseStore(url!, key!), password).then(
  (created) => console.log(created.length ? `Created clients: ${created.join(", ")}` : "Clients already present. Nothing to add."),
  (e: Error) => { console.error(`Seed failed: ${e.message}`); process.exit(1); },
);
