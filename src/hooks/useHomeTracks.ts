import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { FEATURED_MUSIC_PUBKEYS, DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";

const RELAY_LIMIT = 100;
const FEATURED_LIMIT = 300;
const MUSIC_TOPICS = ["music", "tunestr", "song", "wavlake", "v4v", "value4value"];

interface HomeTracksResult {
  tracks: Track[];
  failedRelays: string[];
  succeededRelays: number;
}

/** Gather Home music independently from every read relay and retain partial results. */
export function useHomeTracks(enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const relays = [...new Set([...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url), DROPS_MUSIC_RELAY])].sort();
  const relayKey = relays.join("|");

  return useQuery({
    queryKey: ["home-tracks", relayKey, user?.pubkey ?? "public"],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<HomeTracksResult> => {
      const filtersForRelay = (relay: string): NostrFilter[] => {
        const filters: NostrFilter[] = relay === DROPS_MUSIC_RELAY
          ? [{ kinds: [36787], limit: RELAY_LIMIT }]
          : [
            { kinds: [...MUSIC_TRACK_KINDS], limit: RELAY_LIMIT },
            { kinds: [1063], limit: RELAY_LIMIT },
            { kinds: [1], limit: RELAY_LIMIT, "#t": MUSIC_TOPICS },
          ];
        if (relay !== DROPS_MUSIC_RELAY && FEATURED_MUSIC_PUBKEYS.length) {
          filters.push({ kinds: [...MUSIC_TRACK_KINDS], authors: FEATURED_MUSIC_PUBKEYS, limit: FEATURED_LIMIT });
        }
        return filters;
      };

      const results = await Promise.all(relays.map(async relay => {
        try {
          const events = await nostr.relay(relay).query(filtersForRelay(relay), {
            signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          });
          return { relay, ok: true, tracks: events.map(eventToTrack).filter((track): track is Track => !!track) };
        } catch (error) {
          if (signal.aborted) throw error;
          return { relay, ok: false, tracks: [] as Track[] };
        }
      }));

      const successful = results.filter(result => result.ok);
      const failedRelays = results.filter(result => !result.ok && result.relay !== DROPS_MUSIC_RELAY).map(result => result.relay);
      if (!successful.length) {
        throw new Error(relays.length ? "Could not load music from any configured read relay or DROPS." : "Could not load music from DROPS.");
      }

      const byUrl = new Map<string, Track>();
      for (const track of successful.flatMap(result => result.tracks)) {
        const current = byUrl.get(track.url);
        if (!current || track.createdAt > current.createdAt) byUrl.set(track.url, track);
      }
      return {
        tracks: [...byUrl.values()].filter(track => isTrackVisibleInOstrify(track, user?.pubkey)).sort((left, right) => right.createdAt - left.createdAt),
        failedRelays,
        succeededRelays: successful.length,
      };
    },
  });
}
