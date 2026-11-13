import { inferCategory } from "@/lib/categories";
import type { Track } from "@/lib/music";

const STORAGE_KEY = "ostrify-daily-discovery-feedback-v1";
const UPDATE_EVENT = "ostrify-discovery-feedback-update";

export interface DiscoveryFeedback {
  hiddenTrackIds: string[];
  hiddenDailyTrackKeys: string[];
  discouragedArtists: string[];
  discouragedTopics: string[];
  blockedArtists: string[];
  boostedArtists: string[];
  boostedTopics: string[];
}

export interface DailyDiscoveryTrack {
  track: Track;
  reason: string;
}

const emptyFeedback = (): DiscoveryFeedback => ({
  hiddenTrackIds: [],
  hiddenDailyTrackKeys: [],
  discouragedArtists: [],
  discouragedTopics: [],
  blockedArtists: [],
  boostedArtists: [],
  boostedTopics: [],
});

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 512))].slice(0, 2000);
}

function parseFeedback(value: unknown): DiscoveryFeedback {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyFeedback();
  const data = value as Record<string, unknown>;
  return {
    hiddenTrackIds: cleanStringList(data.hiddenTrackIds),
    hiddenDailyTrackKeys: cleanStringList(data.hiddenDailyTrackKeys),
    discouragedArtists: cleanStringList(data.discouragedArtists),
    discouragedTopics: cleanStringList(data.discouragedTopics),
    blockedArtists: cleanStringList(data.blockedArtists),
    boostedArtists: cleanStringList(data.boostedArtists),
    boostedTopics: cleanStringList(data.boostedTopics),
  };
}

