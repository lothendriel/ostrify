import type { ReactNode, MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePreviousLocation } from '@/components/NavigationHistory';

type BackLinkProps = {
  to: string;
  children: ReactNode;
  className?: string;
};

export function BackLink({ to: fallback, children, className }: BackLinkProps) {
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

  return <Link to={destination} onClick={handleClick} className={className} state={{ ostrifyBackFallback: fallback }}>{children}</Link>;
}
