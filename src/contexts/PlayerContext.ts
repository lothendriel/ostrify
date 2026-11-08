import { createContext } from "react";
import type { Track } from "@/lib/music";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  /** The current playback queue. */
  queue: Track[];
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

  /** Replace the queue and start at a given index. */
  playQueue: (tracks: Track[], startIndex?: number) => void;
  /** Play a single track immediately. */
  playTrack: (track: Track) => void;
  /** Add a track to the end of the queue. */
  addToQueue: (track: Track) => void;
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
