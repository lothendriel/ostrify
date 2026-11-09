import { useNostr } from "@nostrify/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NostrEvent } from "@nostrify/nostrify";
import { eventToTrack, parsePodcastEpisodeTrack, type Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { useNostrPublish } from "@/hooks/useNostrPublish";

export interface PodcastShow {
  id: string;
  title: string;
  image?: string;
  description?: string;
  publisher?: string;
  /** Nostr author pubkey; Fountain shows are external catalog entries. */
  pubkey?: string;
  source: "nostr" | "fountain" | "podcast-index";
  episodeCount?: number;
  feedGuid?: string;
  feedId?: number;
  feedUrl?: string;
  event?: NostrEvent;
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

const FOUNTAIN_API = (import.meta.env.VITE_FOUNTAIN_API_URL ?? "/api/fountain").replace(/\/$/, "");
const PODCAST_INDEX_WORKER = (import.meta.env.VITE_PODCAST_INDEX_WORKER_URL ?? "https://ostrify.lothendriel.workers.dev").replace(/\/$/, "");

function podcastIndexError(response: Response, operation: string): Error {
  return new Error(`${operation} failed with HTTP ${response.status}. Check the Ostrify Worker configuration.`);
}
const EPISODE_GUID_RE = /^[^\s]{1,512}$/;
const NOSTR_SHOW_PAGE_SIZE = 120;
const FOUNTAIN_SHOWS_PER_LOOKUP_BATCH = 5;
const FOUNTAIN_MAX_REFERENCE_BATCH = 16;
const NOSTR_NOTE_KIND = 1;
const NOSTR_PODCAST_SHOW_KIND = 10154;
const NOSTR_PODCAST_EPISODE_KIND = 54;
const FOUNTAIN_REFERENCE_SCAN_PAGE = 120;
const PODCAST_FAVORITES_KIND = 10054;
const PODCAST_LIBRARY_QUERY_KEY = "podcast-favorites";

export interface PodcastFavorite {
  id: string;
  source: "nostr" | "podcast-index";
  title: string;
  publisher?: string;
  image?: string;
  feedId?: number;
  feedUrl?: string;
  pubkey?: string;
  identity?: string;
  episode?: boolean;
  episodeId?: number;
}

export function parsePodcastFavorites(event: NostrEvent | undefined): PodcastFavorite[] {
  if (!event) return [];
  const metadata = new Map<string, { title?: string; publisher?: string; image?: string; feedId?: number }>();
  for (const [name, id, title, publisher, image, feedId] of event.tags) {
    if (name !== "ostrify" || !id) continue;
    metadata.set(id, {
      title: text(title), publisher: text(publisher), image: sanitizeUrl(image),
      feedId: feedId && /^\d{1,12}$/.test(feedId) ? Number(feedId) : undefined,
    });
  }
  const favorites = new Map<string, PodcastFavorite>();
  const structuredShowIdentities = new Set(event.tags.flatMap(([name, id, , , , identity]) => name === "ostrify-show" && id && identity ? [identity] : []));
  for (const [name, value] of event.tags) {
    if (name === "p" && value && /^[0-9a-f]{64}$/i.test(value)) {
      const id = `nostr:${value}`;
      const data = metadata.get(id);
      favorites.set(id, { id, source: "nostr", title: data?.title ?? `Podcast by ${value.slice(0, 8)}`, publisher: data?.publisher, image: data?.image, pubkey: value });
    }
    if (name === "url" && value) {
      const safeUrl = sanitizeUrl(value);
      if (!safeUrl) continue;
      const parsedUrl = new URL(safeUrl);
      const legacyFeedId = parsedUrl.searchParams.get("ostrify_feed_id");
      const legacyTitle = parsedUrl.searchParams.get("ostrify_title");
      const legacyPublisher = parsedUrl.searchParams.get("ostrify_publisher");
      const legacyImage = sanitizeUrl(parsedUrl.searchParams.get("ostrify_image"));
      parsedUrl.searchParams.delete("ostrify_feed_id");
      parsedUrl.searchParams.delete("ostrify_title");
      parsedUrl.searchParams.delete("ostrify_publisher");
      parsedUrl.searchParams.delete("ostrify_image");
      const feedUrl = parsedUrl.toString();
      if (structuredShowIdentities.has(value) || structuredShowIdentities.has(feedUrl)) continue;
      const data = metadata.get(value) ?? metadata.get(feedUrl);
      const feedId = data?.feedId ?? (legacyFeedId && /^\d{1,12}$/.test(legacyFeedId) ? Number(legacyFeedId) : undefined);
      const id = feedId ? `podcast-index:${feedId}` : `feed:${feedUrl}`;
      favorites.set(id, { id, source: "podcast-index", feedId, feedUrl, title: data?.title ?? legacyTitle ?? feedUrl, publisher: data?.publisher ?? legacyPublisher ?? undefined, image: data?.image ?? legacyImage });
    }
  }
  for (const [name, id, title, publisher, image, feedId, episodeId] of event.tags) {
    if (name !== "ostrify-episode" || !id || !episodeId || !/^\d{1,12}$/.test(episodeId)) continue;
    favorites.set(id, { id, source: "podcast-index", title: text(title) ?? `Episode ${episodeId}`, publisher: text(publisher), image: sanitizeUrl(image), feedId: feedId && /^\d{1,12}$/.test(feedId) ? Number(feedId) : undefined, episode: true, episodeId: Number(episodeId) });
  }
  for (const [name, id, title, publisher, image, identity, feedId] of event.tags) {
    if (name !== "ostrify-show" || !id) continue;
    const parsedFeedId = feedId && /^\d{1,12}$/.test(feedId) ? Number(feedId) : undefined;
    const safeIdentity = text(identity) ?? "";
    favorites.set(id, {
      id,
      source: safeIdentity.startsWith("nostr:") ? "nostr" : "podcast-index",
      title: text(title) ?? "Podcast",
      publisher: text(publisher),
      image: sanitizeUrl(image),
      feedUrl: safeIdentity.startsWith("https://") ? safeIdentity : undefined,
      feedId: parsedFeedId,
      pubkey: safeIdentity.startsWith("nostr:") ? safeIdentity.slice(6) : undefined,
      identity: safeIdentity,
    });
  }
  return [...favorites.values()];
}

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
  showId?: string,
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
    ...(showId ? { showId } : {}),
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

  const contentId = text(hit._id);
  if (!contentId || !/^\S{20}$/.test(contentId)) return null;
  return createFountainTrack(`episode:id:${contentId}`, info, url, title, duration, publishedAt);
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
        const isFountainReference = event.tags.some(([name, value]) => name === "i" && (value?.startsWith("podcast:guid:") || value?.startsWith("podcast:item:guid:")));
        const track = isFountainReference && (event.kind === NOSTR_NOTE_KIND || event.kind === 1063) ? null : event.kind === 54 ? parsePodcastEpisodeTrack(event) : eventToTrack(event);
        if (!track || seen.has(track.url)) continue;
        seen.add(track.url);
        tracks.push({ ...track, kind: "podcast" });
      }

      const fountainReferences = new Map<string, string | undefined>();
      const relatedEvents = new Map<string, NostrEvent>();
      for (const event of events) {
        if (event.kind !== NOSTR_NOTE_KIND) continue;
        const itemReference = event.tags.find(([name, value]) => name === "i" && value?.startsWith("podcast:item:guid:"))?.[1];
        const itemGuid = itemReference?.slice("podcast:item:guid:".length);
        if (!itemGuid || !EPISODE_GUID_RE.test(itemGuid)) continue;
        relatedEvents.set(itemGuid, event);
        if (fountainReferences.has(itemGuid)) continue;
        const feedReference = event.tags.find(([name, value]) => name === "i" && value?.startsWith("podcast:guid:"))?.[1];
        const feedGuid = feedReference?.slice("podcast:guid:".length);
        fountainReferences.set(itemGuid, feedGuid && EPISODE_GUID_RE.test(feedGuid) ? feedGuid : undefined);
      }

      const resolvedFountain: (Track | null)[] = [];
      const referencesToResolve = [...fountainReferences.entries()].slice(0, Math.min(limit, 10));
      const referenceBatches = Array.from(
        { length: Math.ceil(referencesToResolve.length / FOUNTAIN_SHOWS_PER_LOOKUP_BATCH) },
        (_, index) => referencesToResolve.slice(index * FOUNTAIN_SHOWS_PER_LOOKUP_BATCH, (index + 1) * FOUNTAIN_SHOWS_PER_LOOKUP_BATCH),
      );
      for (const batch of referenceBatches) {
        if (signal.aborted) throw signal.reason;
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
        const itemGuid = track.id.slice("fountain:episode:id:".length);
        const reference = relatedEvents.get(itemGuid);
        const feedReference = reference?.tags.find(([name, value]) => name === "i" && value?.startsWith("podcast:guid:"))?.[1];
        const feedGuid = feedReference?.slice("podcast:guid:".length);
        tracks.push(feedGuid ? { ...track, showId: `fountain:show:id:${feedGuid}` } : track);
      }

      tracks.sort((a, b) => b.createdAt - a.createdAt);
      return tracks.slice(0, limit);
    },
  });
}

