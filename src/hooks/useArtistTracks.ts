import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrFilter } from "@nostrify/nostrify";
import { useAppContext } from "@/hooks/useAppContext";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";

const ARTIST_TRACK_KINDS = [...MUSIC_TRACK_KINDS, 1063, 54, 1];
const ARTIST_TRACK_LIMIT = 500;
const MUSIC_TOPICS = ['music', 'tunestr', 'song', 'wavlake', 'v4v', 'value4value'];

/** Fetch a broad, relay-by-relay set of audio published by an artist/publisher. */
export function useArtistTracks(pubkey: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const readRelays = [...new Set(config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url))].sort();

  return useQuery({
    queryKey: ["artist-tracks", pubkey ?? "", readRelays.join("|")],
    enabled: !!pubkey && readRelays.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!pubkey) return [] as Track[];
      const timeoutSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
      const filters: NostrFilter[] = ARTIST_TRACK_KINDS.map(kind => ({
        kinds: [kind],
        authors: [pubkey],
        limit: ARTIST_TRACK_LIMIT,
      }));
      // `useMusicDiscovery` also finds kind-1 audio notes through music topic tags;
      // query that same discovery path here so publisher pages do not miss them.
      filters.push({ kinds: [1], authors: [pubkey], '#t': MUSIC_TOPICS, limit: ARTIST_TRACK_LIMIT });
      const relayResults = await Promise.allSettled(readRelays.map(url =>
        nostr.relay(url).query(filters, { signal: timeoutSignal }),
      ));
      if (relayResults.every(result => result.status === "rejected")) {
        throw new Error("Could not load audio published by this account from your read relays.");
      }

      const byUrl = new Map<string, Track>();
      for (const result of relayResults) {
        if (result.status !== "fulfilled") continue;
        for (const event of result.value) {
          if (event.pubkey !== pubkey) continue;
          const track = eventToTrack(event);
          if (track) byUrl.set(track.url, track);
        }
      }
      return [...byUrl.values()].sort((a, b) => b.createdAt - a.createdAt);
    },
  });
}

export interface AlbumGroup {
  /** Album title, or undefined for the "singles" bucket. */
  title: string | undefined;
  tracks: Track[];
  /** Representative cover image for the album. */
  image?: string;
}

/** Group an artist's tracks into albums (by album title) plus loose singles. */
export function groupIntoAlbums(tracks: Track[]): { albums: AlbumGroup[]; singles: Track[] } {
  const byAlbum = new Map<string, Track[]>();
  const singles: Track[] = [];

  for (const track of tracks) {
    const album = track.album?.trim();
    if (album) {
      const existing = byAlbum.get(album);
      if (existing) existing.push(track);
      else byAlbum.set(album, [track]);
    } else {
      singles.push(track);
    }
  }

  const albums: AlbumGroup[] = [...byAlbum.entries()]
    .map(([title, albumTracks]) => ({
      title,
      tracks: albumTracks.sort((a, b) => a.createdAt - b.createdAt),
      image: albumTracks.find((t) => t.image)?.image,
    }))
    .sort((a, b) => {
      const aLatest = Math.max(...a.tracks.map((t) => t.createdAt));
      const bLatest = Math.max(...b.tracks.map((t) => t.createdAt));
      return bLatest - aLatest;
    });

  return { albums, singles };
}
