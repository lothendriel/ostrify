import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Maximize2, PictureInPicture2, ShieldAlert, X } from 'lucide-react';
import type { TunestrStream } from '@/hooks/useTunestrStreams';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { classifyStreamPlayback, sanitizeUrl } from '@/lib/sanitize';

const N94StreamPlayer = lazy(() => import('@/components/music/N94StreamPlayer').then(module => ({ default: module.N94StreamPlayer })));

type PlayerSize = 'small' | 'medium' | 'large';

interface TunestrPlayerContextValue {
  openStream: (stream: TunestrStream) => void;
  setContentPane: (element: HTMLDivElement | null) => void;
  expanded: boolean;
}

const TunestrPlayerContext = createContext<TunestrPlayerContextValue | null>(null);

export function TunestrPlayerProvider({ children }: { children: ReactNode }) {
  const [stream, setStream] = useState<TunestrStream | null>(null);
  const [docked, setDocked] = useState(true);
  const [size, setSize] = useState<PlayerSize>('small');
  const [contentPane, setContentPane] = useState<HTMLDivElement | null>(null);

  const player = stream && <TunestrVideoPlayer
    key={stream.id}
    stream={stream}
    docked={docked}
    size={size}
    onSizeChange={setSize}
    onDock={() => setDocked(true)}
    onRestore={() => setDocked(false)}
    onClose={() => { setDocked(true); setStream(null); }}
  />;

  return <TunestrPlayerContext.Provider value={{ openStream: nextStream => { setStream(nextStream); setSize('small'); setDocked(true); }, setContentPane, expanded: !!stream && !docked }}>
    {children}
    {contentPane ? createPortal(player, contentPane) : player}
  </TunestrPlayerContext.Provider>;
}

export function useTunestrPlayer() {
  const context = useContext(TunestrPlayerContext);
  if (!context) throw new Error('useTunestrPlayer must be used within TunestrPlayerProvider');
  return context;
}

