import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/music";
import { PlayerContext, type RepeatMode } from "@/contexts/PlayerContext";
import { recordListeningSeconds, recordListeningStart } from "@/lib/listeningAnalytics";
import { sanitizeUrl } from "@/lib/sanitize";
import { useTracks } from "@/hooks/useTracks";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { buildRadioStation } from "@/lib/radio";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const PLAYER_VOLUME_STORAGE_KEY = "ostrify-player-volume";
const PLAYER_STATE_STORAGE_PREFIX = "ostrify-player-state:";
const PLAYER_HISTORY_STORAGE_PREFIX = "ostrify-player-history:";
const PLAYER_AUTOPLAY_STORAGE_KEY = "ostrify-player-autoplay";
const DEFAULT_PLAYER_VOLUME = 0.8;
const PLAYER_HISTORY_LIMIT = 50;

interface SavedPlayerState {
  queue: Track[];
  index: number;
  progress: number;
  isPlaying: boolean;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

interface LastSavedPlayerState {
  queue: Track[];
  index: number;
  progressBucket: number;
  isPlaying: boolean;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
}

function historyStorageKey(owner: string): string {
  return `${PLAYER_HISTORY_STORAGE_PREFIX}${owner}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function restoreTrack(value: unknown): Track | undefined {
  if (!isRecord(value)) return undefined;
  const { id, url, title, pubkey, kind, topics, createdAt } = value;
  const safeUrl = typeof url === "string" ? sanitizeUrl(url) : undefined;
  if (
    typeof id !== "string" || !id || !safeUrl ||
    typeof title !== "string" || !title.trim() ||
    typeof pubkey !== "string" ||
    !["music", "podcast", "audiobook"].includes(String(kind)) ||
    !Array.isArray(topics) || !topics.every(topic => typeof topic === "string") ||
    typeof createdAt !== "number" || !Number.isFinite(createdAt)
  ) return undefined;

  const source = ["wavlake", "librivox", "gutenberg", "tunestr", "fountain", "podcast-index"].includes(String(value.source))
    ? value.source as Track["source"]
    : undefined;
  const duration = typeof value.duration === "number" && Number.isFinite(value.duration) && value.duration > 0
    ? value.duration
    : undefined;
  const image = typeof value.image === "string" ? sanitizeUrl(value.image) : undefined;

  return {
    id,
    source,
    artistId: optionalString(value.artistId),
    artistPubkey: optionalString(value.artistPubkey),
    albumId: optionalString(value.albumId),
    showId: optionalString(value.showId),
    podcastIndexEpisodeId: typeof value.podcastIndexEpisodeId === "number" && Number.isFinite(value.podcastIndexEpisodeId)
      ? value.podcastIndexEpisodeId
      : undefined,
    url: safeUrl,
    mimeType: optionalString(value.mimeType),
    title: title.trim(),
    artist: optionalString(value.artist),
    album: optionalString(value.album),
    image,
    pubkey,
    duration,
    kind: kind as Track["kind"],
    topics: topics as string[],
    createdAt,
  };
}

function readSavedHistory(owner: string): Track[] {
  try {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem(historyStorageKey(owner));
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(restoreTrack).filter((track): track is Track => track !== undefined).slice(0, PLAYER_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeSavedHistory(owner: string, history: Track[]): void {
  try {
    if (typeof window === "undefined") return;
    const storedHistory = history.slice(0, PLAYER_HISTORY_LIMIT).map(track => ({
      id: track.id,
      source: track.source,
      artistId: track.artistId,
      artistPubkey: track.artistPubkey,
      albumId: track.albumId,
      showId: track.showId,
      podcastIndexEpisodeId: track.podcastIndexEpisodeId,
      url: track.url,
      mimeType: track.mimeType,
      title: track.title,
      artist: track.artist,
      album: track.album,
      image: track.image,
      pubkey: track.pubkey,
      duration: track.duration,
      kind: track.kind,
      topics: track.topics,
      createdAt: track.createdAt,
    }));
    window.localStorage.setItem(historyStorageKey(owner), JSON.stringify(storedHistory));
  } catch {
    // Listening history remains available for this session if browser storage is unavailable.
  }
}

function playerStateStorageKey(owner: string): string {
  return `${PLAYER_STATE_STORAGE_PREFIX}${owner}`;
}

function readSavedPlayerState(owner: string): SavedPlayerState | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const stored = window.localStorage.getItem(playerStateStorageKey(owner));
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed) || !Array.isArray(parsed.queue)) return undefined;

    const queue = parsed.queue.map(restoreTrack);
    if (queue.some(track => !track)) return undefined;
    const tracks = queue.filter((track): track is Track => track !== undefined);
    const index = parsed.index;
    const progress = parsed.progress;
    if (
      (tracks.length === 0 && index !== -1) ||
      (tracks.length > 0 && (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= tracks.length)) ||
      typeof progress !== "number" || !Number.isFinite(progress) || progress < 0
    ) return undefined;
    const repeat: RepeatMode = parsed.repeat === "all" || parsed.repeat === "one" ? parsed.repeat : "off";
    return {
      queue: tracks,
      index: index as number,
      progress,
      isPlaying: parsed.isPlaying === true,
      muted: parsed.muted === true,
      shuffle: parsed.shuffle === true,
      repeat,
    };
  } catch {
    return undefined;
  }
}

function writeSavedPlayerState(owner: string, state: SavedPlayerState | undefined): void {
  try {
    if (typeof window === "undefined") return;
    const key = playerStateStorageKey(owner);
    if (!state) {
      window.localStorage.removeItem(key);
      return;
    }
    const serializeTrack = (track: Track): Track => ({
        id: track.id,
        source: track.source,
        artistId: track.artistId,
        artistPubkey: track.artistPubkey,
        albumId: track.albumId,
        showId: track.showId,
        podcastIndexEpisodeId: track.podcastIndexEpisodeId,
        url: track.url,
        mimeType: track.mimeType,
        title: track.title,
        artist: track.artist,
        album: track.album,
        image: track.image,
        pubkey: track.pubkey,
        duration: track.duration,
        kind: track.kind,
        topics: track.topics,
        createdAt: track.createdAt,
      });
    const persistedState: SavedPlayerState = {
      ...state,
      queue: state.queue.map(serializeTrack),
    };
    window.localStorage.setItem(key, JSON.stringify(persistedState));
  } catch {
    // Playback remains available for this session if browser storage is unavailable.
  }
}

function readSavedAutoplay(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PLAYER_AUTOPLAY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readSavedVolume(): number {
  try {
    if (typeof window === "undefined") return DEFAULT_PLAYER_VOLUME;
    const stored = window.localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY);
    if (stored === null) return DEFAULT_PLAYER_VOLUME;

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) return DEFAULT_PLAYER_VOLUME;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return DEFAULT_PLAYER_VOLUME;
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const owner = user?.pubkey ?? "anonymous";
  return <PlayerSession key={owner} owner={owner}>{children}</PlayerSession>;
}

function PlayerSession({ children, owner }: { children: React.ReactNode; owner: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, []);

  const [initialPlayerState] = useState(() => readSavedPlayerState(owner));
  const restoredStateRef = useRef(Boolean(initialPlayerState && initialPlayerState.index >= 0 && initialPlayerState.queue[initialPlayerState.index]));
  const pendingSeekRef = useRef(initialPlayerState?.progress ?? 0);
  const lastSavedStateRef = useRef<LastSavedPlayerState | null>(null);
  const pendingAutoplayRef = useRef(initialPlayerState?.isPlaying ?? false);
  const [historyState, setHistoryState] = useState(() => ({ owner, tracks: readSavedHistory(owner) }));
  const history = useMemo(
    () => historyState.owner === owner ? historyState.tracks : readSavedHistory(owner),
    [historyState, owner],
  );
  const setHistory = useCallback((update: (tracks: Track[]) => Track[]) => {
    setHistoryState(previous => {
      const currentHistory = previous.owner === owner ? previous.tracks : readSavedHistory(owner);
      return { owner, tracks: update(currentHistory) };
    });
  }, [owner]);
  const [queue, setQueue] = useState<Track[]>(() => initialPlayerState?.queue ?? []);
  const [index, setIndex] = useState(() => initialPlayerState?.index ?? -1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(() => initialPlayerState?.progress ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(readSavedVolume);
  const [muted, setMuted] = useState(() => initialPlayerState?.muted ?? false);
  const [shuffle, setShuffle] = useState(() => initialPlayerState?.shuffle ?? false);
  const [repeat, setRepeat] = useState<RepeatMode>(() => initialPlayerState?.repeat ?? "off");
  const [autoplay, setAutoplayState] = useState(readSavedAutoplay);
  const playerPreferencesRef = useRef({ muted, shuffle, repeat });
  playerPreferencesRef.current = { muted, shuffle, repeat };
  const autoplayRef = useRef(autoplay);
  const setAutoplay = useCallback((enabled: boolean) => {
    autoplayRef.current = enabled;
    if (enabled) setShuffle(false);
    setAutoplayState(enabled);
    try {
      window.localStorage.setItem(PLAYER_AUTOPLAY_STORAGE_KEY, String(enabled));
    } catch {
      // The preference remains active for this session if browser storage is unavailable.
    }
  }, []);
  const autoplayBusyRef = useRef(false);
  const autoplayQueueKeyRef = useRef("");
  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  const current = index >= 0 ? queue[index] : undefined;
  queueRef.current = queue;
  indexRef.current = index;
  autoplayRef.current = autoplay;
  const nostrTracks = useTracks({ limit: 150, enabled: false });
  const wavlake = useWavlakeCatalog(undefined, false);
  const recordPlayedTrack = useCallback((track: Track | undefined) => {
    if (!track) return;
    setHistory(items => items[0]?.id === track.id ? items : [track, ...items].slice(0, PLAYER_HISTORY_LIMIT));
  }, [setHistory]);

  // Load the current audio track whenever it changes. Video streams are handled
  // by their inline video player rather than the audio queue.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      setProgress(0);
      setDuration(0);
      return;
    }
    if (audio.src !== current.url) {
      audio.src = current.url;
      audio.load();
    }
    if (restoredStateRef.current) {
      const restorePosition = () => {
        const position = pendingSeekRef.current;
        if (position > 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.min(position, Math.max(0, audio.duration - 0.25));
        }
        pendingSeekRef.current = 0;
        restoredStateRef.current = false;
        const shouldResume = pendingAutoplayRef.current;
        pendingAutoplayRef.current = false;
        const preferences = playerPreferencesRef.current;
        lastSavedStateRef.current = {
          queue,
          index,
          progressBucket: Math.floor(position),
          isPlaying: shouldResume,
          ...preferences,
        };
        writeSavedPlayerState(owner, {
          queue,
          index,
          progress: position,
          isPlaying: shouldResume,
          ...preferences,
        });
        setProgress(audio.currentTime || position);
        setIsPlaying(shouldResume);
        if (shouldResume) audio.play().catch(() => setIsPlaying(false));
      };
      if (audio.readyState >= 1) restorePosition();
      else audio.addEventListener("loadedmetadata", restorePosition, { once: true });
      return () => audio.removeEventListener("loadedmetadata", restorePosition);
    }
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, owner]);

  // Keep listening history and playback state private to the active account.
  useEffect(() => {
    writeSavedHistory(owner, history);
  }, [owner, history]);

  // Capture the latest position and play intent before a browser refresh closes the page.
  useEffect(() => {
    const saveBeforePageHide = () => {
      if (!current || index < 0 || queue.length === 0) return;
      writeSavedPlayerState(owner, {
        queue,
        index,
        progress: audioRef.current?.currentTime ?? progress,
        isPlaying,
        muted,
        shuffle,
        repeat,
      });
    };
    window.addEventListener("pagehide", saveBeforePageHide);
    return () => window.removeEventListener("pagehide", saveBeforePageHide);
  }, [queue, index, current, progress, owner, isPlaying, muted, shuffle, repeat]);

  // Keep player-bar state in sync with browser storage for refresh recovery.
  useEffect(() => {
    if (restoredStateRef.current) return;
    const progressBucket = Math.floor(progress);
    const previous = lastSavedStateRef.current;
    if (!current || index < 0 || queue.length === 0) {
      if (
        previous?.queue.length === 0 && previous.index === -1 && previous.progressBucket === 0 &&
        !previous.isPlaying && previous.muted === muted && previous.shuffle === shuffle && previous.repeat === repeat
      ) return;
      lastSavedStateRef.current = { queue: [], index: -1, progressBucket: 0, isPlaying: false, muted, shuffle, repeat };
      writeSavedPlayerState(owner, { queue: [], index: -1, progress: 0, isPlaying: false, muted, shuffle, repeat });
      return;
    }
    const sameQueue = previous !== null && previous.queue.length === queue.length && previous.queue.every((track, trackIndex) => track.id === queue[trackIndex]?.id);
    if (
      previous && sameQueue && previous.index === index && previous.progressBucket === progressBucket &&
      previous.isPlaying === isPlaying && previous.muted === muted && previous.shuffle === shuffle && previous.repeat === repeat
    ) return;
    lastSavedStateRef.current = { queue, index, progressBucket, isPlaying, muted, shuffle, repeat };
    writeSavedPlayerState(owner, { queue, index, progress, isPlaying, muted, shuffle, repeat });
  }, [queue, index, current, progress, owner, isPlaying, muted, shuffle, repeat]);

  // Sync volume / mute.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  const pickNextIndex = useCallback(
    (fromIndex: number): number => {
      if (queue.length === 0) return -1;
      if (shuffle) {
        if (queue.length === 1) return fromIndex;
        let r = fromIndex;
        while (r === fromIndex) r = Math.floor(Math.random() * queue.length);
        return r;
      }
      const nextI = fromIndex + 1;
      if (nextI >= queue.length) {
        return repeat === "all" ? 0 : -1;
      }
      return nextI;
    },
    [queue.length, shuffle, repeat],
  );

  const previous = useCallback(() => {
    restoredStateRef.current = false;
    pendingSeekRef.current = 0;
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    setIndex((cur) => (cur > 0 ? cur - 1 : cur));
  }, []);

  const continueWithAutoplay = useCallback(async () => {
    const seed = current;
    const startingQueue = queueRef.current;
    const startingIndex = indexRef.current;
    if (!autoplayRef.current || !seed || seed.kind !== "music" || autoplayBusyRef.current) return;
    if (startingIndex !== startingQueue.length - 1 || autoplayQueueKeyRef.current === startingQueue.map(track => track.id).join("|")) return;

    const queueKey = startingQueue.map(track => track.id).join("|");
    autoplayQueueKeyRef.current = queueKey;
    autoplayBusyRef.current = true;
    try {
      const [nostrResult, wavlakeResult] = await Promise.allSettled([
        nostrTracks.refetch({ throwOnError: true }),
        wavlake.refetch({ throwOnError: true }),
      ]);
      if (!autoplayRef.current || queueRef.current.map(track => track.id).join("|") !== queueKey || indexRef.current !== startingIndex) return;
      const candidates = [
        ...(nostrResult.status === "fulfilled" ? nostrResult.value.data ?? [] : []),
        ...(wavlakeResult.status === "fulfilled" ? wavlakeResult.value.data?.pages.flatMap(page => page.tracks) ?? [] : []),
        ...history.filter(track => track.kind === "music"),
      ].filter(track => track.title.trim().toLocaleLowerCase() !== "original sound");
      const excluded = new Set([...startingQueue, ...history].map(track => track.id));
      const excludedUrls = new Set([...startingQueue, ...history].map(track => track.url));
      const station = buildRadioStation({ seed, candidates, limit: 16 }).filter(track =>
        track.id !== seed.id && !excluded.has(track.id) && !excludedUrls.has(track.url),
      );
      if (!station.length) return;
      const nextQueue = [...startingQueue, ...station];
      pendingSeekRef.current = 0;
      setQueue(nextQueue);
      setIndex(startingIndex + 1);
      setProgress(0);
    } finally {
      autoplayBusyRef.current = false;
    }
  }, [current, history, nostrTracks.refetch, wavlake.refetch]);

  const next = useCallback(() => {
    restoredStateRef.current = false;
    pendingSeekRef.current = 0;
    const nextIndex = pickNextIndex(index);
    if (nextIndex === -1) {
      setIsPlaying(false);
      return;
    }
    setIndex(nextIndex);
  }, [pickNextIndex, index]);

  // Wire up audio element events.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let lastAnalyticsTime = audio.currentTime;
    let pendingAnalyticsSeconds = 0;
    const flushAnalytics = () => {
      if (current && pendingAnalyticsSeconds > 0) recordListeningSeconds(current, pendingAnalyticsSeconds);
      pendingAnalyticsSeconds = 0;
    };
    const onTime = () => {
      const position = audio.currentTime;
      const elapsed = position - lastAnalyticsTime;
      if (!audio.paused && elapsed > 0 && elapsed <= 15) pendingAnalyticsSeconds += elapsed;
      else if (elapsed < 0 || elapsed > 15) pendingAnalyticsSeconds = 0;
      if (pendingAnalyticsSeconds >= 10) flushAnalytics();
      lastAnalyticsTime = position;
      setProgress(position);
    };
    const onDuration = () => setDuration(audio.duration || 0);
    const onPlay = () => {
      setIsPlaying(true);
      lastAnalyticsTime = audio.currentTime;
      if (current) recordListeningStart(current);
      recordPlayedTrack(current);
    };
    const onPause = () => {
      const elapsed = audio.currentTime - lastAnalyticsTime;
      if (elapsed > 0 && elapsed <= 15) pendingAnalyticsSeconds += elapsed;
      flushAnalytics();
      lastAnalyticsTime = audio.currentTime;
      setIsPlaying(false);
    };
    const onEnded = () => {
      if (repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      recordPlayedTrack(current);
      const n = pickNextIndex(index);
      if (n === -1) {
        setIsPlaying(false);
        void continueWithAutoplay();
      } else {
        setIndex(n);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      flushAnalytics();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [index, repeat, pickNextIndex, current, recordPlayedTrack, continueWithAutoplay]);

  const playQueue = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return;
    autoplayQueueKeyRef.current = "";
    const target = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const sameTrack = current?.id === tracks[target].id;
    restoredStateRef.current = false;
    if (sameTrack && audioRef.current?.paused) {
      void audioRef.current.play().catch(() => {});
    } else if (!sameTrack) {
      pendingSeekRef.current = 0;
      setProgress(0);
    }
    setQueue(tracks);
    setIndex(target);
  }, [current?.id]);

  const playTrack = useCallback((track: Track) => {
    autoplayQueueKeyRef.current = "";
    restoredStateRef.current = false;
    pendingSeekRef.current = 0;
    setProgress(0);

    const hasCurrentTrack = index >= 0 && index < queue.length;
    const existingIndex = queue.findIndex((queuedTrack, queuedIndex) =>
      queuedIndex > (hasCurrentTrack ? index : -1) && queuedTrack.id === track.id,
    );
    if (existingIndex >= 0) {
      setIndex(existingIndex);
      return;
    }

    if (hasCurrentTrack) {
      const nextIndex = index + 1;
      setQueue([...queue.slice(0, nextIndex), track, ...queue.slice(nextIndex)]);
      setIndex(nextIndex);
      return;
    }

    setQueue(queue.length > 0 ? [track, ...queue] : [track]);
    setIndex(0);
  }, [index, queue]);

  const addToQueue = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    autoplayQueueKeyRef.current = "";
    restoredStateRef.current = false;
    const hasCurrentTrack = index >= 0 && index < queue.length;
    setQueue((currentQueue) => hasCurrentTrack ? [...currentQueue, ...tracks] : tracks);
    if (!hasCurrentTrack) {
      pendingSeekRef.current = 0;
      setProgress(0);
      setIndex(0);
    }
  }, [index, queue.length]);

  const playNext = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    autoplayQueueKeyRef.current = "";
    restoredStateRef.current = false;
    const hasCurrentTrack = index >= 0 && index < queue.length;
    setQueue((currentQueue) => {
      const insertionIndex = hasCurrentTrack ? index + 1 : 0;
      return [...currentQueue.slice(0, insertionIndex), ...tracks, ...currentQueue.slice(insertionIndex)];
    });
    if (!hasCurrentTrack) {
      pendingSeekRef.current = 0;
      setProgress(0);
      setIndex(0);
    }
  }, [index, queue.length]);

  const removeQueueItem = useCallback((queueIndex: number) => {
    if (queueIndex < 0 || queueIndex >= queue.length) return;
    autoplayQueueKeyRef.current = "";
    restoredStateRef.current = false;
    if (queueIndex === index) {
      // Items before the current index are already-played queue history, not
      // upcoming tracks. Do not select one of them when removing the current item.
      const upcoming = queue.slice(queueIndex + 1);
      setQueue(upcoming);
      pendingSeekRef.current = 0;
      setProgress(0);
      if (upcoming.length === 0) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setIndex(-1);
      } else {
        setIndex(0);
      }
      return;
    }

    const remaining = queue.filter((_, itemIndex) => itemIndex !== queueIndex);
    setQueue(remaining);
    if (remaining.length === 0) {
      audioRef.current?.pause();
      setIsPlaying(false);
      setIndex(-1);
      setProgress(0);
      return;
    }
    if (queueIndex < index) setIndex(index - 1);
  }, [queue, index]);

  const clearUpcomingQueue = useCallback(() => {
    restoredStateRef.current = false;
    if (index < 0 || index >= queue.length) {
      setQueue([]);
      setIndex(-1);
      setProgress(0);
      setDuration(0);
      setIsPlaying(false);
      return;
    }
    setQueue(queue.slice(0, index + 1));
  }, [queue, index]);

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex <= index || toIndex <= index || fromIndex >= queue.length || toIndex >= queue.length || fromIndex === toIndex) return;
    restoredStateRef.current = false;
    const reordered = [...queue];
    const [movedTrack] = reordered.splice(fromIndex, 1);
    if (!movedTrack) return;
    reordered.splice(toIndex, 0, movedTrack);
    setQueue(reordered);
  }, [queue, index]);

  const togglePlay = useCallback(() => {
    restoredStateRef.current = false;
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [current]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setProgress(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    const nextVolume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : DEFAULT_PLAYER_VOLUME));
    setVolumeState(nextVolume);
    try {
      window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, JSON.stringify(nextVolume));
    } catch {
      // Volume remains functional for this session if browser storage is unavailable.
    }
    if (nextVolume > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleShuffle = useCallback(() => {
    if (!shuffle) setAutoplay(false);
    setShuffle(!shuffle);
  }, [shuffle, setAutoplay]);
  const cycleShuffleAutoplay = useCallback(() => {
    if (shuffle) {
      setShuffle(false);
      setAutoplay(true);
    } else if (autoplay) {
      setAutoplay(false);
    } else {
      setShuffle(true);
    }
  }, [shuffle, autoplay, setAutoplay]);
  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const value = useMemo(
    () => ({
      queue,
      history,
      index,
      current,
      isPlaying,
      progress,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      autoplay,
      setAutoplay,
      playQueue,
      playTrack,
      addToQueue,
      playNext,
      removeQueueItem,
      clearUpcomingQueue,
      moveQueueItem,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleShuffleAutoplay,
      cycleRepeat,
    }),
    [
      queue,
      history,
      index,
      current,
      isPlaying,
      progress,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      autoplay,
      setAutoplay,
      playQueue,
      playTrack,
      addToQueue,
      playNext,
      removeQueueItem,
      clearUpcomingQueue,
      moveQueueItem,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleShuffleAutoplay,
      cycleRepeat,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
