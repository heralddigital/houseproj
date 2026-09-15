import { IndexedDbStore } from "@/lib/storage/indexeddb";
import { SupabaseStore, supabaseConfig } from "@/lib/storage/supabase";
import type { ProjectStore } from "@/lib/storage/types";

let cached: ProjectStore | null = null;

/**
 * Supabase when it is configured, browser-local storage otherwise.
 * Client-side only — call it from components and the store, never from a
 * server component.
 */
export function getStore(): ProjectStore {
  if (cached) return cached;
  const config = supabaseConfig();
  cached = config
    ? new SupabaseStore(config.url, config.anonKey)
    : new IndexedDbStore();
  return cached;
}

export type { ProjectRecord, ProjectStore, VersionRecord } from "@/lib/storage/types";
