import { useInfiniteQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from '@/lib/music';

const KINDS = [...MUSIC_TRACK_KINDS, 1063, 1];
const PAGE_SIZE = 100;
// Kind 1 is a huge general-purpose feed; limit it to music-related tags.
const MUSIC_TOPICS = ['music', 'tunestr', 'song', 'wavlake', 'v4v', 'value4value'];

type Cursor = Record<string, number | null>;
interface Page { tracks: Track[]; next: Cursor; failed: string[]; succeeded: number; }
const cursorKey = (relay: string, kind: number) => `${relay}|${kind}`;

/** Browse each enabled read relay independently so a fast relay can't hide a slow one. */
export function useMusicDiscovery() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const relays = [...new Set(config.relayMetadata.relays.filter(r => r.read).map(r => r.url))].sort();
  const relayKey = relays.join('|');

  return useInfiniteQuery({
    queryKey: ['music-discovery', relayKey],
    initialPageParam: {} as Cursor,
    enabled: relays.length > 0,
    retry: false,
    queryFn: async ({ pageParam, signal }): Promise<Page> => {
      const next: Cursor = { ...pageParam };
      const failed: string[] = [];
      const results = await Promise.all(relays.map(async (url) => {
        const activeKinds = KINDS.filter(kind => next[cursorKey(url, kind)] !== null);
        if (!activeKinds.length) return { events: [], ok: false, skipped: true };
        const filters: NostrFilter[] = activeKinds.map(kind => {
          const until = next[cursorKey(url, kind)];
          return {
            kinds: [kind], limit: PAGE_SIZE,
            ...(kind === 1 ? { '#t': MUSIC_TOPICS } : {}),
            ...(typeof until === 'number' ? { until } : {}),
          };
        });
        try {
          const events = await nostr.relay(url).query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
          for (const kind of activeKinds) {
            const matching = events.filter(event => event.kind === kind);
            // Keep a one-second overlap so events with equal timestamps aren't skipped
            // when they straddle a page. If the relay repeats a full timestamp boundary,
            // step past it to avoid an infinite loop (some events may still be omitted).
            const oldest = matching.length ? Math.min(...matching.map(e => e.created_at)) : null;
            const current = next[cursorKey(url, kind)];
            next[cursorKey(url, kind)] = oldest === null ? null : oldest === current ? oldest - 1 : oldest;
          }
          return { events, ok: true, skipped: false };
        } catch (error) {
          if (signal.aborted) throw error;
          failed.push(url);
          return { events: [], ok: false, skipped: false };
        }
      }));
      const succeeded = results.filter(result => result.ok).length;
      if (!succeeded && failed.length) throw new Error('Could not reach any configured read relays.');
      const tracks = results.flatMap(result => result.events).map(eventToTrack).filter((t): t is Track => !!t && t.kind === 'music');
      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return { tracks, next, failed, succeeded };
    },
    getNextPageParam: (page) => KINDS.some(kind => relays.some(url => page.next[cursorKey(url, kind)] !== null)) ? page.next : undefined,
  });
}
