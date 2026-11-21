import { useInfiniteQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from '@/lib/music';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isTrackVisibleInOstrify } from '@/lib/musicVisibility';
import { DROPS_MUSIC_RELAY } from '@/lib/sources';
import { captureDiscoveredAudioEvents } from '@/lib/audioCatalogCapture';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';
import { queryRelaysWithGrace } from '@/lib/progressiveRelayQuery';

const KINDS = [...MUSIC_TRACK_KINDS, 1063, 1];
const PAGE_SIZE = 100;
// Kind 1 is a huge general-purpose feed; limit it to music-related tags.
const MUSIC_TOPICS = ['music', 'tunestr', 'song', 'wavlake', 'v4v', 'value4value'];

type Cursor = Record<string, number | null>;
interface Page { tracks: Track[]; next: Cursor; failed: string[]; succeeded: number; }
const cursorKey = (relay: string, kind: number) => `${relay}|${kind}`;

/** Browse each enabled read relay independently so a fast relay can't hide a slow one. */
export function useMusicDiscovery(enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const relays = [...new Set([...config.relayMetadata.relays.filter(r => r.read).map(r => r.url), DROPS_MUSIC_RELAY, OSTRIFY_RELAY_URL])].sort();
  const relayKey = `${relays.join('|')}|viewer:${user?.pubkey ?? 'public'}`;

  return useInfiniteQuery({
    queryKey: ['music-discovery', relayKey],
    initialPageParam: {} as Cursor,
    enabled: enabled && relays.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ pageParam, signal }): Promise<Page> => {
      const next: Cursor = { ...pageParam };
      const queryRelay = async (url: string, relaySignal: AbortSignal): Promise<NostrEvent[]> => {
        const relayKinds = url === DROPS_MUSIC_RELAY ? [36787] : url === OSTRIFY_RELAY_URL ? [...KINDS, 54] : KINDS;
        const activeKinds = relayKinds.filter(kind => next[cursorKey(url, kind)] !== null);
        if (!activeKinds.length) return [];
        const filters: NostrFilter[] = activeKinds.map(kind => {
          const until = next[cursorKey(url, kind)];
          return {
            kinds: [kind], limit: PAGE_SIZE,
            ...(kind === 1 ? { '#t': MUSIC_TOPICS } : {}),
            ...(typeof until === 'number' ? { until } : {}),
          };
        });
        return nostr.relay(url).query(filters, {
          signal: AbortSignal.any([relaySignal, AbortSignal.timeout(url === OSTRIFY_RELAY_URL ? 1500 : 8000)]),
        });
      };
      const batch = await queryRelaysWithGrace(relays, queryRelay, signal, 700);
      for (const { relay, value: events } of batch.results) {
        const relayKinds = relay === DROPS_MUSIC_RELAY ? [36787] : relay === OSTRIFY_RELAY_URL ? [...KINDS, 54] : KINDS;
        for (const kind of relayKinds) {
          const matching = events.filter(event => event.kind === kind);
          // Keep a one-second overlap so events with equal timestamps aren't skipped
          // when they straddle a page. If the relay repeats a full timestamp boundary,
          // step past it to avoid an infinite loop (some events may still be omitted).
          const oldest = matching.length ? Math.min(...matching.map(e => e.created_at)) : null;
          const current = next[cursorKey(relay, kind)];
          next[cursorKey(relay, kind)] = oldest === null ? null : oldest === current ? oldest - 1 : oldest;
        }
      }
      for (const url of [...batch.failedRelays, ...batch.pendingRelays]) {
        const relayKinds = url === DROPS_MUSIC_RELAY ? [36787] : url === OSTRIFY_RELAY_URL ? [...KINDS, 54] : KINDS;
        for (const kind of relayKinds) {
          const key = cursorKey(url, kind);
          const previous = pageParam[key];
          if (previous === null || typeof previous === 'number') next[key] = previous;
          else delete next[key];
        }
      }
      const eventsByRelay = new Map(batch.results.map(result => [result.relay, result.value]));
      const successfulRelayCount = batch.results.filter(result => result.relay !== OSTRIFY_RELAY_URL).length;
      const failed = [...new Set([...batch.failedRelays, ...batch.pendingRelays])].filter(url => url !== DROPS_MUSIC_RELAY && url !== OSTRIFY_RELAY_URL);
      if (!batch.results.length) throw new Error('Could not reach any configured read relays or DROPS.');
      const allEvents = [...eventsByRelay.values()].flat();
      const discoveredEvents = [...new Map(allEvents.map(event => [event.id, event])).values()];
      captureDiscoveredAudioEvents(nostr, discoveredEvents, user?.pubkey);
      const tracks = discoveredEvents.map(eventToTrack).filter((t): t is Track => !!t && t.kind === 'music' && isTrackVisibleInOstrify(t, user?.pubkey));
      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return { tracks, next, failed, succeeded: successfulRelayCount };
    },
    getNextPageParam: (page) => relays.some(url => (url === DROPS_MUSIC_RELAY ? [36787] : url === OSTRIFY_RELAY_URL ? [...KINDS, 54] : KINDS).some(kind => page.next[cursorKey(url, kind)] !== null)) ? page.next : undefined,
  });
}