export function readDiscoveryFeedback(): DiscoveryFeedback {
  try {
    if (typeof localStorage === "undefined") return emptyFeedback();
    return parseFeedback(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return emptyFeedback();
  }
}

function saveFeedback(update: (feedback: DiscoveryFeedback) => DiscoveryFeedback): DiscoveryFeedback {
  const next = update(readDiscoveryFeedback());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch {
    // The discovery feed still works when browser storage is unavailable.
  }
  return next;
}

function add(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

function remove(list: string[], value: string): string[] {
  return list.filter(item => item !== value);
}

export function discoveryArtistKeys(track: Track): string[] {
  const keys = [
    track.artistPubkey ? `pubkey:${track.artistPubkey.toLowerCase()}` : undefined,
    track.artistId ? `wavlake:${track.artistId.toLowerCase()}` : undefined,
  ].filter((key): key is string => !!key);
  const artist = track.artist?.trim().toLocaleLowerCase();
  if (artist) keys.push(`name:${artist}`);
  if (keys.length === 0 && track.pubkey) keys.push(`publisher:${track.pubkey.toLowerCase()}`);
  return keys;
}

function discoveryTopics(track: Track): string[] {
  const topics = track.topics.map(topic => topic.trim().toLocaleLowerCase()).filter(Boolean);
  const category = inferCategory(track);
  if (category) topics.push(`category:${category}`);
  return [...new Set(topics)];
}

export function markMoreLikeThis(track: Track, date = new Date()): DiscoveryFeedback {
  const artists = discoveryArtistKeys(track);
  const topics = discoveryTopics(track);
  const dailyKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${track.id}`;
  return saveFeedback(feedback => ({
    ...feedback,
    hiddenDailyTrackKeys: add(feedback.hiddenDailyTrackKeys, dailyKey),
    boostedArtists: artists.reduce(add, feedback.boostedArtists),
    boostedTopics: topics.reduce(add, feedback.boostedTopics),
    discouragedArtists: artists.reduce((list, key) => remove(list, key), feedback.discouragedArtists),
    discouragedTopics: topics.reduce((list, key) => remove(list, key), feedback.discouragedTopics),
  }));
}

export function markNotForMe(track: Track, date = new Date()): DiscoveryFeedback {
  const artists = discoveryArtistKeys(track);
  const topics = discoveryTopics(track);
  const dailyKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}:${track.id}`;
  return saveFeedback(feedback => ({
    ...feedback,
    hiddenDailyTrackKeys: add(feedback.hiddenDailyTrackKeys, dailyKey),
    hiddenTrackIds: add(feedback.hiddenTrackIds, track.id),
    discouragedArtists: artists.reduce(add, feedback.discouragedArtists),
    discouragedTopics: topics.reduce(add, feedback.discouragedTopics),
    boostedArtists: artists.reduce((list, key) => remove(list, key), feedback.boostedArtists),
    boostedTopics: topics.reduce((list, key) => remove(list, key), feedback.boostedTopics),
  }));
}

export function blockDiscoveryArtist(track: Track): DiscoveryFeedback {
  const artists = discoveryArtistKeys(track);
  if (artists.length === 0) return readDiscoveryFeedback();
  return saveFeedback(feedback => ({
    ...feedback,
    blockedArtists: artists.reduce(add, feedback.blockedArtists),
    discouragedArtists: artists.reduce(add, feedback.discouragedArtists),
    boostedArtists: artists.reduce((list, key) => remove(list, key), feedback.boostedArtists),
  }));
}

export function unblockDiscoveryArtist(keys: string | string[]): DiscoveryFeedback {
  const unblock = new Set(Array.isArray(keys) ? keys : [keys]);
  return saveFeedback(feedback => ({ ...feedback, blockedArtists: feedback.blockedArtists.filter(key => !unblock.has(key)) }));
}

function dailySeed(date: Date): number {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let seed = 2166136261;
  for (const character of key) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function stableHash(track: Track, seed: number): number {
  let hash = seed;
  for (const character of track.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function buildDailyDiscovery({
  candidates,
  liked,
  history,
  followedArtists,
  feedback,
  date = new Date(),
  limit = 12,
}: {
  candidates: Track[];
  liked: Track[];
  history: Track[];
  followedArtists: string[];
  feedback: DiscoveryFeedback;
  date?: Date;
  limit?: number;
}): DailyDiscoveryTrack[] {
  const unique = new Map<string, Track>();
  for (const track of candidates) {
    if (track.kind === "music") unique.set(track.id, track);
  }
  const likedIds = new Set(liked.map(track => track.id));
  const heardIds = new Set(history.map(track => track.id));
  const hiddenIds = new Set(feedback.hiddenTrackIds);
  const today = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const dailyHiddenIds = new Set(feedback.hiddenDailyTrackKeys.filter(key => key.startsWith(`${today}:`)).map(key => key.slice(today.length + 1)));
  const blocked = new Set(feedback.blockedArtists);
  const dislikedArtists = new Set(feedback.discouragedArtists);
  const dislikedTopics = new Set(feedback.discouragedTopics);
  const likedArtists = new Set(liked.flatMap(discoveryArtistKeys));
  const followed = new Set(followedArtists.flatMap(value => value.startsWith("wavlake:") ? [value.toLowerCase(), `wavlake:${value.slice(8).toLowerCase()}`] : [`pubkey:${value.toLowerCase()}`, value.toLowerCase()]));
  const likedTopics = new Set(liked.flatMap(discoveryTopics));
  const recentTopics = new Set(history.slice(0, 30).flatMap(discoveryTopics));
  const seed = dailySeed(date);
  const scored = [...unique.values()].flatMap(track => {
    if (likedIds.has(track.id) || heardIds.has(track.id) || hiddenIds.has(track.id) || dailyHiddenIds.has(track.id)) return [];
    const artists = discoveryArtistKeys(track);
    if (artists.some(key => blocked.has(key))) return [];
    const topics = discoveryTopics(track);
    const followedMatch = artists.some(key => followed.has(key));
    const likedArtistMatch = artists.some(key => likedArtists.has(key));
    const artistBoost = artists.some(key => feedback.boostedArtists.includes(key));
    const topicBoost = topics.some(topic => feedback.boostedTopics.includes(topic));
    const artistDown = artists.some(key => dislikedArtists.has(key));
    const topicDownCount = topics.filter(topic => dislikedTopics.has(topic)).length;
    const genreMatch = topics.some(topic => likedTopics.has(topic) || recentTopics.has(topic));
    const freshDays = track.createdAt > 0 ? Math.max(0, (date.getTime() / 1000 - track.createdAt) / 86400) : 365;
    const freshness = Math.max(0, 3 - freshDays / 20);
    const exploration = (followedMatch || likedArtistMatch ? 0.5 : 1.5);
    const score = freshness + exploration + (followedMatch ? 2.5 : 0) + (likedArtistMatch ? 1 : 0)
      + (genreMatch ? 1.5 : 0) + (artistBoost ? 3 : 0) + (topicBoost ? 2 : 0)
      - (artistDown ? 1.5 : 0) - topicDownCount * 0.5;
    let reason = track.source === "wavlake" ? "New on Wavlake" : "New from Nostr";
    if (artistBoost || topicBoost) reason = "Because you asked for more like this";
    else if (followedMatch) reason = "From an artist you follow";
    else if (likedArtistMatch) reason = "From an artist you like";
    else if (genreMatch) reason = "A sound you enjoy";
    return [{ track, artists, score, dailyOrder: stableHash(track, seed), reason }];
  });

  scored.sort((left, right) => right.score - left.score || left.dailyOrder - right.dailyOrder);
  const selected: typeof scored = [];
  const selectedIds = new Set<string>();
  const artistCounts = new Map<string, number>();
  const take = (enforceCap: boolean) => {
    for (const item of scored) {
      if (selectedIds.has(item.track.id)) continue;
      if (enforceCap && item.artists.some(key => (artistCounts.get(key) ?? 0) >= 2)) continue;
      selected.push(item);
      selectedIds.add(item.track.id);
      for (const key of item.artists) artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
      return true;
    }
    return false;
  };
  while (selected.length < limit && take(true)) { /* Select a varied daily batch. */ }
  while (selected.length < limit && take(false)) { /* Fill if catalog metadata is sparse. */ }
  return selected.map(({ track, reason }) => ({ track, reason }));
}

export const DISCOVERY_FEEDBACK_EVENT = UPDATE_EVENT;
