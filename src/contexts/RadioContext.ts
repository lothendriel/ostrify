import { createContext } from "react";
import type { Track } from "@/lib/music";

export interface RadioContextValue {
  startTrackRadio: (seed: Track) => void;
  startArtistRadio: (artistKey: string, artistTracks: Track[]) => void;
}

export const RadioContext = createContext<RadioContextValue | undefined>(undefined);
