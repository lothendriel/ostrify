import { useEffect, useRef, useState } from 'react';
import mpegts from 'mpegts.js';
import type { NPool, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useVideoVolume } from '@/hooks/useVideoVolume';
import { getUserRelayUrls } from '@/lib/appRelays';
import { sanitizeUrl } from '@/lib/sanitize';
import { TUNESTR_RELAYS } from '@/hooks/useTunestrStreams';

type StreamPlayerConfig = mpegts.Config & { nostr: NPool; relays: string[]; variant: string; author: string };
type Segment = { index: number; url: string; hash: string; loaded: boolean };
const MAX_SEGMENT_BYTES = 16 * 1024 * 1024;

/** Bound memory use and verify the signed NIP-94 content hash before decoding. */
async function readVerifiedSegment(response: Response, expectedHash: string): Promise<ArrayBuffer> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_SEGMENT_BYTES) throw new Error('Video segment is too large.');
  const reader = response.body?.getReader();
  let chunk: ArrayBuffer;
  if (!reader) {
    chunk = await response.arrayBuffer();
    if (chunk.byteLength > MAX_SEGMENT_BYTES) throw new Error('Video segment is too large.');
  } else {
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SEGMENT_BYTES) {
          await reader.cancel();
          throw new Error('Video segment is too large.');
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    chunk = bytes.buffer;
  }
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify video segments.');
  const digest = await crypto.subtle.digest('SHA-256', chunk);
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('Video segment failed its integrity check.');
  return chunk;
}

function parseN94Segment(event: NostrEvent, streamId: string, author: string, expectedVariant: string): Segment | undefined {
  const indexTag = event.tags.find(([name]) => name === 'index')?.[1];
  const index = indexTag && /^\d{1,16}$/.test(indexTag) ? Number(indexTag) : NaN;
  const url = sanitizeUrl(event.tags.find(([name]) => name === 'url')?.[1]);
  const parent = event.tags.some(([name, value]) => name === 'e' && value === streamId);
  const variant = event.tags.find(([name]) => name === 'd')?.[1];
  const hash = event.tags.find(([name]) => name === 'x')?.[1];
  const mime = event.tags.find(([name]) => name === 'm')?.[1]?.toLowerCase();
  if (event.kind !== 1063 || event.pubkey !== author || !parent || variant !== expectedVariant || !Number.isSafeInteger(index) || index < 0 || !url || !hash || !/^[0-9a-f]{64}$/i.test(hash) || mime !== 'video/mp2t') return undefined;
  return { index, url, hash: hash.toLowerCase(), loaded: false };
}

class N94SegmentLoader implements mpegts.BaseLoader {
  private readonly nostr: NPool;
  private readonly relays: string[];
  private readonly variant: string;
  private readonly author: string;
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
    this.author = streamConfig.author;
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
    const filter: NostrFilter = { kinds: [1063], authors: [this.author], '#e': [streamId], '#d': [this.variant], limit: 200 };
    this.readyTimer = setTimeout(() => {
      if (!this.destroyed && this.segments.size === 0) this.fail('No verified video segments were found. This stream may use an unsupported publisher or segment format.');
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
          const segment = parseN94Segment(message[2], streamId, this.author, this.variant);
          if (!segment) continue;
          if (!this.segments.has(segment.index)) this.segments.set(segment.index, segment);
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
        const response = await fetch(segment.url, { signal: this.controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error(`Video segment returned HTTP ${response.status}`);
        const chunk = await readVerifiedSegment(response, segment.hash);
        if (this.destroyed || this.controller.signal.aborted) break;
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

export function N94StreamPlayer({ event, variant, initialPlaying = true, onPlaybackChange, onAnalyticsState }: { event: NostrEvent; variant: string; initialPlaying?: boolean; onPlaybackChange?: (position: number, playing: boolean) => void; onAnalyticsState?: (playing: boolean) => void }) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const eventRelays = event.tags.flatMap(([name, ...values]) => {
    if (name !== 'relays') return [];
    return values.filter(value => {
      try {
        const relay = new URL(value);
        return relay.protocol === 'wss:' && !relay.username && !relay.password;
      } catch { return false; }
    });
  }).slice(0, 10);
  const relays = [...new Set([
    ...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url),
    ...getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', 'read', config.excludedUserRelayUrls, config.excludedUserRelayPubkey),
    ...TUNESTR_RELAYS,
    ...eventRelays,
  ])].sort();
  const relayKey = relays.join('|');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { onVolumeChange } = useVideoVolume(videoRef, event.id);
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
      { nostr, relays, variant, author: event.pubkey, customLoader: N94SegmentLoader } as unknown as mpegts.Config,
    );
    player.on(mpegts.Events.ERROR, (_type, detail) => {
      setError(typeof detail === 'string' ? detail : 'The TuneStr stream could not be played.');
    });
    player.attachMediaElement(video);
    player.load();
    if (initialPlaying) {
      const playback = player.play();
      if (playback instanceof Promise) void playback.catch(() => setError('Press play to start this TuneStr stream.'));
    }
    return () => player.destroy();
  }, [nostr, relayKey, event, variant, initialPlaying]);

  return <div className="relative aspect-video w-full bg-black">
    <video ref={videoRef} controls playsInline disablePictureInPicture className="size-full" aria-label="TuneStr live stream" onVolumeChange={onVolumeChange} onPlay={() => onPlaybackChange?.(0, true)} onPlaying={() => onAnalyticsState?.(true)} onWaiting={() => onAnalyticsState?.(false)} onSeeking={() => onAnalyticsState?.(false)} onSeeked={event => { if (!event.currentTarget.paused && event.currentTarget.readyState >= 3) onAnalyticsState?.(true); }} onPause={() => { onAnalyticsState?.(false); onPlaybackChange?.(0, false); }} onEnded={() => { onAnalyticsState?.(false); onPlaybackChange?.(0, false); }} onError={() => { onAnalyticsState?.(false); onPlaybackChange?.(0, false); }} />
    {error && <div role="status" className="absolute inset-x-0 bottom-12 mx-3 rounded-lg bg-black/80 p-3 text-sm text-white">{error}</div>}
  </div>;
}
