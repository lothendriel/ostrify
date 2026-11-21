import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { CATEGORIES, tracksInCategory } from "@/lib/categories";
import { FEATURED_MUSIC_PUBKEYS, DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";
import { captureDiscoveredAudioEvents } from '@/lib/audioCatalogCapture';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';
import { queryRelaysWithGrace } from '@/lib/progressiveRelayQuery';

/**
 * Fetch tracks for a single category.
 *
 * Strategy:
 *  1. Ask relays directly for audio events tagged with the category's explicit
 *     genre aliases (`#t` filter) — this pulls in tagged music the general feed misses.
 *  2. Pull a bounded general audio batch as well, then apply strict explicit-tag
 *     mapping locally; the General shelf includes tracks without a recognized genre tag.
 *  3. Merge, de-dupe by audio URL, and sort newest first.
 */
async function queryRelays(nostr: ReturnType<typeof useNostr>["nostr"], relays: string[], filters: NostrFilter[], signal: AbortSignal) {
  const batch = await queryRelaysWithGrace(relays, (relay, relaySignal) => nostr.relay(relay).query(
    relay === DROPS_MUSIC_RELAY ? [{ kinds: [36787], limit: 250 }]
      : relay === OSTRIFY_RELAY_URL ? filters.map(filter => ({ ...filter, ...(filter.ids ? {} : { kinds: filter.kinds ? [...filter.kinds, 54] : [54] }) }))
        : filters,
    { signal: AbortSignal.any([signal, relaySignal]) },
  ), signal, 700);
  const readRelays = relays.filter(relay => relay !== DROPS_MUSIC_RELAY && relay !== OSTRIFY_RELAY_URL);
  const hasReadRelayResponse = batch.results.some(result => readRelays.includes(result.relay));
  const hasOstrifyRelayResponse = batch.results.some(result => result.relay === OSTRIFY_RELAY_URL);
  if (readRelays.length > 0 && !hasReadRelayResponse && !hasOstrifyRelayResponse) {
    throw new Error("Could not query category tracks from your configured read relays.");
  }
  return batch.results.flatMap(result => result.value);
}

export function useCategoryTracks(categoryId: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const category = CATEGORIES.find((c) => c.id === categoryId);
  const relays = [...new Set([...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url), DROPS_MUSIC_RELAY, OSTRIFY_RELAY_URL])].sort();

  return useQuery({
    queryKey: ["category-tracks", categoryId ?? "", relays.join("|"), user?.pubkey ?? "public"],
    queryFn: async (c) => {
      if (!category) return [] as Track[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(7000)]);

      // Relay-level filter for the category's explicit hashtag aliases.
      const topicFilter = category.id === "general"
        ? []
        : category.match.filter(keyword => !keyword.includes(" "));
      const topicFilters: NostrFilter[] = [];
      for (let index = 0; index < topicFilter.length; index += 10) {
        topicFilters.push({ kinds: [...MUSIC_TRACK_KINDS, 1063, 1], "#t": topicFilter.slice(index, index + 10), limit: 200 });
      }
      const taggedQuery = topicFilters.length
        ? queryRelays(nostr, relays, topicFilters, signal)
        : Promise.resolve([] as NostrEvent[]);
      // Broad batch is required for General: include audio with no recognized genre tag.
      const broadQuery = queryRelays(nostr, relays, [
        { kinds: [...MUSIC_TRACK_KINDS], limit: 250 },
        { kinds: [1063], limit: 250 },
        { kinds: [1], limit: 250 },
        { kinds: [...MUSIC_TRACK_KINDS], authors: FEATURED_MUSIC_PUBKEYS, limit: 300 },
      ], signal);
      const [tagged, general] = await Promise.all([taggedQuery, broadQuery]);
      const discoveredEvents = [...new Map([...tagged, ...general].map(event => [event.id, event])).values()];
      captureDiscoveredAudioEvents(nostr, discoveredEvents, user?.pubkey);

      const taggedTracks = tagged
        .map(eventToTrack)
        .filter((t): t is Track => t !== null);

      const generalTracks = general
        .map(eventToTrack)
        .filter((t): t is Track => t !== null);

      const matchedGeneral = tracksInCategory(generalTracks, category.id);

      // Merge + de-dupe by audio URL.
      const seen = new Set<string>();
      const merged: Track[] = [];
      for (const track of [...taggedTracks, ...matchedGeneral]) {
        if (seen.has(track.url)) continue;
        seen.add(track.url);
        merged.push(track);
      }

      merged.sort((a, b) => b.createdAt - a.createdAt);
      return tracksInCategory(merged.filter(track => isTrackVisibleInOstrify(track, user?.pubkey)), category.id);
    },
    enabled: !!category,
  });
}
