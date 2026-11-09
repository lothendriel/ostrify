import { useInfiniteQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { sanitizeUrl } from '@/lib/sanitize';
import { TUNESTR_PUBKEY, TUNESTR_STREAM_HOST_PUBKEY } from '@/lib/sources';
import type { Track } from '@/lib/music';

const STREAM_PUBKEYS = [TUNESTR_PUBKEY, TUNESTR_STREAM_HOST_PUBKEY];
// Match TuneStr's stream page topic filters (tags are case-sensitive at relays).
const MUSIC_TAGS = ['music', 'Music', 'MUSIC'];
// TuneStr's own profile advertises Lightning Relay and nostr.land; Fountain is
// also a default stream relay in TuneStr's upstream client.
const TUNESTR_RELAYS = [
  'wss://relay.fountain.fm/',
  'wss://lightningrelay.com/',
  'wss://nostr.land/',
  'wss://relay.nostrplebs.com/',
  'wss://relay.divine.video/',
];
const PAGE_SIZE = 200;
const RECORDING_RECENT_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export interface TunestrStream {
  id: string;
  title: string;
  summary?: string;
  image?: string;
  thumbnailSourceUrl?: string;
  url: string;
  externalUrl: string;
  createdAt: number;
  status: string;
  isLive: boolean;
  track: Track;
}

function cloudflarePlaybackUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('.cloudflarestream.com')) return url;
    const match = parsed.pathname.match(/^\/([a-f0-9]{32})\/(?:manifest\/video\.m3u8|watch)$/i);
    return match ? `https://${parsed.hostname}/${match[1]}/iframe` : url;
  } catch {
    return url;
  }
}

function tagValue(event: { tags: string[][] }, name: string): string | undefined {
  return event.tags.find(([key]) => key === name)?.[1];
}

function parseStream(event: { id: string; pubkey: string; created_at: number; kind: number; content: string; tags: string[][] }): TunestrStream | null {
  if (event.kind !== 30311) return null;
  const client = event.tags.find(([name]) => name === 'client')?.[1]?.toLowerCase();
  const taggedMusic = event.tags.some(([name, value]) => name === 't' && MUSIC_TAGS.includes(value));
  const mentionsTuneStr = event.tags.some(([name, value]) => name === 'p' && STREAM_PUBKEYS.includes(value));
  const isTuneStr = STREAM_PUBKEYS.includes(event.pubkey) || client?.includes('tunestr') || taggedMusic || mentionsTuneStr;
  if (!isTuneStr) return null;

  const d = tagValue(event, 'd');
  const streamingUrl = sanitizeUrl(tagValue(event, 'streaming'));
  const recordingUrl = sanitizeUrl(tagValue(event, 'recording'));
  const eventStatus = tagValue(event, 'status') ?? 'unknown';
  const title = tagValue(event, 'title')?.trim();
  if (!d || !title || !['live', 'ended'].includes(eventStatus)) return null;

  const isLive = eventStatus === 'live' && event.created_at >= Date.now() / 1000 - 60 * 60;
  const sourceUrl = isLive ? streamingUrl || recordingUrl : recordingUrl || streamingUrl;
  const url = sourceUrl ? cloudflarePlaybackUrl(sourceUrl) : undefined;
  if (!url || !sourceUrl) return null;

  const summary = tagValue(event, 'summary');
  const image = sanitizeUrl(tagValue(event, 'image'));
  const thumbnailSourceUrl = streamingUrl ?? recordingUrl;
  const durationTag = tagValue(event, 'duration') ?? tagValue(event, 'duration_seconds');
  const duration = durationTag ? Number(durationTag) : undefined;
  const status = isLive ? 'live' : 'ended';
  const track: Track = {
    id: `tunestr:${event.pubkey}:${d}`,
    event: event as Track['event'],
    source: 'tunestr',
    url,
    title,
    artist: 'TuneStr live stream',
    image,
    mimeType: 'video/mp4',
    pubkey: event.pubkey,
    duration: duration && Number.isFinite(duration) && duration > 0 ? duration : undefined,
    kind: 'music',
    topics: event.tags.filter(([name]) => name === 't').map(([, value]) => value.toLowerCase()),
    createdAt: event.created_at,
  };
  return { id: `tunestr:${event.pubkey}:${d}`, title, summary, image, thumbnailSourceUrl, url, externalUrl: sourceUrl, createdAt: event.created_at, status, isLive, track };
}

export function useTunestrStreams() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const relays = [...new Set([
    ...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url),
    ...TUNESTR_RELAYS,
  ])].sort();
  const relayKey = relays.join('|');

  return useInfiniteQuery({
    queryKey: ['tunestr-live-streams', relayKey],
    initialPageParam: undefined as number | undefined,
    enabled: relays.length > 0,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnMount: true,
    queryFn: async ({ pageParam, signal }) => {
      const until = pageParam;
      const failed: string[] = [];
      const responses = await Promise.all(relays.map(async relay => {
        try {
          const timeFilter = typeof until === 'number'
            ? { until }
            : { since: Math.floor(Date.now() / 1000) - RECORDING_RECENT_WINDOW_SECONDS };
          // OR the publisher/host filters with TuneStr's topical feed filters.
          // Don't require known authors alone: the streams themselves are often
          // published by individual musicians and venues.
          const filters = [
            { kinds: [30311], authors: STREAM_PUBKEYS, limit: PAGE_SIZE, ...timeFilter },
            { kinds: [30311], '#t': MUSIC_TAGS, limit: PAGE_SIZE, ...timeFilter },
            { kinds: [30311], '#p': STREAM_PUBKEYS, limit: PAGE_SIZE, ...timeFilter },
          ];
          const events = await nostr.relay(relay).query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
          return { events, ok: true };
        } catch (error) {
          if (signal.aborted) throw error;
          failed.push(relay);
          return { events: [], ok: false };
        }
      }));
      if (relays.length && !responses.some(response => response.ok)) throw new Error('Could not query TuneStr streams from your read relays.');

      const byAddress = new Map<string, TunestrStream>();
      for (const event of responses.flatMap(response => response.events)) {
        const stream = parseStream(event);
        if (!stream) continue;
        const address = `${stream.track.pubkey}:${tagValue(event, 'd')}`;
        const previous = byAddress.get(address);
        if (!previous || previous.createdAt < stream.createdAt) byAddress.set(address, stream);
      }

      const streams = [...byAddress.values()].sort((a, b) => Number(b.isLive) - Number(a.isLive) || b.createdAt - a.createdAt);
      const allEvents = responses.flatMap(response => response.events);
      const oldest = allEvents.reduce<number | undefined>((cursor, event) => cursor === undefined || event.created_at < cursor ? event.created_at : cursor, undefined);
      const next = typeof until === 'number'
        ? oldest === undefined ? undefined : Math.max(0, oldest - 1)
        : Math.floor(Date.now() / 1000) - RECORDING_RECENT_WINDOW_SECONDS - 1;
      return { streams, failed, next, rawCount: allEvents.length, isRecentPage: typeof until !== 'number' };
    },
    getNextPageParam: (page, pages) => {
      // Always offer one older-than-recent query, even if the recent query was
      // sparse. Subsequent pages continue only when the relay batch was full.
      const hasMoreOlderResults = page.isRecentPage || page.rawCount >= PAGE_SIZE;
      const advancesCursor = pages.slice(0, -1).every(item => item.next !== page.next);
      return page.next !== undefined && hasMoreOlderResults && advancesCursor ? page.next : undefined;
    },
  });
}
