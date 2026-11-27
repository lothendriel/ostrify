import { Play, Pause } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/music";
import { usePlayer } from "@/hooks/usePlayer";
import { sanitizeUrl } from "@/lib/sanitize";

/** Relay-read status for public Nostr library lists. A successful read does not confirm relay retention or write delivery. */
export function LibrarySyncStatus({ name, hasReadRelays, isFetching, isError, isPartial, onRetry }: {
  name: string;
  hasReadRelays: boolean;
  isFetching: boolean;
  isError: boolean;
  isPartial: boolean;
  onRetry: () => void;
}) {
  return <div role="status" className="rounded-lg border border-border/70 bg-card/80 p-4 text-sm text-foreground">
    {!hasReadRelays ? <p>Enable a read relay to load {name} from your Nostr account.</p>
      : isFetching ? <p>Checking relay responses for {name}…</p>
        : isError ? <><p>Could not check {name} on your relays. Your library may be incomplete or out of date.</p><p className="mt-1">Try again when your relays are available.</p></>
          : isPartial ? <><p>Some read relays did not finish. {name} may be incomplete or out of date, and another device may have unseen changes.</p><p className="mt-1">Check again when those relays are available, especially before making changes on another device.</p></>
            : <p>{name} is loaded from your read relays. Nostr library data is public and relay availability and retention can vary.</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      {hasReadRelays && <Button type="button" size="sm" variant="secondary" disabled={isFetching} onClick={onRetry}>{isFetching ? 'Checking…' : isPartial || isError ? 'Retry sync' : 'Sync now'}</Button>}
      <Button size="sm" variant="outline" asChild><Link to="/settings?tab=relays">Relay settings</Link></Button>
    </div>
  </div>;
}

interface CollectionHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  icon?: React.ReactNode;
  gradient?: string;
  tracks: Track[];
  actions?: React.ReactNode;
  headingLevel?: 1 | 2;
}

export function CollectionHeader({
  title,
  subtitle,
  description,
  image,
  icon,
  gradient,
  tracks,
  actions,
  headingLevel = 1,
}: CollectionHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const player = usePlayer();
  const safeImage = sanitizeUrl(image);
  const isThisPlaying =
    player.isPlaying && tracks.some((t) => t.id === player.current?.id);

  const handlePlay = () => {
    if (tracks.length === 0) return;
    if (isThisPlaying) {
      player.togglePlay();
    } else if (tracks.some((t) => t.id === player.current?.id)) {
      player.togglePlay();
    } else {
      player.playQueue(tracks, 0);
    }
  };

  return (
    <div>
      <div
        className="flex flex-col sm:flex-row items-center sm:items-end gap-5 p-6 pt-10"
        style={{
          background: gradient ?? "linear-gradient(to bottom, hsl(var(--muted)), transparent)",
        }}
      >
        <div className="size-44 rounded-md shadow-2xl overflow-hidden shrink-0 bg-black/20 flex items-center justify-center">
          {safeImage ? (
            <img src={safeImage} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            icon
          )}
        </div>
        <div className="text-center sm:text-left min-w-0">
          {subtitle && <p className="text-sm font-semibold uppercase tracking-wide">{subtitle}</p>}
          <Heading className="text-4xl sm:text-6xl font-extrabold tracking-tight break-words my-2">
            {title}
          </Heading>
          {description && <p className="text-muted-foreground mt-1 line-clamp-2">{description}</p>}
          <p className="text-sm text-muted-foreground mt-2">{tracks.length} tracks</p>
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-4">
        <Button
          onClick={handlePlay}
          disabled={tracks.length === 0}
          size="icon"
          className={cn(
            "size-14 rounded-full bg-primary text-primary-foreground shadow-xl",
            "hover:scale-105 transition-transform disabled:opacity-40",
          )}
          aria-label={isThisPlaying ? "Pause" : "Play"}
        >
          {isThisPlaying ? (
            <Pause className="size-7 fill-current" />
          ) : (
            <Play className="size-7 fill-current ml-0.5" />
          )}
        </Button>
        {actions}
      </div>
    </div>
  );
}
