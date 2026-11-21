# Ostrify relay list discussion

A transcript of the conversation about reducing Ostrify's default relay list and testing music/podcast discovery coverage.

---

## User

Which relays on the default list could we get rid of? The reason I ask is I was thinking of having where the users inbox and out box relays could be used and we could decrease the default relays. Default relays should be relays that are specifically used for music and podcasts. No work just yet. Let's talk

## Assistant

The list has **15 relays**. Most of the ones I’d consider removing as *defaults* are the six general-purpose relays:

- `nos.lol`
- `relay.primal.net`
- `relay.damus.io`
- `nostr.wine`
- `relay.snort.social`
- `relay.ditto.pub`
- `relay.dreamith.to`

That’s actually **seven** general-purpose relays in the current list. They can help with broad Nostr coverage, but they aren’t listed as music- or podcast-specific sources. I’d make them optional rather than include them for every new Ostrify user.

There are two other borderline cases:

- `relay.nostr.band` is a broad indexing/discovery relay, not music-specific. It may help find audio events beyond the specialized catalogs, so I’d keep it only if that broader discovery is important.
- `purplepag.es` specializes in profile metadata. It helps resolve artist names and avatars, but it isn’t a music or podcast catalog relay. It could also be optional.

The more clearly audio-focused defaults are:

- Ostrify’s own relay — needed for Ostrify’s catalog and app data.
- `drops.basspistol.org` — music tracks.
- `relay.lightning.fm` — artist catalog.
- `relay.wavlake.com` — music catalog.
- `relay.fountain.fm` — podcasts, music, and streams.
- `lightningrelay.com` and `nostr.land` — TuneStr events.

One important wrinkle: the app currently uses its relay list broadly. The same configured read relays are used for music discovery **and** for things like playlists, saved albums, follows, and other user library data; writes also go to the configured write relays. So using a user’s NIP-65 read/write relays makes sense for their personal Ostrify data, but ideally it shouldn’t replace the specialized relays used to discover music and podcasts. Those are two different jobs.

My suggested direction would be: **small, audio-focused defaults for discovery; use the user’s NIP-65 relays for their personal library and publishing; leave general-purpose relays as opt-in.** The main decision is whether to keep `nostr.band` and `purplepag.es` as convenience defaults, or apply the “only music and podcasts” rule strictly and make those optional too.

## User

what is the dreamith relay used for?

## Assistant

`relay.dreamith.to` is a **general-purpose Nostr relay**, not a music or podcast specialist. It’s run by Chad Curtis and uses the Ditto relay software. Public relay listings show support for standard Nostr events, search, and relay authentication; its operator’s apps cover various topics, from letters and geocaching to color palettes.

So, in Ostrify, it currently acts as one of the broad read/write relays: it may help with general Nostr discovery and provide another place to publish Ostrify library events. I don’t see a specific music or podcast function that would make it essential as an Ostrify default. It could be removed from the defaults if we decide to lean on users’ own relays for that general-purpose coverage.

## User

I just want to reduce the relay list because it's alot. What do you think? No work yet

## Assistant

I think reducing it is a good idea. Fifteen defaults is a lot, especially when several are general-purpose relays that don’t add a clear music or podcast role.

A lean default set could be about **seven relays**:

- Ostrify’s relay, for Ostrify’s own catalog and app data
- DROPS, Lightning.fm, and Wavlake, for music
- Fountain, for podcasts and audio
- Lightning Relay and nostr.land, for TuneStr events

I’d leave the broad relays—like Dreamith, Ditto, Primal, and nos.lol—out of the **default** list, while letting people add them or use their own relays. `nostr.band` and `purplepag.es` are useful for broader discovery and profile metadata, but they’re not specifically audio-focused, so I’d make those optional too if the goal is a clean, purpose-built list.

One distinction matters: the audio-source relays are for finding content; a user’s inbox/outbox relays are better suited to their own Nostr activity and library data. That seems like a sensible direction, with the caveat that users who aren’t signed in still need the public audio defaults to discover content. No changes made.

## User

Could we take the ones that aren't music or podcast focused and add them as a list of optional ones that users could add and then use their inbox and outbox relays? Would doing this change lessen Ostrify's ability to discover music and podcasts?

## Assistant

Yes. We could move the general-purpose relays out of the defaults and offer them as an **optional “Additional relays” list** users can add if they want broader Nostr coverage. Then Ostrify could also use a user’s own NIP-65 read/write relays for their personal library and publishing.

That **wouldn’t have to reduce music and podcast discovery**, as long as we keep the dedicated audio relays in the discovery set. Wavlake, Fountain, DROPS, and the other audio-focused sources would continue to provide their catalog content.

There is one tradeoff: general-purpose relays can contain music or podcast posts that aren’t on the specialized relays. Removing them from the defaults could mean fewer of those incidental finds, especially for signed-out users or users whose own relays have limited coverage. Using a signed-in user’s read relays could restore some personalized coverage, but it wouldn’t be a reliable substitute for broad public discovery.

I’d keep the roles separate:

