import { useNostr } from "@nostrify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { useNostrPublish } from "./useNostrPublish";
import { wavlakeTrackId, wavlakeTrackUrl } from "./useWavlake";
import { fountainTrackId, fountainTrackUrl, podcastIndexTrackId, podcastIndexTrackUrl } from "./usePodcasts";
import { isOstrifyMusicPlaylist, MUSIC_PLAYLIST_TOPIC, LIKED_TRACKS_IDENTIFIER } from '@/lib/musicPlaylists';
import { eventToTrack, MUSIC_TRACK_KINDS } from '@/lib/music';
import { sanitizeUrl } from '@/lib/sanitize';
import { useToast } from './useToast';
import { queryLibraryEvents } from '@/lib/libraryQuery';

export const LIKED_SONGS_ID = LIKED_TRACKS_IDENTIFIER;
const PLAYLIST_KIND = 30003; // NIP-51 bookmark set
const PLAYLIST_DELETION_STORAGE_PREFIX = 'nostr:deleted-playlists:v1:';

type PlaylistDeletionTombstones = Record<string, number>;

function playlistCoordinate(pubkey: string, id: string): string {
  return `30003:${pubkey}:${id}`;
}

function readPlaylistDeletionTombstones(pubkey: string): PlaylistDeletionTombstones {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(`${PLAYLIST_DELETION_STORAGE_PREFIX}${pubkey}`) ?? '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([coordinate, timestamp]) =>
      coordinate.startsWith(`30003:${pubkey}:`) && typeof timestamp === 'number' && Number.isSafeInteger(timestamp) && timestamp > 0,
    ));
  } catch {
    return {};
  }
}

export function rememberPlaylistDeletion(pubkey: string, id: string, timestamp: number): void {
  const tombstones = readPlaylistDeletionTombstones(pubkey);
  tombstones[playlistCoordinate(pubkey, id)] = Math.max(timestamp, tombstones[playlistCoordinate(pubkey, id)] ?? 0);
  try {
    localStorage.setItem(`${PLAYLIST_DELETION_STORAGE_PREFIX}${pubkey}`, JSON.stringify(tombstones));
  } catch {
    // The signed NIP-09 deletion event remains authoritative when local storage is unavailable.
  }
}

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
      const podcastIndex = name === "i" && value ? podcastIndexTrackId(value) : undefined;
      return wavlake ? [wavlake] : fountain ? [fountain] : podcastIndex ? [podcastIndex] : [];
    }),
    event,
    isLiked: d === LIKED_SONGS_ID,
  };
}

