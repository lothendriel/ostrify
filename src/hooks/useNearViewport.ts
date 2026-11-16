import { useEffect, useRef, useState, type RefObject } from "react";

/** Activate content once it approaches the viewport, then keep it active. */
export function useNearViewport<T extends Element>(rootMargin = "600px 0px"): {
  ref: RefObject<T | null>;
  isNearViewport: boolean;
} {
  const ref = useRef<T>(null);
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

  return { ref, isNearViewport };
}