- **Default discovery:** Ostrify’s relay plus the focused music/podcast sources.
- **Optional relays:** general-purpose relays users can add for wider Nostr coverage.
- **User relays:** use the user’s read/write preferences for their own activity and library, without replacing the audio discovery sources.

One terminology note: NIP-65 describes **read and write relays**. Nostr’s dedicated “inbox relays” are a separate setting used for private messages, so we should be clear which relay list we mean. No changes made.

## User

I am unsure what to do

## Assistant

That’s understandable—this changes where Ostrify looks for content and where it publishes library data, so there isn’t a one-size-fits-all answer.

**My recommendation:** make the default list smaller, but keep it focused on Ostrify’s own relay and the relays with a clear audio role. Put the general-purpose relays in an optional list rather than removing them from reach. That gives new users a simpler starting point without taking away the broader-relay option.

I’d treat using a person’s NIP-65 relays as a separate choice, not silently add them to every Ostrify operation. NIP-65 relays have read/write permissions, but they’re not necessarily optimized for music discovery. Using them may broaden discovery for signed-in users, and using write-enabled relays for publishing can give their events a wider reach—but it also adds connections and may send library events to more places. Signed-out users would still rely on Ostrify’s defaults.

So the cautious version is: **audio-focused defaults first; optional general relays; user NIP-65 relays only when the user chooses to use them in Ostrify.** That keeps the decision reversible and avoids assuming users want their personal relay setup used for every app feature. No changes made.

## User

Can you name some indexing/search relays? I know nostr.band is one. Are there others?

## Assistant

Yes. A few Nostr relays/services worth looking at are:

- **`wss://relay.nostr.band`** — the best-known broad index/search relay. It aggregates events from many relays, supports NIP-50 search, and offers filtered and unfiltered endpoints (`/` and `/all`).
- **`wss://search.nos.today`** — listed as a NIP-50 search relay.
- **`wss://relay.noswhere.com`** — another NIP-50 search relay, with search-specific filtering features.
- **`wss://relay.ditto.pub`** — a general-purpose relay that supports NIP-50 full-text search, though it’s not primarily an indexer.

There are also more specialized search services, such as **`wss://search.nostrarchives.com`**, which documents search for profiles and text notes; that doesn’t necessarily make it useful for music discovery.

For Ostrify, the key caveat is that **“supports search” doesn’t guarantee good music or podcast results**. We’d want to test whether a relay actually indexes the event kinds and metadata Ostrify searches—especially music tracks and podcast episodes—and how much useful content it returns. These services can also change, so their current support and availability should be checked before treating them as defaults.

## User

Can you test the 4 index/search relays to see?

## Assistant

I checked the relays’ published capabilities, but I **couldn’t complete the live music/podcast event queries** from this environment: those require WebSocket connections, which I can’t establish here. So I don’t have reliable result counts to compare.

What I could verify:

| Relay | Published support | What that tells us |
|---|---|---|
| `relay.nostr.band` | NIP-50 search and broad event indexing | Promising for discovery, but I couldn’t verify how many Ostrify-relevant audio events it currently returns. |
| `search.nos.today` | NIP-50 | It supports search, but the published info alone doesn’t confirm useful music or podcast coverage. |
| `relay.noswhere.com` | NIP-50, with extra search operators | Same caveat: search support is confirmed; audio coverage isn’t. |
| `relay.ditto.pub` | NIP-50 | It supports search as a general-purpose relay, but I couldn’t confirm its audio results. |

There’s a testing wrinkle: much of Ostrify’s audio metadata is in **tags**, and some track events have empty content. A plain NIP-50 text search for “music” may miss those. A meaningful comparison should query each relay for the actual event kinds Ostrify uses—such as music kinds `36787`, `31337`, `32123`, `30440` and the podcast kinds—then compare valid, playable results.

So: **all four advertise indexing/search capabilities, but this check doesn’t establish which one is best for Ostrify’s audio discovery.**

## User

Can you query each relay for the actual event kinds Ostrify uses—such as music kinds 36787, 31337, 32123, 30440 and the podcast kinds—then compare valid, playable results?

## Assistant

I can’t complete the live comparison from this environment: querying a Nostr relay requires a WebSocket connection, and the tools available here can fetch relay metadata over HTTPS but can’t open relay WebSockets. I don’t want to make up result counts or imply I tested the events.

I did verify one important caveat: **noswhere’s search relay is primarily for kind 1 text notes**, so its NIP-50 support doesn’t mean it’s a good source for music event kinds. Search.nos.today is also described by its maintainers as experimental, with incomplete event coverage. The other two advertise broader search/indexing, but that alone doesn’t tell us how many playable audio events they return.

For Ostrify, a useful live test should query each relay for the app’s actual audio kinds—music `36787`, `31337`, `32123`, `30440`; podcast events `54` and `10154`; and relevant audio metadata such as kind `1063`—then deduplicate results and check which parse as playable. **Those counts are still untested.**

---

*No changes to Ostrify’s relay configuration were made as part of this discussion.*
