import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";

interface UseTracksOptions {
  limit?: number;
  /** Filter by topic hashtag (lowercase, no #). */
  topic?: string;
  /** Restrict to a single author pubkey. */
  author?: string;
}

/**
 * Fetch music tracks from Nostr: NIP-94 audio file metadata (kind 1063)
 * and kind:1 notes carrying audio attachments.
 */
export function useTracks(options: UseTracksOptions = {}) {
  const { nostr } = useNostr();
  const { limit = 100, topic, author } = options;

  return useQuery({
    queryKey: ["tracks", limit, topic ?? "", author ?? ""],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);

      const base: Record<string, unknown> = {};
      if (topic) base["#t"] = [topic];
      if (author) base.authors = [author];

      const events = await nostr.query(
        [
          { kinds: [1063], limit, ...base },
          { kinds: [1], limit, ...base },
        ],
        { signal },
      );

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const event of events) {
        const track = eventToTrack(event);
        if (!track) continue;
        // De-dupe by audio url so the same song isn't listed twice.
        if (seen.has(track.url)) continue;
        seen.add(track.url);
        tracks.push(track);
      }

      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return tracks;
    },
  });
}
