import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Hls from 'hls.js';
import { Maximize2, Minimize2, PictureInPicture2, X } from 'lucide-react';
import type { TunestrStream } from '@/hooks/useTunestrStreams';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { N94StreamPlayer } from '@/components/music/N94StreamPlayer';

interface TunestrPlayerContextValue {
  openStream: (stream: TunestrStream) => void;
}

const TunestrPlayerContext = createContext<TunestrPlayerContextValue | null>(null);

export function TunestrPlayerProvider({ children }: { children: ReactNode }) {
  const [stream, setStream] = useState<TunestrStream | null>(null);
  const [docked, setDocked] = useState(false);

  return <TunestrPlayerContext.Provider value={{ openStream: nextStream => { setStream(nextStream); setDocked(false); } }}>
    {children}
    {stream && <TunestrVideoPlayer
      stream={stream}
      docked={docked}
      onDock={() => setDocked(true)}
      onRestore={() => setDocked(false)}
      onClose={() => { setDocked(false); setStream(null); }}
    />}
  </TunestrPlayerContext.Provider>;
}

export function useTunestrPlayer() {
  const context = useContext(TunestrPlayerContext);
  if (!context) throw new Error('useTunestrPlayer must be used within TunestrPlayerProvider');
  return context;
}

function isHlsManifest(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return false;
  }
}

function TunestrVideoPlayer({ stream, docked, onDock, onRestore, onClose }: {
  stream: TunestrStream;
  docked: boolean;
  onDock: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const playerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failedStream, setFailedStream] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const failed = failedStream === stream.id;
  const hlsManifest = stream.format === 'nip53' && isHlsManifest(stream.externalUrl);

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!hlsManifest || stream.format !== 'nip53' || failedStream === stream.id) return;
    const video = videoRef.current;
    if (!video) return;

    setFailedStream(null);
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = stream.externalUrl;
      return () => { video.pause(); video.removeAttribute('src'); video.load(); };
    }
    if (!Hls.isSupported()) {
      setFailedStream(stream.id);
      return;
    }

    const hls = new Hls({ enableWorker: false, lowLatencyMode: true });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) setFailedStream(stream.id);
    });
    hls.loadSource(stream.externalUrl);
    hls.attachMedia(video);
    return () => { hls.destroy(); video.pause(); video.removeAttribute('src'); video.load(); };
  }, [failedStream, hlsManifest, stream.externalUrl, stream.format, stream.id]);

  const closePlayer = () => {
    if (document.fullscreenElement === playerRef.current) void document.exitFullscreen().catch(() => {});
    onClose();
  };

  const toggleFullscreen = () => {
    const player = playerRef.current;
    if (!player) return;
    if (document.fullscreenElement === player) void document.exitFullscreen().catch(() => {});
    else void player.requestFullscreen().catch(() => {});
  };

  const controls = <div className="flex shrink-0 items-center gap-1">
    {docked
      ? <Button type="button" variant="ghost" size="icon" aria-label="Restore player" title="Restore player" onClick={onRestore}><Maximize2 className="size-4" /></Button>
      : <Button type="button" variant="ghost" size="icon" aria-label="Picture in picture" title="Picture in picture" onClick={onDock}><PictureInPicture2 className="size-4" /></Button>}
    <Button type="button" variant="ghost" size="icon" aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
    <Button type="button" variant="ghost" size="icon" aria-label="Close player" title="Close player" onClick={closePlayer}><X className="size-4" /></Button>
  </div>;

  return <Dialog open modal={!docked}       onOpenChange={open => { if (!open) closePlayer(); }}>

    <DialogContent
      className={docked
        ? '!fixed !left-auto !top-auto !right-3 !bottom-[calc(6rem+env(safe-area-inset-bottom))] !z-[60] !w-[min(420px,calc(100vw-1.5rem))] !max-w-none !translate-x-0 !translate-y-0 !gap-0 !overflow-hidden !rounded-2xl !border-border/80 !bg-card !p-0 !shadow-2xl sm:!right-5 sm:!bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:!max-w-none'
        : 'max-w-4xl overflow-hidden p-0'}
      showOverlay={!docked}
      showPortal
      showCloseButton={false}
      onEscapeKeyDown={event => { if (docked) event.preventDefault(); }}
      onInteractOutside={event => { if (docked) event.preventDefault(); }}
    >
      <div ref={playerRef} className={docked ? 'overflow-hidden rounded-2xl bg-card' : 'overflow-hidden bg-background'}>
        <div className={docked ? 'flex min-h-14 items-center justify-between gap-3 border-b border-border/60 bg-card/95 px-3 py-2' : 'flex items-start justify-between gap-3 p-5 pb-0 pr-4'}>
          <div className="min-w-0 flex-1">
            {docked
              ? <>
                <DialogTitle className="sr-only">{stream.title || 'TuneStr stream'}</DialogTitle>
                <DialogDescription className="sr-only">{stream.summary || 'TuneStr video stream on Nostr.'}</DialogDescription>
                <p className="truncate text-sm font-semibold leading-5">{stream.title || 'TuneStr stream'}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {stream.isLive && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /></span>}
                  <span>{stream.isLive ? 'LIVE' : 'Recording'}</span>
                  <span aria-hidden="true">·</span>
                  <span>TuneStr</span>
                </div>
              </>
              : <DialogHeader className="min-w-0"><DialogTitle className="truncate">{stream.title || 'TuneStr stream'}</DialogTitle><DialogDescription className="line-clamp-2">{stream.summary || 'TuneStr video stream on Nostr.'}</DialogDescription></DialogHeader>}
          </div>
          {controls}
        </div>
        {failed
          ? <div className="aspect-video w-full bg-black p-6 text-sm text-white">This stream could not be played in this browser. You can still open the original stream source below.</div>
          : stream.format === 'n94' && stream.event && stream.variant
            ? <N94StreamPlayer key={stream.id} event={stream.event} variant={stream.variant} />
            : hlsManifest
              ? <video
                key={stream.id}
                ref={videoRef}
                controls
                playsInline
                autoPlay
                className="aspect-video w-full bg-black"
                aria-label={stream.title}
                onError={() => setFailedStream(stream.id)}
              />
              : <iframe
                key={stream.id}
                src={stream.url}
                title={stream.title}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; fullscreen"
                allowFullScreen
                className="aspect-video w-full border-0 bg-black"
                onError={() => setFailedStream(stream.id)}
              />}
        {!docked && <div className="p-4 pt-0"><a href={stream.externalUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">Open raw stream source</a>{hlsManifest && <span className="ml-2 text-xs text-muted-foreground">HLS video stream · use the player controls to start or pause.</span>}</div>}
      </div>
    </DialogContent>
  </Dialog>;
}

