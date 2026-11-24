# Ostrify Code Audit

**Re-audited:** 2026-11-24 against commit `305d88a` (before this report update).

**Scope:** A targeted, read-only review of the previous audit findings and representative security, Nostr, playback, persistence, accessibility, and catalog code. This is not a complete security assessment or a live relay, signer, cross-device, accessibility, or performance test. Statuses describe what the code currently shows; they do not establish when a change was made or guarantee behavior in every environment. No application code was changed for this audit.

**Status key:** **Done** = the specific earlier recommendation is present in the reviewed code; **Partial** = some improvements are present but meaningful follow-up remains; **Open** = the issue or recommendation remains; **Review** = an opportunity requiring measurement or broader verification rather than a confirmed defect.

## Previous findings: status at a glance

| Previous finding | Status | Summary |
| --- | --- | --- |
| Listening status clearing feedback | **Done** | Settings distinguishes local opt-out, pending, success, and failure, and warns about retained copies. |
| NIP-17 validation | **Partial** | Wrap, seal, rumor, author, timestamp structure, and relevant tags are checked; further protocol and replay review is worthwhile. The old recommendation to match seal and wrapper authors was incorrect. |
| NIP-17 sync cost | **Partial** | Processed wrap IDs are cached during the query-cache lifetime, but initial decryptions and retries can still be expensive. |
| External catalog validation | **Partial** | The specifically cited audiobook covers and metadata now have meaningful checks; other catalog paths still need a systematic review. |
| Notification baseline and polling | **Partial** | The UI mentions device-local storage and known followers are retained across refreshes. Initial omissions and polling costs still merit review. |
| Cache-key mismatches | **Partial** | Normal playlist, artist, and podcast update paths account for relay-scoped keys; Home-session keys and consistency still need review. |
| URL validation and iframe origins | **Open** | Stream URLs are HTTPS-validated but arbitrary HTTPS hosts can still be embedded; CSP allows HTTPS frames. |
| Replaceable-event selection | **Open** | Several paths still sort only by timestamp; followed-artist reads still use `limit: 1` per relay. |
| Concurrent replaceable-list writes | **Open** | Some read or cache safeguards exist, but concurrent writes can still overwrite each other. |
| Playback edge cases and tests | **Open** | The Next button can still be activated at the queue end; no focused player test file was found. |
| Accessibility consistency | **Open** | Some asynchronous placeholders still use labels without a live status; a broader accessibility check remains. |
| NIP-19 destinations | **Open** | Note, event, and addressable-event routes still show placeholders. |
| Duplicate podcast read-relay check | **Open** | The duplicate guard is still present. |
| JSX maintainability | **Review** | Long, compressed JSX remains in several components. |
| TuneStr request cost | **Review** | Per-relay multi-filter queries remain; performance and partial-result behavior need measurement. |

## Detailed findings and recommendations

### 1. URL validation and iframe origins — Open

`src/hooks/useTunestrStreams.ts` applies `sanitizeUrl()` to event-sourced streaming and recording URLs, and also sanitizes stream images. However, `streamPlaybackUrl()` returns other HTTPS URLs unchanged, and `src/components/music/TunestrPlayer.tsx` loads those URLs in an iframe without a host allowlist. A publicly supplied music-tagged stream can therefore cause an arbitrary HTTPS page to be embedded. The earlier report located the iframe in `MusicDiscovery.tsx`; it is now in `TunestrPlayer.tsx`.

`index.html` still permits `frame-src 'self' https:`. Consider an explicit set of supported embed hosts, a safe external-link fallback for unsupported providers, and a correspondingly narrower CSP after checking provider compatibility. Review event- and catalog-sourced URLs throughout the app rather than assuming every raw-looking render site lacks parse-time validation. `src/lib/sanitize.ts` allows HTTPS only; its comment incorrectly also mentions data images.

### 2. NIP-17 friend-message validation — Partial; correction to prior audit

`src/hooks/useFriends.ts` now validates the outer wrap and seal signatures, kind and field shape, recipient and application tags, safe integer timestamps, an empty seal tag list, an unsigned kind-14 rumor, the rumor hash, and the **seal-to-rumor author match**. It checks that the current user participates in the rumor. These are meaningful improvements over the previous description.

