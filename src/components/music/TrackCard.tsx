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
}

export function TrackCard({ track, showPlaylistAction = false, showLikeAction = false }: TrackCardProps) {
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
    <div className="group relative rounded-lg bg-card p-3 transition-colors hover:bg-accent/10">
      <button type="button" onClick={handlePlay} aria-label={`${isPlaying ? "Pause" : "Play"} ${track.title}`} className="block w-full text-left">
        <div className="relative mb-3">
          <TrackArtwork track={track} className="w-full aspect-square" rounded="rounded-md shadow-lg" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-2 right-2 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl",
              "transition-all duration-200",
              isPlaying
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100",
            )}
          >
            {isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </span>
        </div>
        <div className="truncate font-semibold">{track.title}</div>
      </button>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm text-muted-foreground">
          {fountainGuid ? <Link to={`/podcasts/fountain/${encodeURIComponent(fountainGuid)}`} onClick={event => event.stopPropagation()} className="hover:text-foreground hover:underline focus-visible:underline">{track.artist || "Fountain show"}</Link> : <ArtistLink pubkey={track.pubkey} artistId={track.artistId} artistPubkey={track.artistPubkey} fallbackName={track.artist} isUnverifiedArtist={!!track.event && !!track.artist} />}
        </div>
        {showLikeAction && <LikeButton trackId={track.id} size={18} />}
        {showPlaylistAction && <AddToPlaylistMenu trackId={track.id} />}
        {track.source !== 'tunestr' && <QueueActionsMenu track={track} />}
      </div>
    </div>
  );
}
