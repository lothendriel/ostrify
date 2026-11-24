import { NSet, type NPool, type NostrEvent, type NostrFilter } from '@nostrify/nostrify';
import { verifyEvent } from 'nostr-tools';
import { useQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';

const LIBRARY_EOSE_GRACE_MS = 1600;
const LIBRARY_READ_TIMEOUT_MS = 5000;

export interface LibraryCoverage {
  complete: boolean;
  completedRelays: string[];
  incompleteRelays: string[];
}

export interface LibraryQueryResult extends LibraryCoverage {
  events: NostrEvent[];
}

function coverageKey(queryKey: QueryKey): QueryKey {
  return ['library-read-coverage', ...queryKey];
}

/** Subscribe to the coverage of a library query without changing its data shape. */
export function useLibraryCoverage(queryKey: QueryKey): LibraryCoverage | undefined {
  return useQuery<LibraryCoverage>({ queryKey: coverageKey(queryKey), enabled: false, staleTime: Infinity }).data;
}

export function libraryReadRetryOptions(client: QueryClient, queryKey: QueryKey): { waitForAll: boolean } {
  return { waitForAll: client.getQueryData<LibraryCoverage>(coverageKey(queryKey))?.complete === false };
}

export function saveLibraryCoverage(client: QueryClient, queryKey: QueryKey, result: LibraryCoverage): void {
  client.setQueryData<LibraryCoverage>(coverageKey(queryKey), {
    complete: result.complete,
    completedRelays: result.completedRelays,
    incompleteRelays: result.incompleteRelays,
  });
}

/** Collect relay responses within a bounded grace period. EOSE is per relay, not global completeness. */
export async function queryLibraryEvents(
  nostr: NPool,
  relays: string[],
  filters: NostrFilter[],
  signal: AbortSignal,
  options: { waitForAll?: boolean } = {},
): Promise<LibraryQueryResult> {
  const targets = [...new Set(relays)];
  if (!targets.length) return { events: [], complete: false, completedRelays: [], incompleteRelays: [] };
  if (signal.aborted) throw signal.reason;

  const controller = new AbortController();
  const relaySignal = AbortSignal.any([signal, controller.signal]);
  const events = new NSet();
  const completed = new Set<string>();
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = setTimeout(() => controller.abort(), LIBRARY_READ_TIMEOUT_MS);

  try {
    await Promise.all(targets.map(async url => {
      try {
        for await (const message of nostr.relay(url).req(filters, { signal: relaySignal })) {
          if (message[0] === 'EVENT') events.add(message[2]);
          else if (message[0] === 'EOSE') {
            completed.add(url);
            if (completed.size === targets.length) controller.abort();
            else if (completed.size === 1 && !options.waitForAll) graceTimer = setTimeout(() => controller.abort(), LIBRARY_EOSE_GRACE_MS);
            break;
          }
        }
      } catch {
        // Events received before an interrupted subscription remain useful, but
        // without EOSE this relay is not counted as having finished the query.
      }
    }));
    if (signal.aborted) throw signal.reason;
    const completedRelays = targets.filter(url => completed.has(url));
    const incompleteRelays = targets.filter(url => !completed.has(url));
    return { events: [...events], complete: incompleteRelays.length === 0, completedRelays, incompleteRelays };
  } finally {
    clearTimeout(deadline);
    if (graceTimer) clearTimeout(graceTimer);
    controller.abort();
  }
}

// Library writes need a longer, independent read than the quick display query.
// This does not make Nostr writes atomic across devices or other clients.
const WRITE_READ_TIMEOUT_MS = 4000;
const writeQueues = new Map<string, Promise<void>>();
const recentEvents = new Map<string, NostrEvent>();
let libraryWriteStorageUnavailable = false;

function coordinate(pubkey: string, kind: number, identifier: string): string {
  return `${kind}:${pubkey}:${kind >= 30000 ? identifier : ''}`;
}

export async function withLibraryWrite<T>(pubkey: string, kind: number, identifier: string, action: () => Promise<T>): Promise<T> {
  const key = `ostrify-library-write:${coordinate(pubkey, kind, identifier)}`;
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(() => {
    // Web Locks coordinate cooperating Ostrify tabs on this origin. Other
    // browsers/clients are not covered; the in-memory queue is the fallback.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request(key, action);
    }
    return action();
  });
  const tail = run.then(() => {}, () => {});
  writeQueues.set(key, tail);
  try {
    return await run;
  } finally {
    if (writeQueues.get(key) === tail) writeQueues.delete(key);
  }
}

/** Keep the revision cache observed for as long as its library view is mounted. */
export function useLibraryRevision(pubkey: string, kind: number, identifier: string): NostrEvent | undefined {
  return useQuery<NostrEvent>({ queryKey: ['library-read-event', coordinate(pubkey, kind, identifier)], enabled: false, staleTime: Infinity }).data;
}

function matchesCoordinate(event: NostrEvent, pubkey: string, kind: number, identifier: string): boolean {
  return event.pubkey === pubkey && event.kind === kind && (kind < 30000 || event.tags.find(([name]) => name === 'd')?.[1] === identifier);
}

/** NIP-01: newest timestamp wins; at equal timestamps the lowest event ID wins. */
export function isNewerReplaceableEvent(candidate: Pick<NostrEvent, 'created_at' | 'id'>, current: Pick<NostrEvent, 'created_at' | 'id'>): boolean {
  return candidate.created_at > current.created_at || (candidate.created_at === current.created_at && candidate.id < current.id);
}

