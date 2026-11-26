import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { initializeRadioFavorites, parseRadioFavorites, radioFavoritesSnapshot, replaceRadioFavorites, useRadioFavorites, type RadioStation } from '@/hooks/useRadioFavorites';
import { getUserRelayUrls, normalizeRelayAddress } from '@/lib/appRelays';
import { newestEventForCoordinate, nextLibraryTimestamp, queryLibraryEvents, recentLibraryEvent, rememberLibraryWrite, withLibraryWrite } from '@/lib/libraryQuery';

const KIND = 30078;
const ID = 'ostrify-radio-favorites-v1';
const baselineKey = (pubkey: string) => `ostrify:radio-favorites-baseline:${pubkey}`;
const serialize = (stations: RadioStation[]) => JSON.stringify([...stations].sort((a, b) => a.id.localeCompare(b.id)));

type SyncState = { status: 'local' | 'syncing' | 'synced' | 'partial' | 'error'; message?: string };

/** Apply local changes since the last synchronized revision to the current remote copy. */
function reconcile(local: RadioStation[], remote: RadioStation[], baseline: RadioStation[] | null): RadioStation[] {
  const result = new Map(remote.map(station => [station.id, station]));
  if (!baseline) {
    for (const station of local) result.set(station.id, station);
  } else {
    const before = new Map(baseline.map(station => [station.id, station]));
    const now = new Map(local.map(station => [station.id, station]));
    for (const id of before.keys()) if (!now.has(id)) result.delete(id);
    for (const station of local) if (!before.has(station.id) || JSON.stringify(before.get(station.id)) !== JSON.stringify(station)) result.set(station.id, station);
  }
  return [...result.values()];
}

