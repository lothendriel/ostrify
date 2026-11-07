import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Track } from "@/lib/music";
import { usePlayer } from "@/hooks/usePlayer";
import { TrackArtwork } from "./TrackArtwork";
import { ArtistLink } from "./ArtistLink";

interface TrackCardProps {
  track: Track;
  queue: Track[];
}

export function TrackCard({ track, queue }: TrackCardProps) {
  const player = usePlayer();
  const isCurrent = player.current?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) {
      player.togglePlay();
    } else {
      player.playQueue(queue, queue.findIndex((t) => t.id === track.id));
    }
  };

  return (
    <div
      className="group relative p-3 rounded-lg bg-card hover:bg-accent/10 transition-colors cursor-pointer"
      onClick={handlePlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          if (isCurrent) player.togglePlay();
          else player.playQueue(queue, queue.findIndex((t) => t.id === track.id));
        }
      }}
    >
      <div className="relative mb-3">
        <TrackArtwork track={track} className="w-full aspect-square" rounded="rounded-md shadow-lg" />
        <button
          type="button"
          onClick={handlePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={cn(
            "absolute bottom-2 right-2 size-12 rounded-full bg-primary text-primary-foreground",
            "flex items-center justify-center shadow-xl",
            "transition-all duration-200",
            isPlaying
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 focus:opacity-100 focus:translate-y-0",
          )}
        >
          {isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current ml-0.5" />}
        </button>
      </div>
      <div className="font-semibold truncate">{track.title}</div>
      <div className="text-sm text-muted-foreground truncate mt-0.5">
        <ArtistLink pubkey={track.pubkey} artistId={track.artistId} fallbackName={track.artist} isUnverifiedArtist={!!track.event && !!track.artist} />
      </div>
    </div>
  );
}
