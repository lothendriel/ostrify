import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";
import { captureDiscoveredAudioEvents } from '@/lib/audioCatalogCapture';
import { getUserRelayUrls, OSTRIFY_RELAY_URL } from '@/lib/appRelays';
import { homeSessionQueryKey } from '@/lib/homeSession';

const PER_KIND_LIMIT = 100;

/** Query each configured read/write relay directly for the newest addressable music tracks. */
export function useFreshNostrTracks(enabled = true, sessionScope?: string) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const relays = [...new Set([
    ...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url),
    ...getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', 'read', config.excludedUserRelayUrls, config.excludedUserRelayPubkey),
    DROPS_MUSIC_RELAY,
    OSTRIFY_RELAY_URL,
  ])].sort();
  const relayKey = relays.join("|");

  return useQuery({
    queryKey: homeSessionQueryKey(
      sessionScope ? `${sessionScope}:${user?.pubkey ?? 'public'}` : undefined,
      ["fresh-nostr-tracks", relayKey, user?.pubkey ?? "public"],
    ),
    enabled,
    staleTime: sessionScope ? Infinity : 30_000,
    retry: false,
    refetchOnMount: sessionScope ? false : true,
    refetchOnWindowFocus: sessionScope ? false : undefined,
    queryFn: async ({ signal }) => {
      const filtersForRelay = (relay: string): NostrFilter[] => relay === DROPS_MUSIC_RELAY
        ? [{ kinds: [36787], limit: PER_KIND_LIMIT }]
        : relay === OSTRIFY_RELAY_URL
          ? [{ kinds: [...MUSIC_TRACK_KINDS, 1063, 1, 54], limit: PER_KIND_LIMIT }]
          : MUSIC_TRACK_KINDS.map(kind => ({ kinds: [kind], limit: PER_KIND_LIMIT }));
      const results = await Promise.allSettled(relays.map(async relay => {
        const eventsPromise = nostr.relay(relay).query(filtersForRelay(relay), {
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        });
        const events = relay === OSTRIFY_RELAY_URL
          ? await Promise.race([eventsPromise, new Promise<NostrEvent[]>(resolve => setTimeout(() => resolve([]), 1000))])
          : await eventsPromise;
        return { events, tracks: events.map(eventToTrack).filter((track): track is Track => !!track && track.kind === "music" && isTrackVisibleInOstrify(track, user?.pubkey)) };
      }));
      const discoveredEvents = [...new Map(results.flatMap(result => result.status === 'fulfilled' ? result.value.events : []).map(event => [event.id, event])).values()];
      captureDiscoveredAudioEvents(nostr, discoveredEvents, user?.pubkey);
      const fulfilled = results.filter((result): result is PromiseFulfilledResult<{ tracks: Track[]; events: NostrEvent[] }> => result.status === "fulfilled");
      if (!fulfilled.length && results.length) throw new Error("Could not load recent music from your configured relays.");

      const byUrl = new Map<string, Track>();
      for (const result of fulfilled) {
        for (const track of result.value.tracks) {
          const existing = byUrl.get(track.url);
          if (!existing || track.createdAt > existing.createdAt) byUrl.set(track.url, track);
        }
      }
      return [...byUrl.values()].filter(track => isTrackVisibleInOstrify(track, user?.pubkey)).sort((left, right) => right.createdAt - left.createdAt);
    },
  });
}
