import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, MUSIC_TRACK_KINDS, type Track } from "@/lib/music";

/** Fetch all tracks and podcast episodes published by a given pubkey (artist). */
export function useArtistTracks(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["artist-tracks", pubkey ?? ""],
    queryFn: async (c) => {
      if (!pubkey) return [] as Track[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);

      const events = await nostr.query(
        [
          { kinds: [...MUSIC_TRACK_KINDS], authors: [pubkey], limit: 200 },
          { kinds: [1063], authors: [pubkey], limit: 200 },
          { kinds: [54], authors: [pubkey], limit: 200 },
          { kinds: [1], authors: [pubkey], limit: 200 },
        ],
        { signal },
      );

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const event of events) {
        const track = eventToTrack(event);
        if (!track) continue;
        if (seen.has(track.url)) continue;
        seen.add(track.url);
        tracks.push(track);
      }

      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return tracks;
    },
    enabled: !!pubkey,
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
    // An "album" needs at least one track; keep single-track albums too since
    // some releases genuinely are singles with an album title.
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