function fountainShowFromHit(hit: Record<string, unknown>, feedGuid?: string): PodcastShow | null {
  if (hit._type !== "SHOW" || typeof hit._id !== "string" || !isRecord(hit.info)) return null;
  const title = text(hit.info.title);
  if (!title) return null;
  const rawId = hit._id;
  if (rawId.length !== 20) return null;
  return {
    id: `fountain:show:id:${rawId}`,
    title,
    image: sanitizeUrl(text(hit.info.image)),
    description: text(hit.info.description),
    publisher: text(hit.info.publisher),
    source: "fountain",
    feedGuid: text(hit._guid) ?? feedGuid,
  };
}

/** Fetch podcast show metadata (NIP-F4 kind:10154) for set of pubkeys. */
export function useNostrPodcastShows() {
  const { nostr } = useNostr();
  const query = useInfiniteQuery({
    queryKey: ["podcast-shows", "nostr"],
    initialPageParam: undefined as number | undefined,
    retry: 1,
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(12000)]);
      const until = pageParam;
      const events = await nostr.query(
        [
          { kinds: [NOSTR_PODCAST_SHOW_KIND, NOSTR_PODCAST_EPISODE_KIND], limit: NOSTR_SHOW_PAGE_SIZE, ...(until ? { until } : {}) },
          { kinds: [1063, 1], "#t": PODCAST_TOPICS, limit: NOSTR_SHOW_PAGE_SIZE, ...(until ? { until } : {}) },
        ],
        { signal },
      );
      const episodesByAuthor = new Map<string, NostrEvent[]>();
      for (const event of events) {
        const isNativePodcastEpisode = event.kind === NOSTR_PODCAST_EPISODE_KIND && !!parsePodcastEpisodeTrack(event);
        const hasPodcastTopic = event.tags.some(([name, value]) => name === "t" && value && PODCAST_TOPICS.includes(value.toLowerCase()));
        const referencesFountain = event.tags.some(([name, value]) => name === "i" && (value?.startsWith("podcast:guid:") || value?.startsWith("podcast:item:guid:")));
        const isPodcastFileMetadata = event.kind === 1063 && hasPodcastTopic && !!eventToTrack(event);
        const isPodcastNoteAudio = event.kind === 1 && hasPodcastTopic && !referencesFountain && !!eventToTrack(event);
        const isTaggedAudioEpisode = isPodcastFileMetadata || isPodcastNoteAudio;
        if (!isNativePodcastEpisode && !isTaggedAudioEpisode) continue;
        const list = episodesByAuthor.get(event.pubkey) ?? [];
        list.push(event);
        episodesByAuthor.set(event.pubkey, list);
      }

      const shows = new Map<string, PodcastShow>();
      for (const event of events) {
        if (event.kind !== NOSTR_PODCAST_SHOW_KIND) continue;
        const title = event.tags.find(([name]) => name === "title")?.[1];
        if (!title) continue;
        const authorPubkeys = event.tags.filter(([name]) => name === "p").map(([, value]) => value).filter(Boolean);
        const pubkey = episodesByAuthor.has(event.pubkey) ? event.pubkey : authorPubkeys.find((key) => episodesByAuthor.has(key));
        if (!pubkey) continue;
        const relatedEpisodes = episodesByAuthor.get(pubkey) ?? [];
        if (!relatedEpisodes.length) continue;
        shows.set(pubkey, {
          id: `nostr:${pubkey}`,
          pubkey,
          title,
          image: sanitizeUrl(event.tags.find(([name]) => name === "image")?.[1]),
          description: event.tags.find(([name]) => name === "description")?.[1],
          source: "nostr",
          episodeCount: relatedEpisodes.length,
          event,
        });
      }
      for (const [pubkey, episodes] of episodesByAuthor) {
        if (shows.has(pubkey)) continue;
        const author = episodes[0];
        const title = author.tags.find(([name]) => name === "podcast")?.[1] ?? "Podcast";
        shows.set(pubkey, {
          id: `nostr:${pubkey}`,
          pubkey,
          title,
          image: sanitizeUrl(author.tags.find(([name]) => name === "image")?.[1]),
          source: "nostr",
          episodeCount: episodes.length,
          event: author,
        });
      }
      const pageShows = [...shows.values()].sort((a, b) => (b.episodeCount ?? 0) - (a.episodeCount ?? 0) || a.title.localeCompare(b.title));
      const nextUntil = events.length >= NOSTR_SHOW_PAGE_SIZE * 2 ? Math.min(...events.map((event) => event.created_at)) - 1 : undefined;
      return { shows: pageShows, nextUntil, hasMore: nextUntil !== undefined };
    },
    getNextPageParam: (lastPage) => lastPage.nextUntil,
    staleTime: 5 * 60 * 1000,
  });
  const data = query.data?.pages.flatMap((page) => page.shows) ?? [];
  return { ...query, data, hasNextPage: query.data?.pages.at(-1)?.hasMore ?? false };
}

