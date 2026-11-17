import type { Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";

/** Create a source-agnostic route with a safe metadata fallback if a source is offline. */
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
