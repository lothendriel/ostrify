import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { FEATURED_MUSIC_PUBKEYS } from "@/lib/sources";

const RELAY_LIMIT = 100;
const FEATURED_LIMIT = 300;
const MUSIC_TOPICS = ["music", "tunestr", "song", "wavlake", "v4v", "value4value"];

interface HomeTracksResult {
  tracks: Track[];
  failedRelays: string[];
  succeededRelays: number;
}

/** Gather Home music independently from every read relay and retain partial results. */
export function useHomeTracks() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const relays = [...new Set(config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url))].sort();
  const relayKey = relays.join("|");

  return useQuery({
    queryKey: ["home-tracks", relayKey],
    enabled: true,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<HomeTracksResult> => {
      const filters: NostrFilter[] = [
        { kinds: [...MUSIC_TRACK_KINDS], limit: RELAY_LIMIT },
        { kinds: [1063], limit: RELAY_LIMIT },
        { kinds: [1], limit: RELAY_LIMIT, "#t": MUSIC_TOPICS },
      ];
      if (FEATURED_MUSIC_PUBKEYS.length) {
        filters.push({ kinds: [...MUSIC_TRACK_KINDS], authors: FEATURED_MUSIC_PUBKEYS, limit: FEATURED_LIMIT });
      }

      const results = await Promise.all(relays.map(async relay => {
        try {
          const events = await nostr.relay(relay).query(filters, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          });
          return { relay, ok: true, tracks: events.map(eventToTrack).filter((track): track is Track => !!track) };
        } catch (error) {
          if (signal.aborted) throw error;
          return { relay, ok: false, tracks: [] as Track[] };
        }
      }));

      const successful = results.filter(result => result.ok);
      const failedRelays = results.filter(result => !result.ok).map(result => result.relay);
      if (!successful.length) {
        throw new Error(relays.length ? "Could not load music from any configured read relay." : "No read relays are enabled. Add a read relay to load genre shelves.");
      }

      const byUrl = new Map<string, Track>();
      for (const track of successful.flatMap(result => result.tracks)) {
        const current = byUrl.get(track.url);
        if (!current || track.createdAt > current.createdAt) byUrl.set(track.url, track);
      }
      return {
        tracks: [...byUrl.values()].sort((left, right) => right.createdAt - left.createdAt),
        failedRelays,
        succeededRelays: successful.length,
      };
    },
  });
}