**Correction:** The old audit suggested matching the seal author against the outer gift-wrap author. Do **not** add that check: NIP-17/NIP-59 use a one-time wrapper key, which normally differs from the sender's seal key. NIP-17 instead requires matching the seal author to the rumor author, which the code does.

Further review should consider application-specific replay, ordering, timestamp bounds, and malformed or adversarial messages without rejecting legitimate randomized wrapper timestamps or valid protocol behavior. This review did not prove a replay vulnerability.

### 3. Friend inbox sync cost — Partial

`useFriends.ts` still queries up to 500 gift wraps every 30 seconds and decrypts unseen wraps sequentially. It now remembers successfully processed wrap IDs in the TanStack Query cache, so repeated polls within that cache lifetime do not repeatedly decrypt the same wraps. Failed signer decryptions remain eligible for retry; initial loads, cache loss, and repeated failures may still prompt users or be costly. Measure with extension and remote signers, and consider bounded/incremental processing while accounting for NIP-17 randomized timestamps and potentially missed older events.

### 4. Listening activity clearing feedback — Done

`src/hooks/useListeningSharing.ts`, `src/components/music/ListeningStatusSync.tsx`, and `src/pages/SettingsPage.tsx` communicate pending, published, and failed clear results. Settings says that sharing is off locally while an earlier public status may remain visible, and warns that relays and clients can retain older copies. This addresses the original UI recommendation; acceptance by the configured publisher is not proof that every relay erased a prior status.

### 5. Replaceable-event selection — Open

`useProfilePrivacy.ts`, `useFollowedPeople.ts`, and `useFriendLibrary.ts` still select some kind-30000 events by timestamp only. NIP-01's event-ID tie-break should be applied consistently alongside kind, author, and `d`-tag checks. `useFollowedArtists.ts` still requests `limit: 1` per relay, although `queryLibraryEvents()` now queries multiple relays and can preserve cached artists when its result is incomplete. Review whether querying additional candidates and using a shared comparator improves convergence; no client can retrieve versions that no responding relay supplies.

### 6. Concurrent replaceable-list writes — Open

`useFollowedPeople.ts` compares a fetched event with its cached event and rejects some same-second writes; podcast favorites and artist follows also query before publishing. Playlists, however, prefer a cached entry in `usePlaylists.ts`, and none of these read-then-publish flows can guarantee conflict-free updates across tabs or devices. Serialize local writes where appropriate, reconcile with recent relay state, and explain uncertain delivery or conflicts. Nostr relays do not provide an atomic compare-and-swap, so such safeguards cannot guarantee cross-device conflict prevention.

### 7. Notifications and polling — Partial / Review

`NotificationsPanel` says updates are saved only on this device. `NotificationsBell.tsx` retains the union of previously known followers, reducing the original risk that a temporarily missing *already-known* follower is repeatedly reported as new. An initially omitted follower may still appear new when discovered later; the initial baseline and incomplete relay results are not explained in the UI. Its follower query still polls every 60 seconds.

`useSavedAlbums.ts` separately invalidates on window focus, while other queries use focus refresh or periodic polling. The former audit's broad focus/visibility-invalidation characterization was not re-established across the current app. Measure real request volume and overlapping triggers before changing them.

### 8. TuneStr query fan-out — Review

`useTunestrStreams.ts` sends four filters to each selected and recommended relay, refreshes every 60 seconds while enabled, and tracks failed relays. Check actual request volume, slow and partially responding relay behavior, and pagination before choosing limits or deduplication changes. This is a performance investigation, not a measured defect in this audit.

### 9. External data validation — Partial

The earlier audiobook-specific recommendation is substantially addressed: `useLibriVox.ts` and `useGutenbergAudiobooks.ts` check response shape and identifiers, construct Internet Archive cover and audio URLs from validated identifiers, and sanitize the Gutenberg source URL; `AudiobookCover.tsx` sanitizes cover URLs before rendering. A broader review of other external catalog fields and URL sinks remains advisable; this audit did not establish that every catalog is fully validated.

### 10. Query cache keys — Partial

