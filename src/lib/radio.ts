import { inferCategory } from "@/lib/categories";
import type { Track } from "@/lib/music";
import type { RadioStation } from "@/hooks/useRadioFavorites";
import { sanitizeUrl } from "@/lib/sanitize";

const RADIO_DIRECTORY_SERVERS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
export const RADIO_STATION_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export async function radioDirectoryRequest(path: string, signal: AbortSignal): Promise<unknown> {
  for (const server of RADIO_DIRECTORY_SERVERS) {
    try {
      const response = await fetch(`${server}${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), referrerPolicy: 'no-referrer' });
      if (!response.ok) continue;
      return await response.json() as unknown;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  throw new Error('The station directory is unavailable. Please try again.');
}

export function parseRadioStations(value: unknown): RadioStation[] {
  if (!Array.isArray(value)) throw new Error('The station directory returned an unexpected response.');
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const text = (key: string) => typeof record[key] === 'string' ? (record[key] as string).trim().slice(0, 300) : '';
    const id = text('stationuuid');
    const name = text('name');
    if (!RADIO_STATION_ID.test(id) || !name) return [];
    return [{ id, name, url: sanitizeUrl(text('url_resolved')), image: sanitizeUrl(text('favicon')), location: [text('state'), text('country')].filter(Boolean).join(' · '), tags: text('tags').split(',').filter(Boolean).slice(0, 3).join(' · '), hls: record.hls === 1 || /\.m3u8(?:\?|$)/i.test(text('url_resolved')) }];
  });
}

export function radioStationTrack(station: RadioStation): Track {
  return { id: `radio-browser:${station.id}`, source: 'radio-browser', url: station.url ?? '', mimeType: station.hls ? 'application/vnd.apple.mpegurl' : undefined, title: station.name, artist: station.location || 'Live radio', image: station.image, pubkey: '', kind: 'music', topics: [], createdAt: 0 };
}

export function radioSharePath(track: Pick<Track, 'id' | 'source'>): string | undefined {
  const stationId = track.id.startsWith('radio-browser:') ? track.id.slice('radio-browser:'.length) : '';
  return track.source === 'radio-browser' && RADIO_STATION_ID.test(stationId) ? `/audio?radio=${stationId.toLowerCase()}` : undefined;
}

export async function fetchRadioStation(id: string, signal: AbortSignal): Promise<Track | undefined> {
  if (!RADIO_STATION_ID.test(id)) return undefined;
  const stations = parseRadioStations(await radioDirectoryRequest(`/json/stations/byuuid/${id}`, signal));
  const station = stations.find(item => item.id.toLowerCase() === id.toLowerCase());
  return station?.url ? radioStationTrack(station) : undefined;
}

function artistKeys(track: Track): string[] {
  const keys = [track.artistPubkey?.toLowerCase(), track.artistId ? `wavlake:${track.artistId.toLowerCase()}` : undefined];
  const name = track.artist?.trim().toLocaleLowerCase();
  if (name) keys.push(`name:${name}`);
  // Keep publisher identity as a separate station key even when a track names its artist.
  if (track.pubkey) keys.push(`publisher:${track.pubkey.toLowerCase()}`);
  return keys.filter((key): key is string => !!key);
}

function isRadioTrack(track: Track): boolean {
  return track.kind === "music" && track.title.trim().toLocaleLowerCase() !== "original sound";
}

function uniqueTracks(tracks: Track[]): Track[] {
  const ids = new Set<string>();
  const urls = new Set<string>();
  return tracks.filter(track => {
    if (!isRadioTrack(track) || ids.has(track.id) || urls.has(track.url)) return false;
    ids.add(track.id);
    urls.add(track.url);
    return true;
  });
}

function trackHash(track: Track, seed: string): number {
  let hash = 2166136261;
  for (const character of `${seed}:${track.id}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Build a deterministic, balanced station from local Nostr/Wavlake tracks. */
export function buildRadioStation({
  seed,
  candidates,
  relatedTracks = [],
  artistKeys: requestedArtistKeys = [],
  limit = 30,
}: {
  seed: Track;
  candidates: Track[];
  relatedTracks?: Track[];
  artistKeys?: string[];
  limit?: number;
}): Track[] {
  const artistSet = new Set([...artistKeys(seed), ...requestedArtistKeys.map(key => key.toLowerCase())]);
  const seedTopics = new Set(seed.topics.map(topic => topic.toLowerCase()));
  const seedCategory = inferCategory(seed);
  const relatedIds = new Set(relatedTracks.map(track => track.id));
  const pool = uniqueTracks([...relatedTracks, ...candidates]).filter(track => track.kind === "music" && track.id !== seed.id);
  const scored = pool.map(track => {
    const keys = artistKeys(track);
    const artistMatch = keys.some(key => artistSet.has(key));
    const topicMatches = track.topics.filter(topic => seedTopics.has(topic.toLowerCase())).length;
    const categoryMatch = !!seedCategory && inferCategory(track) === seedCategory;
    const albumMatch = !!seed.album && track.album?.toLocaleLowerCase() === seed.album.toLocaleLowerCase();
    const score = (artistMatch ? 7 : 0) + Math.min(topicMatches, 3) * 2 + (categoryMatch ? 2 : 0) + (albumMatch ? 3 : 0);
    const freshAt = track.createdAt > 0 ? track.createdAt : 0;
    return {
      track,
      artists: keys,
      related: score > 0 || relatedIds.has(track.id),
      score,
      freshness: freshAt + trackHash(track, seed.id) / 0xffffffff * 86_400,
      variety: trackHash(track, `${seed.id}:variety`),
    };
  });

  const similar = scored.filter(item => item.related).sort((left, right) => right.score - left.score || left.variety - right.variety);
  const explore = scored.filter(item => !item.related).sort((left, right) => right.freshness - left.freshness || left.variety - right.variety);
  const queue = [seed];
  const selectedIds = new Set([seed.id]);
  const artistCounts = new Map<string, number>();
  for (const key of artistKeys(seed)) artistCounts.set(key, 1);
  let similarIndex = 0;
  let exploreIndex = 0;
  let similarSlots = 2;
  const artistCap = 2;

  const take = (items: typeof scored, startIndex: number): number => {
    for (let index = startIndex; index < items.length; index++) {
      const item = items[index];
      if (selectedIds.has(item.track.id)) continue;
      if (item.artists.some(key => (artistCounts.get(key) ?? 0) >= artistCap)) continue;
      queue.push(item.track);
      selectedIds.add(item.track.id);
      for (const key of item.artists) artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
      return index + 1;
    }
    return startIndex;
  };

  while (queue.length < limit && (similarIndex < similar.length || exploreIndex < explore.length)) {
    const previousLength = queue.length;
    const preferSimilar = similarSlots > 0 && similarIndex < similar.length;
    if (preferSimilar) {
      const nextIndex = take(similar, similarIndex);
      if (nextIndex > similarIndex) {
        similarIndex = nextIndex;
        similarSlots -= 1;
      } else {
        const exploreNext = take(explore, exploreIndex);
        if (exploreNext > exploreIndex) {
          exploreIndex = exploreNext;
          similarSlots = 2;
        }
      }
    } else {
      const nextIndex = take(explore, exploreIndex);
      if (nextIndex > exploreIndex) {
        exploreIndex = nextIndex;
        similarSlots = 2;
      } else {
        const similarNext = take(similar, similarIndex);
        if (similarNext > similarIndex) similarIndex = similarNext;
      }
    }
    if (queue.length === previousLength) break;
  }

  if (queue.length < limit) {
    const remainder = [...similar, ...explore];
    while (queue.length < limit) {
      const previousLength = queue.length;
      take(remainder, 0);
      if (queue.length === previousLength) {
        for (const item of remainder) {
          if (selectedIds.has(item.track.id)) continue;
          queue.push(item.track);
          selectedIds.add(item.track.id);
          break;
        }
      }
      if (queue.length === previousLength) break;
    }
  }
  return queue;
}
