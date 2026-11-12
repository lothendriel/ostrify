import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS } from "@/lib/music";

export function useNetworkPulse() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const readRelays = config.relayMetadata.relays.filter(relay => relay.read);
  const relayKey = readRelays.map(relay => relay.url).sort().join("|");

  return useQuery({
    queryKey: ["network-pulse", relayKey],
    enabled: !!relayKey,
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      const filters: NostrFilter[] = [
        { kinds: [...MUSIC_TRACK_KINDS], since, limit: 300 },
        { kinds: [54, 1063], since, limit: 300 },
        { kinds: [1], since, limit: 300 },
      ];
      const events = await nostr.query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      const seen = new Set<string>();
      const tracks = [] as ReturnType<typeof eventToTrack>[];
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        const track = eventToTrack(event);
        if (track) tracks.push(track);
      }
      const playable = tracks.filter((track): track is NonNullable<typeof track> => track !== null);
      const dayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const recent = playable.filter(track => track.createdAt >= dayAgo);
      return {
        tracks: playable.length,
        lastDay: recent.length,
        creators: new Set(playable.map(track => track.pubkey).filter(Boolean)).size,
        music: playable.filter(track => track.kind === "music").length,
        podcasts: playable.filter(track => track.kind === "podcast").length,
        audiobooks: playable.filter(track => track.kind === "audiobook").length,
        relays: readRelays.length,
        sampledAt: Date.now(),
      };
    },
  });
}
