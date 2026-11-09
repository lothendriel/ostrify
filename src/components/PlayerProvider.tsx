import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/music";
import { PlayerContext, type RepeatMode } from "@/contexts/PlayerContext";
import { sanitizeUrl } from "@/lib/sanitize";

const PLAYER_VOLUME_STORAGE_KEY = "ostrify-player-volume";
const PLAYER_STATE_STORAGE_KEY = "ostrify-player-state";
const DEFAULT_PLAYER_VOLUME = 0.8;
const PLAYER_HISTORY_LIMIT = 50;

interface SavedPlayerState {
  queue: Track[];
  index: number;
  progress: number;
  history?: Track[];
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

function readSavedPlayerState(): SavedPlayerState | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const stored = window.localStorage.getItem(PLAYER_STATE_STORAGE_KEY);
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
    const savedHistory = Array.isArray(parsed.history)
      ? parsed.history.map(restoreTrack).filter((track): track is Track => track !== undefined).slice(0, PLAYER_HISTORY_LIMIT)
      : [];
    return { queue: tracks, index: index as number, progress, history: savedHistory };
  } catch {
    return undefined;
  }
}

function writeSavedPlayerState(state: SavedPlayerState | undefined): void {
  try {
    if (typeof window === "undefined") return;
    if (!state) {
      window.localStorage.removeItem(PLAYER_STATE_STORAGE_KEY);
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
      history: state.history?.map(serializeTrack).slice(0, PLAYER_HISTORY_LIMIT) ?? [],
    };
    window.localStorage.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(persistedState));
  } catch {
    // Playback remains available for this session if browser storage is unavailable.
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  const [initialPlayerState] = useState(readSavedPlayerState);
  const restoredStateRef = useRef(initialPlayerState !== undefined);
  const pendingSeekRef = useRef(initialPlayerState?.progress ?? 0);
  const lastSavedStateRef = useRef<{ queue: Track[]; index: number; progressBucket: number; historyKey: string } | null>(null);
  const [queue, setQueue] = useState<Track[]>(() => initialPlayerState?.queue ?? []);
  const [history, setHistory] = useState<Track[]>(() => initialPlayerState?.history ?? []);
  const [index, setIndex] = useState(() => initialPlayerState?.index ?? -1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(() => initialPlayerState?.progress ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(readSavedVolume);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const current = index >= 0 ? queue[index] : undefined;
  const recordPlayedTrack = useCallback((track: Track | undefined) => {
    if (!track) return;
    setHistory((items) => items[0]?.id === track.id ? items : [track, ...items].slice(0, PLAYER_HISTORY_LIMIT));
  }, []);

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
        lastSavedStateRef.current = { queue, index, progressBucket: Math.floor(position), historyKey: history.map(track => track.id).join('|') };
        writeSavedPlayerState({ queue, index, progress: position, history });
        setProgress(audio.currentTime || position);
      };
      if (audio.readyState >= 1) restorePosition();
      else audio.addEventListener("loadedmetadata", restorePosition, { once: true });
      return () => audio.removeEventListener("loadedmetadata", restorePosition);
    }
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Preserve the queue, current position, and play history between page loads.
  // A restored session remains paused until the user explicitly presses Play.
  useEffect(() => {
    if (restoredStateRef.current) return;
    if (!current || index < 0 || queue.length === 0) {
      lastSavedStateRef.current = null;
      if (history.length > 0) writeSavedPlayerState({ queue: [], index: -1, progress: 0, history });
      else writeSavedPlayerState(undefined);
      return;
    }
    const progressBucket = Math.floor(progress);
    const historyKey = history.map(track => track.id).join('|');
    const previous = lastSavedStateRef.current;
    const sameQueue = previous?.queue.length === queue.length && previous.queue.every((track, trackIndex) => track.id === queue[trackIndex]?.id);
    if (sameQueue && previous?.index === index && previous.progressBucket === progressBucket && previous.historyKey === historyKey) return;
    lastSavedStateRef.current = { queue, index, progressBucket, historyKey };
    writeSavedPlayerState({ queue, index, progress, history });
  }, [queue, index, current, progress, history]);

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

  // Wire up audio element events.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setProgress(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || 0);
    const onPlay = () => {
      setIsPlaying(true);
      recordPlayedTrack(current);
    };
    const onPause = () => setIsPlaying(false);
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
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [index, repeat, pickNextIndex, current, recordPlayedTrack]);

  const playQueue = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return;
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
    restoredStateRef.current = false;
    pendingSeekRef.current = 0;
    setProgress(0);
    setQueue([track]);
    setIndex(0);
  }, []);

  const addToQueue = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
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
    restoredStateRef.current = false;
    const remaining = queue.filter((_, itemIndex) => itemIndex !== queueIndex);
    setQueue(remaining);
    if (remaining.length === 0) {
      setIsPlaying(false);
      setIndex(-1);
      setProgress(0);
      return;
    }
    if (queueIndex < index) setIndex(index - 1);
    else if (queueIndex === index) {
      setIndex(Math.min(index, remaining.length - 1));
      pendingSeekRef.current = 0;
      setProgress(0);
    }
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
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
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
      playQueue,
      playTrack,
      addToQueue,
      playNext,
      removeQueueItem,
      moveQueueItem,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
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
      playQueue,
      playTrack,
      addToQueue,
      playNext,
      removeQueueItem,
      moveQueueItem,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
