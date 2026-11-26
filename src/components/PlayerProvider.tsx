import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sanitizeAudioFallbacks, type Track } from "@/lib/music";
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

  const source = ["wavlake", "librivox", "gutenberg", "tunestr", "fountain", "podcast-index", "radio-browser"].includes(String(value.source))
    ? value.source as Track["source"]
    : undefined;
  const duration = typeof value.duration === "number" && Number.isFinite(value.duration) && value.duration > 0
    ? value.duration
    : undefined;
  const image = typeof value.image === "string" ? sanitizeUrl(value.image) : undefined;

  return {
    id,
    source,
    eventKind: typeof value.eventKind === "number" && Number.isInteger(value.eventKind) && value.eventKind >= 0 && value.eventKind <= 65535 ? value.eventKind : undefined,
    addressableId: optionalString(value.addressableId),
    trackNumber: typeof value.trackNumber === "number" && Number.isFinite(value.trackNumber) && value.trackNumber > 0 ? value.trackNumber : undefined,
    artistImage: typeof value.artistImage === "string" ? sanitizeUrl(value.artistImage) : undefined,
    visibility: value.visibility === "hidden" ? "hidden" : value.visibility === "public" ? "public" : undefined,
    artistId: optionalString(value.artistId),
    artistPubkey: optionalString(value.artistPubkey),
    albumId: optionalString(value.albumId),
    showId: optionalString(value.showId),
    podcastIndexEpisodeId: typeof value.podcastIndexEpisodeId === "number" && Number.isFinite(value.podcastIndexEpisodeId)
      ? value.podcastIndexEpisodeId
      : undefined,
    url: safeUrl,
    fallbackUrls: sanitizeAudioFallbacks(value.fallbackUrls, safeUrl),
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
      eventKind: track.eventKind ?? track.event?.kind,
      addressableId: track.addressableId,
      trackNumber: track.trackNumber,
      artistImage: track.artistImage,
      visibility: track.visibility,
      artistId: track.artistId,
      artistPubkey: track.artistPubkey,
      albumId: track.albumId,
      showId: track.showId,
      podcastIndexEpisodeId: track.podcastIndexEpisodeId,
      url: track.url,
      fallbackUrls: sanitizeAudioFallbacks(track.fallbackUrls, track.url),
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

    const index = parsed.index;
    const progress = parsed.progress;
    if (
      (parsed.queue.length === 0 && index !== -1) ||
      (parsed.queue.length > 0 && (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= parsed.queue.length)) ||
      typeof progress !== "number" || !Number.isFinite(progress) || progress < 0
    ) return undefined;
    const restored = parsed.queue.map(restoreTrack);
    const selectedIndex = index as number;
    const activeSurvived = selectedIndex >= 0 && !!restored[selectedIndex];
    // If the active item is invalid, resume at the next valid item, but paused.
    // Never move backwards into already played queue history.
    const fallbackIndex = activeSurvived ? selectedIndex : restored.findIndex((track, i) => i > selectedIndex && !!track);
    const tracks = fallbackIndex < 0 ? [] : restored.filter((track): track is Track => track !== undefined);
    const nextIndex = fallbackIndex < 0 ? -1 : restored.slice(0, fallbackIndex).filter(Boolean).length;
    const repeat: RepeatMode = parsed.repeat === "all" || parsed.repeat === "one" ? parsed.repeat : "off";
    return {
      queue: tracks,
      index: nextIndex,
      progress: activeSurvived ? progress : 0,
      isPlaying: activeSurvived && parsed.isPlaying === true,
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
        eventKind: track.eventKind ?? track.event?.kind,
        addressableId: track.addressableId,
        trackNumber: track.trackNumber,
        artistImage: track.artistImage,
        visibility: track.visibility,
        artistId: track.artistId,
        artistPubkey: track.artistPubkey,
        albumId: track.albumId,
        showId: track.showId,
        podcastIndexEpisodeId: track.podcastIndexEpisodeId,
        url: track.url,
        fallbackUrls: sanitizeAudioFallbacks(track.fallbackUrls, track.url),
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
  const playAttemptRef = useRef(0);
  const autoplayEpochRef = useRef(0);
  const wantsPlaybackRef = useRef(false);
  const sourceRef = useRef<{ urls: string[]; index: number }>({ urls: [], index: 0 });
  const fallbackSeekRef = useRef(0);
  const playAudioRef = useRef<(audio: HTMLAudioElement) => void>(() => {});
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      playAttemptRef.current++;
      autoplayEpochRef.current++;
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
  const [playbackError, setPlaybackError] = useState<string>();
  const [progress, setProgress] = useState(() => initialPlayerState?.progress ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(readSavedVolume);
  const [muted, setMuted] = useState(() => initialPlayerState?.muted ?? false);
  const [shuffle, setShuffle] = useState(() => readSavedAutoplay() ? false : initialPlayerState?.shuffle ?? false);
  const [repeat, setRepeat] = useState<RepeatMode>(() => initialPlayerState?.repeat ?? "off");
  const [autoplay, setAutoplayState] = useState(readSavedAutoplay);
  const playerPreferencesRef = useRef({ muted, shuffle, repeat });
  playerPreferencesRef.current = { muted, shuffle, repeat };
  const autoplayRef = useRef(autoplay);
  const setAutoplay = useCallback((enabled: boolean) => {
    autoplayEpochRef.current++;
    autoplayQueueKeyRef.current = "";
    autoplayRef.current = enabled;
    if (enabled) {
      playerPreferencesRef.current = { ...playerPreferencesRef.current, shuffle: false };
      setShuffle(false);
    }
    setAutoplayState(enabled);
    try {
      window.localStorage.setItem(PLAYER_AUTOPLAY_STORAGE_KEY, String(enabled));
    } catch {
      // The preference remains active for this session if browser storage is unavailable.
    }
  }, []);
  const autoplayBusyRef = useRef<number | null>(null);
  const autoplayQueueKeyRef = useRef("");
  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  const current = index >= 0 ? queue[index] : undefined;
  queueRef.current = queue;
  indexRef.current = index;
  autoplayRef.current = autoplay;
  const handlePlaybackFailure = useCallback((audio: HTMLAudioElement, blocked = false) => {
    const sources = sourceRef.current;
    const activeSource = sources.urls[sources.index];
    const track = queueRef.current[indexRef.current];
    if (audioRef.current !== audio || !track || sanitizeUrl(track.url) !== sources.urls[0] || !activeSource || sanitizeUrl(audio.src) !== activeSource) return;
    playAttemptRef.current++;
    if (!blocked && sources.index + 1 < sources.urls.length) {
      const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const shouldPlay = wantsPlaybackRef.current;
      sources.index++;
      if (position > 0) fallbackSeekRef.current = position;
      audio.src = sources.urls[sources.index];
      audio.load();
      if (shouldPlay) playAudioRef.current(audio);
      return;
    }
    wantsPlaybackRef.current = false;
    pendingAutoplayRef.current = false;
    setIsPlaying(false);
    setPlaybackError(blocked ? "Playback was blocked. Press Play to try again." : track.source === "radio-browser" ? "Station unavailable or unsupported. Press Play to retry." : sources.urls.length > 1 ? "Audio unavailable from its source and backups." : "Audio source unavailable. Press Play to retry.");
    const currentQueue = queueRef.current;
    const currentIndex = indexRef.current;
    if (currentQueue[currentIndex]) {
      const position = restoredStateRef.current ? pendingSeekRef.current : (Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
      const preferences = playerPreferencesRef.current;
      lastSavedStateRef.current = { queue: currentQueue, index: currentIndex, progressBucket: Math.floor(position), isPlaying: false, ...preferences };
      writeSavedPlayerState(owner, { queue: currentQueue, index: currentIndex, progress: position, isPlaying: false, ...preferences });
    }
  }, [owner]);
  const playAudio = useCallback((audio: HTMLAudioElement) => {
    const attempt = ++playAttemptRef.current;
    const intendedUrl = sourceRef.current.urls[sourceRef.current.index];
    if (!intendedUrl || sanitizeUrl(audio.src) !== intendedUrl) {
      wantsPlaybackRef.current = false;
      setIsPlaying(false);
      setPlaybackError("This audio source is not a safe HTTPS URL.");
      return;
    }
    wantsPlaybackRef.current = true;
    setPlaybackError(undefined);
    const fail = (error: unknown) => {
      if (playAttemptRef.current !== attempt || audioRef.current !== audio) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      const blocked = error instanceof DOMException && error.name === "NotAllowedError";
      handlePlaybackFailure(audio, blocked);
    };
    try {
      void audio.play().then(() => {
        if (playAttemptRef.current === attempt && audioRef.current === audio && !audio.paused) setIsPlaying(true);
      }).catch(fail);
    } catch (error) {
      fail(error);
    }
  }, [handlePlaybackFailure]);
  playAudioRef.current = playAudio;
  const commitQueue = useCallback((nextQueue: Track[], nextIndex: number) => {
    queueRef.current = nextQueue;
    indexRef.current = nextIndex;
    setQueue(nextQueue);
    setIndex(nextIndex);
  }, []);
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
      playAttemptRef.current++;
      wantsPlaybackRef.current = false;
      sourceRef.current = { urls: [], index: 0 };
      fallbackSeekRef.current = 0;
      audio.pause();
      audio.removeAttribute("src");
      pendingAutoplayRef.current = false;
      setIsPlaying(false);
      setPlaybackError(undefined);
      setProgress(0);
      setDuration(0);
      return;
    }
    playAttemptRef.current++;
    setIsPlaying(false);
    setPlaybackError(undefined);
    setDuration(0);
    const safeUrl = sanitizeUrl(current.url);
    fallbackSeekRef.current = 0;
    sourceRef.current = { urls: safeUrl ? [safeUrl, ...sanitizeAudioFallbacks(current.fallbackUrls, safeUrl)] : [], index: 0 };
    wantsPlaybackRef.current = restoredStateRef.current ? pendingAutoplayRef.current : true;
    if (!safeUrl) {
      audio.pause();
      audio.removeAttribute("src");
      restoredStateRef.current = false;
      pendingAutoplayRef.current = false;
      pendingSeekRef.current = 0;
      setProgress(0);
      setPlaybackError("This audio source is not a safe HTTPS URL.");
      return;
    }
    if (audio.src !== safeUrl) {
      audio.src = safeUrl;
      audio.load();
    } else if (!restoredStateRef.current) {
      if (current.source !== "radio-browser") {
        try { audio.currentTime = 0; } catch { /* The source may not be seekable. */ }
      }
    }
    if (restoredStateRef.current) {
      const restorePosition = () => {
        if (!restoredStateRef.current) return;
        const requestedPosition = pendingSeekRef.current;
        if (current.source !== "radio-browser" && requestedPosition > 0 && Number.isFinite(audio.duration)) {
          try { audio.currentTime = Math.min(requestedPosition, Math.max(0, audio.duration - 0.25)); } catch { /* Not seekable yet. */ }
        }
        const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
        pendingSeekRef.current = 0;
        restoredStateRef.current = false;
        const shouldResume = pendingAutoplayRef.current;
        pendingAutoplayRef.current = false;
        const preferences = playerPreferencesRef.current;
        const savedQueue = queueRef.current;
        const savedIndex = indexRef.current;
        lastSavedStateRef.current = { queue: savedQueue, index: savedIndex, progressBucket: Math.floor(position), isPlaying: shouldResume, ...preferences };
        writeSavedPlayerState(owner, { queue: savedQueue, index: savedIndex, progress: position, isPlaying: shouldResume, ...preferences });
        setProgress(position);
        if (shouldResume && audio.paused) playAudio(audio);
      };
      if (audio.readyState >= 1) restorePosition();
      else audio.addEventListener("loadedmetadata", restorePosition, { once: true });
      return () => {
        playAttemptRef.current++;
        audio.removeEventListener("loadedmetadata", restorePosition);
      };
    }
    setProgress(0);
    if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    playAudio(audio);
    return () => { playAttemptRef.current++; };
    // Track identity and URL determine when the audio source changes; queue edits alone must not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.url, owner, playAudio]);

  // Keep listening history and playback state private to the active account.
  useEffect(() => {
    writeSavedHistory(owner, history);
  }, [owner, history]);

  // Capture the latest position and play intent before a browser refresh closes the page.
  useEffect(() => {
    const saveBeforePageHide = () => {
      const latestQueue = queueRef.current;
      const latestIndex = indexRef.current;
      if (!latestQueue[latestIndex]) return;
      const restoring = restoredStateRef.current;
      writeSavedPlayerState(owner, {
        queue: latestQueue,
        index: latestIndex,
        progress: restoring ? pendingSeekRef.current : audioRef.current?.currentTime ?? progress,
        isPlaying: restoring ? pendingAutoplayRef.current : isPlaying,
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
    const sameQueue = previous !== null && previous.queue === queue;
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

  const pickNextIndex = useCallback((fromIndex: number): number => {
    const length = queueRef.current.length;
    const { shuffle: shuffled, repeat: mode } = playerPreferencesRef.current;
    if (fromIndex < 0 || fromIndex >= length) return -1;
    if (shuffled && length > 1) return (fromIndex + 1 + Math.floor(Math.random() * (length - 1))) % length;
    if (fromIndex + 1 < length) return fromIndex + 1;
    return mode === "all" ? 0 : -1;
  }, []);

  const selectQueueIndex = useCallback((nextQueue: Track[], nextIndex: number) => {
    const previousTrack = queueRef.current[indexRef.current];
    const target = nextQueue[nextIndex];
    if (!target) return;
    const sameSource = previousTrack?.id === target.id && previousTrack.url === target.url;
    autoplayEpochRef.current++;
    playAttemptRef.current++;
    restoredStateRef.current = false;
    pendingSeekRef.current = 0;
    pendingAutoplayRef.current = false;
    wantsPlaybackRef.current = false;
    fallbackSeekRef.current = 0;
    setProgress(0);
    setPlaybackError(undefined);
    commitQueue(nextQueue, nextIndex);
    // Adjacent queue entries can refer to the same track, so a change of index
    // alone may not trigger the source effect.
    if (sameSource && audioRef.current) {
      try { audioRef.current.currentTime = 0; } catch { /* The media is not seekable yet. */ }
      playAudio(audioRef.current);
    }
  }, [commitQueue, playAudio]);

  const previous = useCallback(() => {
    autoplayEpochRef.current++;
    autoplayQueueKeyRef.current = "";
    const audio = audioRef.current;
    if (restoredStateRef.current && pendingSeekRef.current > 3) {
      pendingSeekRef.current = 0;
      setProgress(0);
      return;
    }
    if (audio && audio.currentTime > 3) {
      try { audio.currentTime = 0; setProgress(0); } catch { /* This source is not seekable. */ }
      return;
    }
    const position = indexRef.current;
    if (position > 0) selectQueueIndex(queueRef.current, position - 1);
  }, [selectQueueIndex]);

  const continueWithAutoplay = useCallback(async () => {
    const startingQueue = queueRef.current;
    const startingIndex = indexRef.current;
    const seed = startingQueue[startingIndex];
    const startingEpoch = autoplayEpochRef.current;
    if (!autoplayRef.current || !seed || seed.kind !== "music" || seed.source === "radio-browser" || autoplayBusyRef.current === startingEpoch) return;
    if (startingIndex !== startingQueue.length - 1 || autoplayQueueKeyRef.current === startingQueue.map(track => track.id).join("|")) return;

    const queueKey = startingQueue.map(track => track.id).join("|");
    autoplayQueueKeyRef.current = queueKey;
    autoplayBusyRef.current = startingEpoch;
    try {
      const [nostrResult, wavlakeResult] = await Promise.allSettled([
        nostrTracks.refetch({ throwOnError: true }),
        wavlake.refetch({ throwOnError: true }),
      ]);
      if (!autoplayRef.current || autoplayEpochRef.current !== startingEpoch || queueRef.current.map(track => track.id).join("|") !== queueKey || indexRef.current !== startingIndex) return;
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
      selectQueueIndex(nextQueue, startingIndex + 1);
    } catch {
      // A failed recommendation lookup must leave the finished queue untouched.
    } finally {
      if (autoplayBusyRef.current === startingEpoch) autoplayBusyRef.current = null;
    }
  }, [history, nostrTracks.refetch, wavlake.refetch, selectQueueIndex]);

  const next = useCallback(() => {
    const nextIndex = pickNextIndex(indexRef.current);
    // End of queue is a no-op; do not falsely mark still-playing audio as paused.
    if (nextIndex >= 0) selectQueueIndex(queueRef.current, nextIndex);
  }, [pickNextIndex, selectQueueIndex]);

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
    const onDuration = () => {
      if (fallbackSeekRef.current > 0 && Number.isFinite(audio.duration) && audio.duration > 0) {
        try { audio.currentTime = Math.min(fallbackSeekRef.current, Math.max(0, audio.duration - 0.25)); } catch { /* The source may not be seekable. */ }
        fallbackSeekRef.current = 0;
      }
      setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    };
    const onError = () => {
      if (wantsPlaybackRef.current && audio.error && audio.error.code !== MediaError.MEDIA_ERR_ABORTED) handlePlaybackFailure(audio);
    };
    const onPlay = () => {
      if (audio.paused) return;
      setPlaybackError(undefined);
      setIsPlaying(true);
      lastAnalyticsTime = audio.currentTime;
      if (current) recordListeningStart(current);
      recordPlayedTrack(current);
    };
    const onPause = () => {
      if (!audio.paused) return;
      const elapsed = audio.currentTime - lastAnalyticsTime;
      if (elapsed > 0 && elapsed <= 15) pendingAnalyticsSeconds += elapsed;
      flushAnalytics();
      lastAnalyticsTime = audio.currentTime;
      setIsPlaying(false);
    };
    const onEnded = () => {
      const active = queueRef.current[indexRef.current];
      if (!current || active?.id !== current.id || active.url !== current.url) return;
      if (current.source === "radio-browser") {
        setIsPlaying(false);
        setPlaybackError("This live station stopped. Press Play to reconnect.");
        return;
      }
      if (playerPreferencesRef.current.repeat === "one") {
        try { audio.currentTime = 0; } catch { /* The source may not be seekable. */ }
        playAudio(audio);
        return;
      }
      recordPlayedTrack(current);
      const n = pickNextIndex(indexRef.current);
      if (n === -1) {
        setIsPlaying(false);
        void continueWithAutoplay();
      } else {
        selectQueueIndex(queueRef.current, n);
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("error", onError);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      flushAnalytics();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [current, recordPlayedTrack, continueWithAutoplay, pickNextIndex, selectQueueIndex, playAudio, handlePlaybackFailure]);

  const playQueue = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return;
    autoplayQueueKeyRef.current = "";
    autoplayEpochRef.current++;
    const target = Math.max(0, Math.min(Number.isFinite(startIndex) ? Math.floor(startIndex) : 0, tracks.length - 1));
    const currentTrack = queueRef.current[indexRef.current];
    const sameTrack = currentTrack?.id === tracks[target].id && currentTrack.url === tracks[target].url;
    const nextQueue = [...tracks];
    if (!sameTrack) {
      selectQueueIndex(nextQueue, target);
      return;
    }
    commitQueue(nextQueue, target);
    if (audioRef.current?.paused) {
      if (restoredStateRef.current) pendingAutoplayRef.current = true;
      playAudio(audioRef.current);
    }
  }, [commitQueue, playAudio, selectQueueIndex]);

  const playTrack = useCallback((track: Track) => {
    autoplayQueueKeyRef.current = "";
    const currentQueue = queueRef.current;
    const position = indexRef.current;
    const hasCurrentTrack = position >= 0 && position < currentQueue.length;
    const existingIndex = currentQueue.findIndex((queuedTrack, queuedIndex) =>
      queuedIndex > (hasCurrentTrack ? position : -1) && queuedTrack.id === track.id && queuedTrack.url === track.url,
    );
    if (existingIndex >= 0) {
      selectQueueIndex(currentQueue, existingIndex);
      return;
    }
    const nextIndex = hasCurrentTrack ? position + 1 : 0;
    selectQueueIndex([...currentQueue.slice(0, nextIndex), track, ...currentQueue.slice(nextIndex)], nextIndex);
  }, [selectQueueIndex]);

  const playStation = useCallback((station: Track) => {
    const existing = queueRef.current;
    const position = indexRef.current;
    const before = existing.slice(0, Math.max(0, position + 1)).filter(track => track.source !== "radio-browser");
    const upcoming = existing.slice(Math.max(0, position + 1)).filter(track => track.source !== "radio-browser");
    selectQueueIndex([...before, station, ...upcoming], before.length);
    // Start directly in the click handler so browsers can honor the user gesture.
    const audio = audioRef.current;
    const url = sanitizeUrl(station.url);
    if (audio && url) {
      sourceRef.current = { urls: [url], index: 0 };
      if (audio.src !== url) { audio.src = url; audio.load(); }
      playAudio(audio);
    }
  }, [selectQueueIndex, playAudio]);

  const addToQueue = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    autoplayQueueKeyRef.current = "";
    autoplayEpochRef.current++;
    const currentQueue = queueRef.current;
    const position = indexRef.current;
    if (position >= 0 && position < currentQueue.length) commitQueue([...currentQueue, ...tracks], position);
    else selectQueueIndex([...tracks], 0);
  }, [commitQueue, selectQueueIndex]);

  const playNext = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    autoplayQueueKeyRef.current = "";
    autoplayEpochRef.current++;
    const currentQueue = queueRef.current;
    const position = indexRef.current;
    const hasCurrentTrack = position >= 0 && position < currentQueue.length;
    const insertionIndex = hasCurrentTrack ? position + 1 : 0;
    const nextQueue = [...currentQueue.slice(0, insertionIndex), ...tracks, ...currentQueue.slice(insertionIndex)];
    if (hasCurrentTrack) commitQueue(nextQueue, position);
    else selectQueueIndex(nextQueue, 0);
  }, [commitQueue, selectQueueIndex]);

  const removeQueueItem = useCallback((queueIndex: number) => {
    const currentQueue = queueRef.current;
    const position = indexRef.current;
    if (!Number.isInteger(queueIndex) || queueIndex < 0 || queueIndex >= currentQueue.length) return;
    autoplayQueueKeyRef.current = "";
    autoplayEpochRef.current++;
    if (queueIndex === position) {
      // Already-played entries must not become the current track again.
      const upcoming = currentQueue.slice(queueIndex + 1);
      if (upcoming.length) selectQueueIndex(upcoming, 0);
      else {
        playAttemptRef.current++;
        restoredStateRef.current = false;
        pendingAutoplayRef.current = false;
        pendingSeekRef.current = 0;
        audioRef.current?.pause();
        setIsPlaying(false);
        setPlaybackError(undefined);
        setProgress(0);
        setDuration(0);
        commitQueue([], -1);
      }
      return;
    }
    const remaining = currentQueue.filter((_, itemIndex) => itemIndex !== queueIndex);
    commitQueue(remaining, queueIndex < position ? position - 1 : position);
  }, [commitQueue, selectQueueIndex]);

  const clearUpcomingQueue = useCallback(() => {
    autoplayEpochRef.current++;
    autoplayQueueKeyRef.current = "";
    const currentQueue = queueRef.current;
    const position = indexRef.current;
    if (position < 0 || position >= currentQueue.length) {
      playAttemptRef.current++;
      audioRef.current?.pause();
      restoredStateRef.current = false;
      pendingAutoplayRef.current = false;
      pendingSeekRef.current = 0;
      setProgress(0);
      setDuration(0);
      setIsPlaying(false);
      setPlaybackError(undefined);
      commitQueue([], -1);
    } else commitQueue(currentQueue.slice(0, position + 1), position);
  }, [commitQueue]);

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    const currentQueue = queueRef.current;
    const position = indexRef.current;
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex <= position || toIndex <= position || fromIndex < 0 || toIndex < 0 || fromIndex >= currentQueue.length || toIndex >= currentQueue.length || fromIndex === toIndex) return;
    autoplayEpochRef.current++;
    autoplayQueueKeyRef.current = "";
    const reordered = [...currentQueue];
    const [movedTrack] = reordered.splice(fromIndex, 1);
    if (!movedTrack) return;
    reordered.splice(toIndex, 0, movedTrack);
    commitQueue(reordered, position);
  }, [commitQueue]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !queueRef.current[indexRef.current]) return;
    autoplayEpochRef.current++;
    autoplayQueueKeyRef.current = "";
    if (audio.paused) {
      if (queueRef.current[indexRef.current]?.source === "radio-browser") {
        pendingSeekRef.current = 0;
        audio.load();
      }
      if (restoredStateRef.current) pendingAutoplayRef.current = true;
      playAudio(audio);
    } else {
      pendingAutoplayRef.current = false;
      wantsPlaybackRef.current = false;
      playAttemptRef.current++;
      audio.pause();
      setIsPlaying(false);
    }
  }, [playAudio]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    autoplayEpochRef.current++;
    autoplayQueueKeyRef.current = "";
    const target = Math.max(0, Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(seconds, audio.duration) : seconds);
    if (restoredStateRef.current && audio.readyState < 1) {
      pendingSeekRef.current = target;
      setProgress(target);
      return;
    }
    try {
      audio.currentTime = target;
      setProgress(target);
    } catch { /* This source is not seekable. */ }
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
    const enabled = !playerPreferencesRef.current.shuffle;
    if (enabled) setAutoplay(false);
    else autoplayEpochRef.current++;
    playerPreferencesRef.current = { ...playerPreferencesRef.current, shuffle: enabled };
    setShuffle(enabled);
  }, [setAutoplay]);
  const cycleShuffleAutoplay = useCallback(() => {
    if (playerPreferencesRef.current.shuffle) {
      setAutoplay(true);
    } else if (autoplayRef.current) {
      setAutoplay(false);
    } else {
      autoplayEpochRef.current++;
      playerPreferencesRef.current = { ...playerPreferencesRef.current, shuffle: true };
      setShuffle(true);
    }
  }, [setAutoplay]);
  const cycleRepeat = useCallback(() => {
    const currentMode = playerPreferencesRef.current.repeat;
    const nextMode = currentMode === "off" ? "all" : currentMode === "all" ? "one" : "off";
    autoplayEpochRef.current++;
    playerPreferencesRef.current = { ...playerPreferencesRef.current, repeat: nextMode };
    setRepeat(nextMode);
  }, []);

  const value = useMemo(
    () => ({
      queue,
      history,
      index,
      current,
      isPlaying,
      playbackError,
      progress,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      autoplay,
      setAutoplay,
      playQueue,
      playStation,
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
      playbackError,
      progress,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      autoplay,
      setAutoplay,
      playQueue,
      playStation,
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
