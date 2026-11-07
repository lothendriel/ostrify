import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";
import { CATEGORIES, tracksInCategory } from "@/lib/categories";

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
export function useCategoryTracks(categoryId: string | undefined) {
  const { nostr } = useNostr();
  const category = CATEGORIES.find((c) => c.id === categoryId);

  return useQuery({
    queryKey: ["category-tracks", categoryId ?? ""],
    queryFn: async (c) => {
      if (!category) return [] as Track[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(7000)]);

      // Relay-level filter on the category's keywords (hashtags are lowercase).
      const topicFilter = category.match
        .filter((kw) => !kw.includes(" ") && !kw.includes("-"))
        .slice(0, 10);

      const [tagged, general] = await Promise.all([
        nostr.query(
          [
            { kinds: [1063], "#t": topicFilter, limit: 100 },
            { kinds: [1], "#t": topicFilter, limit: 100 },
          ],
          { signal },
        ),
        // A general batch to keyword-match against (for untagged tracks).
        nostr.query(
          [
            { kinds: [1063], limit: 150 },
            { kinds: [1], limit: 150 },
          ],
          { signal },
        ),
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
      return merged;
    },
    enabled: !!category,
  });
}
