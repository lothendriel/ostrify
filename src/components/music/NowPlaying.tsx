import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { AudioLines, ChevronDown, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { usePlayer } from '@/hooks/usePlayer';
import { formatDuration, fountainShowGuid } from '@/lib/music';
import { audioDetailPath } from '@/lib/audioDetail';
import { sanitizeUrl } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { TrackArtwork } from './TrackArtwork';
import { ArtistLink } from './ArtistLink';
import { LikeButton } from './LikeButton';
import { ShareTrackButton } from './ShareTrackButton';
import { PlayerZapButton } from './PlayerZapButton';

type VisualiserStatus = 'loading' | 'active' | 'unavailable';

/** Analyse a separate, inaudible CORS-enabled copy; never route the real player through Web Audio. */
function Spectrum({ enabled, onStatus }: { enabled: boolean; onStatus: (status: VisualiserStatus) => void }) {
  const { current, getPlaybackElement } = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled || !current) return;
    const primary = getPlaybackElement();
    const canvas = canvasRef.current;
    // iOS can suspend the audible player when another media element starts.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isLiveRadio = current.source === 'radio-browser';
    if (!primary || !canvas || isIOS || typeof AudioContext === 'undefined') {
      onStatus('unavailable');
      return;
    }

    let disposed = false;
    let frame = 0;
    let sourceUrl = '';
    let lastSync = 0;
    let syncGeneration = 0;
    let failureTimer = 0;
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      const audioContext = context;
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      const silent = audioContext.createGain();
      silent.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silent);
      silent.connect(audioContext.destination);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      const draw = () => {
        if (disposed || primary.paused || document.hidden || reducedMotion.matches) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        analyser.getByteFrequencyData(values);
        const count = width < 500 ? 32 : 56;
        const gap = width < 500 ? 4 : 5;
        const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#42d77e');
        gradient.addColorStop(0.55, '#a4ed9a');
        gradient.addColorStop(1, '#c5abff');
        ctx.fillStyle = gradient;
        for (let i = 0; i < count; i++) {
          const start = Math.floor(Math.pow(i / count, 2) * (values.length - 1));
          const end = Math.max(start + 1, Math.floor(Math.pow((i + 1) / count, 2) * (values.length - 1)));
          let peak = 0;
          for (let j = start; j < end; j++) peak = Math.max(peak, values[j]);
          const barHeight = Math.max(3, (peak / 255) * (height - 4));
          ctx.globalAlpha = 0.62 + 0.38 * (peak / 255);
          ctx.fillRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight);
        }
        ctx.globalAlpha = 1;
        // A second live connection has its own timeline and cannot be sought to the
        // audible stream's currentTime. Its bars may lag or lead slightly.
        if (!isLiveRadio && performance.now() - lastSync > 2000) {
          lastSync = performance.now();
          if (Number.isFinite(primary.currentTime) && Math.abs(audio.currentTime - primary.currentTime) > 0.5) {
            try { audio.currentTime = primary.currentTime; } catch { /* Wait for metadata. */ }
          }
        }
        frame = requestAnimationFrame(draw);
      };
      const stop = () => {
        syncGeneration++;
        window.clearTimeout(failureTimer);
        cancelAnimationFrame(frame);
        audio.pause();
        if (isLiveRadio && sourceUrl) {
          // Disconnect the extra live stream when it is not being visualised.
          audio.removeAttribute('src');
          audio.load();
          sourceUrl = '';
        }
      };
      const sync = () => {
        stop();
        if (disposed || primary.paused || document.hidden || reducedMotion.matches) return;
        const nextUrl = sanitizeUrl(primary.currentSrc || primary.src || current.url);
        if (!nextUrl) { onStatus('unavailable'); return; }
        if (sourceUrl !== nextUrl) {
          sourceUrl = nextUrl;
          audio.src = nextUrl;
          audio.load();
          onStatus('loading');
        }
        audio.playbackRate = primary.playbackRate;
        if (!isLiveRadio && Number.isFinite(primary.currentTime)) {
          try { audio.currentTime = primary.currentTime; } catch { /* Retry after metadata. */ }
        }
        const generation = syncGeneration;
        failureTimer = window.setTimeout(() => {
          if (!disposed && generation === syncGeneration) { stop(); onStatus('unavailable'); }
        }, 15000);
        void audioContext.resume().then(() => {
          if (disposed || generation !== syncGeneration) return;
          return audio.play();
        }).then(() => {
          if (disposed || generation !== syncGeneration || primary.paused || document.hidden || reducedMotion.matches) return;
          window.clearTimeout(failureTimer);
          onStatus('active');
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(draw);
        }).catch(() => { if (!disposed && generation === syncGeneration) { stop(); onStatus('unavailable'); } });
      };
      const onError = () => { if (!disposed) { stop(); onStatus('unavailable'); } };
      const onMetadata = () => {
        if (!isLiveRadio && Number.isFinite(primary.currentTime)) {
          try { audio.currentTime = primary.currentTime; } catch { /* Source may not be seekable. */ }
        }
      };
      audio.addEventListener('error', onError);
      audio.addEventListener('loadedmetadata', onMetadata);
      primary.addEventListener('playing', sync);
      primary.addEventListener('pause', stop);
      primary.addEventListener('seeking', sync);
      primary.addEventListener('ratechange', sync);
      primary.addEventListener('loadeddata', sync);
      document.addEventListener('visibilitychange', sync);
      reducedMotion.addEventListener('change', sync);
      sync();
      return () => {
        disposed = true;
        stop();
        audio.removeEventListener('error', onError);
        audio.removeEventListener('loadedmetadata', onMetadata);
        primary.removeEventListener('playing', sync);
        primary.removeEventListener('pause', stop);
        primary.removeEventListener('seeking', sync);
        primary.removeEventListener('ratechange', sync);
        primary.removeEventListener('loadeddata', sync);
        document.removeEventListener('visibilitychange', sync);
        reducedMotion.removeEventListener('change', sync);
        audio.removeAttribute('src');
        audio.load();
        void audioContext.close();
      };
    } catch {
      if (context) void context.close();
      onStatus('unavailable');
    }
  }, [enabled, current?.id, current?.url, current?.source, getPlaybackElement, onStatus]);

  return <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />;
}

