# Ostrify Code Audit

**Last updated:** 2026-11-24 after the relay/Blossom sync, TuneStr revision, and follower-discovery follow-up. The original re-audit reviewed commit `305d88a`; subsequent updates record the library-write, library-read, and selection changes.

**Scope:** A targeted review of previous audit findings and representative security, Nostr, playback, persistence, accessibility, and catalog code. This is not a complete security assessment or a comprehensive signer, cross-device, accessibility, or performance test. Statuses describe the reviewed implementation and its known limitations; completion of a relay query does not prove that a relay has all events.

**Status key:** **Done** = the specific earlier recommendation is present in the reviewed code; **Partial** = some improvements are present but meaningful follow-up remains; **Open** = the issue or recommendation remains; **Review** = an opportunity requiring measurement or broader verification rather than a confirmed defect.

## Remaining work, in priority order

1. **Secure video embeds and review external URLs.** Restrict supported iframe hosts, provide a safe fallback, and review CSP and other untrusted URL sinks. See §1.
2. **Harden playback.** Test and improve queue restoration, track removal, end-of-queue behavior, rapid changes, and autoplay rejection; clarify the Next button. See §11.
3. **Complete NIP-19 destinations.** Replace note, event, and addressable-event placeholders with useful views or clear unsupported states. See §13.
4. **Review private invites.** Assess replay and ordering assumptions and measure inbox decryption and signer prompts. Preserve the correct distinction between wrapper and seal authors. See §§2–3.
5. **Improve accessibility.** Check live loading announcements, keyboard navigation, focus indicators, and dark-theme contrast. See §12.
6. **Improve notification and relay transparency.** Explain notification limitations and measure polling and TuneStr relay request costs before optimizing. See §§7–8.
7. **Finish external-data and sharing review.** Validate remaining catalog URL and metadata handling, then confirm the intended canonical domain and social sharing previews. See §9 and the sharing-metadata observation below.
8. **Clean up cache-key and maintainability issues.** Review Home-session cache behavior, shared key helpers, and compressed JSX. The duplicate podcast guard is already fixed. See §§10 and 14.

**Replaceable-event follow-up:** The three identified settings, TuneStr, and follower paths have been addressed, subject to relay and verification limitations in §5.

**Completed library-read improvement:** Per-relay response coverage, cached-revision reconciliation, and partial-result notices are implemented. The remaining limitations and verification needs are documented in the library-completeness section below.

**Follow-up on library writes:** The requested safeguards have been implemented, but authenticated, cross-tab, and multi-device validation is still needed, and conflicts cannot be eliminated completely. Review private audiobook sync separately. See §6.

## Previous findings: status at a glance

| Previous finding | Status | Summary |
| --- | --- | --- |
| Listening status clearing feedback | **Done** | Settings distinguishes local opt-out, pending, success, and failure, and warns about retained copies. |
| NIP-17 validation | **Partial** | Wrap, seal, rumor, author, timestamp structure, and relevant tags are checked; further protocol and replay review is worthwhile. The old recommendation to match seal and wrapper authors was incorrect. |
| NIP-17 sync cost | **Partial** | Processed wrap IDs are cached during the query-cache lifetime, but initial decryptions and retries can still be expensive. |
| External catalog validation | **Partial** | The specifically cited audiobook covers and metadata now have meaningful checks; other catalog paths still need a systematic review. |
| Notification baseline and polling | **Partial** | The UI mentions device-local storage and known followers are retained across refreshes. Initial omissions and polling costs still merit review. |
| Cache-key mismatches | **Partial** | Normal playlist, artist, and podcast update paths account for relay-scoped keys; Home-session keys and consistency still need review. |
| Library-read relay completeness | **Done** | Per-relay EOSE coverage is reported, incomplete results are surfaced, and the reviewed library reads retain the newest known revisions. Relay data can still be missing or stale. |
| URL validation and iframe origins | **Open** | Stream URLs are HTTPS-validated but arbitrary HTTPS hosts can still be embedded; CSP allows HTTPS frames. |
| Replaceable-event selection | **Done** | The specifically identified settings, TuneStr, follower, profile and library paths now reconcile revisions using the NIP-01 tie-break. Relay completeness and controlled-conflict validation remain limitations; this is not a proof of app-wide coverage. |
| Concurrent replaceable-list writes | **Partial** | Public library writes now use local coordination, relay reconciliation, and delivery warnings; cross-device conflicts remain possible and authenticated testing is outstanding. |
| Playback edge cases and tests | **Open** | The Next button can still be activated at the queue end; no focused player test file was found. |
| Accessibility consistency | **Open** | Some asynchronous placeholders still use labels without a live status; a broader accessibility check remains. |
| NIP-19 destinations | **Open** | Note, event, and addressable-event routes still show placeholders. |
| Duplicate podcast read-relay check | **Done** | The duplicate guard was removed in the library-write update. |
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

