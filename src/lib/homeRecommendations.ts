import { inferCategory } from '@/lib/categories';
import type { Track } from '@/lib/music';

interface HomeSelectionOptions {
  candidates: Track[];
  history: Track[];
  liked: Track[];
  followedArtists: string[];
  limit?: number;
  variation?: number;
  /** Stable per-page-load seed for varying equally suitable shelf picks. */
  seed?: string;
  /** How many familiar tracks to schedule before a discovery track. */
  familiarSlots?: number;
  excludeIds?: string[];
  excludeUrls?: string[];
}

function artistKeys(track: Track): string[] {
  const keys = [
    track.artistPubkey?.toLowerCase(),
    track.artistId ? `wavlake:${track.artistId.toLowerCase()}` : undefined,
    track.artist?.trim() ? `name:${track.artist.trim().toLocaleLowerCase()}` : undefined,
    track.pubkey ? `publisher:${track.pubkey.toLowerCase()}` : undefined,
  ];
  return keys.filter((key): key is string => Boolean(key));
}

function trackTopics(track: Track): string[] {
  const category = inferCategory(track);
  return [...new Set([...track.topics.map(topic => topic.trim().toLocaleLowerCase()).filter(Boolean), ...(category ? [`category:${category}`] : [])])];
}

function trackHash(track: Track, seed: string): number {
  let hash = 2166136261;
  for (const character of `${seed}:${track.id}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
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

/** Select a stable, taste-aware shelf with two familiar picks for each discovery pick. */
export function buildVariedHomeShelf({
  candidates,
  history,
  liked,
  followedArtists,
  limit = 10,
  variation = 0,
  seed: selectionSeed,
  familiarSlots: familiarSlotsPerRound = 2,
  excludeIds = [],
  excludeUrls = [],
}: HomeSelectionOptions): Track[] {
  const musicHistory = history.filter(track => track.kind === 'music');
  const musicLiked = liked.filter(track => track.kind === 'music');
  const tasteArtists = new Set([...musicHistory, ...musicLiked].flatMap(artistKeys));
  const followed = new Set<string>();
  for (const reference of followedArtists) {
    if (/^[0-9a-f]{64}$/i.test(reference)) {
      followed.add(reference.toLowerCase());
      followed.add(`publisher:${reference.toLowerCase()}`);
      followed.add(`pubkey:${reference.toLowerCase()}`);
    }
    if (reference.startsWith('wavlake:')) followed.add(reference.toLowerCase());
  }
  const tasteTopics = new Set([...musicHistory, ...musicLiked].flatMap(trackTopics));
  const heardIds = new Set(musicHistory.map(track => track.id));
  const heardUrls = new Set(musicHistory.map(track => track.url));
  const likedIds = new Set(musicLiked.map(track => track.id));
  const likedUrls = new Set(musicLiked.map(track => track.url));
  const now = Date.now() / 1000;
  const excludedIds = new Set(excludeIds);
  const excludedUrls = new Set(excludeUrls);
  const seed = `${selectionSeed ?? new Date().toISOString().slice(0, 10)}:${variation}`;
  const ranked = uniqueTracks(candidates).filter(track =>
    track.kind === 'music' && !excludedIds.has(track.id) && !excludedUrls.has(track.url) && !heardIds.has(track.id) && !heardUrls.has(track.url) && !likedIds.has(track.id) && !likedUrls.has(track.url),
  ).map(track => {
    const artists = artistKeys(track);
    const topics = trackTopics(track);
    const artistMatch = artists.some(key => tasteArtists.has(key) || followed.has(key));
    const topicMatch = topics.some(topic => tasteTopics.has(topic));
    const familiar = artistMatch || topicMatch;
    const ageDays = track.createdAt > 0 ? Math.max(0, (now - track.createdAt) / 86400) : 365;
    // Treat tracks published on the same day as similarly fresh, so the per-load
    // seed can vary picks within a fresh cohort instead of always favoring exact timestamps.
    const freshness = Math.max(0, 5 - Math.floor(ageDays) / 12);
    const seedOrder = trackHash(track, seed);
    return { track, artists, topics, familiar, freshness, seedOrder };
  });

  const byFreshness = (left: typeof ranked[number], right: typeof ranked[number]) =>
    right.freshness - left.freshness || left.seedOrder - right.seedOrder;
  const familiar = ranked.filter(item => item.familiar).sort(byFreshness);
  const discoveries = ranked.filter(item => !item.familiar).sort(byFreshness);
  const selected: typeof ranked = [];
  const selectedIds = new Set<string>();
  const artistCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  let familiarIndex = 0;
  let discoveryIndex = 0;
  let familiarSlots = familiarSlotsPerRound;

  const take = (items: typeof ranked, start: number, enforceCaps: boolean): number => {
    for (let index = start; index < items.length; index++) {
      const item = items[index];
      if (selectedIds.has(item.track.id) || selected.some(selectedItem => selectedItem.track.url === item.track.url)) continue;
      if (enforceCaps && item.artists.some(key => (artistCounts.get(key) ?? 0) >= 2)) continue;
      if (enforceCaps && item.topics.some(key => (topicCounts.get(key) ?? 0) >= 4)) continue;
      selected.push(item);
      selectedIds.add(item.track.id);
      for (const key of item.artists) artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
      for (const key of item.topics) topicCounts.set(key, (topicCounts.get(key) ?? 0) + 1);
      return index + 1;
    }
    return start;
  };

  while (selected.length < limit && (familiarIndex < familiar.length || discoveryIndex < discoveries.length)) {
    const chooseFamiliar = familiarSlots > 0 && familiarIndex < familiar.length;
    const items = chooseFamiliar ? familiar : discoveries;
    const start = chooseFamiliar ? familiarIndex : discoveryIndex;
    const nextIndex = take(items, start, true);
    if (nextIndex > start) {
      if (chooseFamiliar) familiarIndex = nextIndex;
      else discoveryIndex = nextIndex;
      familiarSlots = chooseFamiliar ? familiarSlots - 1 : familiarSlotsPerRound;
      continue;
    }
    const fallbackItems = chooseFamiliar ? discoveries : familiar;
    const fallbackStart = chooseFamiliar ? discoveryIndex : familiarIndex;
    const fallbackIndex = take(fallbackItems, fallbackStart, true);
    if (fallbackIndex <= fallbackStart) break;
    if (chooseFamiliar) discoveryIndex = fallbackIndex;
    else familiarIndex = fallbackIndex;
    familiarSlots = chooseFamiliar ? familiarSlotsPerRound : Math.max(0, familiarSlots - 1);
  }

  if (selected.length < limit) {
    for (const item of [...familiar, ...discoveries]) {
      if (selected.length >= limit) break;
      if (selectedIds.has(item.track.id) || selected.some(selectedItem => selectedItem.track.url === item.track.url)) continue;
      selected.push(item);
      selectedIds.add(item.track.id);
    }
  }

  return selected.map(item => item.track);
}
