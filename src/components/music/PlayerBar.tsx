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
  AudioLines,
  Heart,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/usePlayer";
import { useDecember } from "@/hooks/useDecember";
import { useOctober } from "@/hooks/useOctober";
import { useValentines } from "@/hooks/useValentines";
import { formatDuration, fountainShowGuid, type Track } from "@/lib/music";
import { TrackArtwork } from "./TrackArtwork";
import { LikeButton } from "./LikeButton";
import { ArtistLink } from "./ArtistLink";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { QueuePanelButton } from "./QueuePanel";
import { ShareTrackButton } from "./ShareTrackButton";
import { audioDetailPath } from "@/lib/audioDetail";
import { PlayerZapButton } from "./PlayerZapButton";
import { RadioFavoriteButton } from "./NowPlaying";

// This one-time Thanksgiving surprise ends at midnight on November 28, 2026,
// according to the listener's local clock (including when the app stays open).
function isThanksgivingPlayIcon() {
  const now = new Date();
  return now.getFullYear() === 2026 && now.getMonth() === 10 && now.getDate() <= 27;
}

function SeasonalPlayIcon() {
  const isDecember = useDecember();
  const isOctober = useOctober();
  const isValentines = useValentines();
  const [showTurkey, setShowTurkey] = useState(isThanksgivingPlayIcon);

  useEffect(() => {
    const update = () => setShowTurkey(isThanksgivingPlayIcon());
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  if (isOctober) return <img src="/images/october-player-pumpkin.webp" alt="" aria-hidden="true" className="october-player-pumpkin pointer-events-none size-16 shrink-0 object-contain" />;
  if (isDecember || isValentines) return <Play className="size-5 fill-current ml-0.5" aria-hidden="true" />;
  return showTurkey
    ? <img src="/images/turkey-silhouette.png" alt="" aria-hidden="true" className="size-8 shrink-0 scale-[3.3] object-contain mix-blend-multiply" />
    : <Play className="size-5 fill-current ml-0.5" aria-hidden="true" />;
}

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

export function PlayerBar({ onQueueToggle, queueOpen = false, nowPlayingOpen, onNowPlayingToggle, videoExpanded = false }: { onQueueToggle: () => void; queueOpen?: boolean; nowPlayingOpen: boolean; onNowPlayingToggle: () => void; videoExpanded?: boolean }) {
  const player = usePlayer();
  const isValentines = useValentines();
  const { current } = player;
  const isRadio = current?.source === 'radio-browser';
  const canGoNext = !isRadio && !!current && (player.index < player.queue.length - 1 || player.repeat === "all" || (player.shuffle && player.queue.length > 1));

  const VolumeIcon = player.muted || player.volume === 0 ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="ostrify-player relative flex h-28 shrink-0 flex-col justify-center gap-1 border-t px-3 py-2 sm:h-24 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-0">
      {/* Track identity and compact mobile actions */}
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-[30%] sm:max-w-xs sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {current ? (
            <>
              <TrackArtwork track={current} className="size-10 shrink-0 sm:size-14" />
              <div className="min-w-0 flex-1 overflow-hidden">
                <span className="mb-1 hidden text-[10px] font-bold uppercase tracking-[0.16em] text-brand-violet sm:block">{player.videoActive ? "Audio paused · video open" : player.isPlaying ? "Now playing" : "Ready to play"}</span>
                <Link to={isRadio ? '/radio' : audioDetailPath(current)} className="block min-w-0 truncate text-ellipsis text-xs font-medium hover:underline sm:text-sm" aria-label={isRadio ? `Radio: ${current.title}` : `View details for ${current.title}`} title={current.title}>{current.title}</Link>
                <div className="truncate text-[11px] text-muted-foreground sm:text-xs">
                  {player.playbackError ? <span role="status" className="text-destructive" title={player.playbackError}>{player.playbackError}</span> : isRadio ? <span>{current.artist || 'Live radio'}</span> : current.kind === "podcast" ? <PodcastShowLink track={current} /> : <ArtistLink pubkey={current.pubkey} artistId={current.artistId} artistPubkey={current.artistPubkey} fallbackName={current.artist} isUnverifiedArtist={!!current.event && !!current.artist} />}
                </div>
              </div>
              {isRadio && <RadioFavoriteButton track={current} className="shrink-0" />}
              {current.kind === 'music' && current.source !== 'tunestr' && !isRadio && <div className="hidden sm:flex items-center">
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
        {current && <PlayerZapButton key={current.id} track={current} />}
        <div className="flex shrink-0 items-center gap-1 sm:hidden">
          <Button variant="ghost" size="icon" onClick={onNowPlayingToggle} disabled={!current || videoExpanded} aria-label={nowPlayingOpen ? "Close listening room" : "Open listening room"} aria-pressed={nowPlayingOpen} title="Listening room" className={cn("size-8 rounded-full", nowPlayingOpen ? "text-primary" : "text-muted-foreground")}><AudioLines className="size-4" /></Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.cycleShuffleAutoplay}
            disabled={isRadio || player.videoActive}
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
            disabled={isRadio || player.videoActive}
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

      {player.videoActive && <span role="status" className="sr-only">Audio playback is paused while a video is open. Close the video to resume audio.</span>}
      {/* Controls */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-row items-center gap-2 sm:flex-col sm:items-center sm:gap-1">
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={player.cycleShuffleAutoplay}
            disabled={isRadio || player.videoActive}
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
            disabled={!current || isRadio || player.videoActive}
            aria-label="Previous"
            className="rounded-full size-10 text-muted-foreground hover:text-foreground sm:size-8"
          >
            <SkipBack className="size-5 fill-current" />
          </Button>
          <span className={cn("player-play-ring", player.isPlaying && "player-play-ring-active")}>
            <Button
              onClick={player.togglePlay}
              disabled={!current || player.videoActive}
              title={player.videoActive ? "Close the video player to resume audio" : undefined}
              aria-label={player.isPlaying ? "Pause" : "Play"}
              className="player-play-button relative z-10 size-10 rounded-full bg-foreground text-background hover:bg-foreground motion-safe:transition-transform motion-safe:hover:scale-105 disabled:opacity-40 sm:size-10"
            >
              {isValentines && <>
                <Heart aria-hidden="true" className="valentines-player-fill pointer-events-none absolute inset-0 size-full" />
                <img src="/images/valentines-heart.webp" alt="" aria-hidden="true" className="valentines-player-heart pointer-events-none absolute inset-0 size-full object-contain" />
              </>}
              {player.isPlaying ? <Pause className="size-5 fill-current" /> : <SeasonalPlayIcon />}
            </Button>
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={player.next}
            disabled={!canGoNext || player.videoActive}
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
            disabled={isRadio || player.videoActive}
            aria-label={`Repeat: ${player.repeat}`}
            className={cn("rounded-full size-8 hidden sm:inline-flex", player.repeat !== "off" ? "text-primary" : "text-muted-foreground")}
          >
            {player.repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
          </Button>
        </div>

        {/* Seek bar */}
        {isRadio ? <div className="flex w-full max-w-xl items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><span className="size-2 rounded-full bg-red-500" /> Live radio</div> : <div className="flex items-center gap-2 w-full max-w-xl">
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
            disabled={player.videoActive}
            className="flex-1"
          />
          <span className="text-[11px] text-muted-foreground tabular-nums w-10">
            {formatDuration(player.duration)}
          </span>
        </div>}
      </div>

      {/* Queue and volume */}
      <div className="hidden shrink-0 items-center gap-1 sm:flex sm:gap-2 md:w-[20%] md:max-w-[12rem] md:justify-end">
        <Button variant="ghost" size="icon" onClick={onNowPlayingToggle} disabled={!current || videoExpanded} aria-label={nowPlayingOpen ? "Close listening room" : "Open listening room"} aria-pressed={nowPlayingOpen} title="Listening room" className={cn("size-8 rounded-full", nowPlayingOpen ? "text-primary" : "text-muted-foreground")}><AudioLines className="size-4" /></Button>
        <ShareTrackButton track={current} />
        <QueuePanelButton queueLength={player.index >= 0 ? player.queue.length - player.index - 1 : player.queue.length} open={queueOpen} onClick={onQueueToggle} />
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={player.toggleMute}
            aria-label={player.muted ? "Unmute" : "Mute"}
            title="Mute or unmute Ostrify audio and supported video"
            className="rounded-full size-8 text-muted-foreground hover:text-foreground"
          >
            <VolumeIcon className="size-4" />
          </Button>
          <Slider
            value={[player.muted ? 0 : player.volume * 100]}
            max={100}
            onValueChange={([v]) => player.setVolume(v / 100)}
            aria-label="Global volume"
            className="w-24"
          />
        </div>
      </div>
    </footer>
  );
}