function useCoordinator() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { raw } = useRadioFavorites();
  const [state, setState] = useState<SyncState>({ status: 'local' });
  const [retry, setRetry] = useState(0);
  const lastMergedRaw = useRef<{ pubkey: string; raw: string } | null>(null);
  const activeIdentity = useRef(user?.pubkey);
  useEffect(() => { activeIdentity.current = user?.pubkey; }, [user?.pubkey]);
  const latest = useRef({ user, nostr });
  latest.current = { user, nostr };
  const excluded = new Set(config.excludedUserRelayUrls.map(normalizeRelayAddress));
  const writeRelays = [...new Set(config.relayMetadata.relays.filter(relay => relay.write && !excluded.has(normalizeRelayAddress(relay.url))).map(relay => relay.url))];
  const relays = [...new Set([...writeRelays, ...getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', 'write', config.excludedUserRelayUrls, config.excludedUserRelayPubkey)])].sort();
  const relayKey = relays.join('|');
  const writeKey = writeRelays.sort().join('|');
  useEffect(() => {
    if (!user?.pubkey) return;
    try { initializeRadioFavorites(user.pubkey); } catch { /* The coordinator reports storage errors on sync. */ }
  }, [user?.pubkey]);
  const requestSync = useCallback(() => setRetry(value => value + 1), []);

  useEffect(() => {
    if (!user?.pubkey) { setState({ status: 'local' }); return; }
    const pubkey = user.pubkey;
    if (!user.signer.nip44) { setState({ status: 'error', message: 'Your signer needs NIP-44 encryption to sync favorites privately.' }); return; }
    if (!writeKey) { setState({ status: 'error', message: 'Enable a write relay in Settings to sync favorites.' }); return; }
    setState({ status: 'syncing' });
    let cancelled = false;
    const checkActive = () => {
      if (cancelled || activeIdentity.current !== pubkey) throw new Error('Sync was interrupted.');
    };
    const timer = setTimeout(() => {
      if (cancelled) return;
      setState({ status: 'syncing' });
      void withLibraryWrite(pubkey, KIND, ID, async () => {
        checkActive();
        initializeRadioFavorites(pubkey);
        const { user: current, nostr: pool } = latest.current;
        if (!current || current.pubkey !== pubkey || !current.signer.nip44) throw new Error('The active signer changed. Please retry.');
        const result = await queryLibraryEvents(pool, relayKey.split('|').filter(Boolean), [{ kinds: [KIND], authors: [pubkey], '#d': [ID], limit: 10 }], AbortSignal.timeout(8000), { waitForAll: true });
        checkActive();
        if (!result.completedRelays.length) throw new Error('No library relay finished checking your favorites. Nothing was published; check your relays and try again.');
        const recent = recentLibraryEvent(pubkey, KIND, ID);
        const event = newestEventForCoordinate(recent ? [...result.events, recent] : result.events, pubkey, KIND, ID);
        let remote: RadioStation[] = [];
        if (event) {
          const plaintext = await current.signer.nip44.decrypt(pubkey, event.content);
          checkActive();
          let parsed: unknown;
          try { parsed = JSON.parse(plaintext); } catch { throw new Error('The encrypted radio favorites could not be decoded.'); }
          if (!Array.isArray(parsed) || parseRadioFavorites(plaintext).length !== parsed.length) throw new Error('The encrypted radio favorites have an unsupported format. Nothing was overwritten.');
          remote = parseRadioFavorites(plaintext);
        }
        const baselineRaw = localStorage.getItem(baselineKey(pubkey));
        const baseline = baselineRaw === null ? null : parseRadioFavorites(baselineRaw);
        const local = parseRadioFavorites(radioFavoritesSnapshot(pubkey));
        const merged = reconcile(local, remote, baseline);
        const serialized = serialize(merged);
        const completed = new Set(result.completedRelays.map(normalizeRelayAddress));
        const targets = writeKey.split('|').filter(relay => completed.has(normalizeRelayAddress(relay)));
        let accepted = 0;
        let partial = !result.complete;
        const shouldPublish = serialized !== serialize(remote);
        if (shouldPublish) {
          if (!targets.length) throw new Error('No writable relay finished checking your favorites. Nothing was published; check your relay settings and try again.');
          // Recheck reachable relays immediately before replacing the list.
          const verify = await queryLibraryEvents(pool, relayKey.split('|').filter(Boolean), [{ kinds: [KIND], authors: [pubkey], '#d': [ID], limit: 10 }], AbortSignal.timeout(8000), { waitForAll: true });
          checkActive();
          if (!verify.completedRelays.length) throw new Error('No relay finished the final check. Nothing was published; try again.');
          const lastWrite = recentLibraryEvent(pubkey, KIND, ID);
          const latestEvent = newestEventForCoordinate(lastWrite ? [...verify.events, lastWrite] : verify.events, pubkey, KIND, ID);
          if ((latestEvent?.id ?? null) !== (event?.id ?? null)) throw new Error('Favorites changed on another device during sync. Try again to merge the latest version.');
          const verified = new Set(verify.completedRelays.map(normalizeRelayAddress));
          const verifiedTargets = targets.filter(relay => verified.has(normalizeRelayAddress(relay)));
          partial ||= !verify.complete || verifiedTargets.length < targets.length;
          if (!verifiedTargets.length) throw new Error('No writable relay finished the final check. Nothing was published; try again.');
          const content = await current.signer.nip44.encrypt(pubkey, serialized);
          const created_at = await nextLibraryTimestamp(event?.created_at);
          checkActive();
          const currentRevision = recentLibraryEvent(pubkey, KIND, ID);
          if (currentRevision && newestEventForCoordinate(event ? [event, currentRevision] : [currentRevision], pubkey, KIND, ID)?.id !== event?.id) throw new Error('Favorites changed in another tab. Try again to merge the latest version.');
          const published = await current.signer.signEvent({ kind: KIND, content, created_at, tags: [['d', ID], ['alt', 'Encrypted Ostrify radio favorites']] });
          checkActive();
          if (published.pubkey !== pubkey) throw new Error('The signer returned a different account. Nothing was published.');
          const outcomes = await Promise.allSettled(verifiedTargets.map(relay => pool.relay(relay).event(published, { signal: AbortSignal.timeout(5000) })));
          accepted = outcomes.filter(outcome => outcome.status === 'fulfilled').length;
          partial ||= accepted < verifiedTargets.length;
          if (!accepted) throw new Error('No checked write relay confirmed the update. Your changes remain in this browser; try again.');
          rememberLibraryWrite(published, ID);
        }
        // Changes made while encryption or publishing was pending must remain local.
        const currentLocal = parseRadioFavorites(radioFavoritesSnapshot(pubkey));
        const next = reconcile(currentLocal, merged, local);
        localStorage.setItem(baselineKey(pubkey), serialized);
        checkActive();
        if (serialize(currentLocal) !== serialize(next)) {
          lastMergedRaw.current = { pubkey, raw: JSON.stringify(next) };
          replaceRadioFavorites(pubkey, next);
        }
        if (serialize(next) !== serialized) requestSync();
        return { partial, delivered: shouldPublish && accepted > 0, foundRemote: !!event };
      }).then(result => { if (!cancelled && activeIdentity.current === pubkey) setState(result.partial ? { status: 'partial', message: result.delivered ? 'Favorites were saved to available relays. Some relays did not respond or accept the update; they may have unseen changes from another device.' : result.foundRemote ? 'Favorites were loaded from available relays. Some relays did not respond and may have unseen changes from another device.' : 'Some relays did not respond. No remote favorites were found on the available relays; another device may have changes we could not see.' } : { status: 'synced' }); })
        .catch(error => { if (!cancelled && activeIdentity.current === pubkey) setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not sync favorites.' }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user?.pubkey, user?.signer, relayKey, writeKey, retry, requestSync]);

  // Local changes request a fresh read before writing.
  const lastRaw = useRef({ raw, pubkey: user?.pubkey });
  useEffect(() => {
    const previous = lastRaw.current;
    lastRaw.current = { raw, pubkey: user?.pubkey };
    if (lastMergedRaw.current && lastMergedRaw.current.pubkey === user?.pubkey && lastMergedRaw.current.raw === raw) {
      lastMergedRaw.current = null;
      return;
    }
    if (previous.pubkey === user?.pubkey && previous.raw !== raw && user?.pubkey) requestSync();
  }, [raw, user?.pubkey, requestSync]);
  useEffect(() => {
    const onFocus = () => { if (user?.pubkey) requestSync(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user?.pubkey, requestSync]);
  return { ...state, isSignedIn: !!user, requestSync };
}

const RadioSyncContext = createContext<ReturnType<typeof useCoordinator> | null>(null);
export function RadioFavoritesSyncProvider({ children }: { children: ReactNode }) {
  const sync = useCoordinator();
  return createElement(RadioSyncContext.Provider, { value: sync }, children);
}
export function useRadioFavoritesSync() {
  return useContext(RadioSyncContext);
}
