import { useEffect } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { parseBlossomServerList } from '@/lib/appBlossom';

/**
 * NostrSync - Syncs user's Nostr data
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Currently syncs:
 * - NIP-65 relay list (kind 10002), for optional use inside Ostrify
 * - BUD-03 Blossom server list (kind 10063)
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();

  useEffect(() => {
    if (!user) {
      if (config.includeUserRelays || config.userRelayPubkey) {
        updateConfig(current => ({
          ...current,
          userRelayMetadata: { relays: [], updatedAt: 0 },
          userRelayPubkey: '',
          includeUserRelays: false,
        }));
      }
      return;
    }

    let active = true;
    if (config.userRelayPubkey !== user.pubkey) {
      updateConfig(current => ({
        ...current,
        userRelayMetadata: { relays: [], updatedAt: 0 },
        userRelayPubkey: user.pubkey,
        includeUserRelays: false,
      }));
    }

    const syncUserRelaysFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
          {
            signal: AbortSignal.timeout(5000),
            relays: ['wss://relay.nostr.net/', 'wss://nos.lol/', 'wss://nostr.wine/'],
          }
        );
        const event = events
          .filter(candidate => candidate.pubkey === user.pubkey && candidate.kind === 10002)
          .sort((a, b) => b.created_at - a.created_at)[0];
        if (!active) return;
        if (config.userRelayPubkey !== user.pubkey) {
          updateConfig(current => current.userRelayPubkey === user.pubkey
            ? current
            : {
                ...current,
                userRelayMetadata: { relays: [], updatedAt: 0 },
                userRelayPubkey: user.pubkey,
              });
        }
        if (!event) {
          updateConfig(current => current.userRelayPubkey === user.pubkey
            ? current
            : {
                ...current,
                userRelayMetadata: { relays: [], updatedAt: 0 },
                userRelayPubkey: user.pubkey,
              });
          return;
        }
        if (config.userRelayPubkey === user.pubkey && event.created_at <= config.userRelayMetadata.updatedAt) return;

        const relays = event.tags
          .filter(([name, url]) => name === 'r' && !!url)
          .map(([, url, marker]) => ({
            url,
            read: marker !== 'write',
            write: marker !== 'read',
          }))
          .filter(relay => {
            try {
              const parsed = new URL(relay.url);
              return (parsed.protocol === 'wss:' || parsed.protocol === 'ws:') && !!parsed.host;
            } catch {
              return false;
            }
          });
        const deduplicated = [...new Map(
          relays.map(relay => [relay.url.trim().replace(/\/+$/, '').toLowerCase(), relay]),
        ).values()];

        updateConfig(current => ({
          ...current,
          userRelayMetadata: { relays: deduplicated, updatedAt: event.created_at },
          userRelayPubkey: user.pubkey,
        }));
      } catch (error) {
        console.error('Failed to sync NIP-65 relays from Nostr:', error);
      }
    };

    syncUserRelaysFromNostr();
    return () => { active = false; };
  }, [user, config.userRelayMetadata.updatedAt, config.userRelayPubkey, config.userRelayMetadata.relays.length, nostr, updateConfig]);

  useEffect(() => {
    if (!user) return;

    const syncBlossomServersFromNostr = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [10063], authors: [user.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) }
        );

        if (events.length > 0) {
          const event = events[0];

          // Only update if the event is newer than our stored data
          if (event.created_at > config.blossomServerMetadata.updatedAt) {
            const fetchedServers = parseBlossomServerList(event);

            console.log('Syncing Blossom server list from Nostr:', fetchedServers);
            updateConfig((current) => ({
              ...current,
              blossomServerMetadata: {
                servers: fetchedServers,
                updatedAt: event.created_at,
              },
            }));
          }
        }
      } catch (error) {
        console.error('Failed to sync Blossom servers from Nostr:', error);
      }
    };

    syncBlossomServersFromNostr();
  }, [user, config.blossomServerMetadata.updatedAt, nostr, updateConfig]);

  return null;
}
