import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/music";
import { usePlayer } from "@/hooks/usePlayer";

interface CollectionHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  icon?: React.ReactNode;
  gradient?: string;
  tracks: Track[];
  actions?: React.ReactNode;
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
}: CollectionHeaderProps) {
  const player = usePlayer();
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
          {image ? (
            <img src={image} alt="" className="w-full h-full object-cover" />
          ) : (
            icon
          )}
        </div>
        <div className="text-center sm:text-left min-w-0">
          {subtitle && <p className="text-sm font-semibold uppercase tracking-wide">{subtitle}</p>}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight break-words my-2">
            {title}
          </h1>
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