### 5. Replaceable-event selection — Done for the identified paths, with limitations

The shared comparator in `src/lib/libraryQuery.ts` selects the newest timestamp and, on a tie, the lexically lowest event ID. Coordinate selection checks author and kind, and for addressable events the first `d` tag. Library reconciliation keeps whole signed revisions and can consider recent local public writes.

**Implemented in this update:**

- Remote profile privacy and the public followed-people view reconcile the same coordinate and observe the shared revision; friend library playlist, album, artist, and people selection and music-status reads apply the tie-break with author/kind/identifier checks. Followed-artist display reads now request up to 20 candidates per relay instead of one.
- Private audiobook remote selection uses the same tie-break without placing decrypted data in the public revision cache. NIP-17 inbox-relay and Nostr follow lookups, direct-message relay selection, notification follow sets, account and author metadata, and publisher metadata also select matching revisions consistently.

**Follow-up implemented:**

- NIP-65 and Blossom sync select matching author/kind revisions with the same tie-break and retain event IDs for later comparisons. Local Blossom edits are marked and are not overwritten by background reads. Legacy lists whose source is unknown are preserved conservatively when they differ from the published list. Settings provides an explicit, confirmed option to replace the local list with a published list; if no list is returned or settings change during the lookup, the local list is kept. A publish does not discard edits made while signing.
- TuneStr rechecks discovered kind-30311 coordinates by author and identifier without the original topic or time filter. It selects the latest revision before parsing, including across loaded pages, so a received unplayable replacement can suppress an older playable revision. Missing responses and bounded lookups are reported as potentially incomplete.
- Public follower discovery treats `#p` results as candidates, then queries their current author-constrained follow sets without `#p`. It reconciles cached revisions and retains previously known followers when there is no evidence of an unfollow; partial or unconfirmed results show a warning and retry control.

**Limits:** Relays can omit newer events, apply limits, or return stale versions even after EOSE; neither follower lists nor TuneStr results are guaranteed complete. TuneStr coordinate checks are limited to 250 authors per batch, add a second relay request, and do not discover an event absent from the initial filters. The Blossom list is device-local when edited, including across account switches, until explicitly published or replaced; the explicit replacement uses only responding relays. Cross-tab coordination and real signer/account-switch races have not been fully tested. These changes address the reviewed paths, not every possible replaceable-event use in the app.

### 6. Concurrent replaceable-list writes — Partial

**Implemented in `25f6865`:**

- Playlist and like changes, playlist deletion, artist and people follows, profile-section visibility, podcast favorites, and saved albums use a shared per-coordinate in-memory write queue. Where Web Locks are available, cooperating Ostrify tabs on the same origin also coordinate writes.
- Before writing, `readLibraryForWrite()` queries the configured user-data read relays, requires at least one completed response, filters to the relevant author and kind, and considers valid recent locally published events and applicable cached events. It reports when some read relays did not finish. Same-second updates wait rather than deliberately publishing a future-dated replacement.
- Playlist editing, reordering, and deletion check the revision the user saw; conflicting changes produce a refresh-and-retry error instead of silently overwriting that revision. Reordering also checks the track IDs.
- `useLibraryPublish()` checks the signer account, sends to configured write relays individually, reports partial acceptance, and explains that a wholly unconfirmed update might still have reached a relay. The affected action UIs expose relevant errors. The app keeps a signed public last-write event locally to help cooperating tabs see it; no signer secret is stored there.
- The duplicate podcast read-relay guard was removed.

