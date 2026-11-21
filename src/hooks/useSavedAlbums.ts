import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { queryLibraryEvents } from '@/lib/libraryQuery';
import { buildSavedAlbumsEvent, parseSavedAlbums, SAVED_ALBUMS_ID, type SavedAlbum } from '@/lib/savedAlbums';
import { getUserDataReadRelays } from '@/lib/appRelays';

const KIND = 30003;

function newestSavedAlbumsEvent(events: NostrEvent[], pubkey: string): NostrEvent | undefined {
  return events.filter(event => event.kind === KIND && event.pubkey === pubkey && event.tags.some(([name, value]) => name === 'd' && value === SAVED_ALBUMS_ID))
    .sort((left, right) => right.created_at - left.created_at)[0];
}

export function useSavedAlbums() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const client = useQueryClient();
  const { mutateAsync: publish } = useNostrPublish();
  const readRelays = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', config.excludedUserRelayUrls, config.excludedUserRelayPubkey);
  const relayKey = readRelays.join('|');
  const queryKey = ['saved-wavlake-albums', user?.pubkey ?? '', relayKey];

  const query = useQuery({
    queryKey,
    enabled: !!user && !!relayKey,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!user) return { event: undefined, albums: [] as SavedAlbum[], complete: false };
      const { events, complete } = await queryLibraryEvents(nostr, readRelays, [{ kinds: [KIND], authors: [user.pubkey], '#d': [SAVED_ALBUMS_ID], limit: 10 }], AbortSignal.any([signal, AbortSignal.timeout(8000)]));
      const relayEvent = newestSavedAlbumsEvent(events, user.pubkey);
      const cached = client.getQueryData<{ event?: NostrEvent; albums: SavedAlbum[]; complete: boolean }>(queryKey);
      const event = cached?.event && (!relayEvent || cached.event.created_at > relayEvent.created_at) ? cached.event : relayEvent;
      const albums = parseSavedAlbums(event);
      if (!complete && cached) {
        const byId = new Map(cached.albums.map(album => [album.id, album]));
        for (const album of albums) byId.set(album.id, album);
        return { event, albums: [...byId.values()], complete: false };
      }
      return { event, albums, complete };
    },
  });

  useEffect(() => {
    if (!user || !relayKey) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: ['saved-wavlake-albums', user.pubkey] }); };
    window.addEventListener('focus', refresh);
    window.addEventListener('ostrify-profile-privacy', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('ostrify-profile-privacy', refresh);
    };
  }, [client, relayKey, user]);

  const saveAlbums = useMutation({
    mutationFn: async (transform: (albums: SavedAlbum[]) => SavedAlbum[]) => {
      if (!user) throw new Error('Log in with Nostr to save albums and sync your library.');
      if (!readRelays.length) throw new Error('Enable a read relay to sync your saved albums.');
      const cached = client.getQueryData<{ event?: NostrEvent; albums: SavedAlbum[]; complete: boolean }>(queryKey);
      const result = await queryLibraryEvents(nostr, readRelays, [{ kinds: [KIND], authors: [user.pubkey], '#d': [SAVED_ALBUMS_ID], limit: 10 }], AbortSignal.timeout(8000));
      const relayEvent = newestSavedAlbumsEvent(result.events, user.pubkey);
      const existing = cached?.event && (!relayEvent || cached.event.created_at > relayEvent.created_at) ? cached.event : relayEvent;
      if (!result.complete && !cached && !existing) throw new Error('Could not confirm your saved albums from a read relay. Try again before changing this library.');
      const current = cached && (!result.complete || (cached.event?.created_at ?? 0) > (existing?.created_at ?? 0)) ? cached.albums : parseSavedAlbums(existing);
      if (!result.complete && !cached && existing) throw new Error('A relay did not finish checking Saved Albums. Retry before changing the library to avoid losing entries.');
      const next = transform(current);
      if (next.length === current.length && next.every(album => current.some(item => item.id === album.id && item.title === album.title && item.artist === album.artist && item.image === album.image && item.isListed === album.isListed))) return { event: existing, albums: current };
      if (existing && existing.created_at >= Math.floor(Date.now() / 1000)) throw new Error('Please wait a moment before updating Saved Albums again.');
      const template = buildSavedAlbumsEvent(existing, next);
      const event = await publish({ ...template, created_at: Math.max(Math.floor(Date.now() / 1000), (existing?.created_at ?? 0) + 1) });
      return { event, albums: parseSavedAlbums(event) };
    },
    onSuccess: data => {
      client.setQueryData(queryKey, { ...data, complete: true });
      void client.invalidateQueries({ queryKey: ['saved-wavlake-albums', user?.pubkey ?? ''] });
    },
  });

  const toggleSaved = (album: Omit<SavedAlbum, 'isListed'>, saved: boolean) => saveAlbums.mutateAsync(albums => {
    const current = albums.find(item => item.id === album.id);
    if (!saved) return albums.filter(item => item.id !== album.id);
    if (current) return albums.map(item => item.id === album.id ? { ...current, ...album } : item);
    return [...albums, { ...album, isListed: true }];
  });

  const setVisibility = (id: string, isListed: boolean) => saveAlbums.mutateAsync(albums => albums.map(album => album.id === id ? { ...album, isListed } : album));

  return {
    ...query,
    albums: query.data?.albums ?? [],
    isEnabled: !!user,
    hasReadRelays: !!relayKey,
    toggleSaved,
    setVisibility,
    isSaving: saveAlbums.isPending,
    saveError: saveAlbums.error,
  };
}
