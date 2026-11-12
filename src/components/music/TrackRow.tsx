import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, type Track } from "@/lib/music";
import { usePlayer } from "@/hooks/usePlayer";
import { TrackArtwork } from "./TrackArtwork";
import { LikeButton } from "./LikeButton";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { ArtistLink } from "./ArtistLink";
import { QueueActionsMenu } from "./QueueActionsMenu";

interface TrackRowProps {
  track: Track;
  index: number;
  /** All tracks in the current context, so clicking plays the whole list by default. */
  queue: Track[];
  /** Play this row without replacing the current queue. */
  playTrackOnSelect?: boolean;
  onCreatePlaylist?: () => void;
  onRemove?: () => void;
}

export function TrackRow({ track, index, queue, playTrackOnSelect = false, onCreatePlaylist, onRemove }: TrackRowProps) {
  const player = usePlayer();
  const isCurrent = player.current?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;

  const handlePlay = () => {
    if (isCurrent) {
      player.togglePlay();
    } else {
      if (playTrackOnSelect) player.playTrack(track);
      else player.playQueue(queue, queue.findIndex((t) => t.id === track.id));
    }
  };

  return (
    <div
      className={cn(
        "group grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_minmax(0,14rem)_auto] items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/10 cursor-pointer",
        isCurrent && "bg-accent/10",
      )}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button, a, [role=menuitem], [data-queue-action='true']")) return;
        handlePlay();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handlePlay();
        }
      }}
    >
      {/* Index / play indicator */}
      <div className="relative w-8 flex items-center justify-center text-sm text-muted-foreground">
        <span className={cn("group-hover:opacity-0", isPlaying ? "opacity-0" : isCurrent && "text-primary")}>
          {index + 1}
        </span>
        <span className="absolute inset-0 hidden group-hover:flex items-center justify-center text-foreground">
          {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
        </span>
      </div>

      {/* Artwork + title */}
      <div className="flex items-center gap-3 min-w-0">
        <TrackArtwork track={track} className="w-10 h-10" />
        <div className="min-w-0">
          <div className={cn("truncate font-medium", isCurrent && "text-primary")}>{track.title}</div>
          <div className="truncate text-sm text-muted-foreground">
            <ArtistLink pubkey={track.pubkey} artistId={track.artistId} artistPubkey={track.artistPubkey} fallbackName={track.artist} isUnverifiedArtist={!!track.event && !!track.artist} />
          </div>
        </div>
      </div>

      {/* Topic (desktop only) */}
      <div className="hidden md:block truncate text-sm text-muted-foreground">
        {track.source === 'librivox' ? 'LibriVox' : track.source === 'gutenberg' ? 'Project Gutenberg' : track.source === 'wavlake' ? 'Wavlake' : track.source === 'tunestr' ? 'TuneStr' : track.source === 'fountain' ? 'Fountain' : track.source === 'podcast-index' ? 'Podcast Index' : track.topics[0] ? `#${track.topics[0]}` : track.kind === "podcast" ? "Podcast" : ""}
      </div>

      {/* Actions + duration */}
      <div className="flex items-center gap-1 justify-end">
        <div className="flex items-center sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {track.source !== 'librivox' && track.source !== 'tunestr' && <LikeButton trackId={track.id} />}
          {track.source !== 'librivox' && track.source !== 'tunestr' && <AddToPlaylistMenu trackId={track.id} onCreateNew={onCreatePlaylist} />}
          {track.source !== 'tunestr' && <QueueActionsMenu track={track} />}
        </div>
        <span className="text-sm text-muted-foreground tabular-nums w-12 text-right">
          {formatDuration(track.duration)}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="ml-1 text-xs text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
            aria-label="Remove from playlist"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
