import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * App default relays. Used as the initial `relayMetadata` for new users and as
 * a fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    // Broad discovery: read from many high-volume relays so Ostrify aggregates
    // as much music and as many podcasts as possible from across the network.
    { url: 'wss://relay.nostr.band/', read: true, write: false },
    { url: 'wss://nos.lol/', read: true, write: true },
    { url: 'wss://relay.primal.net/', read: true, write: true },
    { url: 'wss://relay.damus.io/', read: true, write: true },
    { url: 'wss://relay.ditto.pub/', read: true, write: true },
    { url: 'wss://relay.dreamith.to/', read: true, write: true },
  ],
  updatedAt: 0,
};
