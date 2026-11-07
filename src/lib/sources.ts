/**
 * Well-known Nostr pubkeys that publish large music catalogs. Querying these
 * authors directly guarantees we pull in their catalog even when the general
 * feed on the configured relays is sparse.
 */

/** Wavlake re-publishes its entire catalog from this proxy pubkey. */
export const WAVLAKE_PUBKEY =
  "2250f69694c2a43929e77e5de0f6a61ae5e37a1ee6d6a3baef1706ed9901248b";

/** Featured music catalog publishers (hex pubkeys). */
export const FEATURED_MUSIC_PUBKEYS: string[] = [WAVLAKE_PUBKEY];
