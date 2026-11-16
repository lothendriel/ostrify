import type { Track } from "@/lib/music";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TrackCard } from "./TrackCard";
import { Skeleton } from "@/components/ui/skeleton";
import { HorizontalCarousel } from "@/components/music/HorizontalCarousel";

interface ShelfProps {
  title: string;
  subtitle?: string;
  tracks: Track[];
  isLoading?: boolean;
  dense?: boolean;
  compactCards?: boolean;
  seeAllHref?: string;
  emptyMessage?: string;
}

export function Shelf({ title, subtitle, tracks, isLoading, dense = false, compactCards = false, seeAllHref, emptyMessage }: ShelfProps) {
  if (!isLoading && tracks.length === 0 && !emptyMessage) return null;

  return (
    <section className="w-full min-w-0 max-w-full space-y-3 overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {seeAllHref && (
          <Link to={seeAllHref} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            See all <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      {tracks.length === 0 && !isLoading && emptyMessage ? <div className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{emptyMessage}</div> : <HorizontalCarousel label={`${title} tracks`}>
        {isLoading
          ? Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="min-w-0 snap-start space-y-3 p-2 sm:p-3">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          : tracks.slice(0, seeAllHref?.startsWith("/category/") ? 15 : undefined).map(track => (
              <div key={track.id} className="min-w-0 snap-start">
                <TrackCard track={track} compact={compactCards || dense} />
              </div>
            ))}
      </HorizontalCarousel>}
    </section>
  );
}