/** Resolve a NIP-73 podcast feed GUID to its Fountain show metadata. */
async function lookupFountainShow(feedGuid: string, signal: AbortSignal): Promise<PodcastShow | null> {
  if (!EPISODE_GUID_RE.test(feedGuid)) return null;
  const response = await fetch(`${FOUNTAIN_API}/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: `podcast:guid:${feedGuid}` }),
    signal,
  });
  if (!response.ok) throw new Error(`Fountain returned ${response.status}`);
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.hits)) return null;
  for (const value of data.hits) {
    if (!isRecord(value)) continue;
    const show = fountainShowFromHit(value, feedGuid);
    if (show) {
      return show;
    }
  }
  return null;
}

/** NIP-73 show GUIDs discovered in Nostr notes, resolved to Fountain records. */
export function useFountainPodcastShows() {
  const { nostr } = useNostr();
  const query = useInfiniteQuery({
    queryKey: ["podcast-shows", "fountain"],
    initialPageParam: undefined as number | undefined,
    retry: 1,
    queryFn: async ({ pageParam, signal: querySignal }) => {
      const signal = AbortSignal.any([querySignal, AbortSignal.timeout(20000)]);
      const until = pageParam;
      const events = await nostr.query(
        [
          { kinds: [NOSTR_NOTE_KIND], "#k": ["podcast:guid"], limit: FOUNTAIN_REFERENCE_SCAN_PAGE, ...(until ? { until } : {}) },
          { kinds: [NOSTR_NOTE_KIND], "#k": ["podcast:item:guid"], limit: FOUNTAIN_REFERENCE_SCAN_PAGE, ...(until ? { until } : {}) },
          { kinds: [NOSTR_NOTE_KIND], "#t": ["podcast"], limit: FOUNTAIN_REFERENCE_SCAN_PAGE, ...(until ? { until } : {}) },
        ],
        { signal },
      );
      const guidsInRelayOrder: string[] = [];
      for (const event of events) {
        for (const [name, value] of event.tags) {
          if (name !== "i" || !value?.startsWith("podcast:guid:")) continue;
          const guid = value.slice("podcast:guid:".length);
          if (EPISODE_GUID_RE.test(guid)) {
            guidsInRelayOrder.push(guid);
          }
        }
      }
      const uniqueGuids = [...new Set(guidsInRelayOrder)];
      const guids = uniqueGuids.slice(0, FOUNTAIN_MAX_REFERENCE_BATCH);
      const shows: PodcastShow[] = [];
      const episodeCounts = new Map<string, number>();
      for (const event of events) {
        const itemReference = event.tags.find(([name, value]) => name === "i" && value?.startsWith("podcast:item:guid:"))?.[1];
        const feedReference = event.tags.find(([name, value]) => name === "i" && value?.startsWith("podcast:guid:"))?.[1];
        const itemGuid = itemReference?.slice("podcast:item:guid:".length);
        const feedGuid = feedReference?.slice("podcast:guid:".length);
        if (itemGuid && feedGuid && EPISODE_GUID_RE.test(itemGuid) && EPISODE_GUID_RE.test(feedGuid)) {
          episodeCounts.set(feedGuid, (episodeCounts.get(feedGuid) ?? 0) + 1);
        }
      }
      for (let offset = 0; offset < guids.length; offset += FOUNTAIN_SHOWS_PER_LOOKUP_BATCH) {
        if (signal.aborted) throw signal.reason;
        const batch = guids.slice(offset, offset + FOUNTAIN_SHOWS_PER_LOOKUP_BATCH);
        const resolved = await Promise.all(batch.map((guid) => lookupFountainShow(guid, signal).catch((error: unknown) => {
          if (signal.aborted) throw error;
          return null;
        })));
        for (const show of resolved) {
          if (!show) continue;
          shows.push({ ...show, episodeCount: episodeCounts.get(show.feedGuid ?? "") ?? 0 });
        }
      }
      const deduped = new Map(shows.map((show) => [show.id, show]));
      const pageShows = [...deduped.values()].sort((a, b) => a.title.localeCompare(b.title));
      const hasMore = uniqueGuids.length > guids.length || events.length >= FOUNTAIN_REFERENCE_SCAN_PAGE * 3;
      const nextUntil = uniqueGuids.length > guids.length
        ? Math.min(...events.map((event) => event.created_at))
        : events.length >= FOUNTAIN_REFERENCE_SCAN_PAGE * 3
          ? Math.min(...events.map((event) => event.created_at)) - 1
          : undefined;
      return { shows: pageShows, nextUntil, hasMore, needsMoreScan: uniqueGuids.length > guids.length };
    },
    getNextPageParam: (lastPage) => lastPage.nextUntil,
    staleTime: 5 * 60 * 1000,
  });
  const showMap = new Map<string, PodcastShow>();
  for (const page of query.data?.pages ?? []) for (const show of page.shows) showMap.set(show.id, show);
  const data = [...showMap.values()].sort((a, b) => a.title.localeCompare(b.title));
  const lastPage = query.data?.pages.at(-1);
  return { ...query, data, hasNextPage: lastPage?.hasMore ?? false, needsMoreScan: lastPage?.needsMoreScan ?? false };
}

export function usePodcastFavorites() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const readRelayKey = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join("|");
  const query = useQuery({
    queryKey: [PODCAST_LIBRARY_QUERY_KEY, user?.pubkey ?? "", readRelayKey],
    enabled: !!user && !!readRelayKey,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      if (!user || !readRelayKey) return [] as PodcastFavorite[];
      const events = await nostr.query([{ kinds: [PODCAST_FAVORITES_KIND], authors: [user.pubkey], limit: 10 }], {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      const event = events.filter(item => item.pubkey === user.pubkey && item.kind === PODCAST_FAVORITES_KIND).sort((a, b) => b.created_at - a.created_at)[0];
      return parsePodcastFavorites(event);
    },
  });
  return { ...query, data: query.data ?? [], isEnabled: !!user, hasReadRelays: !!readRelayKey };
}

export function useIsPodcastFavorite(id: string) {
  const favorites = usePodcastFavorites();
  return favorites.data.some(item => item.id === id);
}

export function usePodcastFavoriteActions() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();
  const readRelayKey = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join("|");
  const queryKey = [PODCAST_LIBRARY_QUERY_KEY, user?.pubkey ?? "", readRelayKey];

  const toggleFavorite = useMutation({
    mutationFn: async (input: { favorite: PodcastFavorite; saved: boolean }) => {
      if (!user) throw new Error("Log in to save podcasts");
      if (!readRelayKey) throw new Error("Enable a read relay to refresh your saved podcasts.");
      if (!readRelayKey) throw new Error("Enable a read relay to refresh your saved podcasts.");
      const events = await nostr.query([{ kinds: [PODCAST_FAVORITES_KIND], authors: [user.pubkey], limit: 10 }], { signal: AbortSignal.timeout(15000) });
      const existing = events.filter(item => item.pubkey === user.pubkey && item.kind === PODCAST_FAVORITES_KIND).sort((a, b) => b.created_at - a.created_at)[0];
      const current = parsePodcastFavorites(existing);
      const has = current.some(item => item.id === input.favorite.id);
      const next = input.saved
        ? (has ? current : [...current, input.favorite])
        : current.filter(item => item.id !== input.favorite.id);
      const tags: string[][] = existing?.tags.filter(([name]) => name !== "p" && name !== "url" && name !== "ostrify" && name !== "ostrify-episode" && name !== "ostrify-show").map(tag => [...tag]) ?? [];
      for (const favorite of next) {
        if (favorite.source === "nostr" && favorite.pubkey) tags.push(["p", favorite.pubkey]);
        else if (favorite.feedUrl && !favorite.episode) tags.push(["url", favorite.feedUrl]);
        if (favorite.episode) tags.push(["ostrify-episode", favorite.id, favorite.title.slice(0, 300), favorite.publisher?.slice(0, 200) ?? "", favorite.image ?? "", favorite.feedId ? String(favorite.feedId) : "", favorite.episodeId ? String(favorite.episodeId) : ""]);
        else tags.push(["ostrify-show", favorite.id, favorite.title.slice(0, 300), favorite.publisher?.slice(0, 200) ?? "", favorite.image ?? "", favorite.identity ?? (favorite.source === "nostr" ? `nostr:${favorite.pubkey ?? ""}` : favorite.feedUrl ?? ""), favorite.feedId ? String(favorite.feedId) : ""]);
      }
      tags.unshift(["d", "favorite-podcasts"]);
      const event = await publish({ kind: PODCAST_FAVORITES_KIND, content: existing?.content ?? "", tags });
      return parsePodcastFavorites(event);
    },
    onSuccess: data => { if (user) queryClient.setQueryData(queryKey, data); },
  });

  return { toggleFavorite, isReady: !!user };
}

export function podcastIndexTrackUrl(trackId: string): string | undefined {
  const match = /^podcast-index:episode:id:(\d{1,12})$/.exec(trackId);
  return match ? `https://api.podcastindex.org/api/1.0/episodes/byid?id=${match[1]}` : undefined;
}

export function podcastIndexTrackId(url: string): string | undefined {
  const match = /^https:\/\/api\.podcastindex\.org\/api\/1\.0\/episodes\/byid\?id=(\d{1,12})$/.exec(url);
  return match ? `podcast-index:episode:id:${match[1]}` : undefined;
}

export async function fetchPodcastIndexEpisodes(episodeId: number, signal: AbortSignal): Promise<Track | null> {
  if (!Number.isInteger(episodeId) || episodeId < 1) return null;
  const response = await fetch(`${PODCAST_INDEX_WORKER}/api/podcast-index/episodes/byid?id=${episodeId}`, { signal });
  if (!response.ok) throw podcastIndexError(response, "Loading saved podcast episode");
  const data: unknown = await response.json();
  if (!isRecord(data) || !isRecord(data.episode)) return null;
  const value = data.episode;
  const enclosure = sanitizeUrl(text(value.enclosureUrl));
  const title = text(value.title);
  if (!enclosure || !title) return null;
  const publishedAt = typeof value.datePublished === "number" && Number.isFinite(value.datePublished) ? value.datePublished : 0;
  return {
    id: `podcast-index:episode:id:${episodeId}`,
    source: "podcast-index",
    podcastIndexEpisodeId: episodeId,
    url: enclosure,
    title,
    artist: text(value.feedTitle),
    image: sanitizeUrl(text(value.image) ?? text(value.feedImage)),
    pubkey: "",
    duration: typeof value.duration === "number" && Number.isFinite(value.duration) && value.duration > 0 ? value.duration : undefined,
    kind: "podcast",
    topics: ["podcast"],
    createdAt: publishedAt,
  };
}

export function usePodcastIndexEpisodes(feedId: number | undefined, feedUrl?: string) {
  const hasFeed = (feedId !== undefined && Number.isInteger(feedId) && feedId > 0) || !!feedUrl;
  return useQuery({
    queryKey: ["podcast-index", "episodes", feedId ?? feedUrl ?? ""],
    enabled: hasFeed,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }): Promise<Track[]> => {
      if (!feedId && !feedUrl) return [];
      const endpoint = feedId
        ? `${PODCAST_INDEX_WORKER}/api/podcast-index/episodes/byfeedid?id=${feedId}`
        : `${PODCAST_INDEX_WORKER}/api/podcast-index/episodes/byfeedurl?url=${encodeURIComponent(feedUrl!)}`;
      const response = await fetch(endpoint, { signal });
      if (!response.ok) throw podcastIndexError(response, "Loading podcast episodes");
      const data: unknown = await response.json();
      if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Invalid Podcast Index episodes response");
      return data.items.map((value): Track | null => {
        if (!isRecord(value)) return null;
        const enclosure = sanitizeUrl(text(value.enclosureUrl));
        const title = text(value.title);
        if (!enclosure || !title) return null;
        const duration = typeof value.duration === "number" && Number.isFinite(value.duration) && value.duration > 0 ? value.duration : undefined;
        const publishedAt = typeof value.datePublished === "number" && Number.isFinite(value.datePublished) ? value.datePublished : 0;
        return {
          id: `podcast-index:episode:id:${String(value.id ?? `${feedId ?? feedUrl}-${publishedAt}-${title}`)}`,
          source: "podcast-index",
          showId: feedId ? `podcast-index:${feedId}` : undefined,
          podcastIndexEpisodeId: typeof value.id === "number" && Number.isInteger(value.id) ? value.id : undefined,
          url: enclosure,
          title,
          artist: text(value.feedTitle),
          image: sanitizeUrl(text(value.image) ?? text(value.feedImage)),
          pubkey: "",
          duration,
          kind: "podcast",
          topics: ["podcast"],
          createdAt: publishedAt,
        };
      }).filter((track): track is Track => !!track).sort((a, b) => b.createdAt - a.createdAt);
    },
  });
}

