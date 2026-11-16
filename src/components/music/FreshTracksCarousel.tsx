import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Track } from "@/lib/music";
import { TrackCard } from "@/components/music/TrackCard";
import { Skeleton } from "@/components/ui/skeleton";

interface FreshTracksCarouselProps {
  tracks: Track[];
  isLoading?: boolean;
}

export function FreshTracksCarousel({ tracks, isLoading = false }: FreshTracksCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const visibleCountRef = useRef(visibleCount);
  const visibleTracks = tracks.slice(0, visibleCount);

  useEffect(() => {
    visibleCountRef.current = visibleCount;
  }, [visibleCount]);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setCanScrollPrev(element.scrollLeft > 1);
    setCanScrollNext(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
    if (element.scrollWidth - element.scrollLeft - element.clientWidth < element.clientWidth * 1.5 && visibleCountRef.current < tracks.length) {
      const nextCount = Math.min(tracks.length, visibleCountRef.current + 20);
      visibleCountRef.current = nextCount;
      setVisibleCount(nextCount);
    }
  }, [tracks.length]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Sync initial overflow state as well as later scroll and resize changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, visibleTracks.length, isLoading]);

  const scroll = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section aria-labelledby="fresh-on-nostr-heading" className="w-full min-w-0 space-y-3">
      <div>
        <h2 id="fresh-on-nostr-heading" className="text-2xl font-bold tracking-tight">Fresh on Nostr</h2>
        <p className="text-sm text-muted-foreground">The newest tracks hitting the relays, across your tastes and beyond</p>
      </div>
      <div className="relative">
        <div
          ref={scrollRef}
          role="region"
          aria-label="Fresh tracks from Nostr"
          tabIndex={0}
          className="grid auto-cols-[calc((100%-1rem)/2.25)] grid-flow-col grid-rows-1 gap-2 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:auto-cols-[calc((100%-1rem)/3)] lg:auto-cols-[calc((100%-2.5rem)/6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
        {isLoading
          ? Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="min-w-0 snap-start rounded-lg bg-card p-2 sm:p-3">
                <Skeleton className="mb-2 aspect-square w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))
          : visibleTracks.map(track => (
              <div key={track.id} className="min-w-0 snap-start">
                <TrackCard track={track} compact />
              </div>
            ))}
        </div>
        {canScrollPrev && <button type="button" onClick={() => scroll(-1)} aria-label="Scroll to previous fresh tracks" className="absolute left-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white shadow-lg transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <ArrowLeft className="size-5" />
        </button>}
        {canScrollNext && <button type="button" onClick={() => scroll(1)} aria-label="Scroll to more fresh tracks" className="absolute right-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white shadow-lg transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <ArrowRight className="size-5" />
        </button>}
      </div>
    </section>
  );
}