export function NowPlaying({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const player = usePlayer();
  const { current } = player;
  // Opening the listening room is the listener's opt-in for this session.
  const [status, setStatus] = useState<VisualiserStatus>('loading');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const isRadio = current?.source === 'radio-browser';
  const canNext = !isRadio && !!current && (player.index < player.queue.length - 1 || player.repeat === 'all' || (player.shuffle && player.queue.length > 1));
  const control = 'inline-flex size-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-300 disabled:opacity-30';

  const changeOpen = (value: boolean) => {
    if (!value) setStatus('loading');
    onOpenChange(value);
  };
  const closeOnNavigation = (event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('a') && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) changeOpen(false);
  };
  let podcastShowPath = '/podcasts';
  if (current?.kind === 'podcast') {
    const guid = fountainShowGuid(current.showId);
    if (guid) podcastShowPath = `/podcasts/fountain/${encodeURIComponent(guid)}`;
    else if (current.showId && /^podcast-index:\d{1,12}$/.test(current.showId)) podcastShowPath = `/podcasts?source=directory&show=${encodeURIComponent(current.showId)}`;
    else if (current.pubkey) {
      try { podcastShowPath = `/${nip19.npubEncode(current.pubkey)}`; } catch { /* Keep the podcast directory fallback. */ }
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent showCloseButton={false} className="fixed inset-0 top-0 left-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 bg-[#100e1d] p-0 text-white sm:max-w-none">
      <DialogTitle className="sr-only">Now playing</DialogTitle>
      <DialogDescription className="sr-only">A listening view with playback controls and an optional audio visualiser.</DialogDescription>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,rgba(120,83,183,0.35),transparent_48%),radial-gradient(ellipse_at_90%_85%,rgba(39,129,81,0.20),transparent_45%)]" />
      <header className="relative flex shrink-0 items-center justify-between px-5 py-4 sm:px-10 sm:py-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-green-300">Ostrify / listening room</p><p className="mt-1 text-sm text-white/65">Now playing</p></div>
        <DialogClose asChild><button className={control} aria-label="Close now playing"><ChevronDown className="size-6" /></button></DialogClose>
      </header>
      {current ? <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-7 px-6 pb-8 sm:px-10 lg:flex-row lg:items-center lg:gap-20">
        <div className="flex shrink-0 justify-center lg:w-[40%]">
          <TrackArtwork track={current} priority rounded="rounded-2xl" className="aspect-square w-[min(56vw,250px)] shadow-[0_25px_80px_rgba(0,0,0,0.4)] sm:w-[min(42vw,340px)] lg:w-full lg:max-w-[420px]" />
        </div>
        <div className="mx-auto flex w-full min-w-0 max-w-xl flex-col lg:mx-0">
          <div className="min-w-0 text-center lg:text-left" onClick={closeOnNavigation}>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-green-300">{isRadio ? 'Live radio' : current.kind === 'podcast' ? 'Podcast' : current.kind === 'audiobook' ? 'Audiobook' : 'In your ears'}</p>
            <h2 className="min-w-0 text-2xl font-bold tracking-tight sm:text-4xl"><Link to={isRadio ? '/radio' : audioDetailPath(current)} title={current.title} className="block truncate rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-300">{current.title}</Link></h2>
            <div className="mt-2 truncate text-base text-white/65 sm:text-lg" title={current.artist || undefined}>
              {isRadio ? <Link to="/radio" className="hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-green-300">{current.artist || 'Live radio'}</Link> : current.kind === 'podcast' ? <Link to={podcastShowPath} className="hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-green-300">{current.artist || 'Podcast show'}</Link> : <ArtistLink pubkey={current.pubkey} artistId={current.artistId} artistPubkey={current.artistPubkey} fallbackName={current.artist} isUnverifiedArtist={!!current.event && !!current.artist} stopPropagation={false} className="hover:!text-white focus-visible:outline-2 focus-visible:outline-green-300" />}
            </div>
          </div>
          <div className="relative mt-6 h-24 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] sm:mt-8 sm:h-36">
            <div className="absolute inset-x-4 bottom-4 top-4"><Spectrum enabled={open} onStatus={setStatus} /></div>
            {(status === 'unavailable' || reducedMotion || !player.isPlaying) && <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
              <div className="max-w-sm"><AudioLines aria-hidden="true" className="mx-auto mb-2 size-5 text-green-300/80" /><p className="text-xs leading-relaxed text-white/70">{reducedMotion ? 'Visualiser paused to respect your reduced motion preference.' : status === 'unavailable' ? isRadio ? 'Visualisation unavailable for this station or device. Some stations do not allow audio analysis. Playback is unaffected.' : 'Visualisation unavailable for this source or device. Playback is unaffected.' : 'Visualiser is ready when playback starts.'}</p></div>
            </div>}
            {status === 'loading' && player.isPlaying && !reducedMotion && <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70" role="status">Connecting visualiser…</div>}
          </div>
          {!isRadio && <div className="mt-3 flex items-center justify-center gap-2 lg:justify-start" aria-label="Track actions">
            <LikeButton trackId={current.id} size={20} className="size-11 text-white/70 hover:bg-white/10 hover:text-white aria-pressed:text-green-300 focus-visible:ring-green-300" />
            <ShareTrackButton track={current} className="size-11 text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-green-300" iconClassName="size-5" />
            <PlayerZapButton key={current.id} track={current} className="size-11 text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-green-300" iconClassName="size-5" />
          </div>}
          {player.playbackError && <p role="status" className="mt-3 text-sm text-red-300">{player.playbackError}</p>}
          <div className="mt-6">
            {isRadio ? <div className="text-center text-xs font-bold uppercase tracking-widest text-green-300">Live radio</div> : <><Slider value={[player.duration ? Math.min(100, (player.progress / player.duration) * 100) : 0]} max={100} step={0.1} disabled={!player.duration} onValueChange={([v]) => player.seek((v / 100) * player.duration)} aria-label="Seek" /><div className="mt-2 flex justify-between text-xs tabular-nums text-white/60"><span>{formatDuration(player.progress)}</span><span>{formatDuration(player.duration)}</span></div></>}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 sm:gap-4">
            <button className={cn(control, player.shuffle && 'text-green-300')} onClick={player.toggleShuffle} disabled={isRadio} aria-label="Shuffle" aria-pressed={player.shuffle}><Shuffle className="size-5" /></button>
            <button className={control} onClick={player.previous} disabled={isRadio} aria-label="Previous"><SkipBack className="size-5 fill-current" /></button>
            <button className="flex size-14 items-center justify-center rounded-full bg-white text-[#100e1d] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-green-300 motion-reduce:transition-none motion-reduce:hover:scale-100" onClick={player.togglePlay} aria-label={player.isPlaying ? 'Pause' : 'Play'}>{player.isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="ml-1 size-6 fill-current" />}</button>
            <button className={control} onClick={player.next} disabled={!canNext} aria-label="Next"><SkipForward className="size-5 fill-current" /></button>
            <button className={cn(control, player.repeat !== 'off' && 'text-green-300')} onClick={player.cycleRepeat} disabled={isRadio} aria-label={`Repeat: ${player.repeat}`}><span>{player.repeat === 'one' ? <Repeat1 className="size-5" /> : <Repeat className="size-5" />}</span></button>
          </div>
          <div className="mx-auto mt-3 flex w-40 items-center gap-2"><button className={control} onClick={player.toggleMute} aria-label={player.muted ? 'Unmute' : 'Mute'}>{player.muted || player.volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button><Slider value={[player.muted ? 0 : player.volume * 100]} max={100} onValueChange={([v]) => player.setVolume(v / 100)} aria-label="Volume" className="flex-1" /></div>
        </div>
      </main> : <div className="relative flex flex-1 items-center justify-center text-white/65">Choose something to listen to.</div>}
    </DialogContent>
  </Dialog>;
}