export function usePodcastIndexFeed(feedUrl: string | undefined) {
  return useQuery({
    queryKey: ["podcast-index", "feed", feedUrl ?? ""],
    enabled: !!sanitizeUrl(feedUrl),
    staleTime: 60 * 60 * 1000,
    queryFn: async ({ signal }): Promise<PodcastShow | null> => {
      const safeFeedUrl = sanitizeUrl(feedUrl);
      if (!safeFeedUrl) return null;
      const response = await fetch(`${PODCAST_INDEX_WORKER}/api/podcast-index/podcasts/byfeedurl?url=${encodeURIComponent(safeFeedUrl)}`, { signal });
      if (!response.ok) throw podcastIndexError(response, "Loading podcast details");
      const data: unknown = await response.json();
      if (!isRecord(data) || !Array.isArray(data.feeds)) throw new Error("Invalid Podcast Index feed response");
      const value = data.feeds.find(isRecord);
      if (!value) return null;
      const id = typeof value.id === "number" && Number.isInteger(value.id) ? value.id : undefined;
      return {
        id: id ? `podcast-index:${id}` : `feed:${safeFeedUrl}`,
        feedId: id,
        feedUrl: sanitizeUrl(text(value.url)) ?? safeFeedUrl,
        title: text(value.title) ?? safeFeedUrl,
        publisher: text(value.author) ?? text(value.ownerName),
        image: sanitizeUrl(text(value.artwork) ?? text(value.image)),
        description: text(value.description),
        source: "podcast-index",
      };
    },
  });
}

