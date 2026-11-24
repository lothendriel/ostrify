import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAudiobookLibrary, getAudiobookLibrarySnapshot, parseAudiobookLibrary, replaceAudiobookLibrary, type AudiobookLibraryState } from '@/hooks/useAudiobookLibrary';
import { queryLibraryEvents } from '@/lib/libraryQuery';
import { getUserDataReadRelays, getUserRelayUrls } from '@/lib/appRelays';
import { useToast } from '@/hooks/useToast';

const LIBRARY_KIND = 30078;
const LIBRARY_ID = 'ostrify-audiobook-library-v1';
const LIBRARY_ALT = 'Encrypted Ostrify audiobook library';
const EMPTY_LIBRARY: AudiobookLibraryState = { books: {}, favoriteIds: [], collections: [] };

interface RemoteLibraryResult {
  library: AudiobookLibraryState | null;
  complete: boolean;
}

function mergeLibraries(local: AudiobookLibraryState, remote: AudiobookLibraryState): AudiobookLibraryState {
  const collections = new Map(remote.collections.map(collection => [collection.id, collection]));
  for (const collection of local.collections) {
    const existing = collections.get(collection.id);
    collections.set(collection.id, existing
      ? { ...existing, audiobookIds: [...new Set([...existing.audiobookIds, ...collection.audiobookIds])] }
      : collection);
  }
  return {
    books: { ...remote.books, ...local.books },
    favoriteIds: [...new Set([...remote.favoriteIds, ...local.favoriteIds])],
    collections: [...collections.values()],
  };
}

const baselineKey = (pubkey: string) => `ostrify-audiobook-library-sync-baseline:${pubkey}`;
let syncBaseline: string | null = null;
let syncCanPublish = false;
let syncInFlight = false;

function readSavedBaseline(pubkey: string): string | null {
  try {
    return localStorage.getItem(baselineKey(pubkey));
  } catch {
    return null;
  }
}

function saveBaseline(pubkey: string, value: string): void {
  try {
    localStorage.setItem(baselineKey(pubkey), value);
  } catch {
    // The Nostr event remains the durable copy if browser storage is unavailable.
  }
}

function parseRemoteLibrary(event: NostrEvent, pubkey: string, decrypt: (peer: string, ciphertext: string) => Promise<string>): Promise<AudiobookLibraryState> {
  if (event.pubkey !== pubkey || event.kind !== LIBRARY_KIND || !event.tags.some(([name, value]) => name === 'd' && value === LIBRARY_ID)) {
    return Promise.reject(new Error('Invalid audiobook library event'));
  }
  return decrypt(pubkey, event.content).then(content => {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || !('books' in parsed) || !('favoriteIds' in parsed) || !('collections' in parsed)) {
        throw new Error('Invalid saved library');
      }
      return parseAudiobookLibrary(content);
    } catch {
      throw new Error('The encrypted audiobook library could not be decoded.');
    }
  });
}

function serializeLibrary(library: AudiobookLibraryState): string {
  return JSON.stringify({
    books: Object.fromEntries(Object.entries(library.books).sort(([left], [right]) => left.localeCompare(right))),
    favoriteIds: [...library.favoriteIds].sort(),
    collections: [...library.collections].sort((left, right) => left.id.localeCompare(right.id)),
  });
}