function TunestrVideoSurface({ stream }: { stream: TunestrStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const source = classifyStreamPlayback(stream.url);
  const sourceType = source.type;
  const sourceUrl = source.type === 'unsupported' ? undefined : source.url;
  const externalUrl = sanitizeUrl(stream.externalUrl);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || sourceType !== 'hls' || !sourceUrl) return;
    setError(null);

    // Prefer hls.js when MSE is available; some browsers claim native HLS
    // support but cannot decode every live playlist. Safari falls back to native.
    let disposed = false;
    let player: import('hls.js').default | undefined;
    void import('hls.js').then(({ default: Hls }) => {
      if (disposed) return;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = sourceUrl;
        else setError('This browser does not support HLS video playback. Open the stream source in a new tab.');
        return;
      }
      player = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        // HLS manifests can reference other resources; only request HTTPS URLs.
        xhrSetup: (xhr, url) => {
          const safe = sanitizeUrl(url);
          // Throwing alone is insufficient: hls.js retries setup after opening
          // the request. Abort it explicitly and do not throw on the retry.
          if (!safe) {
            xhr.abort();
            if (!disposed) setError('This stream referenced an unsafe URL and was blocked.');
            return;
          }
          xhr.open('GET', safe, true);
          xhr.withCredentials = false;
        },
        fetchSetup: (context, init) => {
          const safe = sanitizeUrl(context.url);
          if (!safe) throw new Error('The stream referenced an unsafe URL.');
          return new Request(safe, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' });
        },
      });
      player.loadSource(sourceUrl);
      player.attachMedia(video);
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || disposed) return;
        setError('The live stream could not be loaded. Please try opening the stream source directly.');
        player?.destroy();
      });
    }).catch(() => { if (!disposed) setError('The HLS player could not be loaded. Open the stream source in a new tab.'); });
    return () => { disposed = true; player?.destroy(); video.pause(); video.removeAttribute('src'); video.load(); };
  }, [sourceType, sourceUrl, stream.id]);

  if (source.type === 'embed') return <iframe
    key={stream.id}
    src={source.url}
    title={stream.title}
    sandbox="allow-scripts allow-same-origin"
    referrerPolicy="no-referrer"
    allow="autoplay; fullscreen; picture-in-picture"
    allowFullScreen
    className="aspect-video w-full border-0 bg-black"
  />;

  if (source.type === 'unsupported') return <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
    <ShieldAlert className="size-8 text-white/70" aria-hidden="true" />
    <p className="font-semibold">This source can’t be embedded safely</p>
    <p className="max-w-md text-sm text-white/75">{externalUrl ? 'Open the publisher’s site only if you trust it. External sites are not controlled by Ostrify.' : 'No valid HTTPS source is available for this stream.'}</p>
    {externalUrl && <><p className="max-w-full break-all text-xs text-white/75">Source: {new URL(externalUrl).hostname}</p><Button asChild variant="secondary" className="rounded-full"><a href={externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4 shrink-0" /> Open source in a new tab</a></Button></>}
  </div>;

  return <div className="relative aspect-video w-full bg-black">
    <video ref={videoRef} src={source.type === 'video' ? source.url : undefined} controls autoPlay playsInline crossOrigin="anonymous" className="size-full" aria-label={stream.title} onError={() => setError('This video could not be loaded. Check the source or try again.')} />
    {error && <div role="status" className="absolute inset-x-3 bottom-14 rounded-lg bg-black/80 p-3 text-sm text-white">{error}</div>}
  </div>;
}

function TunestrVideoPlayer({ stream, docked, size, onSizeChange, onDock, onRestore, onClose }: {
  stream: TunestrStream;
  docked: boolean;
  size: PlayerSize;
  onSizeChange: (size: PlayerSize) => void;
  onDock: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const sourceUrl = sanitizeUrl(stream.externalUrl);
  const hasEmbeddedPlayer = stream.format === 'n94' && !!stream.event && !!stream.variant || classifyStreamPlayback(stream.url).type !== 'unsupported';
  const widths = {
    small: '!w-[min(320px,calc(100vw-1.5rem),calc(177.78dvh-21.34rem))]',
    medium: '!w-[min(420px,calc(100vw-1.5rem),calc(177.78dvh-21.34rem))]',
    large: '!w-[min(560px,calc(100vw-1.5rem),calc(177.78dvh-21.34rem))]',
  };

  // Keep the same non-modal dialog and video element mounted as the layout changes.
  // Recreating the dialog or video would interrupt live streams and embedded players.
  return <Dialog open modal={false} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent
      className={cn(
        '!z-[60] !max-w-none !gap-0 !overflow-hidden !border-border/80 !bg-card !p-0',
        docked
          ? cn('!fixed !left-auto !top-auto !right-3 !bottom-[calc(7.5rem+env(safe-area-inset-bottom))] !translate-x-0 !translate-y-0 !rounded-2xl !shadow-2xl sm:!right-5 sm:!bottom-[calc(6.5rem+env(safe-area-inset-bottom))]', widths[size])
          : '!absolute !inset-0 !h-full !w-full !translate-x-0 !translate-y-0 !rounded-none !border-0 !shadow-none',
      )}
      showPortal={false}
      showOverlay={false}
      showCloseButton={false}
      onEscapeKeyDown={event => { event.preventDefault(); if (!docked) onDock(); }}
      onInteractOutside={event => event.preventDefault()}
      onOpenAutoFocus={event => event.preventDefault()}
    >
      <div className={cn('overflow-hidden bg-card', !docked && 'flex h-full min-h-0 flex-col')}>
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-1 border-b border-border/60 bg-card px-2 py-2 sm:px-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold leading-5">{stream.title || 'TuneStr stream'}</DialogTitle>
            <DialogDescription className="sr-only">{stream.summary || 'TuneStr video stream on Nostr.'}</DialogDescription>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {stream.isLive && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /></span>}
              <span>{stream.isLive ? 'LIVE' : 'Recording'}</span>
              <span aria-hidden="true">·</span>
              <span>TuneStr</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div role="group" aria-label="Player size" className="flex items-center rounded-lg border border-border/70 bg-background/60 p-0.5">
              {(['small', 'medium', 'large'] as const).map(option => <button
                key={option}
                type="button"
                aria-label={`${option[0].toUpperCase()}${option.slice(1)} player`}
                aria-pressed={docked && size === option}
                title={`${option[0].toUpperCase()}${option.slice(1)} player`}
                onClick={() => { onSizeChange(option); onDock(); }}
                className={cn('flex size-7 items-center justify-center rounded-md text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary', docked && size === option && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground')}
              >{option[0].toUpperCase()}</button>)}
            </div>
            {docked
              ? <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Expand player" title="Expand player" onClick={onRestore}><Maximize2 className="size-4" /></Button>
              : <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Dock player" title="Dock player" onClick={onDock}><PictureInPicture2 className="size-4" /></Button>}
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label="Close player" title="Close player" onClick={onClose}><X className="size-4" /></Button>
          </div>
        </div>
        <div className={cn(!docked && 'flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black [&>div]:!h-full [&>div]:!w-full [&>div]:!aspect-auto [&>iframe]:!h-full [&>iframe]:!w-full [&>iframe]:!aspect-auto')}>
          {stream.format === 'n94' && stream.event && stream.variant
            ? <Suspense fallback={<div role="status" className="aspect-video w-full bg-black" aria-label="Loading TuneStr player" />}><N94StreamPlayer key={stream.id} event={stream.event} variant={stream.variant} /></Suspense>
            : <TunestrVideoSurface stream={stream} />}
        </div>
        {!docked && hasEmbeddedPlayer && sourceUrl && <div className="shrink-0 px-4 py-3"><a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">Open stream source</a></div>}
      </div>
    </DialogContent>
  </Dialog>;
}

