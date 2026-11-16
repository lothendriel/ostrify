import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { DROPS_MUSIC_RELAY } from "@/lib/sources";

export function useRepublishMusicToDrops() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const readRelays = [...new Set([...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url), DROPS_MUSIC_RELAY])].sort();

  const tracks = useQuery({
    queryKey: ["republish-music-to-drops", user?.pubkey ?? "", readRelays.join("|")],
    enabled: false,
    queryFn: async ({ signal }) => {
      if (!user) throw new Error("Log in to load your music.");
      const filters = MUSIC_TRACK_KINDS.map(kind => ({ kinds: [kind], authors: [user.pubkey], limit: 500 }));
      const results = await Promise.allSettled(readRelays.map(relay => nostr.relay(relay).query(filters, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      })));
      if (results.every(result => result.status === "rejected")) throw new Error("Could not load your tracks from your read relays or DROPS.");
      const events = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
      const byAddress = new Map<string, Track>();
      for (const event of events) {
        if (event.pubkey !== user.pubkey) continue;
        const track = eventToTrack(event);
        if (!track?.addressableId) continue;
        const key = `${event.kind}:${event.pubkey}:${track.addressableId}`;
        const current = byAddress.get(key);
        if (!current || track.createdAt > current.createdAt) byAddress.set(key, track);
      }
      return [...byAddress.values()].filter(track => track.visibility !== "hidden").sort((left, right) => right.createdAt - left.createdAt);
    },
  });

  const publish = useMutation({
    mutationFn: async ({ track, visibility = "public" }: { track: Track; visibility?: "public" | "hidden" }) => {
      if (!user || track.pubkey !== user.pubkey || !track.event) throw new Error("Only your own published tracks can be sent to DROPS.");
      if (visibility === "hidden") throw new Error("Hidden tracks are not sent to DROPS.");
      await nostr.relay(DROPS_MUSIC_RELAY).event(track.event, { signal: AbortSignal.timeout(8000) });
      return track.id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fresh-nostr-tracks"] });
      await queryClient.invalidateQueries({ queryKey: ["home-tracks"] });
    },
  });

  return { tracks, publish };
}