/** Fetch all of the current user's playlists (kind 30003 bookmark sets). */
export function usePlaylists() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const readRelayKey = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join("|");
  const queryKey = ["playlists", user?.pubkey ?? "", readRelayKey];

  return useQuery<Playlist[]>({
    queryKey,
    select: (playlists: Playlist[]) => {
      if (!user) return playlists;
      const tombstones = readPlaylistDeletionTombstones(user.pubkey);
      return playlists.filter(playlist => {
        const deletedAt = tombstones[playlistCoordinate(user.pubkey, playlist.id)];
        return deletedAt === undefined || playlist.event.created_at > deletedAt;
      });
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    placeholderData: (previousData: Playlist[] | undefined, previousQuery) => {
      if (previousQuery?.queryKey[1] !== user?.pubkey || !user) return undefined;
      const tombstones = readPlaylistDeletionTombstones(user.pubkey);
      return previousData?.filter(playlist => {
        const deletedAt = tombstones[playlistCoordinate(user.pubkey, playlist.id)];
        return deletedAt === undefined || playlist.event.created_at > deletedAt;
      });
    },
    queryFn: async (c) => {
      if (!user) return [] as Playlist[];
      if (!readRelayKey) return [] as Playlist[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const { events, complete } = await queryLibraryEvents(
        nostr,
        readRelayKey.split("|"),
        [
          { kinds: [PLAYLIST_KIND], authors: [user.pubkey], limit: 100 },
          { kinds: [5], authors: [user.pubkey], limit: 200 },
        ],
        signal,
      );
      const tombstones = readPlaylistDeletionTombstones(user.pubkey);
      const deletionEvents = events.filter(event => event.kind === 5 && event.pubkey === user.pubkey);
      const cache = new Map((queryClient.getQueryData<Playlist[]>(queryKey) ?? []).map(playlist => [playlist.id, playlist]));
      for (const deletion of deletionEvents) {
        for (const [name, value] of deletion.tags) {
          if (name === 'a' && value.startsWith(`30003:${user.pubkey}:`)) {
            const id = value.slice(`30003:${user.pubkey}:`.length);
            const coordinate = playlistCoordinate(user.pubkey, id);
            if (id && (!tombstones[coordinate] || deletion.created_at > tombstones[coordinate])) {
              tombstones[coordinate] = deletion.created_at;
              rememberPlaylistDeletion(user.pubkey, id, deletion.created_at);
            }
          }
          if (name === 'd' && value && deletion.tags.some(([tagName, coordinate]) => tagName === 'a' && coordinate === `30003:${user.pubkey}:${value}`)) {
            const coordinate = playlistCoordinate(user.pubkey, value);
            if (!tombstones[coordinate] || deletion.created_at > tombstones[coordinate]) {
              tombstones[coordinate] = deletion.created_at;
              rememberPlaylistDeletion(user.pubkey, value, deletion.created_at);
            }
          }
        }
      }
      const relayEvents = events.filter(event => event.pubkey === user.pubkey && event.kind === PLAYLIST_KIND && isOstrifyMusicPlaylist(event));
      const newerRelayEvents = new Map<string, NostrEvent>();
      for (const event of relayEvents) {
        const id = event.tags.find(([name]) => name === 'd')?.[1];
        if (!id) continue;
        const cachedEvent = cache.get(id)?.event;
        const current = newerRelayEvents.get(id);
        const newest = [event, current, cachedEvent].filter((candidate): candidate is NostrEvent => !!candidate).sort((left, right) => right.created_at - left.created_at)[0];
        if (newest) newerRelayEvents.set(id, newest);
      }
      for (const [id, cached] of cache) {
        if (!newerRelayEvents.has(id)) newerRelayEvents.set(id, cached.event);
      }
      const playlists = [...newerRelayEvents.values()].filter(event => {
        const id = event.tags.find(([name]) => name === 'd')?.[1];
        if (!id) return false;
        const deletedAt = tombstones[playlistCoordinate(user.pubkey, id)];
        return deletedAt === undefined || event.created_at > deletedAt;
      }).map(parsePlaylist).filter((playlist): playlist is Playlist => playlist !== null);
      const visiblePlaylists = new Map(playlists.map(playlist => [playlist.id, playlist]));
      if (!complete) {
        for (const [id, cached] of cache) {
          const deletedAt = tombstones[playlistCoordinate(user.pubkey, id)];
          if (!visiblePlaylists.has(id) && (deletedAt === undefined || cached.event.created_at > deletedAt)) visiblePlaylists.set(id, cached);
        }
      }
      const finalPlaylists = [...visiblePlaylists.values()];
      // Liked songs first, then newest.
      finalPlaylists.sort((a, b) => {
        if (a.isLiked) return -1;
        if (b.isLiked) return 1;
        return b.event.created_at - a.event.created_at;
      });
      return finalPlaylists;
    },
    enabled: !!user && !!readRelayKey,
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
    !['d', 'title', 'description', 'image'].includes(name) && !(name === 'e' && !!value) && !(name === 'i' && !!value && (!!wavlakeTrackId(value) || !!fountainTrackId(value) || !!podcastIndexTrackId(value)))
  ).map((tag) => [...tag]) : [];
  tags.unshift(["d", playlist.id], ["title", playlist.title]);
  if (!tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC)) tags.push(['t', MUSIC_PLAYLIST_TOPIC]);
  if (playlist.description) tags.push(["description", playlist.description]);
  if (playlist.image) tags.push(["image", playlist.image]);
  for (const id of playlist.trackIds) {
    const url = wavlakeTrackUrl(id) ?? fountainTrackUrl(id) ?? podcastIndexTrackUrl(id);
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["playlists"] });

  const publishPlaylist = async (template: { kind: number; content: string; tags: string[][] }) => {
    if (!user) throw new Error('User is not logged in');
    const event = await publish(template);
    const playlist = parsePlaylist(event);
    if (playlist) queryClient.setQueriesData<Playlist[]>(
      { queryKey: ['playlists', user.pubkey] },
      current => [playlist, ...(current ?? []).filter(item => item.id !== playlist.id)],
    );
    return event;
  };

  const publishPublicPlaylist = async (playlist: Pick<Playlist, 'id' | 'title' | 'description' | 'image' | 'trackIds'>): Promise<boolean> => {
    if (playlist.id === LIKED_SONGS_ID) return true;
    const eventIds = [...new Set(playlist.trackIds.filter(id => /^[0-9a-f]{64}$/i.test(id)).map(id => id.toLowerCase()))].slice(0, 250);
    const nostrEvents = eventIds.length
      ? (await Promise.all(Array.from({ length: Math.ceil(eventIds.length / 100) }, (_, index) =>
          nostr.query([{ ids: eventIds.slice(index * 100, (index + 1) * 100) }], { signal: AbortSignal.timeout(6000) }).catch(() => []),
        ))).flat()
      : [];
    const eventById = new Map(nostrEvents.map(event => [event.id.toLowerCase(), event]));
    const tags: string[][] = [
      ['d', playlist.id],
      ['title', playlist.title.slice(0, 160)],
      ['alt', `Public music playlist: ${playlist.title.slice(0, 160)}`],
      ['public', 'true'],
      ['t', 'music'],
      ['t', 'playlist'],
    ];
    if (playlist.description?.trim()) tags.push(['description', playlist.description.trim().slice(0, 1200)]);
    const image = sanitizeUrl(playlist.image);
    if (image) tags.push(['image', image]);
    for (const id of playlist.trackIds.slice(0, 250)) {
      const event = eventById.get(id.toLowerCase());
      if (event && MUSIC_TRACK_KINDS.includes(event.kind as (typeof MUSIC_TRACK_KINDS)[number])) {
        const identifier = event.tags.find(([name]) => name === 'd')?.[1];
        if (identifier) {
          tags.push(['a', `${event.kind}:${event.pubkey}:${identifier}`]);
          continue;
        }
      }
      const wavlakeUrl = wavlakeTrackUrl(id);
      if (wavlakeUrl) {
        tags.push(['i', wavlakeUrl]);
        continue;
      }
      const fountainUrl = fountainTrackUrl(id);
      if (fountainUrl) {
        tags.push(['i', fountainUrl]);
        continue;
      }
      if (event && eventToTrack(event)?.kind === 'music') tags.push(['e', event.id]);
      else if (/^[0-9a-f]{64}$/i.test(id)) tags.push(['e', id.toLowerCase()]);
    }
    try {
      await publish({ kind: 34139, content: '', tags });
      await queryClient.invalidateQueries({ queryKey: ['public-music-playlists'] });
      return true;
    } catch {
      return false;
    }
  };

  async function fetchExisting(id: string): Promise<Playlist | undefined> {
    if (!user) return undefined;
    // Prefer cache, fall back to network.
    const cached = queryClient.getQueryData<Playlist[]>(["playlists", user.pubkey]);
    const fromCache = cached?.find((p) => p.id === id);
    if (fromCache) return fromCache;
    const deletedAt = readPlaylistDeletionTombstones(user.pubkey)[playlistCoordinate(user.pubkey, id)];
    if (deletedAt !== undefined) return undefined;
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
      if (!(await publishPublicPlaylist({ id, title: input.title, description: input.description, image: input.image, trackIds: [] }))) {
        toast({ title: 'Playlist created in Your Library, but public publishing failed', description: 'Edit the playlist to retry publishing it to Public playlists on Nostr.', variant: 'destructive' });
      }
      return id;
    },
    onSuccess: invalidate,
  });

  const updatePlaylist = useMutation({
    mutationFn: async (input: { id: string; title: string; description?: string; image?: string }) => {
      const existing = await fetchExisting(input.id);
      if (!existing) throw new Error('Playlist could not be loaded, so the edit was not published. Please retry.');
      const playlist = {
        event: existing.event,
        id: input.id,
        title: input.title,
        description: input.description,
        image: input.image,
        trackIds: existing.trackIds,
      };
      await publishPlaylist(buildPlaylistEvent(playlist));
      if (!(await publishPublicPlaylist(playlist))) toast({ title: 'Playlist updated, but its public copy could not be published', description: 'Your library copy is safe. Save the playlist again to retry the public update.', variant: 'destructive' });
    },
    onSuccess: invalidate,
  });

  const addToPlaylist = useMutation({
    mutationFn: async (input: { playlistId: string; trackId: string }) => {
      const existing = await fetchExisting(input.playlistId);
      if (!existing) throw new Error('Playlist could not be loaded, so the edit was not published. Please retry.');
      const trackIds = existing.trackIds;
      if (trackIds.includes(input.trackId)) return;
      const playlist = {
        event: existing.event,
        id: input.playlistId,
        title: existing.title,
        description: existing?.description,
        image: existing?.image,
        trackIds: [...trackIds, input.trackId],
      };
      await publishPlaylist(buildPlaylistEvent(playlist));
      if (!(await publishPublicPlaylist(playlist))) toast({ title: 'Track added to your library playlist, but the public copy could not be updated', variant: 'destructive' });
    },
    onSuccess: invalidate,
  });

  const removeFromPlaylist = useMutation({
    mutationFn: async (input: { playlistId: string; trackId: string }) => {
      const existing = await fetchExisting(input.playlistId);
      if (!existing) return;
      const playlist = {
        event: existing.event,
        id: input.playlistId,
        title: existing.title,
        description: existing.description,
        image: existing.image,
        trackIds: existing.trackIds.filter((t) => t !== input.trackId),
      };
      await publishPlaylist(buildPlaylistEvent(playlist));
      if (!(await publishPublicPlaylist(playlist))) toast({ title: 'Track removed from your library playlist, but the public copy could not be updated', variant: 'destructive' });
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
