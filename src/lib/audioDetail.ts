import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";

/** Create a source-agnostic route with a safe metadata fallback if a source is offline. */
const MAX_PACKED_AUDIO_DETAIL_LENGTH = 12000;

export function encodeAudioDetailFallback(track: Track): string | undefined {
  const url = sanitizeUrl(track.url);
  if (!url || url.length > 2048 || track.id.length > 2048 || track.title.length > 500) return undefined;
  const payload: Track = {
    ...track,
    event: undefined,
    url,
    image: sanitizeUrl(track.image),
    artistImage: sanitizeUrl(track.artistImage),
  };
  try {
    const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
    return encoded.length <= MAX_PACKED_AUDIO_DETAIL_LENGTH ? encoded : undefined;
  } catch {
    return undefined;
  }
}

export function decodeAudioDetailFallback(value: string | null): Track | undefined {
  if (!value || value.length > MAX_PACKED_AUDIO_DETAIL_LENGTH) return undefined;
  try {
    const decoded = decompressFromEncodedURIComponent(value);
    if (!decoded || decoded.length > 12000) return undefined;
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Partial<Track>;
    const url = sanitizeUrl(candidate.url);
    if (typeof candidate.id !== "string" || candidate.id.length > 2048
      || !url || typeof candidate.title !== "string" || candidate.title.trim().length === 0 || candidate.title.length > 500
      || typeof candidate.pubkey !== "string" || !Array.isArray(candidate.topics)
      || !candidate.topics.every(topic => typeof topic === "string" && /^[a-z0-9_-]{1,50}$/i.test(topic))) return undefined;
    const kind = candidate.kind;
    if (kind !== "music" && kind !== "podcast" && kind !== "audiobook") return undefined;

    const eventKind = candidate.eventKind;
    return {
      id: candidate.id,
      source: ["wavlake", "librivox", "gutenberg", "tunestr", "fountain", "podcast-index"].includes(candidate.source ?? "") ? candidate.source : undefined,
      eventKind: Number.isInteger(eventKind) && [1, 54, 1063, 1053, 31337, 36787, 32123, 30440, 30311].includes(eventKind ?? 0) ? eventKind : undefined,
      artistId: typeof candidate.artistId === "string" ? candidate.artistId.slice(0, 100) : undefined,
      artistPubkey: typeof candidate.artistPubkey === "string" && /^[0-9a-f]{64}$/i.test(candidate.artistPubkey) ? candidate.artistPubkey.toLowerCase() : undefined,
      showId: typeof candidate.showId === "string" ? candidate.showId.slice(0, 256) : undefined,
      podcastIndexEpisodeId: Number.isInteger(candidate.podcastIndexEpisodeId) ? candidate.podcastIndexEpisodeId : undefined,
      url,
      mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType.slice(0, 100) : undefined,
      title: candidate.title,
      artist: typeof candidate.artist === "string" ? candidate.artist.slice(0, 300) : undefined,
      album: typeof candidate.album === "string" ? candidate.album.slice(0, 300) : undefined,
      albumId: typeof candidate.albumId === "string" ? candidate.albumId.slice(0, 256) : undefined,
      trackNumber: typeof candidate.trackNumber === "number" && Number.isFinite(candidate.trackNumber) ? candidate.trackNumber : undefined,
      addressableId: typeof candidate.addressableId === "string" ? candidate.addressableId.slice(0, 256) : undefined,
      image: sanitizeUrl(candidate.image),
      artistImage: sanitizeUrl(candidate.artistImage),
      visibility: candidate.visibility === "hidden" ? "hidden" : candidate.visibility === "public" ? "public" : undefined,
      pubkey: /^[0-9a-f]{64}$/i.test(candidate.pubkey) ? candidate.pubkey.toLowerCase() : "",
      duration: typeof candidate.duration === "number" && Number.isFinite(candidate.duration) && candidate.duration > 0 ? candidate.duration : undefined,
      kind,
      topics: candidate.topics.slice(0, 12),
      createdAt: typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) && candidate.createdAt > 0 ? candidate.createdAt : 0,
    };
  } catch {
    return undefined;
  }
}

export function audioDetailPath(track: Pick<Track, "id" | "url" | "title" | "artist" | "pubkey" | "artistId" | "artistPubkey" | "album" | "showId" | "image" | "duration" | "kind" | "source" | "topics" | "createdAt" | "eventKind" | "event">): string {
  const params = new URLSearchParams({ track: track.id.slice(0, 2048) });
  const url = sanitizeUrl(track.url);
  if (url && url.length <= 2048) params.set("url", url);
  params.set("title", track.title.slice(0, 500));
  params.set("kind", track.kind);
  const eventKind = track.event?.kind ?? track.eventKind ?? (/^[0-9a-f]{64}$/i.test(track.id) ? track.kind === "podcast" ? 54 : track.kind === "music" ? 1 : undefined : undefined);
  if (eventKind && Number.isInteger(eventKind) && eventKind > 0) params.set("eventKind", String(eventKind));
  if (track.artist) params.set("artist", track.artist.slice(0, 300));
  if (track.artistId) params.set("artistId", track.artistId.slice(0, 100));
  if (track.artistPubkey && /^[0-9a-f]{64}$/i.test(track.artistPubkey)) params.set("artistPubkey", track.artistPubkey);
  if (track.album) params.set("album", track.album.slice(0, 300));
  if (track.showId && track.showId.length <= 256) params.set("showId", track.showId);
  if (/^[0-9a-f]{64}$/i.test(track.pubkey)) params.set("pubkey", track.pubkey.toLowerCase());
  const image = sanitizeUrl(track.image);
  if (image && image.length <= 2048) params.set("image", image);
  if (track.duration && Number.isFinite(track.duration) && track.duration > 0) params.set("duration", String(track.duration));
  if (track.source) params.set("source", track.source);
  if (track.topics.length) params.set("topics", track.topics.slice(0, 12).map(topic => topic.slice(0, 50)).join(","));
  if (Number.isFinite(track.createdAt) && track.createdAt > 0) params.set("createdAt", String(track.createdAt));
  return `/audio?${params.toString()}`;
}
