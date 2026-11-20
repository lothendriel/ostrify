import type { NostrEvent, NPool } from '@nostrify/nostrify';
import { eventToTrack } from '@/lib/music';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';

const PAGE_SIZE = 500;
const MAX_KIND_ONE_EVENTS = 10_000;
const CATALOG_EVENT_KINDS = [1, 54, 1063, 31337, 32123, 30440, 36787, 10154];

export interface AudioCatalogCount {
  total: number;
  complete: boolean;
  scannedKindOne: number;
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
  const seen = new Set<string>();
  let scannedKindOne = 0;
  let complete = true;

  for (const kind of CATALOG_EVENT_KINDS) {
    let until: number | undefined;
    let scannedForKind = 0;

    while (true) {
      if (signal.aborted) throw signal.reason;
      const remaining = kind === 1 ? MAX_KIND_ONE_EVENTS - scannedKindOne : PAGE_SIZE;
      if (kind === 1 && remaining <= 0) {
        complete = false;
        break;
      }
      const limit = kind === 1 ? Math.min(PAGE_SIZE, remaining) : PAGE_SIZE;
      const filter = { kinds: [kind], limit, ...(until !== undefined ? { until } : {}) };
      const events = await nostr.relay(OSTRIFY_RELAY_URL).query([filter], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      scannedForKind += events.length;
      if (kind === 1) scannedKindOne += events.length;
      for (const event of events) {
        if (isAudioCatalogEvent(event)) seen.add(event.id);
      }

      if (events.length < limit) break;
      const oldest = Math.min(...events.map(event => event.created_at));
      if (!Number.isFinite(oldest) || (until !== undefined && oldest >= until)) {
        complete = false;
        break;
      }
      until = oldest - 1;
      if (kind === 1 && scannedForKind >= MAX_KIND_ONE_EVENTS) {
        complete = false;
        break;
      }
    }
  }

  return { total: seen.size, complete, scannedKindOne };
}
