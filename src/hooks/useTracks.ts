import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrFilter } from "@nostrify/nostrify";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { FEATURED_MUSIC_PUBKEYS, DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";

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
  const readRelays = [...new Set([...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url), DROPS_MUSIC_RELAY])].sort();
  const { limit = 200, topic, author, authors, enabled = true } = options;
  const authorKey = authors?.slice().sort().join('|') ?? '';

  return useQuery({
    queryKey: ["tracks", limit, topic ?? "", author ?? "", authorKey, readRelays.join("|"), user?.pubkey ?? "public"],
    staleTime: author || authors?.length ? 60_000 : 0,
    enabled,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const base: Record<string, unknown> = {};
      if (topic) base["#t"] = [topic];
      if (author) base.authors = [author];
      else if (authors?.length) base.authors = authors;

      const filtersForRelay = (relay: string): NostrFilter[] => {
        if (relay === DROPS_MUSIC_RELAY) return [{ kinds: [36787], limit, ...base }];
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
      const results = await Promise.allSettled(readRelays.map(relay => nostr.relay(relay).query(filtersForRelay(relay), { signal })));
      const events = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
      if (!results.some(result => result.status === "fulfilled")) throw new Error("Could not load tracks from your read relays or DROPS.");

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const event of events) {
        const track = eventToTrack(event);
        if (!track) continue;
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