export function newestLibraryEvent(events: NostrEvent[]): NostrEvent | undefined {
  return events.reduce<NostrEvent | undefined>((latest, event) => !latest || isNewerReplaceableEvent(event, latest) ? event : latest, undefined);
}

/** Only compare events belonging to the same trusted coordinate. */
export function newestEventForCoordinate(events: NostrEvent[], pubkey: string, kind: number, identifier = ''): NostrEvent | undefined {
  return newestLibraryEvent(events.filter(event => matchesCoordinate(event, pubkey, kind, identifier)));
}

/** Keep a whole signed revision, rather than unioning incompatible replaceable lists. */
export function reconcileLibraryEvent(client: QueryClient, pubkey: string, kind: number, identifier: string, candidates: (NostrEvent | null | undefined)[]): NostrEvent | undefined {
  const key = ['library-read-event', coordinate(pubkey, kind, identifier)];
  const cached = client.getQueryData<NostrEvent>(key);
  const valid = [cached, ...candidates].filter((event): event is NostrEvent => !!event && matchesCoordinate(event, pubkey, kind, identifier));
  const latest = newestLibraryEvent(valid);
  if (latest && latest.id !== cached?.id) client.setQueryData(key, latest);
  return latest;
}

/** Remember only signed public library events; no signer secrets or private data. */
export function rememberLibraryWrite(event: NostrEvent, identifier: string): void {
  const key = coordinate(event.pubkey, event.kind, identifier);
  recentEvents.set(key, event);
  try {
    localStorage.setItem(`ostrify-library-last-write:${key}`, JSON.stringify(event));
    libraryWriteStorageUnavailable = false;
  } catch {
    // Other tabs may not see the most recent successful write before relays do.
    libraryWriteStorageUnavailable = true;
  }
}

export function recentLibraryEvent(pubkey: string, kind: number, identifier: string): NostrEvent | undefined {
  const key = coordinate(pubkey, kind, identifier);
  let stored: NostrEvent | undefined;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`ostrify-library-last-write:${key}`) ?? 'null');
    if (value && typeof value === 'object') {
      const candidate = value as NostrEvent;
      if (Array.isArray(candidate.tags) && matchesCoordinate(candidate, pubkey, kind, identifier) && verifyEvent(candidate)) stored = candidate;
    }
  } catch { /* Treat malformed or unavailable storage as empty. */ }
  return newestLibraryEvent([recentEvents.get(key), stored].filter((event): event is NostrEvent => !!event));
}

export async function readLibraryForWrite(nostr: NPool, relays: string[], pubkey: string, kind: number, identifier: string, cached?: NostrEvent): Promise<{ event?: NostrEvent; partial: boolean }> {
  if (!relays.length) throw new Error('Enable a read relay before changing your library.');
  const filters: NostrFilter[] = [{ kinds: [kind], authors: [pubkey], ...(kind >= 30000 ? { '#d': [identifier] } : {}), limit: 20 }];
  const found: NostrEvent[] = [];
  let completed = 0;
  await Promise.all([...new Set(relays)].map(async relay => {
    try {
      for await (const message of nostr.relay(relay).req(filters, { signal: AbortSignal.timeout(WRITE_READ_TIMEOUT_MS) })) {
        if (message[0] === 'EVENT' && matchesCoordinate(message[2], pubkey, kind, identifier)) found.push(message[2]);
        if (message[0] === 'EOSE') { completed++; break; }
      }
    } catch { /* The caller is told if any relay was unavailable. */ }
  }));
  if (!completed) throw new Error('No read relay finished checking your library. Nothing was published; check your relays and try again.');
  const recent = recentLibraryEvent(pubkey, kind, identifier);
  if (cached && matchesCoordinate(cached, pubkey, kind, identifier)) found.push(cached);
  if (recent) found.push(recent);
  return { event: newestLibraryEvent(found), partial: completed < new Set(relays).size };
}

/** Avoid future-dating replaceable events or losing a same-second update. */
export async function nextLibraryTimestamp(previousCreatedAt = 0): Promise<number> {
  let now = Math.floor(Date.now() / 1000);
  if (previousCreatedAt > now) throw new Error('The latest library update is dated in the future. Check your clock and retry later.');
  if (previousCreatedAt === now) {
    await new Promise(resolve => setTimeout(resolve, 1050 - Date.now() % 1000));
    now = Math.floor(Date.now() / 1000);
  }
  if (previousCreatedAt >= now) throw new Error('Please wait a moment and try again.');
  return now;
}



export function libraryWriteWarning(partial: boolean): string | undefined {
  const noCrossTabLock = typeof navigator === 'undefined' || !navigator.locks?.request;
  if (libraryWriteStorageUnavailable) return 'This browser could not store the latest library revision for other tabs. Avoid editing the same list in another tab until relays have synced.';
  if (partial && noCrossTabLock) return 'Some read relays did not respond, and this browser cannot coordinate other tabs. Check your library before editing it elsewhere.';
  if (partial) return 'Some read relays did not respond. Updates from another device may not have been seen; check your library before editing it elsewhere.';
  if (noCrossTabLock) return 'This browser cannot coordinate library changes across tabs. Avoid editing the same list in two tabs at once.';
  return undefined;
}