`useFollowedArtists.ts` uses prefix-based `setQueriesData` for ordinary relay-scoped keys, `usePlaylists.ts` updates ordinary playlist keys with a relay-aware cache key and prefix updates, and `usePodcastFavoriteActions()` updates its full relay-aware key. Thus the old examples should not be treated as evidence that all writes simply omit relay keys.

Home queries can instead be prefixed with `['home-session', scope, ...]` by `homeSessionQueryKey()`, while the normal playlist and artist update/invalidation prefixes start with `['playlists', ...]` or `['followed-artists', ...]`. Check whether those separate Home snapshots are intentionally stable or should be reconciled after mutations. Shared key factories and focused tests would make the intended scope clearer.

### 11. Playback edge cases and tests — Open

`src/components/PlayerProvider.tsx` handles queue restoration and autoplay rejection in several paths, but no focused player test file was found among the existing test files. Add coverage for restored empty queues, removing the active item, end-of-queue behavior, rapid updates, and rejected playback. `PlayerBar.tsx` disables Next only when no track is selected. At the end of a non-repeating, non-shuffled queue, `next()` sets playback to stopped rather than advancing; decide whether to disable the control or make this behavior clear. Shuffle, repeat, and autoplay should be considered before changing the button.

### 12. Accessibility consistency — Open

Some structured loading states still use `aria-label` on non-live containers, for example `FriendsActivitySheet.tsx`, `NostrCollections.tsx`, and `AudiobooksPage.tsx`. Other areas already use `role="status"` or `aria-live`. Review meaningful asynchronous announcements, keyboard navigation, focus indicators, and dark-theme text contrast with real assistive technology and contrast measurements; these were not tested here.

### 13. NIP-19 destinations — Open

`src/pages/NIP19Page.tsx` resolves `npub` and `nprofile`, but renders `Note placeholder`, `Event placeholder`, and `Addressable event placeholder` for the other supported identifier types. Implement appropriate content views or useful unsupported/not-found states. This does not mean Ostrify's separate `/audio` or `/listen` sharing routes are necessarily broken.

### 14. Maintainability cleanup — Open / Review

- The duplicate `if (!readRelayKey)` check remains in `src/hooks/usePodcasts.ts` inside `usePodcastFavoriteActions()`.
- Long compressed JSX remains, for example in `MyUploadsManager.tsx` and `NotificationsBell.tsx`. Extracting focused helpers could make future review safer, but should be prioritized below functional and security work.

## Additional observations from this review

### Library completeness can overstate cross-relay coverage — Review

`src/lib/libraryQuery.ts` sets `complete = true` when **one** relay sends EOSE, then gives other relays a 700 ms grace period. This means the flag indicates at least one completed response, not that all selected relays responded or that the newest version was retrieved. For example, `useFollowedArtists.ts` replaces its cached list when `complete` is true; a fast but stale or empty relay combined with a slow relay could make the displayed list temporarily lose entries. Consider reporting per-relay completion separately and making cache replacement decisions reflect the intended trade-off between speed and completeness. A live-relay reproduction was not performed.

### Sharing metadata points to a different host — Review

`index.html` hardcodes `og:url`, `og:image`, and `twitter:image` to an older-looking `shakespeare.to` host, while the README identifies `ostrify.studio314.us` and the project also has a `shakespeare.wtf` deployment URL. Confirm the intended canonical domain and that the image is publicly reachable before updating these tags. Social crawlers often rely on the initial HTML rather than client-side metadata; validate actual share previews after any change.

### Chart helper uses injected CSS — Review

`src/components/ui/chart.tsx` builds a `<style>` element with `dangerouslySetInnerHTML` from chart configuration. The search in this review found no current application use of `ChartContainer` outside the helper, so this is not an identified active event-data injection path. If used later, keep its IDs, color values, and configuration keys trusted or strictly validated; do not pass Nostr-sourced strings into CSS unchecked.

## Validation performed

- Compared each previous finding to current source and reviewed NIP-17 and NIP-59 for the wrapper/seal author correction.
- Static review only; no live signer, relay, multi-device, playback, screen-reader, or performance tests were performed.
- `tsc --noEmit` passed.
- Shakespeare's `build_project` completed successfully, and the Home page rendered in preview. No application UI was changed by this audit.
- `npm test` could not run: `npm` is not available in this environment. Therefore the full test script, including ESLint and Vitest, was not verified.