**Remaining limitations and work:**

- Nostr has no atomic compare-and-swap. Other devices, browsers, clients, and tabs without Web Locks can still publish concurrent replacements. A read can be incomplete or become stale between checking and publishing. Some relay reads may be incomplete and the write can still proceed with a warning; an accepting relay may not retain the event.
- Validate the safeguards with authenticated signers and controlled relays: simultaneous same-tab and cross-tab changes, delayed or missing relay responses, partial and unconfirmed writes, stale playlist edits and deletions, same-second updates, storage failure, and account switching. Also test real cross-device conflicts and clarify recovery where necessary. These scenarios have not been verified by the preview used for the implementation.
- Private audiobook sync uses its separate `useAudiobookLibrarySync.ts` flow; it was not moved to this public-library write coordinator. It now pauses remote reconciliation and publication when any selected relay fails to finish. Review its concurrent-update and deletion/merge behavior separately without storing decrypted private library content in the public-event cache.

### 7. Notifications and polling — Partial / Review

`NotificationsPanel` says updates are saved only on this device. `NotificationsBell.tsx` retains the union of previously known followers, reducing the original risk that a temporarily missing *already-known* follower is repeatedly reported as new. An initially omitted follower may still appear new when discovered later; the initial baseline and incomplete relay results are not explained in the UI. Its follower query still polls every 60 seconds.

`useSavedAlbums.ts` separately invalidates on window focus, while other queries use focus refresh or periodic polling. The former audit's broad focus/visibility-invalidation characterization was not re-established across the current app. Measure real request volume and overlapping triggers before changing them.

### 8. TuneStr query fan-out — Review

`useTunestrStreams.ts` sends four discovery filters to each selected and recommended relay, then sends a bounded author/identifier lookup for discovered stream revisions. It refreshes every 60 seconds while enabled and reports failed or unconfirmed lookups. Measure the added request volume, slow and partially responding relay behavior, and pagination before changing limits or deduplication. This is a performance investigation, not a measured defect in this audit.

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

### 14. Maintainability cleanup — Partial / Review

- **Done:** the duplicate `if (!readRelayKey)` check in `usePodcastFavoriteActions()` was removed in `25f6865`.
- Long compressed JSX remains, for example in `MyUploadsManager.tsx` and `NotificationsBell.tsx`. Extracting focused helpers could make future review safer, but should be prioritized below functional and security work.

## Additional observations from this review

### Library-read completeness across relays — Done, with limitations

**Implemented:**

- `queryLibraryEvents()` now deduplicates selected relays and records which relays reached EOSE and which did not. `complete` is true only when every selected relay finished, rather than when the first relay responded. The initial query uses a 1.6-second grace period after the first EOSE and a five-second overall limit; after an incomplete check, subsequent library retries wait up to the full five seconds for slower relays. Slow, failed, or stopped subscriptions are reported as incomplete. Events received before a relay stops are still considered.
- Followed artists, saved podcasts, followed people, and saved albums reconcile the newest known **whole signed revision** with new relay results and recent local writes. This protects known newer lists from an empty or stale partial response without automatically unioning incompatible revisions and resurrecting removed entries. Playlist reads retain cached entries and honor known deletion events; their event comparison now includes the tie-break.
- Library views, including Liked Songs, followed artists, saved podcasts, saved albums, friends, playlist pages, and profile settings, report incomplete relay responses or preserve an existing partial-state warning. Users can retry. If no privacy preference event is known and the read is partial, Ostrify treats profile visibility as unconfirmed instead of assuming it is public.
- Private audiobook sync keeps local data unchanged and pauses remote reconciliation and publication when any selected relay did not finish; the audiobook library provides retry and relay-settings controls. Automatic friend migration is also paused on a partial follow-list read.

