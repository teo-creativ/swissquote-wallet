// Process-wide store. Supabase when SQ_SUPABASE_URL is set, otherwise an in-memory store seeded with the demo data
// (local dev: state is lost on restart). Server only.
import { seedDemoData } from "./seed";
import { MemoryStore, type Store } from "./store";
import { SupabaseStore } from "./store.supabase";

const holder = globalThis as unknown as { __sqMockStore?: Promise<Store> };

async function createStore(): Promise<Store> {
  const url = process.env.SQ_SUPABASE_URL;
  const key = process.env.SQ_SUPABASE_SERVICE_ROLE_KEY;
  if (url) {
    if (!key) throw new Error("SQ_SUPABASE_SERVICE_ROLE_KEY is not set");
    // The Supabase project is seeded once with `npm run seed`.
    return new SupabaseStore(url, key);
  }
  const store = new MemoryStore();
  await seedDemoData(store, process.env.SQ_DEMO_PASSWORD);
  return store;
}

export function getStore(): Promise<Store> {
  holder.__sqMockStore ??= createStore();
  return holder.__sqMockStore;
}

export const storeKind = (): "supabase" | "memory" => (process.env.SQ_SUPABASE_URL ? "supabase" : "memory");
