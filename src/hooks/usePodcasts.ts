import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { parsePodcastEpisodeTrack, type Track } from "@/lib/music";

export interface PodcastShow {
  pubkey: string;
  title: string;
  image?: string;
  description?: string;
  event: NostrEvent;
}

/** Fetch recent podcast episodes (NIP-F4 kind:54). */
export function usePodcastEpisodes(limit = 60) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["podcast-episodes", limit],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      const events = await nostr.query([{ kinds: [54], limit }], { signal });

      const tracks: Track[] = [];
      for (const event of events) {
        const track = parsePodcastEpisodeTrack(event);
        if (track) tracks.push(track);
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
