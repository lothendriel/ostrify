import { NSet, type NPool, type NostrEvent, type NostrFilter } from '@nostrify/nostrify';

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
