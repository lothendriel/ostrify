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
      const queryRelay = async (url: string) => {
        const relayKinds = url === DROPS_MUSIC_RELAY ? [36787] : url === OSTRIFY_RELAY_URL ? [...KINDS, 54] : KINDS;
        const activeKinds = relayKinds.filter(kind => next[cursorKey(url, kind)] !== null);
        if (!activeKinds.length) return { url, events: [], ok: false, skipped: true };
        const filters: NostrFilter[] = activeKinds.map(kind => {
          const until = next[cursorKey(url, kind)];
          return {
            kinds: [kind], limit: PAGE_SIZE,
            ...(kind === 1 ? { '#t': MUSIC_TOPICS } : {}),
            ...(typeof until === 'number' ? { until } : {}),
          };
        });
        try {
          const eventsPromise = nostr.relay(url).query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
          const events = url === OSTRIFY_RELAY_URL
            ? await Promise.race([eventsPromise, new Promise<NostrEvent[]>(resolve => setTimeout(() => resolve([]), 1000))])
            : await eventsPromise;
          for (const kind of activeKinds) {
            const matching = events.filter(event => event.kind === kind);
            // Keep a one-second overlap so events with equal timestamps aren't skipped
            // when they straddle a page. If the relay repeats a full timestamp boundary,
            // step past it to avoid an infinite loop (some events may still be omitted).
            const oldest = matching.length ? Math.min(...matching.map(e => e.created_at)) : null;
            const current = next[cursorKey(url, kind)];
            next[cursorKey(url, kind)] = oldest === null ? null : oldest === current ? oldest - 1 : oldest;
          }
          return { url, events, ok: true, skipped: false };
        } catch (error) {
          if (signal.aborted) throw error;
          return { url, events: [], ok: false, skipped: false };
        }
      };
      let results = await Promise.all(relays.map(queryRelay));
      // Keep partial results responsive. Retry the failed relays once only when
      // none responded, so a slow/broken relay cannot hold back a usable feed.
      if (!results.some(result => result.ok)) {
        const retryable = results.filter(result => !result.ok && !result.skipped);
        const retried = await Promise.all(retryable.map(result => queryRelay(result.url)));
        const retryByUrl = new Map(retried.map(result => [result.url, result]));
        results = results.map(result => retryByUrl.get(result.url) ?? result);
      }
      const discoveredEvents = [...new Map(results.flatMap(result => result.events).map(event => [event.id, event])).values()];
      captureDiscoveredAudioEvents(nostr, discoveredEvents, user?.pubkey);
      const failed = results.filter(result => !result.ok && !result.skipped && result.url !== DROPS_MUSIC_RELAY && result.url !== OSTRIFY_RELAY_URL).map(result => result.url);
      const succeeded = results.filter(result => result.ok && result.url !== OSTRIFY_RELAY_URL).length;
      if (!results.some(result => result.ok) && !succeeded && failed.length) throw new Error('Could not reach any configured read relays or DROPS.');
      const tracks = [...new Map(results.flatMap(result => result.events).map(event => [event.id, event])).values()].map(eventToTrack).filter((t): t is Track => !!t && t.kind === 'music' && isTrackVisibleInOstrify(t, user?.pubkey));
      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return { tracks, next, failed, succeeded };
    },
    getNextPageParam: (page) => relays.some(url => (url === DROPS_MUSIC_RELAY ? [36787] : url === OSTRIFY_RELAY_URL ? [...KINDS, 54] : KINDS).some(kind => page.next[cursorKey(url, kind)] !== null)) ? page.next : undefined,
  });
}
