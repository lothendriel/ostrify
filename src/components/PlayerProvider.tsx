import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import type { Track } from "@/lib/music";
import { PlayerContext, type RepeatMode } from "@/contexts/PlayerContext";

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const current = index >= 0 ? queue[index] : undefined;

  // Load direct audio URLs and HLS livestream playlists into the same player.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setPlaybackError(null);
    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      setProgress(0);
      setDuration(0);
      return;
    }
    let playAfterHlsManifest = false;
    if (/\.m3u8(?:$|[?#])/i.test(current.url)) {
      if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = current.url;
        audio.load();
      } else if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.attachMedia(audio);
        hls.loadSource(current.url);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (audioRef.current !== audio || hlsRef.current !== hls) return;
          audio.play().then(() => { setPlaybackError(null); setIsPlaying(true); }).catch(() => setIsPlaying(false));
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setPlaybackError('This live audio stream is currently unavailable.');
            setIsPlaying(false);
          }
        });
        playAfterHlsManifest = true;
      } else {
        setPlaybackError('This browser does not support HLS live streams.');
        setIsPlaying(false);
        return;
      }
    } else {
      audio.src = current.url;
      audio.load();
    }
    if (!playAfterHlsManifest) audio.play().then(() => { setPlaybackError(null); setIsPlaying(true); }).catch(() => { setIsPlaying(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => () => { hlsRef.current?.destroy(); }, []);

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
    setIndex((cur) => {
      const n = pickNextIndex(cur);
      return n === -1 ? cur : n;
    });
    // If at the end with repeat off, stop.
    setIsPlaying((playing) => {
      const n = pickNextIndex(index);
      return n === -1 ? false : playing;
    });
  }, [pickNextIndex, index]);

  const previous = useCallback(() => {
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
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      setPlaybackError('Could not play this stream. It may have ended or the host may have disabled playback.');
      setIsPlaying(false);
    };
    const onEnded = () => {
      if (repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
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
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
  }, [index, repeat, pickNextIndex]);

  const playQueue = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return;
    const target = Math.max(0, Math.min(startIndex, tracks.length - 1));
    if (current?.id === tracks[target].id && audioRef.current?.paused) {
      void audioRef.current.play().catch(() => {});
    }
    setQueue(tracks);
    setIndex(target);
  }, [current?.id]);

  const playTrack = useCallback((track: Track) => {
    setQueue([track]);
    setIndex(0);
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueue((q) => {
      if (q.some((t) => t.id === track.id)) return q;
      return [...q, track];
    });
    setIndex((cur) => (cur === -1 ? 0 : cur));
  }, []);

  const togglePlay = useCallback(() => {
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
    setVolumeState(v);
    if (v > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const value = useMemo(
    () => ({
      queue,
      index,
      current,
      playbackError,
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
      index,
      current,
      playbackError,
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
