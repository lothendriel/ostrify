import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePreviousLocation } from '@/components/NavigationHistory';

type BackLinkProps = {
  to: string;
  className?: string;
  children?: ReactNode;
};

export function BackLink({ to: fallback, className }: BackLinkProps) {
  const { previousTo, historyLength } = usePreviousLocation();
  const navigate = useNavigate();
  const location = useLocation();
  const fallbackState = location.state as { ostrifyBackFallback?: unknown } | null;
  const stateFallback = typeof fallbackState?.ostrifyBackFallback === 'string' ? fallbackState.ostrifyBackFallback : undefined;
  const destination = previousTo ?? stateFallback ?? fallback;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (historyLength > 1) navigate(-1);
    else if (stateFallback) navigate(stateFallback);
    else navigate(fallback);
  };

  return <Link to={destination} onClick={handleClick} className={`inline-flex items-center gap-2 ${className ?? ''}`} state={{ ostrifyBackFallback: fallback }} aria-label="Back">Back</Link>;
}
