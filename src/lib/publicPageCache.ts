import type { QueryClient, QueryKey } from "@tanstack/react-query";

const DATABASE_NAME = "ostrify-public-page-cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "queries";
const CACHE_KEY = "public-pages-v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;
const MAX_ENTRY_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 4_000_000;
const WRITE_DELAY_MS = 400;

interface PersistedQuery {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

function hasSafeRelayKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return value.split("|").every((relay) => {
    try {
      const url = new URL(relay);
      return (url.protocol === "wss:" || url.protocol === "ws:") && !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  });
}

function hasSafePublicUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hasSafeServiceKey(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("/api/") || hasSafePublicUrl(value));
}

function isPublicPageQueryKey(queryKey: QueryKey): boolean {
  const [scope, subtype, id, extra] = queryKey;
  if (scope === "nostr" && subtype === "author") {
    return typeof id === "string" && /^[0-9a-f]{64}$/i.test(id) && extra === "public-artist-page";
  }
  if (scope === "artist-tracks") {
    return typeof subtype === "string" && /^[0-9a-f]{64}$/i.test(subtype) && hasSafeRelayKey(id);
  }
  if (scope === "artist-identified-tracks") {
    return typeof subtype === "string" && /^[0-9a-f]{64}$/i.test(subtype);
  }
  if (scope === "podcast-show-episodes") {
    return typeof subtype === "string" && /^[0-9a-f]{64}$/i.test(subtype);
  }
  if (scope === "podcast-index" && subtype === "feed") {
    return hasSafePublicUrl(id);
  }
  if (scope === "podcast-index" && subtype === "episodes") {
    return (typeof id === "number" && Number.isInteger(id) && id > 0) || hasSafePublicUrl(id);
  }
  if (scope === "fountain-show") {
    return typeof subtype === "string" && /^[^\s]{1,512}$/.test(subtype) && hasSafeServiceKey(id);
  }
  if (scope === "fountain-rss-episodes") {
    return hasSafePublicUrl(subtype) && typeof id === "string" && /^[^\s]{1,513}$/.test(id) && hasSafeServiceKey(extra);
  }
  return false;
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function readPersistedQueries(): Promise<PersistedQuery[]> {
  const database = await openDatabase();
  if (!database) return [];
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CACHE_KEY);
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (!Array.isArray(value)) {
          resolve([]);
          return;
        }
        const entries = value.filter((item): item is PersistedQuery => {
          if (typeof item !== "object" || item === null) return false;
          const entry = item as Partial<PersistedQuery>;
          return Array.isArray(entry.queryKey) && typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt) && "data" in entry;
        });
        resolve(entries);
      };
      request.onerror = () => resolve([]);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => { database.close(); resolve([]); };
      transaction.onabort = () => { database.close(); resolve([]); };
    } catch {
      database.close();
      resolve([]);
    }
  });
}

async function writePersistedQueries(entries: PersistedQuery[]): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entries, CACHE_KEY);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); resolve(); };
    } catch {
      database.close();
      resolve();
    }
  });
}

function boundedEntries(entries: PersistedQuery[], now: number): PersistedQuery[] {
  const valid = entries
    .filter((entry) => now - entry.updatedAt <= MAX_AGE_MS && isPublicPageQueryKey(entry.queryKey))
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const output: PersistedQuery[] = [];
  let totalBytes = 0;
  for (const entry of valid) {
    if (output.length >= MAX_ENTRIES) break;
    let bytes: number;
    try {
      bytes = JSON.stringify(entry.data).length * 2;
    } catch {
      continue;
    }
    if (bytes > MAX_ENTRY_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) continue;
    totalBytes += bytes;
    output.push(entry);
  }
  return output;
}

/** Restore a small allowlist of public artist and podcast detail-page results. */
export async function restorePublicPageCache(queryClient: QueryClient): Promise<void> {
  const entries = boundedEntries(await readPersistedQueries(), Date.now());
  for (const entry of entries) {
    // Mark restored data stale: it renders immediately, while the page's normal
    // query lifecycle refreshes it from its relay or catalog source.
    queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: 0 });
  }
  await writePersistedQueries(entries);
}

/** Persist only approved public detail queries; never libraries or user data. */
export function watchPublicPageCache(queryClient: QueryClient): () => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    const now = Date.now();
    const entries: PersistedQuery[] = queryClient.getQueryCache().getAll().flatMap((query) => {
      if (query.state.status !== "success" || query.state.data === undefined || !isPublicPageQueryKey(query.queryKey)) return [];
      return [{ queryKey: query.queryKey, data: query.state.data, updatedAt: query.state.dataUpdatedAt || now }];
    });
    void writePersistedQueries(boundedEntries(entries, now));
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || !["success", "setData"].includes(event.action.type)) return;
    if (!isPublicPageQueryKey(event.query.queryKey)) return;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(persist, WRITE_DELAY_MS);
  });
  return () => {
    unsubscribe();
    if (timeout) clearTimeout(timeout);
  };
}
