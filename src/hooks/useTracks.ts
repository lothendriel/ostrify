import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { FEATURED_MUSIC_PUBKEYS, DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";
import { captureDiscoveredAudioEvents } from '@/lib/audioCatalogCapture';
import { homeSessionQueryKey } from '@/lib/homeSession';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';

interface UseTracksOptions {
  limit?: number;
  /** Filter by topic hashtag (lowercase, no #). */
  topic?: string;
  /** Restrict to a single author pubkey. */
  author?: string;
  /** Restrict results to these author pubkeys. */
  authors?: string[];
  /** Defer discovery until a feature explicitly needs the track pool. */
  enabled?: boolean;
  /** Keep results fixed for one Home app session. */
  sessionScope?: string;
}

/**
 * Fetch music tracks from Nostr: dedicated music-track kinds (Wavlake, zapstr,
 * lightning.fm, etc.), NIP-94 audio file metadata (kind 1063), and kind:1 notes
 * carrying audio attachments. Also pulls directly from featured catalog
 * publishers (e.g. Wavlake's proxy) so there's always a solid base of music.
 */
export function useTracks(options: UseTracksOptions = {}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const readRelays = [...new Set([...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url), DROPS_MUSIC_RELAY, OSTRIFY_RELAY_URL])].sort();
  const { limit = 200, topic, author, authors, enabled = true, sessionScope } = options;
  const authorKey = authors?.slice().sort().join('|') ?? '';

  return useQuery({
    queryKey: homeSessionQueryKey(
      sessionScope ? `${sessionScope}:${user?.pubkey ?? 'public'}` : undefined,
      ["tracks", limit, topic ?? "", author ?? "", authorKey, readRelays.join("|"), user?.pubkey ?? "public"],
    ),
    staleTime: sessionScope ? Infinity : author || authors?.length ? 60_000 : 0,
    refetchOnMount: sessionScope ? false : true,
    refetchOnWindowFocus: sessionScope ? false : undefined,
    enabled,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const base: Record<string, unknown> = {};
      if (topic) base["#t"] = [topic];
      if (author) base.authors = [author];
      else if (authors?.length) base.authors = authors;

      const filtersForRelay = (relay: string): NostrFilter[] => {
        if (relay === DROPS_MUSIC_RELAY) return [{ kinds: [36787], limit, ...base }];
        if (relay === OSTRIFY_RELAY_URL) return [{ kinds: [...MUSIC_TRACK_KINDS, 1063, 1, 54], limit, ...base }];
        const filters: NostrFilter[] = [
          { kinds: [...MUSIC_TRACK_KINDS], limit, ...base },
          { kinds: [1063], limit, ...base },
          { kinds: [1], limit, ...base },
        ];
        if (!author && !authors?.length && FEATURED_MUSIC_PUBKEYS.length > 0) {
          filters.push({ kinds: [...MUSIC_TRACK_KINDS], authors: FEATURED_MUSIC_PUBKEYS, limit: 300, ...(topic ? { "#t": [topic] } : {}) });
        }
        return filters;
      };
      const results = await Promise.allSettled(readRelays.map(async relay => {
        const query = nostr.relay(relay).query(filtersForRelay(relay), { signal });
        const value = relay === OSTRIFY_RELAY_URL
          ? await Promise.race([query, new Promise<NostrEvent[]>(resolve => setTimeout(() => resolve([]), 1000))])
          : await query;
        return value;
      }));
      const events = [...new Map(results.flatMap(result => result.status === "fulfilled" ? result.value : []).map(event => [event.id, event])).values()];
      if (!results.some(result => result.status === "fulfilled" && result.value.length > 0)) throw new Error("Could not load tracks from your read relays or DROPS.");
      captureDiscoveredAudioEvents(nostr, events, user?.pubkey);

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const event of events) {
        const track = eventToTrack(event);
        if (!track) continue;
        track.eventKind = event.kind;
        // De-dupe by audio url so the same song isn't listed twice.
        if (seen.has(track.url)) continue;
        seen.add(track.url);
        tracks.push(track);
      }

      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return tracks.filter(track => track.kind === "music" ? isTrackVisibleInOstrify(track, user?.pubkey) : true);
    },
  });
}
