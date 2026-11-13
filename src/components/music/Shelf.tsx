import type { Track } from "@/lib/music";
import { TrackCard } from "./TrackCard";
import { Skeleton } from "@/components/ui/skeleton";

interface ShelfProps {
  title: string;
  subtitle?: string;
  tracks: Track[];
  isLoading?: boolean;
  dense?: boolean;
}

export function Shelf({ title, subtitle, tracks, isLoading, dense = false }: ShelfProps) {
  if (!isLoading && tracks.length === 0) return null;

  return (
    <section className="w-full min-w-0 max-w-full space-y-3 overflow-hidden">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className={`grid w-full min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))] ${dense ? "lg:grid-cols-[repeat(4,minmax(0,1fr))] 2xl:grid-cols-[repeat(6,minmax(0,1fr))]" : "lg:grid-cols-[repeat(3,minmax(0,1fr))] 2xl:grid-cols-[repeat(5,minmax(0,1fr))]"}`}>
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
