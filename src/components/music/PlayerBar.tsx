import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Sparkles,
  Volume2,
  Volume1,
  VolumeX,
} from "lucide-react";
import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/usePlayer";
import { formatDuration, fountainShowGuid, type Track } from "@/lib/music";
import { TrackArtwork } from "./TrackArtwork";
import { LikeButton } from "./LikeButton";
import { ArtistLink } from "./ArtistLink";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { QueuePanelButton } from "./QueuePanel";
import { ShareTrackButton } from "./ShareTrackButton";
import { audioDetailPath } from "@/lib/audioDetail";

function PodcastShowLink({ track }: { track: Track }) {
  const fountainGuid = fountainShowGuid(track.showId);
  const podcastIndexShowId = track.showId && /^podcast-index:\d{1,12}$/.test(track.showId) ? track.showId : undefined;
  let to: string;

  if (fountainGuid) {
    to = `/podcasts/fountain/${encodeURIComponent(fountainGuid)}`;
  } else if (podcastIndexShowId) {
    to = `/podcasts?source=directory&show=${encodeURIComponent(podcastIndexShowId)}`;
  } else {
    try {
      to = track.pubkey ? `/${nip19.npubEncode(track.pubkey)}` : "/podcasts";
    } catch {
      to = "/podcasts";
    }
  }

  return <Link to={to} className="hover:text-foreground hover:underline focus-visible:underline" title="Open this podcast show">{track.artist || "Podcast show"}</Link>;
}

export function PlayerBar({ onQueueToggle, queueOpen = false }: { onQueueToggle: () => void; queueOpen?: boolean }) {
  const player = usePlayer();
  const { current } = player;
  const canGoNext = !!current && (player.index < player.queue.length - 1 || player.repeat === "all" || (player.shuffle && player.queue.length > 1));

  const VolumeIcon = player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="flex h-28 shrink-0 flex-col justify-center gap-1 border-t border-border bg-card px-3 py-2 sm:h-20 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-0">
      {/* Track identity and compact mobile actions */}
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-[30%] sm:max-w-xs sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {current ? (
            <>
              <TrackArtwork track={current} className="size-10 shrink-0 sm:size-14" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <Link to={audioDetailPath(current)} className="block min-w-0 truncate text-ellipsis text-xs font-medium hover:underline sm:text-sm" aria-label={`View details for ${current.title}`} title={current.title}>{current.title}</Link>
                <div className="truncate text-[11px] text-muted-foreground sm:text-xs">
                  {player.playbackError ? <span role="status" className="text-destructive" title={player.playbackError}>{player.playbackError}</span> : current.kind === "podcast" ? <PodcastShowLink track={current} /> : <ArtistLink pubkey={current.pubkey} artistId={current.artistId} artistPubkey={current.artistPubkey} fallbackName={current.artist} isUnverifiedArtist={!!current.event && !!current.artist} />}
                </div>
              </div>
              {current.kind === 'music' && current.source !== 'tunestr' && <div className="hidden sm:flex items-center">
                <LikeButton trackId={current.id} size={16} />
              </div>}
              {current.source !== 'librivox' && current.source !== 'fountain' && current.kind === 'podcast' && <div className="hidden sm:flex items-center">
                <LikeButton trackId={current.id} size={16} />
                <AddToPlaylistMenu trackId={current.id} />
              </div>}
            </>
          ) : (
            <div className="text-xs text-muted-foreground sm:text-sm">Nothing playing</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={player.cycleShuffleAutoplay}
            aria-label={player.shuffle ? "Shuffle on" : player.autoplay ? "Autoplay similar music on" : "Shuffle and autoplay off"}
            aria-pressed={player.shuffle || player.autoplay}
            title={player.shuffle ? "Shuffle on — click for autoplay" : player.autoplay ? "Autoplay on — click to turn off" : "Shuffle and autoplay off — click to shuffle"}
            className={cn("size-8 rounded-full", player.shuffle || player.autoplay ? "text-primary" : "text-muted-foreground")}
          >
            {player.autoplay ? <Sparkles className="size-4" /> : <Shuffle className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.cycleRepeat}
            aria-label={`Repeat: ${player.repeat}`}
            aria-pressed={player.repeat !== "off"}
            title={player.repeat === "off" ? "Repeat off — click to repeat queue" : player.repeat === "all" ? "Repeat queue — click to repeat current track" : "Repeat current track — click to turn off"}
            className={cn("size-8 rounded-full", player.repeat !== "off" ? "text-primary" : "text-muted-foreground")}
          >
            {player.repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
          </Button>
          <ShareTrackButton track={current} />
          <QueuePanelButton queueLength={player.index >= 0 ? player.queue.length - player.index - 1 : player.queue.length} open={queueOpen} onClick={onQueueToggle} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-row items-center gap-2 sm:flex-col sm:items-center sm:gap-1">
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={player.cycleShuffleAutoplay}
            aria-label={player.shuffle ? "Shuffle on" : player.autoplay ? "Autoplay similar music on" : "Shuffle and autoplay off"}
            aria-pressed={player.shuffle || player.autoplay}
            title={player.shuffle ? "Shuffle on — click for autoplay" : player.autoplay ? "Autoplay on — click to turn off" : "Shuffle and autoplay off — click to shuffle"}
            className={cn("rounded-full size-8 hidden sm:inline-flex", player.shuffle || player.autoplay ? "text-primary" : "text-muted-foreground")}
          >
            {player.autoplay ? <Sparkles className="size-4" /> : <Shuffle className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.previous}
            disabled={!current}
            aria-label="Previous"
            className="rounded-full size-10 text-muted-foreground hover:text-foreground sm:size-8"
          >
            <SkipBack className="size-5 fill-current" />
          </Button>
          <Button
            onClick={player.togglePlay}
            disabled={!current}
            aria-label={player.isPlaying ? "Pause" : "Play"}
            className="rounded-full size-10 bg-foreground text-background hover:bg-foreground hover:scale-105 transition-transform disabled:opacity-40 sm:size-10"
          >
            {player.isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current ml-0.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.next}
            disabled={!canGoNext}
            aria-label="Next"
            title={canGoNext ? "Next track" : player.autoplay && current?.kind === "music" ? "Similar music can start automatically when this track ends" : "No next track in the queue"}
            className="rounded-full size-10 text-muted-foreground hover:text-foreground sm:size-8"
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

      {/* Queue and volume */}
      <div className="hidden shrink-0 items-center gap-1 sm:flex sm:gap-2 md:w-[20%] md:max-w-[12rem] md:justify-end">
        <ShareTrackButton track={current} />
        <QueuePanelButton queueLength={player.index >= 0 ? player.queue.length - player.index - 1 : player.queue.length} open={queueOpen} onClick={onQueueToggle} />
        <div className="hidden md:flex items-center gap-2">
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
      </div>
    </footer>
  );
}
