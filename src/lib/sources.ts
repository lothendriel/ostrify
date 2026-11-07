/** Additional publisher queries for Nostr discovery. Availability and catalog
 * coverage depend on which relays respond; this is not a complete catalog. */

/** Wavlake's public profile pubkey; not a guarantee of a catalog feed. */
export const WAVLAKE_PUBKEY =
  "2250f69694c2a43929e77e5de0f6a61ae5e37a1ee6d6a3baef1706ed9901248b";

/** Featured music catalog publishers (hex pubkeys). */
export const FEATURED_MUSIC_PUBKEYS: string[] = [WAVLAKE_PUBKEY];
