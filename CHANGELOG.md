# Changelog

All notable user-facing changes to Ostrify are recorded here, newest first.

## Updates — 2026-11-21

- Home genre shelves with tracks now appear before empty shelves, allowing populated categories such as General to use open grid positions instead of leaving gaps between shelves.
- Refreshed the README feature list to describe current discovery, playback, library, sharing, privacy, relay, and analytics features and recent improvements.

## Ver. 1

Initial documented release of Ostrify as an open-protocol audio discovery and listening app.

### Features

- Browse Nostr music, genre shelves, Wavlake catalog tracks, and audio shared through the DROPS relay.
- Play music, podcasts, TuneStr streams and recordings, and audiobooks with a persistent player, queue, playback history, and listening controls.
- Discover podcasts from Nostr and Fountain references, and search the Podcast Index directory.
- Browse LibriVox and Project Gutenberg Open Audiobook Collection recordings.
- Search audio and opted-in Ostrify directory profiles; view music news and local listening analytics.
- Create and publish Nostr playlists and likes; save albums, podcasts, and audiobooks; follow artists and Ostrify accounts.
- Publish tracks and albums, manage uploaded music, and control whether tracks appear in Ostrify discovery.
- Find friends through the opt-in directory, send private NIP-17 invites, and optionally share listening status with NIP-38.
- Configure Ostrify-specific read and write relays, Blossom servers, profile visibility, and appearance preferences.

### Notes

- Public Nostr events and media URLs remain public. Ostrify visibility controls affect Ostrify discovery and do not delete relay copies or provide access control.
- Audiobook libraries can optionally sync privately using NIP-44 encrypted NIP-78 application data; playback state and listening analytics remain local to the browser.
- Content availability depends on configured relays, signer capabilities, external catalogs, and service credentials.
