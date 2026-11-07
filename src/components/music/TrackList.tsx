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
}

export function TrackList({ tracks, isLoading, onCreatePlaylist, onRemove, emptyMessage }: TrackListProps) {
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
            onCreatePlaylist={onCreatePlaylist}
            onRemove={onRemove ? () => onRemove(track) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
