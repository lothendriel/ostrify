import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrFilter } from "@nostrify/nostrify";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";
import { FEATURED_MUSIC_PUBKEYS } from "@/lib/sources";

interface UseTracksOptions {
  limit?: number;
  /** Filter by topic hashtag (lowercase, no #). */
  topic?: string;
  /** Restrict to a single author pubkey. */
  author?: string;
  /** Defer discovery until a feature explicitly needs the track pool. */
  enabled?: boolean;
}

/**
 * Fetch music tracks from Nostr: dedicated music-track kinds (Wavlake, zapstr,
 * lightning.fm, etc.), NIP-94 audio file metadata (kind 1063), and kind:1 notes
 * carrying audio attachments. Also pulls directly from featured catalog
 * publishers (e.g. Wavlake's proxy) so there's always a solid base of music.
 */
export function useTracks(options: UseTracksOptions = {}) {
  const { nostr } = useNostr();
  const { limit = 200, topic, author, enabled = true } = options;

  return useQuery({
    queryKey: ["tracks", limit, topic ?? "", author ?? ""],
    enabled,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);

      const base: Record<string, unknown> = {};
      if (topic) base["#t"] = [topic];
      if (author) base.authors = [author];

      const filters: NostrFilter[] = [
        // Dedicated music-track kinds (Wavlake, zapstr, lightning.fm, etc.)
        { kinds: [...MUSIC_TRACK_KINDS], limit, ...base },
        // NIP-94 audio file metadata
        { kinds: [1063], limit, ...base },
        // Plain notes carrying audio attachments
        { kinds: [1], limit, ...base },
      ];

      // Always pull the featured catalogs (unless a specific author is requested).
      if (!author && FEATURED_MUSIC_PUBKEYS.length > 0) {
        filters.push({
          kinds: [...MUSIC_TRACK_KINDS],
          authors: FEATURED_MUSIC_PUBKEYS,
          limit: 300,
          ...(topic ? { "#t": [topic] } : {}),
        });
      }

      const events = await nostr.query(filters, { signal });

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
