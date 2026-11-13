import { createContext } from "react";
import type { Track } from "@/lib/music";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  /** The current playback queue. */
  queue: Track[];
  /** Tracks that have actually started playing, newest first. */
  history: Track[];
  /** Index of the current track within the queue, or -1. */
  index: number;
  /** The currently loaded track, if any. */
  current: Track | undefined;
  isPlaying: boolean;
  /** Current playback position in seconds. */
  progress: number;
  /** Duration of current track in seconds. */
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  autoplay: boolean;
  setAutoplay: (enabled: boolean) => void;

  /** Replace the queue and start at a given index. */
  playQueue: (tracks: Track[], startIndex?: number) => void;
  /** Play a track immediately, inserting it after the current track without discarding the queue. */
  playTrack: (track: Track) => void;
  /** Add tracks to the end of the queue. */
  addToQueue: (tracks: Track[]) => void;
  /** Insert tracks immediately after the current track. */
  playNext: (tracks: Track[]) => void;
  /** Remove a track from a queue position. */
  removeQueueItem: (queueIndex: number) => void;
  /** Remove all upcoming tracks while preserving the currently playing track. */
  clearUpcomingQueue: () => void;
  /** Move an upcoming queue item to another position. */
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

export const PlayerContext = createContext<PlayerState | undefined>(undefined);
