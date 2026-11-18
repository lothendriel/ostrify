import type { QueryClient, QueryKey } from "@tanstack/react-query";

const DATABASE_NAME = "ostrify-public-page-cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "queries";
const CACHE_KEY = "public-pages-v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;
const MAX_ENTRY_BYTES = 2_500_000;
const MAX_TOTAL_BYTES = 10_000_000;
const WRITE_DELAY_MS = 400;
const MUSIC_CATEGORIES = new Set(["rock", "electronic", "hiphop", "jazz", "classical", "folk", "pop", "ambient", "bitcoin"]);
const WAVLAKE_GENRES = new Set(["Rock", "Alternative", "Electronic", "Dance/EDM", "Hip-Hop/Rap", "Jazz", "Blues", "R&B/Soul", "Classical", "Singer/Songwriter", "Country", "Pop", "New Age"]);
const MUSIC_NEWS_TAGS = new Set(["music", "musicnews", "newmusic", "musicindustry", "musicjournalism", "musicreview", "albumreview", "musicbusiness", "musictechnology", "concert", "livemusic"]);

interface PersistedQuery {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
}

function hasSafeRelayKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
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
  if (typeof value !== "string") return false;
  if (value.startsWith("/api/")) return !value.startsWith("//") && !value.includes("\\");
  return hasSafePublicUrl(value);
}

function isViewerIdentity(value: unknown): value is string {
  return value === "public" || (typeof value === "string" && /^[0-9a-f]{64}$/i.test(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

function removeHiddenMusic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeHiddenMusic).filter(item => item !== undefined);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (record.visibility === "hidden") return undefined;
  if (Array.isArray(record.tags) && record.tags.some((tag: unknown) => Array.isArray(tag) && tag[0] === "ostrify_visibility" && tag[1] === "hidden")) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    const safeItem = removeHiddenMusic(item);
    if (safeItem !== undefined) sanitized[key] = safeItem;
  }
  return sanitized;
}

function isPublicPageQueryKey(queryKey: QueryKey): boolean {
  const [scope, subtype, id, extra] = queryKey;
  if (scope === "nostr" && subtype === "author") {
    return typeof id === "string" && /^[0-9a-f]{64}$/i.test(id) && extra === "public-artist-page" && queryKey.length === 4;
  }
  if (scope === "artist-tracks") {
    return typeof subtype === "string" && /^[0-9a-f]{64}$/i.test(subtype) && hasSafeRelayKey(id) && isViewerIdentity(extra) && queryKey.length === 4;
  }
  if (scope === "artist-identified-tracks") {
    return typeof subtype === "string" && /^[0-9a-f]{64}$/i.test(subtype) && queryKey.length === 3;
  }
  if (scope === "home-tracks" || scope === "fresh-nostr-tracks") {
    return hasSafeRelayKey(subtype) && isViewerIdentity(id) && extra === undefined && queryKey.length === 3 && subtype.length <= 2048;
  }
  if (scope === "category-tracks") {
    return typeof subtype === "string" && MUSIC_CATEGORIES.has(subtype) && hasSafeRelayKey(id) && isViewerIdentity(extra) && queryKey.length === 4;
  }
  if (scope === "wavlake" && subtype === "catalog") {
    return (id === "" || (typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) && extra === undefined && queryKey.length === 3;
  }
  if (scope === "wavlake" && subtype === "genre-catalog") {
    return typeof id === "string" && WAVLAKE_GENRES.has(id) && extra === undefined && queryKey.length === 3;
  }
  if (scope === "music-news") {
    return isStringArray(subtype) && subtype.length === MUSIC_NEWS_TAGS.size && subtype.every(tag => MUSIC_NEWS_TAGS.has(tag)) && (id === "home" || id === "full") && extra === undefined && queryKey.length === 3;
  }
  if (scope === "music-discovery") {
    if (typeof subtype !== "string" || id !== undefined || extra !== undefined || queryKey.length !== 2) return false;
    const separator = subtype.lastIndexOf("|viewer:");
    if (separator < 0) return false;
    return hasSafeRelayKey(subtype.slice(0, separator)) && subtype.slice(separator + "|viewer:".length) === "public" && queryKey.length === 2;
  }
  if (scope === "podcast-episodes" && typeof subtype === "number") {
    return Number.isInteger(subtype) && subtype > 0 && typeof id === "number" && Number.isInteger(id) && id >= 0 && hasSafeServiceKey(extra) && queryKey.length === 4;
  }
  if (scope === "podcast-episodes" && subtype === "nostr-feed") return id === undefined && extra === undefined && queryKey.length === 2;
  if (scope === "podcast-shows") return (subtype === "nostr" || subtype === "fountain") && id === undefined && extra === undefined && queryKey.length === 2;
  if (scope === "podcast-show-episodes") {
    return typeof subtype === "string" && /^[0-9a-f]{64}$/i.test(subtype) && id === undefined && extra === undefined && queryKey.length === 2;
  }
  if (scope === "podcast-index" && subtype === "feed") {
    return hasSafePublicUrl(id) && extra === undefined && queryKey.length === 3;
  }
  if (scope === "podcast-index" && subtype === "episodes") {
    return ((typeof id === "number" && Number.isInteger(id) && id > 0) || hasSafePublicUrl(id)) && (extra === undefined || typeof extra === "string") && queryKey.length === (extra === undefined ? 3 : 4);
  }
  if (scope === "fountain-show") {
    return typeof subtype === "string" && /^[^\s]{1,512}$/.test(subtype) && hasSafeServiceKey(id) && extra === undefined && queryKey.length === 3;
  }
  if (scope === "fountain-rss-episodes") {
    return hasSafePublicUrl(subtype) && typeof id === "string" && /^[^\s]{1,513}$/.test(id) && hasSafeServiceKey(extra) && queryKey.length === 4;
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
  const valid = entries.flatMap((entry) => {
    if (now - entry.updatedAt > MAX_AGE_MS || !isPublicPageQueryKey(entry.queryKey)) return [];
    const data = removeHiddenMusic(entry.data);
    return data === undefined ? [] : [{ ...entry, data }];
  }).sort((left, right) => right.updatedAt - left.updatedAt);
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

/** Restore approved public discovery and detail results; all restored entries are stale so active queries refresh in the background. */
export async function restorePublicPageCache(queryClient: QueryClient, shouldRestore: () => boolean = () => true): Promise<void> {
  const entries = boundedEntries(await readPersistedQueries(), Date.now());
  // A startup timeout may already have released the app to its live query path.
  // Never let a late IndexedDB result replace data fetched after that fallback.
  if (!shouldRestore()) return;
  for (const entry of entries) {
    // Mark restored data stale: it renders immediately, while the page's normal
    // query lifecycle refreshes it from its relay or catalog source.
    queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: 0 });
  }
  // Prune old or invalid records without making router startup wait on a write.
  void writePersistedQueries(entries);
}

/** Persist only approved public discovery/detail queries; never libraries or account-specific data. */
export function watchPublicPageCache(queryClient: QueryClient): () => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    const now = Date.now();
    const entries: PersistedQuery[] = queryClient.getQueryCache().getAll().flatMap((query) => {
      if (query.state.data === undefined || !isPublicPageQueryKey(query.queryKey)) return [];
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
