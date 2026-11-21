import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HorizontalCarouselProps {
  label: string;
  children: ReactNode;
  className?: string;
  rows?: 1 | 2;
}

export function HorizontalCarousel({ label, children, className, rows = 1 }: HorizontalCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setCanScrollPrev(element.scrollLeft > 1);
    setCanScrollNext(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Initialize arrow availability and update it when scrolling or resizing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, children]);

  const scroll = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="relative min-w-0">
      <div
        ref={scrollRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn("grid auto-cols-[calc((100%-1rem)/2.25)] grid-flow-col gap-2 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:auto-cols-[calc((100%-1rem)/3)] lg:auto-cols-[calc((100%-2.5rem)/6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", rows === 2 ? "grid-rows-2 auto-rows-fr auto-cols-[calc((100%-0.5rem)/2)] sm:auto-cols-[calc((100%-0.5rem)/2)] lg:auto-cols-[calc((100%-0.5rem)/2)]" : "grid-rows-1", className)}
      >
        {children}
      </div>
      {canScrollPrev && <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll to previous ${label.toLowerCase()}`} className="absolute left-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white shadow-lg transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <ArrowLeft className="size-5" />
      </button>}
      {canScrollNext && <button type="button" onClick={() => scroll(1)} aria-label={`Scroll to more ${label.toLowerCase()}`} className="absolute right-2 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white shadow-lg transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <ArrowRight className="size-5" />
      </button>}
    </div>
  );
}
