import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Hls from 'hls.js';
import * as dashjs from 'dashjs';
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
      key={stream.id}
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

type SourceFormat = 'hls' | 'dash' | 'media' | 'embed';

function sameOriginMediaUrl(url: string): string {
  const proxyUrl = new URL('/api/tunestr/media', window.location.origin);
  proxyUrl.searchParams.set('url', url);
  return proxyUrl.href;
}

function sourceFormat(stream: TunestrStream): SourceFormat {
  // Preserve provider player pages (for example Cloudflare Stream's /iframe)
  // even when their original URL was an HLS manifest.
  if (stream.url !== stream.externalUrl) return 'embed';
  try {
    const path = new URL(stream.externalUrl).pathname.toLowerCase();
    if (/\.m3u8$/.test(path)) return 'hls';
    if (/\.mpd$/.test(path)) return 'dash';
    if (/\.(mp4|m4v|webm|ogv|mov|mp3|m4a|aac|oga|wav|ts)$/.test(path)) return 'media';
  } catch {
    return 'embed';
  }
  // Keep non-media endpoints and provider pages in the iframe path that has
  // historically worked for streams which publish an embeddable URL.
  return 'embed';
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
  const format = sourceFormat(stream);

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (failedStream === stream.id) return;
    const video = videoRef.current;
    if (!video) return;

    if (format === 'embed') return;
    setFailedStream(null);

    const mediaUrl = format === 'hls' ? sameOriginMediaUrl(stream.externalUrl) : stream.externalUrl;

    if (format === 'hls') {
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = mediaUrl;
          void video.play().catch(() => {});
          return () => { video.pause(); video.removeAttribute('src'); video.load(); };
        }
        setFailedStream(stream.id);
        return;
      }

      const hls = new Hls({ enableWorker: false, lowLatencyMode: true });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setFailedStream(stream.id);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { void video.play().catch(() => {}); });
      hls.loadSource(mediaUrl);
      hls.attachMedia(video);
      return () => { hls.destroy(); video.pause(); video.removeAttribute('src'); video.load(); };
    }

    if (format === 'dash') {
      const player = dashjs.MediaPlayer().create();
      player.initialize(video, mediaUrl, true);
      player.on(dashjs.MediaPlayer.events.ERROR, () => setFailedStream(stream.id));
      return () => { player.reset(); video.pause(); video.removeAttribute('src'); video.load(); };
    }

    video.src = mediaUrl;
    void video.play().catch(() => {});
    return () => { video.pause(); video.removeAttribute('src'); video.load(); };
  }, [failedStream, format, stream.externalUrl, stream.id]);

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
        {stream.format === 'n94' && stream.event && stream.variant
          ? <N94StreamPlayer key={stream.id} event={stream.event} variant={stream.variant} />
          : format === 'embed'
            ? <iframe
              key={stream.id}
              src={stream.url}
              title={stream.title}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full border-0 bg-black"
            />
            : <div className="relative aspect-video w-full bg-black">
              <video
                key={stream.id}
                ref={videoRef}
                controls
                playsInline
                autoPlay
                preload="metadata"
                className="size-full"
                aria-label={stream.title}
                onError={() => setFailedStream(stream.id)}
              />
              {failed && <div role="status" className="absolute inset-x-0 bottom-12 mx-3 rounded-lg bg-black/85 p-3 text-sm text-white">Could not fetch this stream. Confirm Ostrify’s Cloudflare Worker is deployed with the media relay, and that this stream host is supported. You can still open the original source below.</div>}
            </div>}
        {!docked && <div className="p-4 pt-0"><a href={stream.externalUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">Open original source</a><span className="ml-2 text-xs text-muted-foreground">{format === 'embed' ? 'Embedded player' : format === 'hls' ? 'HLS stream' : format === 'dash' ? 'DASH stream' : 'Direct media stream'}</span></div>}
      </div>
    </DialogContent>
  </Dialog>;
}

