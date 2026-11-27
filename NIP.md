# Ostrify

Ostrify is a Spotify-style player for audio media published on Nostr. It does
not define any new event kinds — it aggregates and reuses existing NIPs.

## Ostrify Armada chat

The signed-in chat panel joins the public Ostrify Armada invite using the existing [Concord protocol](https://concordprotocol.org/spec/) and displays the community's `ostrify-site-chat` channel. Concord uses kind `33301` for the encrypted invite bundle, kind `1059` for encrypted community streams, and encrypted community-list events (including kinds `13302` and `33302`). Ostrify does not define a separate chat schema. The invite is public: anyone holding it can join and read the channels it grants. The panel keeps decrypted Concord membership material in memory and publishes the user's encrypted community list to relays. This browser caches only signed, encrypted community-list fragments for faster restoration; decrypted messages and membership keys are not stored by the chat panel. After joining, this browser remembers the community identifier per account and attempts to restore the chat automatically in future tabs or sessions; restoration requires the encrypted list to be available on relays and the signer to decrypt it. Closing the panel keeps the connection active until the page closes or the account changes. Relay availability and signer NIP-44 support affect joining and syncing. Messages shown optimistically may not have been accepted by a relay.

## Event kinds consumed

| Kind    | Source                                   | Used for                                        |
| ------- | ---------------------------------------- | ----------------------------------------------- |
| `0`     | NIP-01 metadata                          | Artist / creator display names and avatars      |
| `1`     | NIP-10 text notes                        | Tracks whose content/`imeta` carry audio files  |
| `54`    | NIP-F4 podcast episode                   | Podcast episodes                                 |
| `1063`  | NIP-94 file metadata                     | Music tracks (`m` = `audio/*` or audio URL)     |
| `10154` | NIP-F4 podcast metadata                  | Podcast show info                                |
| `30003` | NIP-51 bookmark set                      | User playlists, Liked Songs, TuneStr Recordings, and Saved Albums |
| `30311` | NIP-53 Live Activities                   | TuneStr live streams and recordings             |
| `1053`  | TuneStr N94 stream variant               | TuneStr N94 recording metadata                 |
| `30440` | Wavlake NOM track                        | Artist-published music tracks (`stream_url`)    |
| `31337` | zapstr.live / lightning.fm audio track   | Artist-published music tracks (`media`/`url`)   |
| `32123` | Legacy Wavlake track                     | Music tracks (JSON metadata in `content`)       |
| `36787` | Common audio-track kind (multi-client)   | Music tracks (`url`, `title`, `artist`); Ostrify publishing uses addressable `d` IDs and optional album metadata |

### Audio detection

An event is treated as a playable **track** when it exposes an `https:` audio URL.
Because there is no single ratified NIP for music tracks yet, Ostrify supports the
several addressable "audio track" kinds that circulate in the Nostr music
ecosystem (Wavlake, zapstr.live, lightning.fm, Fountain, etc.) in addition to
NIP-94 files and plain notes.

The audio URL is resolved, in order, from:

- a direct tag: `url`, `stream_url`, `enclosure`, or `media` (zapstr), or
- a NIP-92 `imeta` attachment, or
- JSON metadata in `content` (legacy kinds like `32123`), or
- an audio URL embedded in note `content`.

A URL counts as audio when its MIME (`m`/`imeta m`) starts with `audio/` or it ends
in a known audio extension (`.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg`, `.oga`, `.opus`,
`.flac`, `.weba`, `.webm`). **Kind `31337` is deliberately strict** here, because in
practice that kind is shared with many non-audio apps (game scores, fitness data,
etc.); events without a plausible audio URL are ignored.

Genre/category is collected from `t`, `c` (zapstr category), and `genre` tags.

### Ostrify music publishing convention (kind `36787`)

Ostrify publishes one addressable kind `36787` event per track with `d`, `title`, `url`, `artist`, and `alt=Music track` tags. The persistent `d` value identifies a track across revisions; it must be retained when editing that track. Album tracks additionally share `album` (display title), `album_id` (stable Ostrify grouping ID), and `image` (cover URL) tags, and carry a `track_number` tag for ordering. Album IDs are opaque values generated per release and are not separate Nostr events. Existing events without `album_id` continue to group by album title. Uploaded media may include Blossom/NIP-94 metadata tags. Ostrify uses the optional `ostrify_visibility=hidden` tag to omit a track from other users' Ostrify discovery, category results, search, and public artist-track views; absent or other values mean visible. This is only an Ostrify display convention, not access control: event metadata and the media URL remain public on the user's write relays. Ostrify-visible tracks are additionally mirrored to the shared DROPS relay (`wss://drops.basspistol.org/`); hidden tracks are not sent there. When a visible track is changed to hidden after previously being shared, Ostrify sends a newer hidden revision to DROPS so compatible clients can replace the public version; this is not a deletion guarantee and other relays or clients may retain prior copies.

Podcast episodes (kind `54`) use the NIP-F4 `audio` tag: `["audio", <url>, <mime?>]`.

## Events published

### Playlists & Liked Songs — NIP-51 bookmark sets (kind `30003`)

Playlists are addressable bookmark sets authored by the logged-in user. Tracks are
referenced by their event id using `e` tags. Wavlake catalog tracks use a NIP-73 `i` URL tag, `https://wavlake.com/track/<uuid>`. TuneStr NIP-53 recordings use an `a` tag containing the `30311:<pubkey>:<d>` coordinate, while NIP-94 recording events use an `e` tag. Both types preserve insertion order; other clients may not understand these extensions.

```json
{
  "kind": 30003,
  "tags": [
    ["d", "nostr-tunes-liked"],
    ["title", "Liked Songs"],
    ["description", "Your favorite tracks on Nostr"],
    ["e", "<track-event-id>"],
    ["e", "<track-event-id>"]
  ],
  "content": ""
}
```

- The **Liked Songs** playlist is a reserved bookmark set with `d` tag
  `nostr-tunes-liked`. Liking/unliking a track adds/removes its `e` tag.
- The private-by-display **TuneStr Recordings** collection uses the reserved `d` tag
  `ostrify-tunestr-recordings`. NIP-53 streams are referenced using their addressable
  `a` coordinate (`30311:<pubkey>:<d>`); NIP-94 recordings use their event id in an
  `e` tag. The collection is public NIP-51 data; it does not grant access control.
- Regular playlists use a random `d` tag (`playlist-xxxxxxxx`) and may carry
  optional `title`, `description`, and `image` tags. New and updated Ostrify
  music lists carry `t=ostrify-music-playlist`; older Ostrify identifiers remain
  recognized. Ostrify playlists are included in its public playlist discovery by
  default; `ostrify-visibility=private` opts a playlist out of that discovery.
  This tag is an Ostrify convention, not access control: kind `30003` events and
  their playlist contents remain public on Nostr. Other bookmark sets are only
  shown on public music profiles when a supported Wavlake reference or a
  resolvable audio event is found.
- Saved albums use a separate bookmark set with `d=ostrify-wavlake-albums-v1` and
  `title=Saved Albums`. Wavlake albums have an `i` tag referencing the catalog URL;
  `ostrify-album` stores their stable catalog ID, title, artist, image, and Ostrify
  visibility (`public` or `private`). Inferred Nostr albums use `ostrify-nostr-album`
  tags containing the publisher pubkey, album title, artist, image, and visibility.
  Their identity is the publisher pubkey plus normalized album title; they are groups
  inferred from track metadata, not canonical album events. Private is an Ostrify
  display/discovery preference, not access control: bookmark data remains public on
  Nostr. Album state syncs between devices through the user's authored replaceable
  bookmark set.
- Because these are addressable, replaceable events, all reads are filtered by the
  user's `authors` pubkey.

### Followed Artists — NIP-51 follow set (kind `30000`)

Following a Nostr artist stores their pubkey as a `p` tag in the reserved follow set
with `d` tag `ostrify-artists`. Wavlake artists use an `i` URL tag of the form
`https://wavlake.com/artist/<uuid>`, an Ostrify extension. These lists are public.
The list is replaceable and read filtered by the user's `authors` pubkey.

```json
{
  "kind": 30000,
  "tags": [
    ["d", "ostrify-artists"],
    ["title", "Followed Artists"],
    ["p", "<artist-pubkey>"],
    ["p", "<artist-pubkey>"]
  ],
  "content": ""
}
```

### Followed people — NIP-51 follow set (kind `30000`)

Ostrify-only one-way follows use a public follow set with `d=ostrify-people`
and `p` tags identifying followed pubkeys. This list is independent of both
NIP-02 kind `3` follows and mutual Ostrify friend requests. Reads constrain
`authors` to the list owner; existing metadata and encrypted content are preserved.

### Private audiobook library — NIP-78 application data (kind `30078`)

The user's saved audiobook favorites and collections are synced in a replaceable
kind `30078` event with `d=ostrify-audiobook-library-v1` and an NIP-31 `alt` tag.
The JSON library state (catalog IDs, display metadata, favorites, and collections)
is NIP-44 encrypted to the author's own pubkey before publishing. Its contents are
not public; relays store ciphertext and the event author can decrypt it with a
NIP-44-capable signer. Events are queried only by the logged-in author's pubkey.
Browser-only saves are merged into the remote copy on first sync. Use only on
relays suitable for private application data; relay availability, retention, and
account signer support affect cross-device recovery.

### Private radio favorites — NIP-78 application data (kind `30078`)

Radio Browser station favorites sync as a kind `30078` event with
`d=ostrify-radio-favorites-v1` and `alt=Encrypted Ostrify radio favorites`.
The content is a JSON array of station records (ID, name, HTTPS stream and artwork
URLs, location, tags, and HLS flag), encrypted to the author's own pubkey with
NIP-44. Reads are constrained to the signed-in author. Browser-only favorites are
claimed by the first account on that browser and merged on initial sync. Subsequent
updates reconcile local additions and removals against the last synced baseline.
Sync requires at least one completed relay read and, for an update, a confirming
write to a relay that completed both checks. Unresponsive relays do not block
available relays, but may contain unseen changes from another device; Ostrify
reports partial sync rather than assuming the list is complete. Sync relies on
compatible signers and relay availability and cannot make simultaneous edits from
separate devices atomic. Ciphertext, author, event type, and identifier remain
visible to relays, which may retain older revisions.

### Ostrify directory — NIP-78 application data (kind `30078`)

An optional public listing uses `d=ostrify-directory-v1`, `t=ostrify-directory-v1`
for relay-level discovery, `status=active` or `status=inactive`, and an `alt` tag.
An inactive replacement is a withdrawal, not a guarantee of deletion: relays may
retain or serve older copies. A listing represents only its own event author and
must not be used to assert another person's participation. Names and avatars come
from the author's kind 0 profile. Results are limited to listings returned by the
reader's relays and may be incomplete. No directory event is published by default.

### Ostrify friends — NIP-17 private messages

Ostrify friend requests use ordinary NIP-17 kind `14` plaintext messages inside
NIP-59 gift wraps. An encrypted rumor tag `["ostrify-friends-v1", action, token]`
marks a request, accept, decline, or remove action. A random 32-character hex token
links an acceptance to the matching request. Friendships are derived from verified
sender seals and reciprocal request/accept messages; they are independent of kind 3
follows. Messages are sent only to the recipient's NIP-17 DM relays, with a separate
copy to the sender's DM relays. DM relay availability and the latest 100 messages
limit recovery; the list is not a public NIP-51 list.

Listening status uses NIP-38 kind `30315` with `d=music` and an expiration. It is
public and enabled by default for signed-in accounts without a saved preference;
existing off choices are respected. The preference is stored per account on this
device. Ostrify attempts to publish a clearing status on pause or disable, but
relays or clients may retain older copies. Embedded video status reports that the
video is open because playback and pauses cannot reliably be detected.

### Playlist deletion — NIP-09 (kind `5`)

Deleting a playlist publishes a deletion request referencing the addressable
coordinate `30003:<pubkey>:<d>` and the latest event id.

## Discovery notes

- **Shared audio catalog forwarding.** During normal browsing, Ostrify may forward eligible playable public audio Nostr events unchanged to `wss://relay.studio314.us/nostrrelay/ostrify`. The original signature, event data, and author are preserved: forwarding creates no signature, user-authored event, or separate index record, and goes only to this relay. Explicitly hidden Ostrify tracks and external-catalog-only items are excluded. Relay rejection or connection failure does not block browsing; acceptance does not guarantee retention. The controls and session status are shown only to allowlisted accounts; forwarding is automatic for other visitors as they browse.
- **Wavlake catalog.** Ostrify offers browser-based search and paginated browsing
  using Wavlake's public catalog API. Catalog tracks are not Nostr events and
  are saved in Nostr playlists using external URL references. The Nostr feed separately queries
  Wavlake's public profile, without assuming that it publishes the full catalog.
- **Podcasts.** Because genuine NIP-F4 (kind `54`) episodes are still rare, the
  Podcasts view also includes kind `1`/`1063` audio tagged with podcast-related
  hashtags (`podcast`, `episode`, `pc20`, etc.).
- **Artists.** An artist is simply a `pubkey`. The artist page queries all audio
  kinds filtered by that author and groups results into albums via the `album`/
  `release` tag, with the remainder shown as singles.
