import { accountStorageKey } from '@/lib/utils';

const STORAGE_KEY = "ostrify:home-shelf-history:v1";
const MAX_TRACKS_PER_CATEGORY = 90;
const MAX_AGE_DAYS = 21;

export type HomeShelfHistory = Record<string, string[]>;

function parseHistory(value: unknown): HomeShelfHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: HomeShelfHistory = {};
  for (const [category, ids] of Object.entries(value)) {
    if (!Array.isArray(ids)) continue;
    result[category] = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length <= 2048))].slice(0, MAX_TRACKS_PER_CATEGORY);
  }
  return result;
}

export function readHomeShelfHistory(owner = 'anonymous'): HomeShelfHistory {
  try {
    if (typeof localStorage === "undefined") return {};
    const stored = localStorage.getItem(accountStorageKey(localStorage, STORAGE_KEY, owner));
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    const savedAt = typeof record.savedAt === "number" ? record.savedAt : 0;
    if (!savedAt || Date.now() - savedAt > MAX_AGE_DAYS * 86400_000) return {};
    return parseHistory(record.categories);
  } catch {
    return {};
  }
}

export function writeHomeShelfHistory(categories: HomeShelfHistory, owner = 'anonymous'): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(accountStorageKey(localStorage, STORAGE_KEY, owner), JSON.stringify({ savedAt: Date.now(), categories: parseHistory(categories) }));
  } catch {
    // Storage may be unavailable or full; shelf selection still works without memory.
  }
}
