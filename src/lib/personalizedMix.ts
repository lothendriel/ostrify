import type { Track } from "@/lib/music";

export interface PersonalizedTrack {
  track: Track;
  reason: string;
}

function dailySeed(date: Date, variation: number): number {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${variation}`;
  let seed = 2166136261;
  for (const character of key) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function stableTrackHash(track: Track, seed: number): number {
  let hash = seed;
  for (const character of track.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function artistKeys(track: Track): string[] {
  const name = track.artist?.trim().toLocaleLowerCase();
  return [track.artistPubkey?.toLowerCase(), track.artistId ? `wavlake:${track.artistId.toLowerCase()}` : undefined, name ? `name:${name}` : undefined]
    .filter((value): value is string => !!value);
}

function varietyKeys(track: Track): string[] {
  const knownArtists = artistKeys(track).map(key => key.toLowerCase());
  if (knownArtists.length) return knownArtists;
  return track.pubkey ? [`publisher:${track.pubkey.toLowerCase()}`] : [];
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

/** Rank available music against private, on-device likes and playback history. */
export function buildPersonalizedMix({
  candidates,
  liked,
  history,
  followedArtists,
  date = new Date(),
  variation = 0,
  limit = 24,
}: {
  candidates: Track[];
  liked: Track[];
  history: Track[];
  followedArtists: string[];
  date?: Date;
  /** Local-only variation counter used to generate another version of the same day's mix. */
  variation?: number;
  limit?: number;
}): PersonalizedTrack[] {
  const musicLiked = liked.filter(track => track.kind === "music");
  const musicHistory = history.filter(track => track.kind === "music");
  const musicCandidates = uniqueTracks([...candidates, ...musicHistory]).filter(track => track.kind === "music");
  const likedIds = new Set(musicLiked.map(track => track.id));
  const likedUrls = new Set(musicLiked.map(track => track.url));
  const likedArtists = new Set(musicLiked.flatMap(artistKeys));
  const historyArtists = new Set(musicHistory.flatMap(artistKeys));
  const followed = new Set(followedArtists);
  const topicWeights = new Map<string, number>();

  if (musicLiked.length === 0 && musicHistory.length === 0 && followed.size === 0) return [];

  for (const track of musicLiked) {
    for (const topic of track.topics) topicWeights.set(topic.toLowerCase(), (topicWeights.get(topic.toLowerCase()) ?? 0) + 3);
  }
  musicHistory.forEach((track, index) => {
    const weight = Math.max(0.5, 2.5 - index * 0.08);
    for (const topic of track.topics) topicWeights.set(topic.toLowerCase(), (topicWeights.get(topic.toLowerCase()) ?? 0) + weight);
  });

  const seed = dailySeed(date, variation);
  const scored = musicCandidates.flatMap(track => {
    if (likedIds.has(track.id) || likedUrls.has(track.url)) return [];
    const keys = artistKeys(track);
    const followedMatch = keys.some(key => followed.has(key));
    const likedArtistMatch = keys.some(key => likedArtists.has(key));
    const historyArtistMatch = keys.some(key => historyArtists.has(key));
    const topicScore = track.topics.reduce((total, topic) => total + (topicWeights.get(topic.toLowerCase()) ?? 0), 0);
    const preferenceScore = (followedMatch ? 7 : 0) + (likedArtistMatch ? 6 : 0) + (historyArtistMatch ? 3 : 0) + topicScore;
    const dailyOrder = stableTrackHash(track, seed);
    const dailyVariety = dailyOrder / 0xffffffff;
    const recency = track.createdAt > 0
      ? Math.min(1, Math.max(0, 1 - (date.getTime() / 1000 - track.createdAt) / (365 * 24 * 60 * 60)))
      : 0;

    let reason = track.source === "wavlake" ? "A fresh find on Wavlake" : "A fresh find from Nostr";
    if (followedMatch) reason = "From an artist you follow";
    else if (likedArtistMatch) reason = "From an artist you like";
    else if (historyArtistMatch) reason = "Similar to your recent listening";
    else if (topicScore > 0) {
      const matchingTopic = track.topics.find(topic => (topicWeights.get(topic.toLowerCase()) ?? 0) > 0);
      if (matchingTopic) reason = `Because you like ${matchingTopic}`;
    }

    return [{
      track,
      reason,
      familiar: preferenceScore > 0,
      score: preferenceScore + recency * 0.5 + dailyVariety,
      dailyOrder,
      artists: varietyKeys(track),
    }];
  });

  const familiar = scored.filter(item => item.familiar).sort((left, right) => right.score - left.score || left.dailyOrder - right.dailyOrder);
  const discoveries = scored.filter(item => !item.familiar).sort((left, right) => {
    const leftFreshness = (left.track.createdAt > 0 ? left.track.createdAt : 0) + left.dailyOrder / 0xffffffff * 60 * 60 * 24;
    const rightFreshness = (right.track.createdAt > 0 ? right.track.createdAt : 0) + right.dailyOrder / 0xffffffff * 60 * 60 * 24;
    return rightFreshness - leftFreshness;
  });

  const selected: typeof scored = [];
  const selectedIds = new Set<string>();
  const artistCounts = new Map<string, number>();
  let familiarIndex = 0;
  let discoveryIndex = 0;
  let chooseFamiliar = true;
  const varietyCap = 2;

  const takeNext = (items: typeof scored, startIndex: number, enforceCap: boolean): number => {
    for (let index = startIndex; index < items.length; index++) {
      const item = items[index];
      if (selectedIds.has(item.track.id)) continue;
      if (enforceCap && item.artists.some(artist => (artistCounts.get(artist) ?? 0) >= varietyCap)) continue;
      selected.push(item);
      selectedIds.add(item.track.id);
      for (const artist of item.artists) artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
      return index + 1;
    }
    return startIndex;
  };

  while (selected.length < limit && (familiarIndex < familiar.length || discoveryIndex < discoveries.length)) {
    const previousLength = selected.length;
    if (chooseFamiliar) {
      const nextIndex = takeNext(familiar, familiarIndex, true);
      if (nextIndex > familiarIndex) familiarIndex = nextIndex;
      else {
        const discoveryNext = takeNext(discoveries, discoveryIndex, true);
        if (discoveryNext > discoveryIndex) discoveryIndex = discoveryNext;
      }
    } else {
      const nextIndex = takeNext(discoveries, discoveryIndex, true);
      if (nextIndex > discoveryIndex) discoveryIndex = nextIndex;
      else {
        const familiarNext = takeNext(familiar, familiarIndex, true);
        if (familiarNext > familiarIndex) familiarIndex = familiarNext;
      }
    }
    if (selected.length === previousLength) break;
    chooseFamiliar = !chooseFamiliar;
  }

  if (selected.length < limit) {
    const remainder = [...familiar, ...discoveries].sort((left, right) => right.score - left.score || left.dailyOrder - right.dailyOrder);
    while (selected.length < limit) {
      const previousLength = selected.length;
      takeNext(remainder, 0, false);
      if (selected.length === previousLength) break;
    }
  }

  return selected.slice(0, limit).map(({ track, reason }) => ({ track, reason }));
}
