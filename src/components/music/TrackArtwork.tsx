import { useState } from "react";
import { Music, Mic, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/music";

/** Deterministic gradient from a string (so each track gets a stable color). */
function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const h1 = hash % 360;
  const h2 = (h1 + 50) % 360;
  return `linear-gradient(135deg, hsl(${h1} 55% 32%), hsl(${h2} 60% 18%))`;
}

interface TrackArtworkProps {
  track: Pick<Track, "image" | "id" | "title" | "kind">;
  className?: string;
  rounded?: string;
}

export function TrackArtwork({ track, className, rounded = "rounded-md" }: TrackArtworkProps) {
  const [errored, setErrored] = useState(false);
  const showImage = track.image && !errored;
  const Icon = track.kind === "audiobook" ? BookOpen : track.kind === "podcast" ? Mic : Music;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-secondary flex items-center justify-center shrink-0",
        rounded,
        className,
      )}
      style={showImage ? undefined : { background: gradientFor(track.id) }}
    >
      {showImage ? (
        <img
          src={track.image}
          alt=""
          loading="lazy"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <Icon className="w-1/3 h-1/3 text-white/70" aria-hidden />
      )}
    </div>
  );
}
