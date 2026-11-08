import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { eventToTrack, parsePodcastEpisodeTrack, type Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";

export interface PodcastShow {
  pubkey: string;
  title: string;
  image?: string;
  description?: string;
  event: NostrEvent;
}

/** Hashtags that indicate an audio track is really a podcast episode. */
const PODCAST_TOPICS = [
  "podcast",
  "podcasting",
  "podcasting20",
  "episode",
  "nostrpodcast",
  "pc20",
];

const FOUNTAIN_API = "/api/fountain";
const EPISODE_GUID_RE = /^[^\s]{1,512}$/;

interface FountainEpisodeHit {
  _id?: unknown;
  _type?: unknown;
  _guid?: unknown;
  info?: unknown;
}

interface FountainEpisodeInfo {
  title?: unknown;
  subtitle?: unknown;
  publisher?: unknown;
  image?: unknown;
  audio?: unknown;
  duration?: unknown;
  published?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createFountainTrack(
  id: string,
  info: FountainEpisodeInfo,
  url: string,
  title: string,
  duration: number | undefined,
  publishedAt: number,
): Track {
  return {
    id: `fountain:${id}`,
    source: "fountain",
    url,
    title,
    artist: text(info.subtitle) ?? text(info.publisher),
    image: sanitizeUrl(text(info.image)),
    pubkey: "",
    duration,
    kind: "podcast",
    topics: ["podcast", "fountain"],
    createdAt: Number.isFinite(publishedAt) ? Math.floor(publishedAt / 1000) : 0,
  };
}

export function fountainTrackUrl(trackId: string): string | undefined {
  const match = /^fountain:(episode:id:\S{20})$/.exec(trackId);
  return match ? `https://fountain.fm/episode/${encodeURIComponent(match[1].slice("episode:id:".length))}` : undefined;
}

export function fountainTrackId(url: string): string | undefined {
  const match = /^https:\/\/fountain\.fm\/(?:episode|track)\/([^/?#]+)$/.exec(url);
  if (!match) return undefined;
  try {
    const id = decodeURIComponent(match[1]);
    return /^.{20}$/.test(id) ? `fountain:episode:id:${id}` : undefined;
  } catch {
    return undefined;
  }
}

/** Fetch one Fountain episode by its stable Fountain content ID. */
export async function fetchFountainTrack(trackId: string, signal: AbortSignal): Promise<Track | null> {
  if (!fountainTrackUrl(trackId)) return null;
  const fountainId = trackId.slice("fountain:".length);
  if (!/^episode:id:\S{20}$/.test(fountainId)) return null;
  const response = await fetch(`${FOUNTAIN_API}/content/${encodeURIComponent(fountainId)}`, { signal });
  if (!response.ok) throw new Error(`Fountain returned ${response.status}`);
  const data: unknown = await response.json();
  if (!isRecord(data) || !isRecord(data.hit) || data.hit._type !== "EPISODE" || !isRecord(data.hit.info)) return null;
  const info = data.hit.info;
  const url = sanitizeUrl(text(info.audio));
  const title = text(info.title);
  if (!url || !title) return null;
  const published = text(info.published);
  const timestamp = published ? Date.parse(published) : NaN;
  const duration = typeof info.duration === "number" && Number.isFinite(info.duration) && info.duration > 0
    ? info.duration
    : undefined;
  return createFountainTrack(fountainId, info, url, title, duration, timestamp);
}

/** Return the first playable podcast episode Fountain can resolve for a NIP-73 GUID. */
async function lookupFountainEpisode(
  itemGuid: string,
  feedGuid: string | undefined,
  signal: AbortSignal,
): Promise<Track | null> {
  if (!EPISODE_GUID_RE.test(itemGuid) || (feedGuid && !EPISODE_GUID_RE.test(feedGuid))) return null;

  const response = await fetch(`${FOUNTAIN_API}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: `podcast:item:guid:${itemGuid}`,
      ...(feedGuid ? { parent: `podcast:guid:${feedGuid}` } : {}),
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Fountain returned ${response.status}`);

  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.hits)) return null;
  const hit = data.hits.find((candidate): candidate is FountainEpisodeHit => {
    if (!isRecord(candidate) || candidate._type !== "EPISODE" || !isRecord(candidate.info)) return false;
    return !!sanitizeUrl(text(candidate.info.audio));
  });
  if (!hit || !isRecord(hit.info)) return null;

  const info = hit.info as FountainEpisodeInfo;
  const url = sanitizeUrl(text(info.audio));
  const title = text(info.title);
  if (!url || !title) return null;

  const published = text(info.published);
  const publishedAt = published ? Date.parse(published) : NaN;
  const duration = typeof info.duration === "number" && Number.isFinite(info.duration) && info.duration > 0
    ? info.duration
    : undefined;

  return createFountainTrack(text(hit._id) ?? itemGuid, info, url, title, duration, publishedAt);
}

/**
 * Fetch podcast episodes. Combines true NIP-F4 episodes (kind 54), audio
 * tracks/notes tagged as podcasts, and Fountain episode GUID references.
 */
export function usePodcastEpisodes(limit = 80) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["podcast-episodes", limit, FOUNTAIN_API],
    retry: 1,
    staleTime: 5 * 60 * 1000,
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(30000)]);
      const events = await nostr.query(
        [
          { kinds: [54], limit },
          { kinds: [1063, 1], "#t": PODCAST_TOPICS, limit },
          // `k` is the NIP-73 kind label for the `i` reference; the GUID itself
          // lives in an unindexed tag value and must be resolved via Fountain.
          { kinds: [1], "#k": ["podcast:item:guid"], limit: Math.min(limit, 30) },
        ],
        { signal },
      );

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const event of events) {
        const track = event.kind === 54 ? parsePodcastEpisodeTrack(event) : eventToTrack(event);
        if (!track || seen.has(track.url)) continue;
        seen.add(track.url);
        tracks.push({ ...track, kind: "podcast" });
      }

      const fountainReferences = new Map<string, string | undefined>();
      for (const event of events) {
        if (event.kind !== 1) continue;
        const itemReference = event.tags.find(([name, value]) => name === "i" && value?.startsWith("podcast:item:guid:"))?.[1];
        const itemGuid = itemReference?.slice("podcast:item:guid:".length);
        if (!itemGuid || !EPISODE_GUID_RE.test(itemGuid) || fountainReferences.has(itemGuid)) continue;
        const feedReference = event.tags.find(([name, value]) => name === "i" && value?.startsWith("podcast:guid:"))?.[1];
        const feedGuid = feedReference?.slice("podcast:guid:".length);
        fountainReferences.set(itemGuid, feedGuid && EPISODE_GUID_RE.test(feedGuid) ? feedGuid : undefined);
      }

      const resolvedFountain: (Track | null)[] = [];
      const referencesToResolve = [...fountainReferences.entries()].slice(0, Math.min(limit, 10));
      const referenceBatches = Array.from(
        { length: Math.ceil(referencesToResolve.length / 5) },
        (_, index) => referencesToResolve.slice(index * 5, index * 5 + 5),
      );
      for (const batch of referenceBatches) {
        resolvedFountain.push(...await Promise.all(batch.map(([itemGuid, feedGuid]) =>
          lookupFountainEpisode(itemGuid, feedGuid, signal).catch((error: unknown) => {
            if (signal.aborted) throw error;
            return null;
          }),
        )));
      }
      for (const track of resolvedFountain) {
        if (!track || seen.has(track.url)) continue;
        seen.add(track.url);
        tracks.push(track);
      }

      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return tracks.slice(0, limit);
    },
  });
}

/** Fetch podcast show metadata (NIP-F4 kind:10154) for a set of pubkeys. */
export function usePodcastShows() {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ["podcast-shows"],
    queryFn: async (c) => {
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      const events = await nostr.query([{ kinds: [10154], limit: 60 }], { signal });

      const shows: PodcastShow[] = [];
      for (const event of events) {
        const title = event.tags.find(([n]) => n === "title")?.[1];
        if (!title) continue;
        shows.push({
          pubkey: event.pubkey,
          title,
          image: event.tags.find(([n]) => n === "image")?.[1],
          description: event.tags.find(([n]) => n === "description")?.[1],
          event,
        });
      }
      return shows;
    },
  });
}
