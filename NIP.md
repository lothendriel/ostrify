# Nostr Tunes

Nostr Tunes is a Spotify-style player for audio media published on Nostr. It does
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

### Audio detection

A kind `1063` or kind `1` event is treated as a playable **track** when it exposes
an `https:` audio URL, detected via:

- the NIP-94 `m` tag starting with `audio/`, or a NIP-92 `imeta` `m` field, or
- a URL ending in a known audio extension (`.mp3`, `.m4a`, `.aac`, `.wav`, `.ogg`,
  `.oga`, `.opus`, `.flac`, `.weba`, `.webm`).

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

### Playlist deletion — NIP-09 (kind `5`)

Deleting a playlist publishes a deletion request referencing the addressable
coordinate `30003:<pubkey>:<d>` and the latest event id.
