import type { NostrEvent } from "@nostrify/nostrify";
import { sanitizeUrl } from "./sanitize";

/** A universal playable audio item (music track or podcast episode). */
export interface Track {
  /** Stable id used by the player and playlists. */
  id: string;
  /** The underlying Nostr event, when the track was published on Nostr. */
  event?: NostrEvent;
  /** External catalog tracks are not Nostr events. */
  source?: "wavlake" | "librivox" | "tunestr" | "fountain";
  artistId?: string;
  albumId?: string;
  /** Direct audio URL (https). */
  url: string;
  /** Audio MIME type, if known. */
  mimeType?: string;
  /** Title of the track / episode. */
  title: string;
  /** Artist / creator / podcast name (freeform). */
  artist?: string;
  /** Album / release title, if the track belongs to one. */
  album?: string;
  /** Cover art / episode image URL (https). */
  image?: string;
  /** Pubkey that published the event. */
  pubkey: string;
  /** Duration in seconds, if known. */
  duration?: number;
  /** High-level category used for Spotify-style sections. */
  kind: "music" | "podcast" | "audiobook";
  /** Topic tags (from `t` tags). */
  topics: string[];
  /** created_at timestamp. */
  createdAt: number;
}

export const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)(?:[?#].*)?$/i;

function tagValue(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

function allTagValues(event: NostrEvent, name: string): string[] {
  return event.tags.filter(([n]) => n === name).map((t) => t[1]).filter(Boolean);
}

function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return undefined;
}

/** Extract audio URLs & metadata from an `imeta` tag (NIP-92). */
function parseImeta(tag: string[]): { url?: string; mime?: string; image?: string } {
  const out: { url?: string; mime?: string; image?: string } = {};
  for (const part of tag.slice(1)) {
    const idx = part.indexOf(" ");
    if (idx === -1) continue;
    const key = part.slice(0, idx);
    const val = part.slice(idx + 1).trim();
    if (key === "url") out.url = val;
    else if (key === "m") out.mime = val;
    else if (key === "image" || key === "thumb") out.image = val;
  }
  return out;
}

function isAudio(url: string | undefined, mime: string | undefined): boolean {
  if (mime?.toLowerCase().startsWith("audio/")) return true;
  if (url && AUDIO_EXT_RE.test(url)) return true;
  return false;
}

/**
 * Parse a kind:1063 (NIP-94 File Metadata) event into a Track, if it is audio.
 */
export function parseFileMetadataTrack(event: NostrEvent): Track | null {
  const url = sanitizeUrl(tagValue(event, "url"));
  const mime = tagValue(event, "m");
  if (!url || !isAudio(url, mime)) return null;

  const title =
    tagValue(event, "title") ||
    tagValue(event, "name") ||
    tagValue(event, "summary") ||
    tagValue(event, "alt") ||
    (event.content || "").split("\n")[0]?.slice(0, 80) ||
    "Untitled";

  const image = sanitizeUrl(tagValue(event, "image") || tagValue(event, "thumb"));
  const duration = parseDuration(tagValue(event, "duration"));
  const artist = tagValue(event, "artist") || tagValue(event, "author");

  return {
    id: event.id,
    event,
    url,
    mimeType: mime,
    title,
    artist,
    album: tagValue(event, "album") || tagValue(event, "release"),
    image,
    pubkey: event.pubkey,
    duration,
    kind: "music",
    topics: allTagValues(event, "t").map((t) => t.toLowerCase()),
    createdAt: event.created_at,
  };
}

/**
 * Parse a kind:1 note into a Track if it contains an audio attachment (imeta or URL).
 */
export function parseNoteTrack(event: NostrEvent): Track | null {
  let url: string | undefined;
  let mime: string | undefined;
  let image: string | undefined;

  // imeta tags first
  for (const tag of event.tags) {
    if (tag[0] !== "imeta") continue;
    const meta = parseImeta(tag);
    if (isAudio(meta.url, meta.mime)) {
      url = meta.url;
      mime = meta.mime;
      image = meta.image;
      break;
    }
  }

  // Fallback: an audio URL in the content
  if (!url) {
    const match = event.content.match(/https?:\/\/\S+/g);
    if (match) {
      for (const candidate of match) {
        const clean = candidate.replace(/[),.]+$/, "");
        if (AUDIO_EXT_RE.test(clean)) {
          url = clean;
          break;
        }
      }
    }
  }

  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return null;

  // Title: strip the audio URL from content and take the first line
  const content = event.content.replace(/https?:\/\/\S+/g, "").trim();
  const title = content.split("\n")[0]?.slice(0, 80) || "Untitled track";

  return {
    id: event.id,
    event,
    url: safeUrl,
    mimeType: mime,
    title,
    image: sanitizeUrl(image),
    pubkey: event.pubkey,
    kind: "music",
    topics: allTagValues(event, "t").map((t) => t.toLowerCase()),
    createdAt: event.created_at,
  };
}

/**
 * Parse a kind:54 (NIP-F4 Podcast Episode) event into a Track.
 */
export function parsePodcastEpisodeTrack(event: NostrEvent): Track | null {
  // `audio` tag: ["audio", url, optional mime]
  const audioTag = event.tags.find(([n, value]) => n === "audio" && !!sanitizeUrl(value));
  const url = sanitizeUrl(audioTag?.[1]);
  if (!url) return null;

  const title = tagValue(event, "title") || "Untitled episode";
  const image = sanitizeUrl(tagValue(event, "image"));
  const duration = parseDuration(tagValue(event, "duration"));

  return {
    id: event.id,
    event,
    url,
    mimeType: audioTag?.[2],
    title,
    image,
    pubkey: event.pubkey,
    duration,
    kind: "podcast",
    topics: allTagValues(event, "t").map((t) => t.toLowerCase()),
    createdAt: event.created_at,
  };
}

/**
 * Parse an addressable "audio track" event into a Track.
 *
 * Covers the several competing music-track kinds used across the Nostr music
 * ecosystem (Wavlake, zapstr.live, lightning.fm, Fountain, etc.):
 *   - 31337 — zapstr.live / lightning.fm (uses `media`/`url`/imeta, `subject`)
 *   - 36787 — the most consistent in the wild (`url`, `title`, `artist`)
 *   - 32123 — legacy Wavlake (JSON metadata in `content`)
 *   - 30440 — Wavlake NOM spec (`stream_url`)
 *
 * NOTE: kind 31337 in particular is heavily polluted with non-audio app data
 * (game scores, fitness trackers, etc.), so we only return a Track when we can
 * actually find a plausible audio URL.
 */
export function parseAudioTrackEvent(event: NostrEvent): Track | null {
  // Collect all candidates: an image or broken first URL must not mask later audio.
  let mime: string | undefined = tagValue(event, "m") || tagValue(event, "mime") || tagValue(event, "type");
  const candidates: { url?: string; mime?: string }[] = event.tags
    .filter(([name]) => ['url', 'stream_url', 'enclosure', 'media', 'fallback'].includes(name))
    .map((tag) => ({ url: tag[1], mime: tag[2]?.startsWith('audio/') ? tag[2] : mime }));
  let url: string | undefined;
  let image = tagValue(event, "image") || tagValue(event, "cover") || tagValue(event, "thumb");
  let title = tagValue(event, "title") || tagValue(event, "subject") || tagValue(event, "name");
  let artist = tagValue(event, "artist") || tagValue(event, "creator") || tagValue(event, "author");
  let album = tagValue(event, "album") || tagValue(event, "release");
  let duration = parseDuration(tagValue(event, "duration"));

  // 2. imeta attachment (NIP-92), if present.
  for (const tag of event.tags) {
    if (tag[0] !== "imeta") continue;
    const meta = parseImeta(tag);
    if (meta.url) candidates.push({ url: meta.url, mime: meta.mime });
    image = image || meta.image;
  }

  // 3. Some kinds (e.g. legacy 32123, Wavlake NOM) put JSON metadata in content.
  if ((!url || !title) && event.content.trim().startsWith("{")) {
    try {
      const json = JSON.parse(event.content) as Record<string, unknown>;
      const pick = (...keys: string[]): string | undefined => {
        for (const k of keys) {
          const v = json[k];
          if (typeof v === "string" && v) return v;
        }
        return undefined;
      };
      const jsonUrl = pick("enclosure", "url", "stream_url", "mediaUrl", "media");
      if (jsonUrl) candidates.push({ url: jsonUrl, mime: pick("type", "mimeType") });
      title = title || pick("title", "name");
      artist = artist || pick("creator", "artist", "author");
      album = album || pick("album", "release", "albumTitle");
      image = image || pick("image", "artwork", "cover", "artworkUrl");
      duration = duration ?? parseDuration(pick("duration"));
      if (!mime) mime = pick("type", "mimeType");
    } catch {
      // ignore malformed JSON
    }
  }

  const candidate = candidates.find((item) => {
    const safe = sanitizeUrl(item.url);
    return !!safe && isAudio(safe, item.mime || mime);
  });
  url = candidate?.url;
  mime = candidate?.mime || mime;
  const safeUrl = sanitizeUrl(url);
  // Shared kinds can contain non-audio data, so require audio evidence.
  if (!safeUrl) return null;

  return {
    id: event.id,
    event,
    url: safeUrl,
    mimeType: mime,
    title: title || "Untitled",
    artist,
    album,
    image: sanitizeUrl(image),
    pubkey: event.pubkey,
    duration,
    kind: "music",
    // Genre can live in `t` tags or a `c` (category) tag (zapstr) or `genre`.
    topics: [
      ...allTagValues(event, "t"),
      ...allTagValues(event, "c"),
      ...allTagValues(event, "genre"),
    ].map((t) => t.toLowerCase()),
    createdAt: event.created_at,
  };
}

/** Event kinds that carry addressable music-track metadata. */
export const MUSIC_TRACK_KINDS = [31337, 36787, 32123, 30440] as const;

/** Parse any supported event kind into a Track. */
export function eventToTrack(event: NostrEvent): Track | null {
  switch (event.kind) {
    case 54:
      return parsePodcastEpisodeTrack(event);
    case 1063:
      return parseFileMetadataTrack(event);
    case 1:
      return parseNoteTrack(event);
    case 31337:
    case 36787:
    case 32123:
    case 30440:
      return parseAudioTrackEvent(event);
    default:
      return null;
  }
}

/** Format seconds as m:ss or h:mm:ss. */
export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
