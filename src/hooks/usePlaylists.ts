import { useNostr } from "@nostrify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { useNostrPublish } from "./useNostrPublish";
import { wavlakeTrackId, wavlakeTrackUrl } from "./useWavlake";
import { fountainTrackId, fountainTrackUrl, podcastIndexTrackId, podcastIndexTrackUrl } from "./usePodcasts";
import { isOstrifyMusicPlaylist, MUSIC_PLAYLIST_TOPIC, LIKED_TRACKS_IDENTIFIER, PLAYLIST_VISIBILITY_TAG } from '@/lib/musicPlaylists';
import { useToast } from './useToast';
import { queryLibraryEvents } from '@/lib/libraryQuery';
import { parsePublicMusicPlaylist, readPlaylistVisibilityOverrides, rememberPlaylistVisibility, type PublicMusicPlaylistDiscovery } from '@/lib/publicMusicPlaylists';

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
  /** Whether this playlist appears in Ostrify's public playlist discovery. */
  isListed: boolean;
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
      if (name === "a" && value && /^(31337|36787|32123|30440):[0-9a-f]{64}:.+$/i.test(value)) return [value];
      const wavlake = name === "i" && value ? wavlakeTrackId(value) : undefined;
      const fountain = name === "i" && value ? fountainTrackId(value) : undefined;
      const podcastIndex = name === "i" && value ? podcastIndexTrackId(value) : undefined;
      return wavlake ? [wavlake] : fountain ? [fountain] : podcastIndex ? [podcastIndex] : [];
    }),
    event,
    isLiked: d === LIKED_SONGS_ID,
    isListed: d !== LIKED_SONGS_ID && !event.tags.some(([name, value]) => name === PLAYLIST_VISIBILITY_TAG && value === 'private'),
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
  playlist: Partial<Playlist> & { id: string; title: string; trackIds: string[]; isListed?: boolean },
): { kind: number; content: string; tags: string[][] } {
  const existing = playlist.event;
  const tags: string[][] = existing ? existing.tags.filter(([name, value]) =>
    !['d', 'title', 'description', 'image', PLAYLIST_VISIBILITY_TAG].includes(name) && !(name === 'e' && !!value) && !(name === 'i' && !!value && (!!wavlakeTrackId(value) || !!fountainTrackId(value) || !!podcastIndexTrackId(value))) && !(name === 'a' && !!value && /^(31337|36787|32123|30440):[0-9a-f]{64}:.+$/i.test(value))
  ).map((tag) => [...tag]) : [];
  tags.unshift(["d", playlist.id], ["title", playlist.title]);
  if (!tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC)) tags.push(['t', MUSIC_PLAYLIST_TOPIC]);
  if (playlist.id !== LIKED_SONGS_ID) tags.push([PLAYLIST_VISIBILITY_TAG, playlist.isListed === false ? 'private' : 'public']);
  if (playlist.description) tags.push(["description", playlist.description]);
  if (playlist.image) tags.push(["image", playlist.image]);
  for (const id of playlist.trackIds) {
    const url = wavlakeTrackUrl(id) ?? fountainTrackUrl(id) ?? podcastIndexTrackUrl(id);
    const address = /^(31337|36787|32123|30440):([0-9a-f]{64}):(.+)$/i.exec(id);
    const previous = existing?.tags.find(([name, value]) => url
      ? name === 'i' && value === url
      : address
        ? name === 'a' && value.toLowerCase() === id.toLowerCase()
        : name === 'e' && value.toLowerCase() === id.toLowerCase());
    if (previous) tags.push([...previous]);
    else if (url) tags.push(['i', url]);
    else if (address) tags.push(['a', id]);
    else if (/^[0-9a-f]{64}$/i.test(id)) tags.push(['e', id]);
  }
  return { kind: PLAYLIST_KIND, content: existing?.content ?? "", tags };
}

