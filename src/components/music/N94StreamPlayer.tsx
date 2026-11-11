import { useEffect, useRef, useState } from 'react';
import mpegts from 'mpegts.js';
import type { NPool, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { sanitizeUrl } from '@/lib/sanitize';
import { TUNESTR_RELAYS } from '@/hooks/useTunestrStreams';

type StreamPlayerConfig = mpegts.Config & { nostr: NPool; relays: string[]; variant: string };
type Segment = { index: number; url: string; loaded: boolean };

class N94SegmentLoader implements mpegts.BaseLoader {
  private readonly nostr: NPool;
  private readonly relays: string[];
  private readonly variant: string;
  private readonly controller = new AbortController();
  private readonly segments = new Map<number, Segment>();
  private byteOffset = 0;
  private loading = false;
  private destroyed = false;
  private loaderStatus = 0;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private initialFlushTimer: ReturnType<typeof setTimeout> | undefined;
  private initialQueryReady = false;
  private nextIndex: number | undefined;
  onContentLengthKnown: (contentLength: number) => void = () => {};
  onURLRedirect: (redirectedURL: string) => void = () => {};
  onDataArrival: (chunk: ArrayBuffer, byteStart: number, receivedLength?: number) => void = () => {};
  onError: (errorType: mpegts.LoaderErrors, errorInfo: mpegts.LoaderErrorMessage) => void = () => {};
  onComplete: (rangeFrom: number, rangeTo: number) => void = () => {};

  constructor(_seekHandler: mpegts.SeekHandler, config: mpegts.Config) {
    const streamConfig = config as StreamPlayerConfig;
    this.nostr = streamConfig.nostr;
    this.relays = streamConfig.relays;
    this.variant = streamConfig.variant;
  }

  get _status(): number { return this.loaderStatus; }
  get status(): number { return this.loaderStatus; }
  isWorking(): boolean { return this.loading; }
  get type(): string { return 'n94'; }
  get needStashBuffer(): boolean { return false; }
  get _needStash(): boolean { return false; }

  open(dataSource: mpegts.MediaSegment): void {
    this.loaderStatus = 1;
    const streamId = dataSource.url;
    if (!this.relays.length) {
      this.fail('Enable a read relay in Settings to play this TuneStr stream.');
      return;
    }
    const filter: NostrFilter = { kinds: [1063], '#e': [streamId], '#d': [this.variant], limit: 200 };
    this.readyTimer = setTimeout(() => {
      if (!this.destroyed && this.segments.size === 0) this.fail('No video segments were found for this TuneStr stream.');
    }, 12000);
    this.initialFlushTimer = setTimeout(() => {
      this.initialQueryReady = true;
      void this.flushSegments();
    }, 2500);
    for (const url of this.relays) void this.readRelay(url, filter, streamId);
  }

  private async readRelay(url: string, filter: NostrFilter, streamId: string): Promise<void> {
    try {
      for await (const message of this.nostr.relay(url).req([filter], { signal: this.controller.signal })) {
        if (this.destroyed) return;
        if (message[0] === 'EVENT') {
          const event = message[2];
          const indexTag = event.tags.find(([name]) => name === 'index')?.[1];
          const index = indexTag ? Number(indexTag) : NaN;
          const segmentUrl = sanitizeUrl(event.tags.find(([name]) => name === 'url')?.[1]);
          const parent = event.tags.some(([name, value]) => name === 'e' && value === streamId);
          const variant = event.tags.find(([name]) => name === 'd')?.[1];
          if (event.kind !== 1063 || !parent || variant !== this.variant || !Number.isSafeInteger(index) || index < 0 || !segmentUrl) continue;
          if (!this.segments.has(index)) this.segments.set(index, { index, url: segmentUrl, loaded: false });
          if (this.readyTimer) clearTimeout(this.readyTimer);
          this.loaderStatus = 2;
          if (this.initialQueryReady) void this.flushSegments();
        } else if (message[0] === 'EOSE') {
          this.initialQueryReady = true;
          if (this.initialFlushTimer) clearTimeout(this.initialFlushTimer);
          this.initialFlushTimer = undefined;
          void this.flushSegments();
        }
      }
    } catch (error) {
      if (!this.destroyed && !this.controller.signal.aborted) console.debug('TuneStr segment relay ended', error);
    }
  }

  private async flushSegments(): Promise<void> {
    if (this.loading || this.destroyed) return;
    this.loading = true;
    const ordered = [...this.segments.values()].sort((a, b) => a.index - b.index);
    const pending: Segment[] = [];
    let expectedIndex = this.nextIndex ?? ordered[0]?.index;
    for (const segment of ordered) {
      if (segment.loaded || expectedIndex === undefined || segment.index < expectedIndex) continue;
      if (segment.index !== expectedIndex) break;
      pending.push(segment);
      expectedIndex = segment.index + 1;
    }
    for (const segment of pending) {
      if (this.destroyed) break;
      segment.loaded = true;
      try {
        const response = await fetch(segment.url, { signal: this.controller.signal });
        if (!response.ok) throw new Error(`Video segment returned HTTP ${response.status}`);
        const chunk = await response.arrayBuffer();
        if (!chunk.byteLength) continue;
        this.onDataArrival(chunk, this.byteOffset, chunk.byteLength);
        this.byteOffset += chunk.byteLength;
        this.nextIndex = segment.index + 1;
      } catch (error) {
        segment.loaded = false;
        if (!this.controller.signal.aborted) {
          this.fail(error instanceof Error ? error.message : 'Could not load a video segment.');
          break;
        }
      }
    }
    this.loading = false;
    if (!this.destroyed) this.loaderStatus = 0;
  }

  private fail(message: string): void {
    this.loaderStatus = 3;
    this.onError('Exception' as unknown as mpegts.LoaderErrors, { code: 0, msg: message });
  }

  abort(): void {
    this.controller.abort();
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.initialFlushTimer) clearTimeout(this.initialFlushTimer);
  }

  destroy(): void {
    this.destroyed = true;
    this.abort();
    this.segments.clear();
  }
}

export function N94StreamPlayer({ event, variant }: { event: NostrEvent; variant: string }) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const eventRelays = event.tags.flatMap(([name, ...values]) => {
    if (name !== 'relays') return [];
    return values.filter(value => {
      try { return new URL(value).protocol === 'wss:'; } catch { return false; }
    });
  });
  const relays = [...new Set([
    ...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url),
    ...TUNESTR_RELAYS,
    ...eventRelays,
  ])].sort();
  const relayKey = relays.join('|');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!mpegts.getFeatureList().mseLivePlayback) {
      setError('This browser does not support this TuneStr stream format.');
      return;
    }
    setError(null);
    const player = new mpegts.MSEPlayer(
      { type: 'mse', isLive: true, url: event.id },
      { nostr, relays, variant, customLoader: N94SegmentLoader } as unknown as mpegts.Config,
    );
    player.on(mpegts.Events.ERROR, (_type, detail) => {
      setError(typeof detail === 'string' ? detail : 'The TuneStr stream could not be played.');
    });
    player.attachMediaElement(video);
    player.load();
    const playback = player.play();
    if (playback instanceof Promise) void playback.catch(() => setError('Press play to start this TuneStr stream.'));
    return () => player.destroy();
  }, [nostr, relayKey, event, variant]);

  return <div className="relative aspect-video w-full bg-black">
    <video ref={videoRef} controls playsInline className="size-full" aria-label="TuneStr live stream" />
    {error && <div role="status" className="absolute inset-x-0 bottom-12 mx-3 rounded-lg bg-black/80 p-3 text-sm text-white">{error}</div>}
  </div>;
}
