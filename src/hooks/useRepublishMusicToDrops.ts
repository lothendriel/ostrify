import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import type { NostrEvent } from "@nostrify/nostrify";
import { DROPS_MUSIC_RELAY } from "@/lib/sources";
import { getUserDataReadRelays } from "@/lib/appRelays";

export function useRepublishMusicToDrops() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const readRelays = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', config.excludedUserRelayUrls, config.excludedUserRelayPubkey).filter(url => url !== DROPS_MUSIC_RELAY);

  const tracks = useQuery({
    queryKey: ["republish-music-to-drops", user?.pubkey ?? "", readRelays.join("|"), DROPS_MUSIC_RELAY],
    enabled: false,
    queryFn: async ({ signal }) => {
      if (!user) throw new Error("Log in to load your music.");
      if (readRelays.length === 0) throw new Error("Enable at least one read relay to find your public tracks.");
      const pageSize = 200;
      const relaySignal = () => AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
      const queryAllTrackEvents = async (relay: string) => {
        const relayConnection = nostr.relay(relay);
        const events: NostrEvent[] = [];
        for (const kind of MUSIC_TRACK_KINDS) {
          let until: number | undefined;
          while (true) {
            const page = await relayConnection.query([{
              kinds: [kind],
              authors: [user.pubkey],
              limit: pageSize,
              ...(until === undefined ? {} : { until }),
            }], { signal: relaySignal() });
            events.push(...page);
            if (page.length < pageSize) break;
            const oldestTimestamp = Math.min(...page.map(event => event.created_at));
            if (!Number.isFinite(oldestTimestamp) || oldestTimestamp <= 0 || until !== undefined && oldestTimestamp >= until) break;
            until = oldestTimestamp - 1;
          }
        }
        return events;
      };
      const [readResults, dropsResult] = await Promise.all([
        Promise.allSettled(readRelays.map(relay => queryAllTrackEvents(relay))),
        queryAllTrackEvents(DROPS_MUSIC_RELAY).then(
          events => ({ events }),
          () => ({ error: true as const }),
        ),
      ]);
      if ("error" in dropsResult) throw new Error("Could not check DROPS for existing tracks. Try again when the relay is available.");
      if (readResults.every(result => result.status === "rejected")) throw new Error("Could not load your tracks from your configured read relays.");

      const dropsAddresses = new Set<string>();
      for (const event of dropsResult.events) {
        if (event.pubkey !== user.pubkey) continue;
        const track = eventToTrack(event);
        if (track?.addressableId) dropsAddresses.add(`${event.kind}:${event.pubkey}:${track.addressableId}`);
      }

      const events = readResults.flatMap(result => result.status === "fulfilled" ? result.value : []);
      const byAddress = new Map<string, Track>();
      for (const event of events) {
        if (event.pubkey !== user.pubkey) continue;
        const track = eventToTrack(event);
        if (!track?.addressableId) continue;
        const key = `${event.kind}:${event.pubkey}:${track.addressableId}`;
        if (dropsAddresses.has(key)) continue;
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