/** Syncs the current user's audiobook library as NIP-44 encrypted NIP-78 app data. */
export function useAudiobookLibrarySync(enabled = true) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useNostrPublish();
  const { toast } = useToast();
  const client = useQueryClient();
  const library = useAudiobookLibrary();
  const [syncRequested, setSyncRequested] = useState(false);
  const syncRequestedRef = useRef(false);
  const queryRequestedByLibrary = useRef(false);
  const previousIdentity = useRef<string | null>(null);
  const previousEnabled = useRef(enabled);
  const relays = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', config.excludedUserRelayUrls, config.excludedUserRelayPubkey);
  const relayKey = relays.join('|');
  const writeRelayKey = [...new Set([
    ...config.relayMetadata.relays.filter(relay => relay.write && !config.excludedUserRelayUrls.some(url => url.trim().replace(/\/+$/, '').toLowerCase() === relay.url.trim().replace(/\/+$/, '').toLowerCase())).map(relay => relay.url),
    ...getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', 'write', config.excludedUserRelayUrls, config.excludedUserRelayPubkey),
  ])].sort().join('|');
  const queryKey = ['audiobook-library-remote', user?.pubkey ?? '', relayKey];
  const query = useQuery({
    queryKey,
    enabled: enabled && !!user && !!relayKey && syncRequested,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }): Promise<RemoteLibraryResult> => {
      if (!user) return { library: null, complete: false };
      if (!user.signer.nip44) throw new Error('Your Nostr signer must support NIP-44 encryption to sync this private library.');
      const { events, complete } = await queryLibraryEvents(
        nostr,
        relays,
        [{ kinds: [LIBRARY_KIND], authors: [user.pubkey], '#d': [LIBRARY_ID], limit: 10 }],
        AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        { waitForAll: client.getQueryData<RemoteLibraryResult>(queryKey)?.complete === false },
      );
      const latest = events.filter(event => event.pubkey === user.pubkey && event.kind === LIBRARY_KIND && event.tags.some(([name, value]) => name === 'd' && value === LIBRARY_ID)).sort((left, right) => right.created_at - left.created_at)[0];
      if (!latest) return { library: null, complete };
      return { library: await parseRemoteLibrary(latest, user.pubkey, (peer, ciphertext) => user.signer.nip44!.decrypt(peer, ciphertext)), complete };
    },
  });

  const [syncReadyFor, setSyncReadyFor] = useState<string | null>(null);
  const previousQueryResult = useRef<{ pubkey?: string; dataUpdatedAt: number }>({ dataUpdatedAt: 0 });

  useEffect(() => {
    syncRequestedRef.current = syncRequested;
  }, [syncRequested]);

  useEffect(() => {
    const currentPubkey = user?.pubkey ?? null;
    if (currentPubkey === previousIdentity.current && enabled === previousEnabled.current) return;
    previousIdentity.current = currentPubkey;
    syncBaseline = null;
    syncCanPublish = false;
    syncRequestedRef.current = false;
    queryRequestedByLibrary.current = false;
    previousEnabled.current = enabled;
    setSyncRequested(false);
    setSyncReadyFor(null);
    previousQueryResult.current = { pubkey: currentPubkey ?? undefined, dataUpdatedAt: 0 };
  }, [enabled, user?.pubkey]);

  const requestSync = useCallback(() => {
    if (!enabled) return;
    const wasRequested = syncRequestedRef.current;
    syncRequestedRef.current = true;
    queryRequestedByLibrary.current = true;
    setSyncRequested(true);
    if (wasRequested) void query.refetch();
  }, [enabled, query.refetch]);

  useEffect(() => {
    if (!user) return;
    if (!syncRequested || !query.isSuccess || !query.dataUpdatedAt || query.isError || (previousQueryResult.current.pubkey === user.pubkey && previousQueryResult.current.dataUpdatedAt === query.dataUpdatedAt)) return;
    const local = getAudiobookLibrarySnapshot();
    const savedBaseline = readSavedBaseline(user.pubkey);
    if (!query.data.complete) {
      // A partial read cannot safely establish the current remote baseline.
      // Keep local data untouched and do not publish until all selected relays finish.
      syncBaseline = serializeLibrary(local);
      syncCanPublish = false;
    } else if (query.data.library) {
      const remoteLibrary = query.data.library;
      const remoteLibrarySerialized = serializeLibrary(remoteLibrary);
      const localSerialized = serializeLibrary(local);
      if (savedBaseline && savedBaseline !== remoteLibrarySerialized && localSerialized === savedBaseline) {
        // Local state still matches the previous sync, so the remote copy changed on another device.
        replaceAudiobookLibrary(remoteLibrary);
        saveBaseline(user.pubkey, remoteLibrarySerialized);
      } else if (localSerialized !== remoteLibrarySerialized) {
        // Merge concurrent additions so an initial device migration doesn't discard either library.
        const merged = mergeLibraries(local, remoteLibrary);
        replaceAudiobookLibrary(merged);
        saveBaseline(user.pubkey, remoteLibrarySerialized);
      }
      syncBaseline = savedBaseline ?? remoteLibrarySerialized;
      if (!savedBaseline) saveBaseline(user.pubkey, remoteLibrarySerialized);
      else if (localSerialized === savedBaseline) syncBaseline = remoteLibrarySerialized;
      syncCanPublish = true;
    } else {
      // Absence is only used as a baseline after every selected relay completed.
      syncBaseline = serializeLibrary(EMPTY_LIBRARY);
      saveBaseline(user.pubkey, syncBaseline);
      syncCanPublish = true;
    }
    const currentSerialized = serializeLibrary(getAudiobookLibrarySnapshot());
    if (!syncCanPublish || currentSerialized === syncBaseline || !writeRelayKey || !user.signer.nip44) {
      queryRequestedByLibrary.current = false;
      syncRequestedRef.current = false;
      setSyncRequested(false);
    }
    previousQueryResult.current = { pubkey: user.pubkey, dataUpdatedAt: query.dataUpdatedAt };
    setSyncReadyFor(user.pubkey);
  }, [user?.pubkey, query.data, query.dataUpdatedAt, query.isSuccess, syncReadyFor, query.isError, syncRequested]);

  useEffect(() => {
    if (!user || !syncRequested || !queryRequestedByLibrary.current || syncReadyFor !== user.pubkey || !query.isSuccess || !relayKey || !syncCanPublish || syncInFlight) return;
    const serialized = serializeLibrary(getAudiobookLibrarySnapshot());
    if (serialized === syncBaseline || !user.signer.nip44 || !writeRelayKey) return;

    let cancelled = false;
    const publishingPubkey = user.pubkey;
    syncInFlight = true;
    queryRequestedByLibrary.current = false;
    void user.signer.nip44.encrypt(user.pubkey, serialized).then(content => publish({
      kind: LIBRARY_KIND,
      content,
      tags: [['d', LIBRARY_ID], ['alt', LIBRARY_ALT]],
    })).then(() => {
      if (!cancelled) {
        syncBaseline = serialized;
        saveBaseline(publishingPubkey, serialized);
        syncRequestedRef.current = false;
        setSyncRequested(false);
      }
    }).catch(error => {
      if (!cancelled) toast({ title: 'Audiobook sync failed', description: error instanceof Error ? error.message : 'Could not publish the encrypted library.', variant: 'destructive' });
    }).finally(() => {
      syncInFlight = false;
      if (serializeLibrary(getAudiobookLibrarySnapshot()) !== serialized) requestSync();
    });
    return () => { cancelled = true; };
  }, [library, user?.pubkey, syncRequested, syncReadyFor, query.isSuccess, query.dataUpdatedAt, relayKey, writeRelayKey, publish, user, toast]);

  return {
    isSignedIn: !!user,
    requestSync,
    isRequested: syncRequested,
    isReady: !!user && syncRequested && syncReadyFor === user.pubkey,
    isLoading: !!user && syncRequested && query.isLoading,
    isError: syncRequested && query.isError,
    error: query.error,
    isPartial: query.data?.complete === false,
    hasReadRelays: !!relayKey,
    supportsEncryption: !!user?.signer.nip44,
    hasWriteRelays: !!writeRelayKey,
    refetch: query.refetch,
  };
}
