import { NSet, type NPool, type NostrEvent, type NostrFilter } from '@nostrify/nostrify';
import { verifyEvent } from 'nostr-tools';

const LIBRARY_EOSE_TIMEOUT_MS = 700;

export interface LibraryQueryResult {
  events: NostrEvent[];
  complete: boolean;
}

/** Query user-owned replaceable library events with a short, library-only relay grace period. */
export async function queryLibraryEvents(
  nostr: NPool,
  relays: string[],
  filters: NostrFilter[],
  signal: AbortSignal,
): Promise<LibraryQueryResult> {
  if (!relays.length) return { events: [], complete: false };

  const controller = new AbortController();
  const relaySignal = AbortSignal.any([signal, controller.signal]);
  const events = new NSet();
  let completedRelays = 0;
  let complete = false;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const requests = relays.map(async (url) => {
    try {
      for await (const message of nostr.relay(url).req(filters, { signal: relaySignal })) {
        if (message[0] === 'EVENT') {
          events.add(message[2]);
        } else if (message[0] === 'EOSE') {
          completedRelays += 1;
          // One completed relay is enough to establish that the query returned a
          // complete response; other selected relays may be offline or slow.
          complete = true;
          if (completedRelays === relays.length) {
            if (graceTimer) clearTimeout(graceTimer);
            controller.abort();
          } else if (completedRelays === 1) {
            graceTimer = setTimeout(() => controller.abort(), LIBRARY_EOSE_TIMEOUT_MS);
          }
          break;
        }
      }
    } catch {
      // Failed or timed-out relays contribute whatever events they returned.
    }
  });

  await Promise.all(requests);
  if (graceTimer) clearTimeout(graceTimer);
  return { events: [...events], complete };
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

function matchesCoordinate(event: NostrEvent, pubkey: string, kind: number, identifier: string): boolean {
  return event.pubkey === pubkey && event.kind === kind && (kind < 30000 || event.tags.some(([name, value]) => name === 'd' && value === identifier));
}

export function newestLibraryEvent(events: NostrEvent[]): NostrEvent | undefined {
  return events.reduce<NostrEvent | undefined>((latest, event) => !latest || event.created_at > latest.created_at || (event.created_at === latest.created_at && event.id < latest.id) ? event : latest, undefined);
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

