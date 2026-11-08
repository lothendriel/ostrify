import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * App default relays. Used as the initial `relayMetadata` for new users and as
 * a fallback when the user has no NIP-65 relay list configured (e.g. during
 * nostrconnect handshakes before any user relays have been loaded).
 */
export const APP_RELAYS: RelayMetadata = {
  relays: [
    // --- Music-focused sources (read) ---
    // Wavlake is the biggest source of artist-published music tracks.
    { url: 'wss://relay.wavlake.com/', read: true, write: false },
    // Fountain hosts podcasts, music, and NIP-53 streams.
    { url: 'wss://relay.fountain.fm/', read: true, write: false },
    // TuneStr's community uses Lightning Relay and nostr.land for live music events.
    { url: 'wss://lightningrelay.com/', read: true, write: false },
    { url: 'wss://nostr.land/', read: true, write: false },
    // Aggregating/indexing relay — great for discovery across the network.
    { url: 'wss://relay.nostr.band/', read: true, write: false },
    // Specializes in profiles/metadata — resolves artist names & avatars.
    { url: 'wss://purplepag.es/', read: true, write: false },

    // --- Broad, high-volume general relays (lots of audio notes & reposts) ---
    { url: 'wss://nos.lol/', read: true, write: true },
    { url: 'wss://relay.primal.net/', read: true, write: true },
    { url: 'wss://relay.damus.io/', read: true, write: true },
    { url: 'wss://nostr.wine/', read: true, write: false },
    { url: 'wss://relay.snort.social/', read: true, write: false },
    { url: 'wss://relay.ditto.pub/', read: true, write: true },
    { url: 'wss://relay.dreamith.to/', read: true, write: true },
  ],
  updatedAt: 0,
};
