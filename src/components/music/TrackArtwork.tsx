import { useState } from "react";
import { Music, Mic, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";

const FALLBACK_POSITIONS = ["15% 30%", "70% 40%", "35% 80%", "90% 65%"] as const;

/** Vary the crop without interpolating untrusted track data into CSS. */
function fallbackPosition(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_POSITIONS[hash % FALLBACK_POSITIONS.length];
}

interface TrackArtworkProps {
  track: Pick<Track, "image" | "id" | "title" | "kind">;
  className?: string;
  rounded?: string;
  priority?: boolean;
}

export function TrackArtwork({ track, className, rounded = "rounded-md", priority = false }: TrackArtworkProps) {
  const [failedImage, setFailedImage] = useState<string>();
  const image = sanitizeUrl(track.image);
  const showImage = image && image !== failedImage;
  const Icon = track.kind === "audiobook" ? BookOpen : track.kind === "podcast" ? Mic : Music;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-secondary flex items-center justify-center shrink-0",
        rounded,
        className,
      )}
      style={showImage ? undefined : { backgroundColor: "#18132d", backgroundImage: "linear-gradient(140deg, rgba(11, 9, 27, 0.2), rgba(11, 9, 27, 0.6)), url('/browse-texture.webp')", backgroundPosition: fallbackPosition(track.id), backgroundSize: "cover" }}
    >
      {showImage ? (
        <img
          src={image}
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          onError={() => setFailedImage(image)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="flex size-1/2 items-center justify-center rounded-full border border-white/25 bg-black/30"><Icon className="size-1/2 text-white/90" strokeWidth={1.5} /></span>
      )}
    </div>
  );
}
