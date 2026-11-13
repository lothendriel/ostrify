import type { Track } from "@/lib/music";

export interface PersonalizedTrack {
  track: Track;
  reason: string;
}

function dailySeed(date: Date): number {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
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
  return [track.artistPubkey, track.artistId ? `wavlake:${track.artistId}` : undefined]
    .filter((value): value is string => !!value);
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
  limit = 24,
}: {
  candidates: Track[];
  liked: Track[];
  history: Track[];
  followedArtists: string[];
  date?: Date;
  limit?: number;
}): PersonalizedTrack[] {
  const musicLiked = liked.filter(track => track.kind === "music");
  const musicHistory = history.filter(track => track.kind === "music");
  const musicCandidates = uniqueTracks([...candidates, ...musicHistory]).filter(track => track.kind === "music");
  const likedIds = new Set(musicLiked.map(track => track.id));
  const likedArtists = new Set(musicLiked.flatMap(artistKeys));
  const historyArtists = new Set(musicHistory.flatMap(artistKeys));
  const followed = new Set(followedArtists);
  const topicWeights = new Map<string, number>();

  for (const track of musicLiked) {
    for (const topic of track.topics) topicWeights.set(topic.toLowerCase(), (topicWeights.get(topic.toLowerCase()) ?? 0) + 3);
  }
  musicHistory.forEach((track, index) => {
    const weight = Math.max(0.5, 2.5 - index * 0.08);
    for (const topic of track.topics) topicWeights.set(topic.toLowerCase(), (topicWeights.get(topic.toLowerCase()) ?? 0) + weight);
  });

  const scored = musicCandidates.flatMap(track => {
    if (likedIds.has(track.id)) return [];
    const keys = artistKeys(track);
    const followedMatch = keys.some(key => followed.has(key));
    const likedArtistMatch = keys.some(key => likedArtists.has(key));
    const historyArtistMatch = keys.some(key => historyArtists.has(key));
    const topicScore = track.topics.reduce((total, topic) => total + (topicWeights.get(topic.toLowerCase()) ?? 0), 0);
    const recency = track.createdAt > 0 ? Math.min(1, Math.max(0, 1 - (date.getTime() / 1000 - track.createdAt) / (365 * 24 * 60 * 60))) : 0;
    const preferenceScore = (followedMatch ? 9 : 0) + (likedArtistMatch ? 7 : 0) + (historyArtistMatch ? 5 : 0) + topicScore;
    if (preferenceScore <= 0) return [];
    const dailyOrder = stableTrackHash(track, dailySeed(date));
    const dailyVariety = dailyOrder / 0xffffffff * 1.5;
    const score = preferenceScore + recency * 0.2 + dailyVariety;

    let reason = "Because you like these sounds";
    if (followedMatch) reason = "From an artist you follow";
    else if (likedArtistMatch) reason = "From an artist you like";
    else if (historyArtistMatch) reason = "Similar to your recent listening";
    else {
      const matchingTopic = track.topics.find(topic => (topicWeights.get(topic.toLowerCase()) ?? 0) > 0);
      if (matchingTopic) reason = `Because you like ${matchingTopic}`;
    }
    return [{ track, reason, score, dailyOrder: stableTrackHash(track, dailySeed(date)) }];
  });

  return scored
    .sort((left, right) => right.score - left.score || left.dailyOrder - right.dailyOrder)
    .slice(0, limit)
    .map(({ track, reason }) => ({ track, reason }));
}
