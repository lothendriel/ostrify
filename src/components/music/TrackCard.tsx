import { Play, Pause } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { fountainShowGuid, type Track } from "@/lib/music";
import { usePlayer } from "@/hooks/usePlayer";
import { TrackArtwork } from "./TrackArtwork";
import { ArtistLink } from "./ArtistLink";
import { QueueActionsMenu } from "./QueueActionsMenu";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { LikeButton } from "./LikeButton";

interface TrackCardProps {
  track: Track;
  showPlaylistAction?: boolean;
  showLikeAction?: boolean;
  compact?: boolean;
}

export function TrackCard({ track, showPlaylistAction = false, showLikeAction = false, compact = false }: TrackCardProps) {
  const player = usePlayer();
  const isCurrent = player.current?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;
  const fountainGuid = track.source === "fountain" ? fountainShowGuid(track.showId) : undefined;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) {
      player.togglePlay();
    } else {
      player.playTrack(track);
    }
  };

  return (
    <div className={cn("group relative rounded-lg bg-card transition-colors hover:bg-accent/10", compact ? "p-2" : "p-3")}>
      <button type="button" onClick={handlePlay} aria-label={`${isPlaying ? "Pause" : "Play"} ${track.title}`} className="block w-full text-left">
        <div className={cn("relative", compact ? "mb-2" : "mb-3")}>
          <TrackArtwork track={track} className="w-full aspect-square" rounded={compact ? "rounded-md" : "rounded-md shadow-lg"} />
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-2 right-2 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl",
              compact ? "size-8" : "size-12",
              "transition-all duration-200",
              isPlaying
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100",
            )}
          >
            {isPlaying ? <Pause className={cn("fill-current", compact ? "size-4" : "size-5")} /> : <Play className={cn("ml-0.5 fill-current", compact ? "size-4" : "size-5")} />}
          </span>
        </div>
        <div className={cn("truncate font-semibold", compact && "text-sm")}>{track.title}</div>
      </button>
      <div className={cn("flex items-center justify-between gap-2", compact && "text-xs")}>
        <div className={cn("min-w-0 truncate text-sm text-muted-foreground", compact && "text-xs")}>
          {fountainGuid ? <Link to={`/podcasts/fountain/${encodeURIComponent(fountainGuid)}`} onClick={event => event.stopPropagation()} className="hover:text-foreground hover:underline focus-visible:underline">{track.artist || "Fountain show"}</Link> : <ArtistLink pubkey={track.pubkey} artistId={track.artistId} artistPubkey={track.artistPubkey} fallbackName={track.artist} isUnverifiedArtist={!!track.event && !!track.artist} />}
        </div>
        {showLikeAction && <LikeButton trackId={track.id} size={18} />}
        {showPlaylistAction && <AddToPlaylistMenu trackId={track.id} />}
        {track.source !== 'tunestr' && <QueueActionsMenu track={track} />}
      </div>
    </div>
  );
}
