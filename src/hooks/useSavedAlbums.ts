import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useLibraryPublish } from '@/hooks/useNostrPublish';
import { queryLibraryEvents, withLibraryWrite, readLibraryForWrite, rememberLibraryWrite, recentLibraryEvent, reconcileLibraryEvent, nextLibraryTimestamp, libraryWriteWarning } from '@/lib/libraryQuery';
import { useToast } from '@/hooks/useToast';
import { buildSavedAlbumsEvent, parseSavedAlbums, SAVED_ALBUMS_ID, type SavedAlbum } from '@/lib/savedAlbums';
import { getUserDataReadRelays } from '@/lib/appRelays';

const KIND = 30003;

export function useSavedAlbums() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const client = useQueryClient();
  const { toast } = useToast();
  const { mutateAsync: publish } = useLibraryPublish();
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
      const previous = client.getQueryData<{ event?: NostrEvent; albums: SavedAlbum[]; complete: boolean }>(queryKey);
      const result = await queryLibraryEvents(nostr, readRelays, [{ kinds: [KIND], authors: [user.pubkey], '#d': [SAVED_ALBUMS_ID], limit: 10 }], AbortSignal.any([signal, AbortSignal.timeout(8000)]), { waitForAll: previous?.complete === false });
      const cached = client.getQueryData<{ event?: NostrEvent; albums: SavedAlbum[]; complete: boolean }>(queryKey);
      const recent = recentLibraryEvent(user.pubkey, KIND, SAVED_ALBUMS_ID);
      const event = reconcileLibraryEvent(client, user.pubkey, KIND, SAVED_ALBUMS_ID, [...result.events, cached?.event, recent]);
      const albums = !event && !result.complete && cached ? cached.albums : parseSavedAlbums(event);
      return { event, albums, complete: result.complete, completedRelays: result.completedRelays, incompleteRelays: result.incompleteRelays };
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
      return withLibraryWrite(user.pubkey, KIND, SAVED_ALBUMS_ID, async () => {
        const cached = client.getQueryData<{ event?: NostrEvent; albums: SavedAlbum[]; complete: boolean }>(queryKey);
        const result = await readLibraryForWrite(nostr, readRelays, user.pubkey, KIND, SAVED_ALBUMS_ID, cached?.event);
        const existing = result.event;
        const current = parseSavedAlbums(existing);
        const next = transform(current);
        if (next.length === current.length && next.every(album => current.some(item => item.id === album.id && item.title === album.title && item.artist === album.artist && item.image === album.image && item.isListed === album.isListed))) return { event: existing, albums: current, complete: !result.partial };
        const template = buildSavedAlbumsEvent(existing, next);
        const created_at = await nextLibraryTimestamp(existing?.created_at);
        const event = await publish({ ...template, created_at });
        rememberLibraryWrite(event, SAVED_ALBUMS_ID);
        const data = { event, albums: parseSavedAlbums(event), complete: !result.partial };
        client.setQueryData(queryKey, data);
        const warning = libraryWriteWarning(result.partial);
        if (warning) toast({ title: 'Library sync may be incomplete', description: warning });
        return data;
      });
    },
    onSuccess: () => {
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
