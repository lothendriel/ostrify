# Changelog

All notable user-facing changes to Ostrify are recorded here, newest first.

## Updates — 2026-11-27

### Library and sync

- Added relay sync status panels, retry controls, and direct relay-settings links across library pages, including playlists, saved music, podcasts, recordings, and audiobook collections. Partial results warn that another device may have unseen changes.
- Added Local Radio discovery and a Favorite Radio library, with private NIP-44 sync across devices and partial-relay feedback. Added HLS playback and visualizer support for compatible radio streams.
- Combined Liked Songs and Saved Albums under Saved Music. Improved private audiobook sync and protected library reads and updates against stale or incomplete relay responses.
- Scoped browser playback sessions and queues to the active account.

### Playback and discovery

- Added Odysee music video discovery with pagination and embedded playback. TuneStr and Odysee videos open expanded by default; the video player supports adjustable sizes and docks when navigating.
- Coordinated video and audio playback and restored TuneStr video after refresh. Added a full-screen listening-room visualizer and track actions.
- Added artist and publisher Lightning payment options in the player, including compatible browser wallets and invoice payments when supported.
- Refreshed the app shell and audio cards, added featured audiobooks, and improved Home discovery stability and player controls.

### Privacy

- Listening activity sharing is now on by default for signed-in accounts without a saved preference. Existing off choices remain off. Sharing can be disabled in Settings; embedded video statuses indicate the video is open, not necessarily playing.

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
