import { useNostr } from "@nostrify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "./useCurrentUser";
import { useNostrPublish } from "./useNostrPublish";
import { wavlakeTrackId, wavlakeTrackUrl } from "./useWavlake";
import { fountainTrackId, fountainTrackUrl } from "./usePodcasts";
import { isOstrifyMusicPlaylist, MUSIC_PLAYLIST_TOPIC, LIKED_TRACKS_IDENTIFIER } from '@/lib/musicPlaylists';

export const LIKED_SONGS_ID = LIKED_TRACKS_IDENTIFIER;
const PLAYLIST_KIND = 30003; // NIP-51 bookmark set

export interface Playlist {
  id: string; // d-tag
  title: string;
  description?: string;
  image?: string;
  /** Stable event or external catalog ids for tracks in this playlist. */
  trackIds: string[];
  event: NostrEvent;
  isLiked: boolean;
}

function parsePlaylist(event: NostrEvent): Playlist | null {
  const d = event.tags.find(([n]) => n === "d")?.[1];
  if (!d) return null;
  return {
    id: d,
    title: event.tags.find(([n]) => n === "title")?.[1] || (d === LIKED_SONGS_ID ? "Liked Songs" : "Untitled Playlist"),
    description: event.tags.find(([n]) => n === "description")?.[1],
    image: event.tags.find(([n]) => n === "image")?.[1],
    trackIds: event.tags.flatMap(([name, value]) => {
      if (name === "e" && value) return [value];
      const wavlake = name === "i" && value ? wavlakeTrackId(value) : undefined;
      const fountain = name === "i" && value ? fountainTrackId(value) : undefined;
      return wavlake ? [wavlake] : fountain ? [fountain] : [];
    }),
    event,
    isLiked: d === LIKED_SONGS_ID,
  };
}

/** Fetch all of the current user's playlists (kind 30003 bookmark sets). */
export function usePlaylists() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ["playlists", user?.pubkey ?? ""],
    queryFn: async (c) => {
      if (!user) return [] as Playlist[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [{ kinds: [PLAYLIST_KIND], authors: [user.pubkey], limit: 100 }],
        { signal },
      );
      const playlists = events
        .filter(event => event.pubkey === user.pubkey && isOstrifyMusicPlaylist(event))
        .map(parsePlaylist)
        .filter((p): p is Playlist => p !== null);
      // Liked songs first, then newest.
      playlists.sort((a, b) => {
        if (a.isLiked) return -1;
        if (b.isLiked) return 1;
        return b.event.created_at - a.event.created_at;
      });
      return playlists;
    },
    enabled: !!user,
  });
}

/** Fetch a single playlist by its d-tag for the current user. */
export function usePlaylist(id: string | undefined) {
  const { data: playlists, ...rest } = usePlaylists();
  return {
    ...rest,
    data: playlists?.find((p) => p.id === id),
  };
}

function buildPlaylistEvent(
  playlist: Partial<Playlist> & { id: string; title: string; trackIds: string[] },
): { kind: number; content: string; tags: string[][] } {
  const existing = playlist.event;
  const tags: string[][] = existing ? existing.tags.filter(([name, value]) =>
    !['d', 'title', 'description', 'image'].includes(name) && !(name === 'e' && !!value) && !(name === 'i' && !!value && (!!wavlakeTrackId(value) || !!fountainTrackId(value)))
  ).map((tag) => [...tag]) : [];
  tags.unshift(["d", playlist.id], ["title", playlist.title]);
  if (!tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC)) tags.push(['t', MUSIC_PLAYLIST_TOPIC]);
  if (playlist.description) tags.push(["description", playlist.description]);
  if (playlist.image) tags.push(["image", playlist.image]);
  for (const id of playlist.trackIds) {
    const url = wavlakeTrackUrl(id) ?? fountainTrackUrl(id);
    const previous = existing?.tags.find(([name, value]) => url ? name === 'i' && value === url : name === 'e' && value === id);
    if (previous) tags.push([...previous]);
    else if (url) tags.push(['i', url]);
    else if (/^[0-9a-f]{64}$/i.test(id)) tags.push(['e', id]);
  }
  return { kind: PLAYLIST_KIND, content: existing?.content ?? "", tags };
}

