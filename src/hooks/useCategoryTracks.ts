import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent, NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { CATEGORIES, tracksInCategory } from "@/lib/categories";
import { FEATURED_MUSIC_PUBKEYS, DROPS_MUSIC_RELAY } from "@/lib/sources";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";

/**
 * Fetch tracks for a single category.
 *
 * Strategy:
 *  1. Ask relays directly for audio events tagged with the category's keywords
 *     (`#t` filter) — this pulls in genre-tagged music the general feed misses.
 *  2. Also pull a batch of the general audio feed and keyword-match it, so
 *     untagged tracks whose title/content mention the genre still show up.
 *  3. Merge, de-dupe by audio URL, and sort newest first.
 */
async function queryRelays(nostr: ReturnType<typeof useNostr>["nostr"], relays: string[], filters: NostrFilter[], signal: AbortSignal) {
  const results = await Promise.allSettled(relays.map(relay => nostr.relay(relay).query(relay === DROPS_MUSIC_RELAY ? [{ kinds: [36787], limit: 250 }] : filters, { signal })));
  const readRelayResults = results.filter((_result, index) => relays[index] !== DROPS_MUSIC_RELAY);
  const fulfilled = results.filter((result): result is PromiseFulfilledResult<NostrEvent[]> => result.status === "fulfilled");
  if (readRelayResults.length > 0 && readRelayResults.every(result => result.status === "rejected")) throw new Error("Could not query category tracks from your configured read relays.");
  return fulfilled.flatMap(result => result.value);
}

export function useCategoryTracks(categoryId: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const category = CATEGORIES.find((c) => c.id === categoryId);
  const relays = [...new Set([...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url), DROPS_MUSIC_RELAY])].sort();

  return useQuery({
    queryKey: ["category-tracks", categoryId ?? "", relays.join("|"), user?.pubkey ?? "public"],
    queryFn: async (c) => {
      if (!category) return [] as Track[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(7000)]);

      // Relay-level filter on the category's keywords (hashtags are lowercase).
      const topicFilter = category.match
        .filter((kw) => !kw.includes(" ") && !kw.includes("-"))
        .slice(0, 10);

      const [tagged, general] = await Promise.all([
        queryRelays(nostr, relays, [
          { kinds: [...MUSIC_TRACK_KINDS], "#t": topicFilter, limit: 200 },
          { kinds: [1063], "#t": topicFilter, limit: 200 },
          { kinds: [1], "#t": topicFilter, limit: 200 },
        ], signal),
        // A general batch to keyword-match against (for untagged tracks), plus the
        // featured catalogs so big publishers (Wavlake) are always represented.
        queryRelays(nostr, relays, [
          { kinds: [...MUSIC_TRACK_KINDS], limit: 250 },
          { kinds: [1063], limit: 250 },
          { kinds: [1], limit: 250 },
          { kinds: [...MUSIC_TRACK_KINDS], authors: FEATURED_MUSIC_PUBKEYS, limit: 300 },
        ], signal),
      ]);

      const taggedTracks = tagged
        .map(eventToTrack)
        .filter((t): t is Track => t !== null);

      const generalTracks = general
        .map(eventToTrack)
        .filter((t): t is Track => t !== null);

      // Keyword-match the general feed to the category.
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
      return merged.filter(track => isTrackVisibleInOstrify(track, user?.pubkey));
    },
    enabled: !!category,
  });
}
