import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Volume1,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/usePlayer";
import { formatDuration } from "@/lib/music";
import { TrackArtwork } from "./TrackArtwork";
import { LikeButton } from "./LikeButton";
import { ArtistLink } from "./ArtistLink";

export function PlayerBar() {
  const player = usePlayer();
  const { current } = player;

  const VolumeIcon = player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="h-20 shrink-0 border-t border-border bg-card px-3 sm:px-4 flex items-center gap-3">
      {/* Track info */}
      <div className="flex items-center gap-3 min-w-0 w-[30%] max-w-xs">
        {current ? (
          <>
            <TrackArtwork track={current} className="w-14 h-14" />
            <div className="min-w-0 hidden sm:block">
              <div className="truncate font-medium text-sm">{current.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                <ArtistLink pubkey={current.pubkey} artistId={current.artistId} fallbackName={current.artist} />
              </div>
            </div>
            <div className="hidden sm:block">
              <LikeButton trackId={current.id} size={16} />
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground hidden sm:block">Nothing playing</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={player.toggleShuffle}
            aria-label="Shuffle"
            aria-pressed={player.shuffle}
            className={cn("rounded-full size-8 hidden sm:inline-flex", player.shuffle ? "text-primary" : "text-muted-foreground")}
          >
            <Shuffle className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.previous}
            disabled={!current}
            aria-label="Previous"
            className="rounded-full size-8 text-muted-foreground hover:text-foreground"
          >
            <SkipBack className="size-5 fill-current" />
          </Button>
          <Button
            onClick={player.togglePlay}
            disabled={!current}
            aria-label={player.isPlaying ? "Pause" : "Play"}
            className="rounded-full size-10 bg-foreground text-background hover:bg-foreground hover:scale-105 transition-transform disabled:opacity-40"
          >
            {player.isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current ml-0.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.next}
            disabled={!current}
            aria-label="Next"
            className="rounded-full size-8 text-muted-foreground hover:text-foreground"
          >
            <SkipForward className="size-5 fill-current" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.cycleRepeat}
            aria-label={`Repeat: ${player.repeat}`}
            className={cn("rounded-full size-8 hidden sm:inline-flex", player.repeat !== "off" ? "text-primary" : "text-muted-foreground")}
          >
            {player.repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
          </Button>
        </div>

        {/* Seek bar */}
        <div className="flex items-center gap-2 w-full max-w-xl">
          <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
            {formatDuration(player.progress)}
          </span>
          <Slider
            value={[player.duration ? (player.progress / player.duration) * 100 : 0]}
            max={100}
            step={0.1}
            onValueChange={([v]) => {
              if (player.duration) player.seek((v / 100) * player.duration);
            }}
            aria-label="Seek"
            className="flex-1"
          />
          <span className="text-[11px] text-muted-foreground tabular-nums w-10">
            {formatDuration(player.duration)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="hidden md:flex items-center gap-2 w-[20%] max-w-[12rem] justify-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={player.toggleMute}
          aria-label={player.muted ? "Unmute" : "Mute"}
          className="rounded-full size-8 text-muted-foreground hover:text-foreground"
        >
          <VolumeIcon className="size-4" />
        </Button>
        <Slider
          value={[player.muted ? 0 : player.volume * 100]}
          max={100}
          onValueChange={([v]) => player.setVolume(v / 100)}
          aria-label="Volume"
          className="w-24"
        />
      </div>
    </footer>
  );
}
