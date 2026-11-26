import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useLibraryPublish } from '@/hooks/useNostrPublish';
import { useAudiobookLibrary, getAudiobookLibrarySnapshot, parseAudiobookLibrary, replaceAudiobookLibrary, type AudiobookLibraryState } from '@/hooks/useAudiobookLibrary';
import { newestEventForCoordinate, nextLibraryTimestamp, queryLibraryEvents, recentLibraryEvent, rememberLibraryWrite, withLibraryWrite } from '@/lib/libraryQuery';
import { getUserRelayUrls, normalizeRelayAddress } from '@/lib/appRelays';
import { useToast } from '@/hooks/useToast';

const LIBRARY_KIND = 30078;
const LIBRARY_ID = 'ostrify-audiobook-library-v1';
const LIBRARY_ALT = 'Encrypted Ostrify audiobook library';
const EMPTY_LIBRARY: AudiobookLibraryState = { books: {}, favoriteIds: [], collections: [] };

interface RemoteLibraryResult {
  library: AudiobookLibraryState | null;
  complete: boolean;
  eventId: string | null;
  incompleteRelays: string[];
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

/** One coordinator stays mounted across navigation and syncs NIP-44 encrypted NIP-78 data. */
function useAudiobookSyncCoordinator() {
  const enabled = true;
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useLibraryPublish();
  const { toast } = useToast();
  const library = useAudiobookLibrary();
  const [syncRequested, setSyncRequested] = useState(false);
  const syncRequestedRef = useRef(false);
  const queryRequestedByLibrary = useRef(false);
  const previousIdentity = useRef<string | null>(null);
  const previousEnabled = useRef(enabled);
  // Private library events are published to write relays, not music-only read relays.
  // Checking unrelated catalog relays can prevent sync forever when one is offline.
  const excluded = new Set(config.excludedUserRelayUrls.map(normalizeRelayAddress));
  const relays = [...new Set([
    ...config.relayMetadata.relays.filter(relay => relay.write && !excluded.has(normalizeRelayAddress(relay.url))).map(relay => relay.url),
    ...getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', 'write', config.excludedUserRelayUrls, config.excludedUserRelayPubkey),
  ])].sort();
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
      if (!user) return { library: null, complete: false, eventId: null, incompleteRelays: [] };
      if (!user.signer.nip44) throw new Error('Your Nostr signer must support NIP-44 encryption to sync this private library.');
      const { events, complete, incompleteRelays } = await queryLibraryEvents(
        nostr,
        relays,
        [{ kinds: [LIBRARY_KIND], authors: [user.pubkey], '#d': [LIBRARY_ID], limit: 10 }],
        AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        { waitForAll: true },
      );
      const recent = recentLibraryEvent(user.pubkey, LIBRARY_KIND, LIBRARY_ID);
      const latest = newestEventForCoordinate(recent ? [...events, recent] : events, user.pubkey, LIBRARY_KIND, LIBRARY_ID);
      if (!latest) return { library: null, complete, eventId: null, incompleteRelays };
      return { library: await parseRemoteLibrary(latest, user.pubkey, (peer, ciphertext) => user.signer.nip44!.decrypt(peer, ciphertext)), complete, eventId: latest.id, incompleteRelays };
    },
  });

  const [syncReadyFor, setSyncReadyFor] = useState<string | null>(null);
  const [syncReadyRelayKey, setSyncReadyRelayKey] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const identityRef = useRef(user?.pubkey);
  useEffect(() => { identityRef.current = user?.pubkey; }, [user?.pubkey]);
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
    setSyncReadyRelayKey(null);
    setPublishError(null);
    previousQueryResult.current = { pubkey: currentPubkey ?? undefined, dataUpdatedAt: 0 };
  }, [enabled, user?.pubkey]);

  const requestSync = useCallback(() => {
    if (!enabled) return;
    setPublishError(null);
    const wasRequested = syncRequestedRef.current;
    syncRequestedRef.current = true;
    queryRequestedByLibrary.current = true;
    setSyncRequested(true);
    if (wasRequested) void query.refetch();
  }, [enabled, query.refetch]);

  // Start after sign-in and whenever the set of library relays changes. This also
  // migrates saves made before private sync existed without needing another edit.
  useEffect(() => {
    if (user?.pubkey && relayKey) requestSync();
  }, [user?.pubkey, relayKey, requestSync]);

  useEffect(() => {
    if (!user) return;
    if (!syncRequested || !query.isSuccess || query.isFetching || !query.dataUpdatedAt || query.isError || (previousQueryResult.current.pubkey === user.pubkey && previousQueryResult.current.dataUpdatedAt === query.dataUpdatedAt)) return;
    const local = getAudiobookLibrarySnapshot();
    const savedBaseline = readSavedBaseline(user.pubkey);
    if (!query.data.complete) {
      // Show recoverable additions immediately, but never publish based on an
      // incomplete read: an unavailable relay may hold a newer revision.
      if (query.data.library) replaceAudiobookLibrary(mergeLibraries(local, query.data.library));
      syncBaseline = serializeLibrary(getAudiobookLibrarySnapshot());
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
      syncBaseline = remoteLibrarySerialized;
      if (!savedBaseline) saveBaseline(user.pubkey, remoteLibrarySerialized);
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
    setSyncReadyRelayKey(relayKey);
  }, [user?.pubkey, query.data, query.dataUpdatedAt, query.isSuccess, query.isFetching, syncReadyFor, query.isError, syncRequested, relayKey]);

  useEffect(() => {
    if (!user || !syncRequested || !queryRequestedByLibrary.current || syncReadyFor !== user.pubkey || syncReadyRelayKey !== relayKey || !query.isSuccess || query.isFetching || !relayKey || !syncCanPublish || syncInFlight) return;
    const serialized = serializeLibrary(getAudiobookLibrarySnapshot());
    if (serialized === syncBaseline || !user.signer.nip44 || !writeRelayKey) return;

    const publishingPubkey = user.pubkey;
    const signer = user.signer.nip44;
    syncInFlight = true;
    queryRequestedByLibrary.current = false;
    void withLibraryWrite(publishingPubkey, LIBRARY_KIND, LIBRARY_ID, async () => {
      // Recheck under the cross-tab lock; never overwrite a revision we haven't read.
      const result = await queryLibraryEvents(nostr, relays, [{ kinds: [LIBRARY_KIND], authors: [publishingPubkey], '#d': [LIBRARY_ID], limit: 10 }], AbortSignal.timeout(8000), { waitForAll: true });
      if (!result.complete) throw new Error('Some library relays did not respond. Your changes remain on this device; retry sync when they are available.');
      const recent = recentLibraryEvent(publishingPubkey, LIBRARY_KIND, LIBRARY_ID);
      const latest = newestEventForCoordinate(recent ? [...result.events, recent] : result.events, publishingPubkey, LIBRARY_KIND, LIBRARY_ID);
      if ((latest?.id ?? null) !== query.data.eventId) throw new Error('Your library changed on another device. Retry sync to load the latest version.');
      const content = await signer.encrypt(publishingPubkey, serialized);
      const created_at = await nextLibraryTimestamp(latest?.created_at);
      if (identityRef.current !== publishingPubkey) throw new Error('The active account changed before publishing.');
      const event = await publish({ kind: LIBRARY_KIND, content, created_at, tags: [['d', LIBRARY_ID], ['alt', LIBRARY_ALT]] });
      if (event.pubkey !== publishingPubkey) throw new Error('The signer returned a different account. Check your signer.');
      rememberLibraryWrite(event, LIBRARY_ID);
    }).then(() => {
      saveBaseline(publishingPubkey, serialized);
      if (identityRef.current === publishingPubkey) {
        syncBaseline = serialized;
        setPublishError(null);
        syncRequestedRef.current = false;
        setSyncRequested(false);
      }
    }).catch(error => {
      if (identityRef.current === publishingPubkey) {
        const message = error instanceof Error ? error.message : 'Could not publish the encrypted library.';
        setPublishError(message);
        syncRequestedRef.current = false;
        setSyncRequested(false);
        toast({ title: 'Audiobook sync failed', description: message, variant: 'destructive' });
      }
    }).finally(() => {
      syncInFlight = false;
      if (identityRef.current === publishingPubkey && serializeLibrary(getAudiobookLibrarySnapshot()) !== serialized) requestSync();
    });
  }, [library, user?.pubkey, syncRequested, syncReadyFor, syncReadyRelayKey, query.isSuccess, query.isFetching, query.dataUpdatedAt, relayKey, writeRelayKey, publish, user, toast]);

  return {
    isSignedIn: !!user,
    requestSync,
    isRequested: syncRequested,
    isReady: !!user && syncRequested && syncReadyFor === user.pubkey,
    isLoading: !!user && syncRequested && (query.isFetching || syncInFlight),
    isError: syncRequested && query.isError,
    error: query.error,
    isPartial: query.data?.complete === false,
    incompleteRelays: query.data?.incompleteRelays ?? [],
    publishError,
    hasReadRelays: !!relayKey,
    supportsEncryption: !!user?.signer.nip44,
    hasWriteRelays: !!writeRelayKey,
    refetch: query.refetch,
  };
}

const AudiobookSyncContext = createContext<ReturnType<typeof useAudiobookSyncCoordinator> | null>(null);

export function AudiobookSyncProvider({ children }: { children: ReactNode }) {
  const sync = useAudiobookSyncCoordinator();
  return createElement(AudiobookSyncContext.Provider, { value: sync }, children);
}

export function useAudiobookLibrarySync() {
  const sync = useContext(AudiobookSyncContext);
  if (!sync) throw new Error('AudiobookSyncProvider is missing');
  return sync;
}
