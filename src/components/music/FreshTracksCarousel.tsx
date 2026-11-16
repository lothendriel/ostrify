import { useMemo } from "react";
import type { Track } from "@/lib/music";
import { TrackCard } from "@/components/music/TrackCard";
import { Skeleton } from "@/components/ui/skeleton";
import { HorizontalCarousel } from "@/components/music/HorizontalCarousel";

interface FreshTracksCarouselProps {
  tracks: Track[];
  isLoading?: boolean;
}

export function FreshTracksCarousel({ tracks, isLoading = false }: FreshTracksCarouselProps) {
  const freshTracks = useMemo(() => tracks.slice(0, 15), [tracks]);

  return (
    <section aria-labelledby="fresh-on-nostr-heading" className="w-full min-w-0 space-y-3">
      <div>
        <h2 id="fresh-on-nostr-heading" className="text-2xl font-bold tracking-tight">Fresh on Nostr</h2>
        <p className="text-sm text-muted-foreground">The newest tracks hitting the relays, across your tastes and beyond</p>
      </div>
      <HorizontalCarousel label="Fresh tracks from Nostr">
        {isLoading
          ? Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="min-w-0 snap-start rounded-lg bg-card p-2 sm:p-3">
                <Skeleton className="mb-2 aspect-square w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))
          : freshTracks.map(track => (
              <div key={track.id} className="min-w-0 snap-start">
                <TrackCard track={track} compact />
              </div>
            ))}
      </HorizontalCarousel>
    </section>
  );
}
