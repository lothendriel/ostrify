import type { RelayMetadata } from '@/contexts/AppContext';

/**
 * Ostrify's recommended relay defaults. These initialize the app-specific
 * relay configuration and are not imported from or published to NIP-65.
 */
export const OSTRIFY_RELAY_URL = 'wss://relay.studio314.us/nostrrelay/ostrify';

export function normalizeRelayAddress(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

export function isRequiredAppRelay(url: string): boolean {
  return normalizeRelayAddress(url) === normalizeRelayAddress(OSTRIFY_RELAY_URL);
}

/** Get current-account relay URLs for one NIP-65 permission, omitting local Ostrify exclusions. */
export function getUserRelayUrls(
  userRelays: RelayMetadata,
  relayListPubkey: string,
  userPubkey: string,
  permission: 'read' | 'write',
  excludedRelayUrls: string[] = [],
  exclusionPubkey = relayListPubkey,
): string[] {
  if (!userPubkey || relayListPubkey !== userPubkey) return [];
  const excluded = new Set(exclusionPubkey === userPubkey ? excludedRelayUrls.map(normalizeRelayAddress) : []);
  return userRelays.relays
    .filter(relay => relay[permission] && !excluded.has(normalizeRelayAddress(relay.url)))
    .map(relay => relay.url);
}

/** Read locations for the current user's authored data: app-readable relays plus their NIP-65 write relays. */
export function getUserDataReadRelays(
  appRelays: RelayMetadata,
  userRelays: RelayMetadata,
  relayListPubkey: string,
  userPubkey: string,
  excludedRelayUrls: string[] = [],
  exclusionPubkey = relayListPubkey,
): string[] {
  return [...new Set([
    ...appRelays.relays.filter(relay => relay.read).map(relay => relay.url),
    ...getUserRelayUrls(userRelays, relayListPubkey, userPubkey, 'write', excludedRelayUrls, exclusionPubkey),
  ])].sort();
}

export const APP_RELAYS: RelayMetadata = {
  relays: [
    // Ostrify's own catalog and user-library relay; always available to read and publish.
    { url: OSTRIFY_RELAY_URL, read: true, write: true },
    // --- Music and podcast sources (read) ---
    // DROPS is dedicated to Nostr kind 36787 music tracks.
    { url: 'wss://drops.basspistol.org/', read: true, write: false },
    // Lightning FM's artist catalog uses kind 31337; reads are public.
    { url: 'wss://relay.lightning.fm/', read: true, write: false },
    // Wavlake is the biggest source of artist-published music tracks.
    { url: 'wss://relay.wavlake.com/', read: true, write: false },
    // Fountain hosts podcasts, music, and NIP-53 streams.
    { url: 'wss://relay.fountain.fm/', read: true, write: false },
    // TuneStr's community uses Lightning Relay and nostr.land for live music events.
    { url: 'wss://lightningrelay.com/', read: true, write: false },
    { url: 'wss://nostr.land/', read: true, write: false },

    // --- Additional community and discovery relays ---
    { url: 'wss://nos.lol/', read: true, write: true },
    { url: 'wss://relay.nostr.net/', read: true, write: true },
    { url: 'wss://nostr.wine/', read: true, write: false },
    { url: 'wss://relay.noswhere.com/', read: true, write: false },
    // Specializes in profiles/metadata — resolves artist names & avatars.
    { url: 'wss://purplepag.es/', read: true, write: false },
  ],
  updatedAt: 0,
};
