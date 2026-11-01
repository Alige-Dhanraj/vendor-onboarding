// Picks the store: Supabase when configured, otherwise an in-memory store (local development only;
// it resets whenever the server restarts and is not shared between serverless instances).
import "server-only";
import { TEST_REGISTRY } from "../scenarios";
import { BLOCKLIST_SEED, VENDOR_MASTER_SEED } from "../seed";
import { createMemoryStore } from "./memory";
import { createSupabaseStore } from "./supabase";
import type { Store } from "./types";

const g = globalThis as unknown as { __vendorStore?: Store };

export function getStore(): Store {
  if (g.__vendorStore) return g.__vendorStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  g.__vendorStore = url && key
    ? createSupabaseStore(url, key)
    : createMemoryStore({ vendors: VENDOR_MASTER_SEED, blocklist: BLOCKLIST_SEED, registry: TEST_REGISTRY });
  return g.__vendorStore;
}

export const storeMode = () => (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory");
