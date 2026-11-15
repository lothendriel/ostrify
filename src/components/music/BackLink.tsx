import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type BackLinkProps = {
  to: string;
  className?: string;
  children?: ReactNode;
};

export function BackLink({ to, className }: BackLinkProps) {
  return <Link to={to} className={`inline-flex items-center gap-2 ${className ?? ''}`} aria-label="Back">Back</Link>;
}
