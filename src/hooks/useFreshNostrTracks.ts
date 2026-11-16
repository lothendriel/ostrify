import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";

const PER_KIND_LIMIT = 100;

/** Query each configured read/write relay directly for the newest addressable music tracks. */
export function useFreshNostrTracks() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const relays = [...new Set(config.relayMetadata.relays
    .filter(relay => relay.read || relay.write)
    .map(relay => relay.url))].sort();
  const relayKey = relays.join("|");

  return useQuery({
    queryKey: ["fresh-nostr-tracks", relayKey],
    enabled: relays.length > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const filters: NostrFilter[] = MUSIC_TRACK_KINDS.map(kind => ({ kinds: [kind], limit: PER_KIND_LIMIT }));
      const results = await Promise.allSettled(relays.map(async relay => {
        const events = await nostr.relay(relay).query(filters, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        });
        return events.map(eventToTrack).filter((track): track is Track => !!track && track.kind === "music");
      }));
      const fulfilled = results.filter((result): result is PromiseFulfilledResult<Track[]> => result.status === "fulfilled");
      if (!fulfilled.length && results.length) throw new Error("Could not load recent music from your configured relays.");

      const byUrl = new Map<string, Track>();
      for (const result of fulfilled) {
        for (const track of result.value) {
          const existing = byUrl.get(track.url);
          if (!existing || track.createdAt > existing.createdAt) byUrl.set(track.url, track);
        }
      }
      return [...byUrl.values()].sort((left, right) => right.createdAt - left.createdAt);
    },
  });
}
