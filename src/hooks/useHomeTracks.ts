import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { CATEGORIES } from "@/lib/categories";
import { FEATURED_MUSIC_PUBKEYS, DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";
import { captureDiscoveredAudioEvents } from '@/lib/audioCatalogCapture';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';
import { homeSessionQueryKey } from '@/lib/homeSession';

const RELAY_LIMIT = 150;
const FEATURED_LIMIT = 250;
const HOME_GENRE_TOPICS = [...new Set(CATEGORIES.flatMap(category => category.match.filter(topic => !topic.includes(" ")).slice(0, 2)))].filter(topic => topic.length <= 30);
const HOME_RELAY_GRACE_MS = 1500;
const MUSIC_TOPICS = ["music", "tunestr", "song", "wavlake", "v4v", "value4value"];

function waitForRelayStart(signal: AbortSignal, relayIndex: number): Promise<void> {
  const delayMs = Math.min(relayIndex * 120, 600);
  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

interface HomeTracksResult {
  tracks: Track[];
  failedRelays: string[];
  succeededRelays: number;
}

/** Gather Home music independently from every read relay and retain partial results. */
export function useHomeTracks(enabled = true, sessionScope?: string) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const relays = [...new Set([...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url), DROPS_MUSIC_RELAY, OSTRIFY_RELAY_URL])].sort();
  const relayKey = relays.join("|");

  return useQuery({
    queryKey: homeSessionQueryKey(
      sessionScope ? `${sessionScope}:${user?.pubkey ?? 'public'}` : undefined,
      ["home-tracks", relayKey, user?.pubkey ?? "public"],
    ),
    enabled,
    staleTime: sessionScope ? Infinity : 60_000,
    refetchOnMount: sessionScope ? false : true,
    refetchOnWindowFocus: sessionScope ? false : undefined,
    retry: false,
    queryFn: async ({ signal }): Promise<HomeTracksResult> => {
      const filtersForRelay = (relay: string): NostrFilter[] => {
        const filters: NostrFilter[] = relay === DROPS_MUSIC_RELAY
          ? [{ kinds: [36787], limit: RELAY_LIMIT }]
          : relay === OSTRIFY_RELAY_URL
            ? [{ kinds: [...MUSIC_TRACK_KINDS, 1063, 1, 54], limit: RELAY_LIMIT }]
            : [
              { kinds: [...MUSIC_TRACK_KINDS], limit: RELAY_LIMIT },
              { kinds: [1063], limit: RELAY_LIMIT },
              { kinds: [1], limit: RELAY_LIMIT, "#t": MUSIC_TOPICS },
            ];
        if (relay !== DROPS_MUSIC_RELAY && relay !== OSTRIFY_RELAY_URL && FEATURED_MUSIC_PUBKEYS.length) {
          filters.push({ kinds: [...MUSIC_TRACK_KINDS], authors: FEATURED_MUSIC_PUBKEYS, limit: FEATURED_LIMIT });
        }
        for (let index = 0; index < HOME_GENRE_TOPICS.length; index += 10) {
          filters.push({ kinds: [...MUSIC_TRACK_KINDS, 1063], "#t": HOME_GENRE_TOPICS.slice(index, index + 10), limit: RELAY_LIMIT });
        }
        return filters;
      };

      const relayController = new AbortController();
      const relaySignal = AbortSignal.any([signal, relayController.signal]);
      const results = relays.map(relay => ({
        relay,
        ok: false,
        events: [] as NostrEvent[],
        tracks: [] as Track[],
      }));
      const requests = relays.map(async (relay, index) => {
        try {
          await waitForRelayStart(relaySignal, index);
          const eventsPromise = nostr.relay(relay).query(filtersForRelay(relay), {
            signal: AbortSignal.any([relaySignal, AbortSignal.timeout(8000)]),
          });
          const events = relay === OSTRIFY_RELAY_URL
            ? await Promise.race([eventsPromise, new Promise<NostrEvent[]>(resolve => setTimeout(() => resolve([]), 1000))])
            : await eventsPromise;
          results[index] = { relay, ok: true, events, tracks: events.map(eventToTrack).filter((track): track is Track => !!track) };
        } catch (error) {
          if (signal.aborted) throw error;
        }
      });
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const firstResponse = await Promise.race([
        Promise.any(requests.map(async (_request, index) => {
          await requests[index];
          if (!results[index].ok) throw new Error('Relay did not respond.');
          return true;
        })),
        new Promise<false>(resolve => { graceTimer = setTimeout(() => resolve(false), HOME_RELAY_GRACE_MS); }),
      ]).catch(() => false);
      if (graceTimer) clearTimeout(graceTimer);
      if (firstResponse && requests.some((_, index) => !results[index].ok)) {
        await Promise.race([
          Promise.allSettled(requests),
          new Promise<void>(resolve => { graceTimer = setTimeout(resolve, HOME_RELAY_GRACE_MS); }),
        ]);
        if (graceTimer) clearTimeout(graceTimer);
      }
      if (signal.aborted) throw signal.reason;
      relayController.abort();

      const discoveredEvents = [...new Map(results.flatMap(result => result.ok ? result.events : []).map(event => [event.id, event])).values()];
      captureDiscoveredAudioEvents(nostr, discoveredEvents, user?.pubkey);
      const successful = results.filter(result => result.ok);
      const failedRelays = results.filter(result => !result.ok && result.relay !== DROPS_MUSIC_RELAY && result.relay !== OSTRIFY_RELAY_URL).map(result => result.relay);
      if (!successful.some(result => result.relay !== OSTRIFY_RELAY_URL)) {
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
        succeededRelays: successful.filter(result => result.relay !== OSTRIFY_RELAY_URL).length,
      };
    },
  });
}