export function usePodcastIndexSearch(term: string) {
  const normalized = term.trim();
  return useQuery({
    queryKey: ["podcast-index", "search", normalized],
    enabled: normalized.length >= 2,
    staleTime: 10 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${PODCAST_INDEX_WORKER}/api/podcast-index/search/byterm?q=${encodeURIComponent(normalized)}`, { signal });
      if (!response.ok) throw podcastIndexError(response, "Searching Podcast Index");
      const data: unknown = await response.json();
      if (!isRecord(data) || !Array.isArray(data.feeds)) throw new Error("Invalid Podcast Index search response");
      return data.feeds.map((value): PodcastShow | null => {
        if (!isRecord(value) || typeof value.id !== "number" || !Number.isInteger(value.id)) return null;
        const title = text(value.title);
        if (!title) return null;
        return {
          id: `podcast-index:${value.id}`,
          feedId: value.id,
          title,
          image: sanitizeUrl(text(value.artwork) ?? text(value.image)),
          description: text(value.description),
          publisher: text(value.author) ?? text(value.ownerName),
          feedUrl: sanitizeUrl(text(value.url)),
          episodeCount: typeof value.episodeCount === "number" ? value.episodeCount : undefined,
          source: "podcast-index",
        };
      }).filter((show): show is PodcastShow => !!show);
    },
  });
}
