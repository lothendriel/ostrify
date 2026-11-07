import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { eventToTrack, parsePodcastEpisodeTrack, type Track } from "@/lib/music";

export interface PodcastShow {
  pubkey: string;
  title: string;
  image?: string;
  description?: string;
  event: NostrEvent;
}

/** Hashtags that indicate an audio track is really a podcast episode. */
const PODCAST_TOPICS = [
  "podcast",
  "podcasting",
  "podcasting20",
  "episode",
  "nostrpodcast",
  "pc20",
];

/**
 * Fetch podcast episodes. Combines true NIP-F4 episodes (kind 54) with audio
 * tracks/notes tagged as podcasts, since genuine kind-54 events are still rare
 * on Nostr while plenty of podcast audio is published as kind 1 / 1063.
 */
export function usePodcastEpisodes(limit = 80) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["podcast-episodes", limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const events = await nostr.query(
        [
          // True NIP-F4 podcast episodes.
          { kinds: [54], limit },
          // Audio tracks / notes explicitly tagged as podcasts.
          { kinds: [1063, 1], "#t": PODCAST_TOPICS, limit },
        ],
        { signal },
      );

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const event of events) {
        // kind 54 has a dedicated parser; others go through the generic one.
        const track =
          event.kind === 54 ? parsePodcastEpisodeTrack(event) : eventToTrack(event);
        if (!track) continue;
        if (seen.has(track.url)) continue;
        seen.add(track.url);
        // Normalize everything shown here as a podcast.
        tracks.push({ ...track, kind: "podcast" });
      }
      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return tracks;
    },
  });
}

/** Fetch podcast show metadata (NIP-F4 kind:10154) for a set of pubkeys. */
export function usePodcastShows() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["podcast-shows"],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      const events = await nostr.query([{ kinds: [10154], limit: 60 }], { signal });

      const shows: PodcastShow[] = [];
      for (const event of events) {
        const title = event.tags.find(([n]) => n === "title")?.[1];
        if (!title) continue;
        shows.push({
          pubkey: event.pubkey,
          title,
          image: event.tags.find(([n]) => n === "image")?.[1],
          description: event.tags.find(([n]) => n === "description")?.[1],
          event,
        });
      }
      return shows;
    },
  });
}
