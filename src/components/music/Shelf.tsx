import type { Track } from "@/lib/music";
import { TrackCard } from "./TrackCard";
import { Skeleton } from "@/components/ui/skeleton";

interface ShelfProps {
  title: string;
  subtitle?: string;
  tracks: Track[];
  isLoading?: boolean;
}

export function Shelf({ title, subtitle, tracks, isLoading }: ShelfProps) {
  if (!isLoading && tracks.length === 0) return null;

  return (
    <section className="w-full min-w-0 max-w-full space-y-3 overflow-hidden">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 space-y-3">
                <Skeleton className="w-full aspect-square rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          : tracks.map((track) => <TrackCard key={track.id} track={track} />)}
      </div>
    </section>
  );
}
