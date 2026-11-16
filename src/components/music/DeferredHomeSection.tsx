import { useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface DeferredHomeSectionProps {
  title: string;
  children: ReactNode | ((isNearViewport: boolean) => ReactNode);
  rootMargin?: string;
}

export function DeferredHomeSection({ title, children, rootMargin = "500px 0px" }: DeferredHomeSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setIsNearViewport(true);
      observer.disconnect();
    }, { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <section ref={ref} aria-label={title} className="w-full min-w-0 space-y-3">
      {typeof children === "function" ? children(isNearViewport) : isNearViewport ? children : (
        <div aria-hidden="true" className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="w-[min(42vw,176px)] shrink-0 space-y-2 rounded-lg p-2">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
