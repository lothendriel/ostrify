import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { parseBlossomServerList } from '@/lib/appBlossom';
import { isNewerReplaceableEvent, newestEventForCoordinate } from '@/lib/libraryQuery';

/** Sync NIP-65 and BUD-03 without overwriting unsaved local server choices. */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const pubkey = user?.pubkey;
  const readRelayKey = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join('|') + '|' + [...config.excludedUserRelayUrls].sort().join('|');

  useEffect(() => {
    if (!pubkey) {
      updateConfig(current => !current.userRelayPubkey && !current.includeUserRelays ? current : ({
        ...current,
        userRelayMetadata: { relays: [], updatedAt: 0 },
        userRelayPubkey: '', includeUserRelays: false,
        excludedUserRelayUrls: [], excludedUserRelayPubkey: '',
      }));
      return;
    }

    let active = true;
    updateConfig(current => current.userRelayPubkey === pubkey ? current : ({
      ...current,
      userRelayMetadata: { relays: [], updatedAt: 0 },
      userRelayPubkey: pubkey, includeUserRelays: false,
      excludedUserRelayUrls: [], excludedUserRelayPubkey: pubkey,
    }));

    void (async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [pubkey], limit: 20 }],
          { signal: AbortSignal.timeout(5000), relays: ['wss://relay.nostr.net/', 'wss://nos.lol/', 'wss://nostr.wine/'] },
        );
        const event = newestEventForCoordinate(events, pubkey, 10002);
        if (!active || !event) return;
        const relays = event.tags.filter(([name, url]) => name === 'r' && !!url)
          .map(([, url, marker]) => ({ url, read: marker !== 'write', write: marker !== 'read' }))
          .filter(relay => {
            try { const url = new URL(relay.url); return (url.protocol === 'wss:' || url.protocol === 'ws:') && !!url.host; }
            catch { return false; }
          });
        const deduplicated = [...new Map(relays.map(relay => [relay.url.trim().replace(/\/+$/, '').toLowerCase(), relay])).values()];
        updateConfig(current => {
          if (current.userRelayPubkey !== pubkey) return current;
          const previous = current.userRelayMetadata;
          if (previous && (event.created_at < previous.updatedAt ||
            (event.created_at === previous.updatedAt && previous.eventId && !isNewerReplaceableEvent(event, { created_at: previous.updatedAt, id: previous.eventId })))) return current;
          return { ...current, userRelayMetadata: { relays: deduplicated, updatedAt: event.created_at, eventId: event.id } };
        });
      } catch (error) {
        if (active) console.error('Failed to sync NIP-65 relays from Nostr:', error);
      }
    })();
    return () => { active = false; };
    // updateConfig uses the shared storage ref; re-running on its changing function identity would repeat relay requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, nostr]);

  useEffect(() => {
    if (!pubkey) return;
    let active = true;
    void (async () => {
      try {
        const events = await nostr.query([{ kinds: [10063], authors: [pubkey], limit: 20 }], { signal: AbortSignal.timeout(5000) });
        const event = newestEventForCoordinate(events, pubkey, 10063);
        if (!active || !event) return;
        const servers = parseBlossomServerList(event);
        updateConfig(current => {
          if (current.userRelayPubkey !== pubkey) return current;
          const previous = current.blossomServerMetadata;
          // Legacy entries do not tell us whether they were local edits. Preserve
          // differing lists until the user explicitly publishes or reloads them.
          const legacyUnknown = !!previous && previous.updatedAt > 0 && !previous.eventId && previous.isLocal === undefined;
          const sameServers = JSON.stringify(previous?.servers ?? []) === JSON.stringify(servers);
          if (previous?.isLocal || (legacyUnknown && !sameServers)) return current;
          if (previous?.pubkey === pubkey && previous.eventId && !isNewerReplaceableEvent(event, { created_at: previous.updatedAt, id: previous.eventId })) return current;
          return { ...current, blossomServerMetadata: { servers, updatedAt: event.created_at, eventId: event.id, pubkey, isLocal: false } };
        });
      } catch (error) {
        if (active) console.error('Failed to sync Blossom servers from Nostr:', error);
      }
    })();
    return () => { active = false; };
    // Re-run for account or relay changes, not for updateConfig's changing function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, nostr, readRelayKey]);

  return null;
}
