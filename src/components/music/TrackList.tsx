import { useState } from "react";
import type { Track } from "@/lib/music";
import { TrackRow } from "./TrackRow";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";

interface TrackListProps {
  tracks: Track[];
  isLoading?: boolean;
  onCreatePlaylist?: () => void;
  onRemove?: (track: Track) => void;
  emptyMessage?: string;
  playTrackOnSelect?: boolean;
  onReorder?: (tracks: Track[]) => void;
}

export function TrackList({ tracks, isLoading, onCreatePlaylist, onRemove, emptyMessage, playTrackOnSelect = false, onReorder }: TrackListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (!onReorder || from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
    setDraggedIndex(null);
  };
  if (isLoading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-4" />
            <Skeleton className="size-10 rounded-md" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg py-12 px-8 text-center">
        <p className="text-muted-foreground max-w-sm mx-auto">
          {emptyMessage ?? "No tracks here yet."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_minmax(0,14rem)_auto] items-center gap-3 px-3 py-2 border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="text-center">#</span>
        <span>Title</span>
        <span className="hidden md:block">Category</span>
        <span className="flex justify-end pr-14">
          <Clock className="size-4" />
        </span>
      </div>
      <div className="mt-1">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            queue={tracks}
            playTrackOnSelect={playTrackOnSelect}
            onCreatePlaylist={onCreatePlaylist}
            onRemove={onRemove ? () => onRemove(track) : undefined}
            draggable={!!onReorder}
            onMoveUp={onReorder && i > 0 ? () => reorder(i, i - 1) : undefined}
            onMoveDown={onReorder && i < tracks.length - 1 ? () => reorder(i, i + 1) : undefined}
            onDragStart={onReorder ? event => { setDraggedIndex(i); event.dataTransfer.effectAllowed = "move"; } : undefined}
            onDragOver={onReorder ? event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } : undefined}
            onDrop={onReorder ? event => { event.preventDefault(); if (draggedIndex !== null) reorder(draggedIndex, i); setDraggedIndex(null); } : undefined}
            onDragEnd={onReorder ? () => setDraggedIndex(null) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
