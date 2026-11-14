import { inferCategory } from "@/lib/categories";
import type { Track } from "@/lib/music";

function artistKeys(track: Track): string[] {
  const keys = [track.artistPubkey?.toLowerCase(), track.artistId ? `wavlake:${track.artistId.toLowerCase()}` : undefined];
  const name = track.artist?.trim().toLocaleLowerCase();
  if (name) keys.push(`name:${name}`);
  // Keep publisher identity as a separate station key even when a track names its artist.
  if (track.pubkey) keys.push(`publisher:${track.pubkey.toLowerCase()}`);
  return keys.filter((key): key is string => !!key);
}

function uniqueTracks(tracks: Track[]): Track[] {
  const ids = new Set<string>();
  const urls = new Set<string>();
  return tracks.filter(track => {
    if (ids.has(track.id) || urls.has(track.url)) return false;
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
