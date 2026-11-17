import { ChevronDown, ChevronUp, GripVertical, Play, Pause } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDuration, type Track } from "@/lib/music";
import { usePlayer } from "@/hooks/usePlayer";
import { TrackArtwork } from "./TrackArtwork";
import { LikeButton } from "./LikeButton";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { ArtistLink } from "./ArtistLink";
import { QueueActionsMenu } from "./QueueActionsMenu";
import { Link } from "react-router-dom";
import { audioDetailPath } from "@/lib/audioDetail";

interface TrackRowProps {
  track: Track;
  index: number;
  /** Optional selection controls for explicit bulk queue actions. */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onCreatePlaylist?: () => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  draggable?: boolean;
  trailingAction?: ReactNode;
}

export function TrackRow({ track, index, selectable = false, selected = false, onSelectedChange, onCreatePlaylist, onRemove, onMoveUp, onMoveDown, onDragStart, onDragOver, onDrop, onDragEnd, draggable = false, trailingAction }: TrackRowProps) {
  const player = usePlayer();
  const isCurrent = player.current?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;

  const handlePlay = () => {
    if (isCurrent) {
      player.togglePlay();
    } else {
      player.playTrack(track);
    }
  };

  return (
    <div
      className={cn(
        cn("group grid items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/10 cursor-pointer", selectable ? "grid-cols-[1.25rem_2rem_minmax(0,1fr)_auto] md:grid-cols-[1.25rem_2rem_minmax(0,1fr)_minmax(0,14rem)_auto]" : "grid-cols-[2rem_minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,14rem)_auto]"),
        isCurrent && "bg-accent/10",
      )}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={event => {
        if (event.target instanceof Element && event.target.closest("button, a, [role=menuitem], [data-queue-action='true']")) return;
        handlePlay();
      }}
      onKeyDown={event => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          handlePlay();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Play ${track.title}`}
    >
      {selectable && <Checkbox checked={selected} aria-label={`${selected ? "Deselect" : "Select"} ${track.title}`} onCheckedChange={checked => onSelectedChange?.(checked === true)} onClick={event => event.stopPropagation()} />}
      {/* Index / play control */}
      <div className="relative flex h-10 w-8 items-center justify-center text-sm text-muted-foreground">
        {draggable && <GripVertical className="absolute -left-2 size-3.5 cursor-grab text-muted-foreground/60" aria-hidden="true" />}
        <button type="button" onClick={handlePlay} aria-label={`${isPlaying ? "Pause" : "Play"} ${track.title}`} className="absolute inset-0 flex items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-primary">
          <span className={cn("group-hover:opacity-0", isPlaying ? "opacity-0" : isCurrent && "text-primary")}>{index + 1}</span>
          <span className="absolute inset-0 hidden items-center justify-center text-foreground group-hover:flex group-focus-within:flex">
            {isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </span>
        </button>
      </div>

      {/* Artwork + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={handlePlay} aria-label={`${isPlaying ? "Pause" : "Play"} ${track.title}`} className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-primary"><TrackArtwork track={track} className="w-10 h-10" /></button>
        <div className="min-w-0">
          <Link to={audioDetailPath(track)} onClick={event => event.stopPropagation()} className={cn("block truncate font-medium hover:underline focus-visible:underline", isCurrent && "text-primary")} title={`View details for ${track.title}`}>{track.title}</Link>
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
        {(onMoveUp || onMoveDown) && <div className="flex items-center">
          <button type="button" onClick={event => { event.stopPropagation(); onMoveUp?.(); }} disabled={!onMoveUp} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Move ${track.title} up`}><ChevronUp className="size-4" /></button>
          <button type="button" onClick={event => { event.stopPropagation(); onMoveDown?.(); }} disabled={!onMoveDown} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={`Move ${track.title} down`}><ChevronDown className="size-4" /></button>
        </div>}
        <div className="flex items-center">
          {track.source !== 'librivox' && <LikeButton trackId={track.id} collection={track.source === 'tunestr' ? 'tunestr' : undefined} />}
          <div className="flex items-center sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            {track.source !== 'librivox' && track.source !== 'tunestr' && <AddToPlaylistMenu trackId={track.id} onCreateNew={onCreatePlaylist} />}
            {track.source !== 'tunestr' && <QueueActionsMenu track={track} />}
          </div>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums w-12 text-right">
          {formatDuration(track.duration)}
        </span>
        {trailingAction && <span onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} className="shrink-0">{trailingAction}</span>}
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
