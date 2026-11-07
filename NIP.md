# Ostrify

Ostrify is a Spotify-style player for audio media published on Nostr. It does
not define any new event kinds — it aggregates and reuses existing NIPs.

## Event kinds consumed

| Kind    | Source                                   | Used for                                        |
| ------- | ---------------------------------------- | ----------------------------------------------- |
| `0`     | NIP-01 metadata                          | Artist / creator display names and avatars      |
| `1`     | NIP-10 text notes                        | Tracks whose content/`imeta` carry audio files  |
| `54`    | NIP-F4 podcast episode                   | Podcast episodes                                 |
| `1063`  | NIP-94 file metadata                     | Music tracks (`m` = `audio/*` or audio URL)     |
| `10154` | NIP-F4 podcast metadata                  | Podcast show info                                |
| `30003` | NIP-51 bookmark set                      | User playlists (incl. Liked Songs)              |
| `30440` | Wavlake NOM track                        | Artist-published music tracks (`stream_url`)    |
| `31337` | zapstr.live / lightning.fm audio track   | Artist-published music tracks (`media`/`url`)   |
| `32123` | Legacy Wavlake track                     | Music tracks (JSON metadata in `content`)       |
| `36787` | Common audio-track kind (multi-client)   | Music tracks (`url`, `title`, `artist`)         |

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

Podcast episodes (kind `54`) use the NIP-F4 `audio` tag: `["audio", <url>, <mime?>]`.

## Events published

### Playlists & Liked Songs — NIP-51 bookmark sets (kind `30003`)

Playlists are addressable bookmark sets authored by the logged-in user. Tracks are
referenced by their event id using `e` tags, preserving insertion order.

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
- Regular playlists use a random `d` tag (`playlist-xxxxxxxx`) and may carry
  optional `title`, `description`, and `image` tags.
- Because these are addressable, replaceable events, all reads are filtered by the
  user's `authors` pubkey.

### Followed Artists — NIP-51 follow set (kind `30000`)

Following an artist stores their pubkey as a `p` tag in a reserved follow set with
`d` tag `ostrify-artists`. The list is replaceable and read filtered by the user's
`authors` pubkey.

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

### Playlist deletion — NIP-09 (kind `5`)

Deleting a playlist publishes a deletion request referencing the addressable
coordinate `30003:<pubkey>:<d>` and the latest event id.

## Discovery notes

- **Featured catalogs.** To ensure a solid base of music, the general feed also
  queries well-known catalog publishers by `authors` — notably Wavlake's proxy
  pubkey (`npub1yfg0d955c2jrj2080ew7pa4xrtj7x7s7umt28wh0zurwmxgpyj9shwv6vg`), which
  re-publishes its catalog to Nostr.
- **Podcasts.** Because genuine NIP-F4 (kind `54`) episodes are still rare, the
  Podcasts view also includes kind `1`/`1063` audio tagged with podcast-related
  hashtags (`podcast`, `episode`, `pc20`, etc.).
- **Artists.** An artist is simply a `pubkey`. The artist page queries all audio
  kinds filtered by that author and groups results into albums via the `album`/
  `release` tag, with the remainder shown as singles.