**Limits and follow-up:** EOSE only confirms that a relay finished this bounded query; it does not prove the relay retained every event, delivered the latest revision, or returned results beyond query limits. The short grace period deliberately favors responsiveness and can classify slow relays as incomplete. Cached remote revisions are retained in the current app query cache; this is not a durable backup or cross-device sync. With unavailable selected relays, private audiobook sync and automatic friend migration remain paused until a full check succeeds. Check real-world relay responsiveness and, if necessary, refine retry or relay-selection guidance. Cross-device conflicts, write delivery, other public-profile queries, and broader replaceable-event consistency remain separate follow-up work.

Browser checks with simulated relay responses exercised complete, delayed, and failed responses, duplicate relay URLs, longer retries, cached newer revisions, mismatched authors, and timestamp ties. A signed-in preview also showed partial-result notices and retry controls with live relays. These checks do not replace automated tests or full cross-device testing.

### Sharing metadata points to a different host — Review

`index.html` hardcodes `og:url`, `og:image`, and `twitter:image` to the Shakespeare deployment at `0171xlfg6yo0wjs9yhveno8onk4d56evm4dkxm6qq323hyigvhostrify.shakespeare.to`; the README also identifies `ostrify.studio314.us`. Confirm which domain should be canonical and that its image is publicly reachable before changing these tags. Social crawlers often rely on the initial HTML rather than client-side metadata; validate actual share previews after any change.

### Chart helper uses injected CSS — Review

`src/components/ui/chart.tsx` builds a `<style>` element with `dangerouslySetInnerHTML` from chart configuration. The search in this review found no current application use of `ChartContainer` outside the helper, so this is not an identified active event-data injection path. If used later, keep its IDs, color values, and configuration keys trusted or strictly validated; do not pass Nostr-sourced strings into CSS unchecked.

## Validation and review history

- The original re-audit compared previous findings to source and reviewed NIP-17 and NIP-59 for the wrapper/seal author correction. Its review was static; it did not exercise live signers, relays, multiple devices, playback, screen readers, or performance.
- For library-write commit `25f6865`, `tsc --noEmit` and Shakespeare's `build_project` passed. The signed-out library and like flows rendered in preview. Authenticated writes, relay failures, and cross-device conflicts were not exercised. `npm test` and a direct Vitest attempt could not run because the necessary commands/packages were unavailable in that environment.
- The library-read update was checked with simulated relay responses in the preview and a temporary signed-in preview account for partial notices, privacy controls, and retry controls. `tsc --noEmit` and Shakespeare's build passed. `npm test` and a direct Vitest attempt could not run because `npm` and Vitest are unavailable in this environment. No live cross-device conflict test or automated test suite was performed for this update; see the library-completeness section for the checks and their limits.
- For the replaceable-event selection update, `tsc --noEmit` and Shakespeare's build passed. A public profile loaded from live relay responses in preview, including its followed people and playlists, and expanding a playlist worked. The preview did not verify same-second competing events or authenticated signer flows. `npm test` could not run because `npm` is unavailable; direct Vitest was also unavailable.
- For the settings, stream, and follower follow-up, `tsc --noEmit` and Shakespeare's build passed. The preview showed a local Blossom edit surviving reload, and kept the list when no published list was found. Live TuneStr results and an older-recording batch rendered, and the public follower view displayed its partial-result warning and retry control. A temporary browser check of the actual TuneStr merge helper passed for timestamp ties across pages, a newer unplayable replacement, and separate authors; the temporary harness was removed. The preview did not simulate competing relay responses for followers or settings, or exercise a real signer, cross-tab edits, or account switches. `npm test` and Vitest remain unavailable in this environment.