/** Mutations for creating / updating playlists and toggling likes. */
export function usePlaylistActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["playlists"] });

  const publishPlaylist = async (template: { kind: number; content: string; tags: string[][] }, previousCreatedAt = 0) => {
    if (!user) throw new Error('User is not logged in');
    const readRelayKey = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join('|');
    const cacheKey = ['playlists', user.pubkey, readRelayKey];
    const cachedPlaylists = queryClient.getQueryData<Playlist[]>(cacheKey);
    const id = template.tags.find(([name]) => name === 'd')?.[1];
    const previousPlaylist = id ? cachedPlaylists?.find(playlist => playlist.id === id) : undefined;
    const visibilityOverride = id ? readPlaylistVisibilityOverrides(user.pubkey)[`30003:${user.pubkey}:${id}`] : undefined;
    const previousTimestamp = Math.max(previousCreatedAt, previousPlaylist?.event.created_at ?? 0, visibilityOverride?.event.created_at ?? 0);
    const event = await publish({ ...template, created_at: Math.max(Math.floor(Date.now() / 1000), previousTimestamp + 1) });
    await queryClient.cancelQueries({ queryKey: ['ostrify-public-playlists'] });
    const playlist = parsePlaylist(event);
    if (playlist) {
      queryClient.setQueriesData<Playlist[]>(
        { queryKey: ['playlists'] },
        current => current ? [playlist, ...current.filter(item => item.id !== playlist.id)] : current,
      );
      if (!playlist.isLiked) rememberPlaylistVisibility(user.pubkey, playlist.id, { isListed: playlist.isListed, event });
      const discoveryKey = ['ostrify-public-playlists', readRelayKey, user.pubkey];
      queryClient.setQueryData<PublicMusicPlaylistDiscovery>(discoveryKey, current => {
        const discovered = parsePublicMusicPlaylist(event);
        const key = `${user.pubkey}:${playlist.id}`;
        const playlists = (current?.playlists ?? []).filter(item => `${item.pubkey}:${item.id}` !== key);
        if (discovered) playlists.unshift(discovered);
        playlists.sort((left, right) => right.createdAt - left.createdAt);
        return { playlists: playlists.slice(0, 100), failedRelayCount: current?.failedRelayCount ?? 0 };
      });
    }
    return event;
  };

  async function fetchExisting(id: string): Promise<Playlist | undefined> {
    if (!user) return undefined;
    // Prefer cache, fall back to network.
    const readRelayKey = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join("|");
    const cached = queryClient.getQueryData<Playlist[]>(["playlists", user.pubkey, readRelayKey]);
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
    mutationFn: async (input: { title: string; description?: string; image?: string; id?: string; isListed?: boolean }) => {
      const id = input.id ?? `playlist-${crypto.randomUUID().slice(0, 8)}`;
      const event = buildPlaylistEvent({ id, title: input.title, description: input.description, image: input.image, trackIds: [], isListed: input.isListed });
      if (!event.tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC)) event.tags.push(['t', MUSIC_PLAYLIST_TOPIC]);
      await publishPlaylist(event);
      void queryClient.invalidateQueries({ queryKey: ['ostrify-public-playlists'] });
      return id;
    },
    onSuccess: invalidate,
  });

  const updatePlaylist = useMutation({
    mutationFn: async (input: { id: string; title: string; description?: string; image?: string; isListed?: boolean }) => {
      const existing = await fetchExisting(input.id);
      if (!existing) throw new Error('Playlist could not be loaded, so the edit was not published. Please retry.');
      const playlist = {
        event: existing.event,
        id: input.id,
        title: input.title,
        description: input.description,
        image: input.image,
        trackIds: existing.trackIds,
        isListed: input.isListed ?? existing.isListed,
      };
      const event = buildPlaylistEvent(playlist);
      if (!event.tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC)) event.tags.push(['t', MUSIC_PLAYLIST_TOPIC]);
      await publishPlaylist(event, existing.event.created_at);
      void queryClient.invalidateQueries({ queryKey: ['ostrify-public-playlists'] });
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
        isListed: existing.isListed,
      };
      const event = buildPlaylistEvent(playlist);
      if (!event.tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC)) event.tags.push(['t', MUSIC_PLAYLIST_TOPIC]);
      await publishPlaylist(event, existing.event.created_at);
      void queryClient.invalidateQueries({ queryKey: ['ostrify-public-playlists'] });
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
        isListed: existing.isListed,
      };
      const event = buildPlaylistEvent(playlist);
      if (!event.tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC)) event.tags.push(['t', MUSIC_PLAYLIST_TOPIC]);
      await publishPlaylist(event, existing.event.created_at);
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
        (() => {
          const event = buildPlaylistEvent({
            event: existing?.event,
            id: LIKED_SONGS_ID,
            title: "Liked Songs",
            description: existing?.description ?? "Your favorite tracks on Nostr",
            trackIds: next,
            isListed: false,
          });
          event.tags = event.tags.filter(([name, value]) => name !== 't' || value !== MUSIC_PLAYLIST_TOPIC);
          return event;
        })(),
        existing?.event.created_at ?? 0,
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
