import type { NostrEvent, NPool } from '@nostrify/nostrify';
import { eventToTrack } from '@/lib/music';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';

const PAGE_SIZE = 500;
const MAX_EVENTS_PER_KIND = 10_000;
const CATALOG_EVENT_KINDS = [1, 54, 1063, 31337, 32123, 30440, 36787, 10154];

export interface AudioCatalogCount {
  total: number;
  estimatedBytes: number;
  complete: boolean;
}

function isAudioCatalogEvent(event: NostrEvent): boolean {
  if (event.kind === 10154) {
    return event.tags.some(([name, value]) => name === 'title' && !!value?.trim());
  }
  const track = eventToTrack(event);
  return !!track && track.visibility !== 'hidden';
}

/** Count distinct currently queryable audio-track/episode metadata events on Ostrify's relay. */
export async function countAudioCatalogEvents(nostr: NPool, signal: AbortSignal): Promise<AudioCatalogCount> {
  const seen = new Map<string, number>();
  let complete = true;

  for (const kind of CATALOG_EVENT_KINDS) {
    let until: number | undefined;
    let scannedForKind = 0;

    while (true) {
      if (signal.aborted) throw signal.reason;
      const remaining = MAX_EVENTS_PER_KIND - scannedForKind;
      if (remaining <= 0) {
        complete = false;
        break;
      }
      const limit = Math.min(PAGE_SIZE, remaining);
      const filter = { kinds: [kind], limit, ...(until !== undefined ? { until } : {}) };
      const events = await nostr.relay(OSTRIFY_RELAY_URL).query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      scannedForKind += events.length;
      for (const event of events) {
        if (isAudioCatalogEvent(event) && !seen.has(event.id)) {
          seen.set(event.id, new TextEncoder().encode(JSON.stringify(event)).byteLength);
        }
      }

      if (events.length < limit) break;
      const oldest = Math.min(...events.map(event => event.created_at));
      if (!Number.isFinite(oldest) || (until !== undefined && oldest >= until)) {
        complete = false;
        break;
      }
      until = oldest - 1;
      if (scannedForKind >= MAX_EVENTS_PER_KIND) {
        complete = false;
        break;
      }
    }
  }

  const estimatedBytes = [...seen.values()].reduce((total, eventBytes) => total + eventBytes, 0);
  return { total: seen.size, estimatedBytes, complete };
}
