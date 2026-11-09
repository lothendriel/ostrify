# Ostrify Code Audit

**Scope:** Read-only review of the project structure and representative application code, with particular attention to Nostr data handling, playback, persistence, API requests, security, accessibility, and maintainability. No application code was changed for this audit.

## Highest-priority suggestions

### 1. Tighten URL validation and iframe origins

`src/lib/sanitize.ts` accepts any absolute HTTPS URL, while several components use remote URLs without calling it. The clearest concern is `src/pages/MusicDiscovery.tsx`, which renders an event-derived stream URL in an iframe. Validate the URL and allowlist supported embed hosts before rendering it. Apply the same URL policy consistently to event- and catalog-sourced images and links.

The Content Security Policy in `index.html` currently permits `frame-src https:`. Where practical, restrict frames to the providers the app actually embeds. URL validation and a narrower CSP provide complementary defenses.

### 2. Review NIP-17 friend-message validation and sync costs

`src/hooks/useFriends.ts` verifies the seal signature and rumor event hash, but `unwrapMessage()` does not explicitly check the seal author against the outer gift-wrap author or validate the rumor timestamp and complete expected tag structure. Review the NIP-17 validation and replay assumptions, add the appropriate checks, and document those rules.

The hook may query up to 500 gift wraps and decrypt them sequentially every 30 seconds. This can create significant work and repeated interactive signer prompts. Profile this path and consider incremental synchronization or a smaller bounded strategy.

### 3. Clarify whether listening activity was actually cleared

`src/components/music/ListeningStatusSync.tsx` disables local sharing and attempts to publish an empty status, but logs a warning if publishing fails. The UI may still say activity is private even when a previously published status remains visible until expiration. Surface delivery failure and distinguish “sharing disabled on this device” from “status successfully cleared on relays.”

### 4. Use consistent replaceable-event selection

Several kind `30000` lookups select the latest event by timestamp only. NIP-01 defines an event-ID tie-break when timestamps match. This pattern appears in privacy, followed-artist, friend-library, and follow-list paths. A shared helper for selecting the latest replaceable event—with the tie-break and author checks—would avoid inconsistent results.

`useFollowedArtists()` requests `limit: 1` and sorts the returned result locally. If a relay returns an older copy, the client may not see the newest version. Consider querying and selecting the latest event robustly across configured read relays.

### 5. Protect replaceable-list writes from concurrent updates

Playlist, podcast-favorite, followed-artist, and followed-people mutations read the current event and then publish a replacement. Concurrent changes from another tab or device can be overwritten. Consider serializing writes within the app and reconciling with the newest relay state before publishing. Make conflicts or uncertain delivery visible rather than silently losing changes.

## Other worthwhile improvements

### Notifications and polling

- `NotificationsBell.tsx` uses the initial observed follower set as its baseline, and stores notifications only on the current device. Relay omissions can make a previously known follower appear new later. Explain these limits in the UI and consider how to reduce false notifications.
- The app invalidates broad query groups on focus and visibility changes, while some queries also poll periodically. Measure request volume and deduplicate refresh triggers, especially for mobile clients and slow relays.
- TuneStr discovery fans out several filters across multiple relays per page. Review the request cost, limits, and behavior when only some relays respond.

### External data validation

`src/hooks/usePodcasts.ts` performs useful runtime checks on Podcast Index and Fountain responses. Apply similarly thorough validation to other external catalog data, especially audiobook cover URLs and metadata before using them in `src` or `href` attributes.

### Query cache keys

Some cache writes use keys that differ from the full query keys. For example, playlist and followed-artist cache updates omit relay-key segments. Centralized query-key factories would make updates and invalidations easier to reason about and less error-prone.

### Playback edge cases and tests

`src/components/PlayerProvider.tsx` contains substantial queue, restore, and audio-element logic. It is a high-value target for focused tests covering restored empty queues, removing the current track, advancing at the end of a queue, rapid queue changes, and autoplay rejection. The “Next” button remains enabled at the end of a non-repeating queue, where pressing it has no effect; consider disabling it or defining clearer behavior.

### Accessibility consistency

Some loading placeholders use `aria-label` on non-live containers, which may not be announced by assistive technology. Use `role="status"` or an appropriate `aria-live` region for meaningful asynchronous updates, and review small-text contrast in the dark theme. Continue checking keyboard access and focus indicators on dialogs, menus, and custom controls.

### Incomplete NIP-19 destinations

`src/pages/NIP19Page.tsx` currently renders placeholders for note, event, and addressable-event identifiers. This may be intentional, but users opening shared NIP-19 links will reach incomplete views. Consider implementing those routes or giving them a clear, useful unsupported-content state.

### Maintainability cleanup

- `usePodcastFavoriteActions()` contains a duplicate `readRelayKey` check.
- Several components contain very compressed, long JSX expressions. Formatting and extracting shared UI and query helpers would make future review and changes safer.

## Validation performed

- TypeScript check: `tsc --noEmit` passed.
- The full `npm test` script could not be run because `npm` is not available in the audit environment.
- The working tree was clean at the start of the audit. No application code was modified.