/** Mutations for creating / updating playlists and toggling likes. */
export function usePlaylistActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["playlists", user?.pubkey ?? ""] });

  const publishPlaylist = async (template: { kind: number; content: string; tags: string[][] }) => {
    const event = await publish(template);
    const playlist = parsePlaylist(event);
    if (playlist && user) queryClient.setQueryData<Playlist[]>(['playlists', user.pubkey], (current) => [
      playlist, ...(current ?? []).filter((item) => item.id !== playlist.id),
    ]);
  };

  async function fetchExisting(id: string): Promise<Playlist | undefined> {
    if (!user) return undefined;
    // Prefer cache, fall back to network.
    const cached = queryClient.getQueryData<Playlist[]>(["playlists", user.pubkey]);
    const fromCache = cached?.find((p) => p.id === id);
    if (fromCache) return fromCache;
    const events = await nostr.query(
      [{ kinds: [PLAYLIST_KIND], authors: [user.pubkey], "#d": [id], limit: 1 }],
      { signal: AbortSignal.timeout(4000) },
    );
    return events[0] ? parsePlaylist(events[0]) ?? undefined : undefined;
  }

  const createPlaylist = useMutation({
    mutationFn: async (input: { title: string; description?: string; image?: string; id?: string }) => {
      const id = input.id ?? `playlist-${crypto.randomUUID().slice(0, 8)}`;
      await publishPlaylist(
        buildPlaylistEvent({ id, title: input.title, description: input.description, image: input.image, trackIds: [] }),
      );
      return id;
    },
    onSuccess: invalidate,
  });

  const updatePlaylist = useMutation({
    mutationFn: async (input: { id: string; title: string; description?: string; image?: string }) => {
      const existing = await fetchExisting(input.id);
      await publishPlaylist(
        buildPlaylistEvent({
          event: existing?.event,
          id: input.id,
          title: input.title,
          description: input.description,
          image: input.image,
          trackIds: existing?.trackIds ?? [],
        }),
      );
    },
    onSuccess: invalidate,
  });

  const addToPlaylist = useMutation({
    mutationFn: async (input: { playlistId: string; trackId: string }) => {
      const existing = await fetchExisting(input.playlistId);
      const trackIds = existing?.trackIds ?? [];
      if (trackIds.includes(input.trackId)) return;
      await publishPlaylist(
        buildPlaylistEvent({
          event: existing?.event,
          id: input.playlistId,
          title: existing?.title ?? "Untitled Playlist",
          description: existing?.description,
          image: existing?.image,
          trackIds: [...trackIds, input.trackId],
        }),
      );
    },
    onSuccess: invalidate,
  });

  const removeFromPlaylist = useMutation({
    mutationFn: async (input: { playlistId: string; trackId: string }) => {
      const existing = await fetchExisting(input.playlistId);
      if (!existing) return;
      await publishPlaylist(
        buildPlaylistEvent({
          event: existing?.event,
          id: input.playlistId,
          title: existing.title,
          description: existing.description,
          image: existing.image,
          trackIds: existing.trackIds.filter((t) => t !== input.trackId),
        }),
      );
    },
    onSuccess: invalidate,
  });

  const toggleLike = useMutation({
    mutationFn: async (input: { trackId: string; liked: boolean }) => {
      const existing = await fetchExisting(LIKED_SONGS_ID);
      const trackIds = existing?.trackIds ?? [];
      const has = trackIds.includes(input.trackId);
      let next = trackIds;
      if (input.liked && !has) next = [...trackIds, input.trackId];
      else if (!input.liked && has) next = trackIds.filter((t) => t !== input.trackId);
      else return;
      await publishPlaylist(
        buildPlaylistEvent({
          event: existing?.event,
          id: LIKED_SONGS_ID,
          title: "Liked Songs",
          description: existing?.description ?? "Your favorite tracks on Nostr",
          trackIds: next,
        }),
      );
    },
    onSuccess: invalidate,
  });

  return {
    createPlaylist,
    updatePlaylist,
    addToPlaylist,
    removeFromPlaylist,
    toggleLike,
    isReady: !!user,
  };
}

/** Convenience hook: is a given track in the user's Liked Songs? */
export function useIsLiked(trackId: string): boolean {
  const { data: playlists } = usePlaylists();
  const liked = playlists?.find((p) => p.isLiked);
  return !!liked?.trackIds.includes(trackId);
}
