import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { sanitizeUrl } from '@/lib/sanitize';
import { TUNESTR_PUBKEY, TUNESTR_STREAM_HOST_PUBKEY } from '@/lib/sources';
import { getUserRelayUrls, OSTRIFY_RELAY_URL } from '@/lib/appRelays';
import { isOriginalSoundTitle, type Track } from '@/lib/music';
import { captureDiscoveredAudioEvents } from '@/lib/audioCatalogCapture';
import { isNewerReplaceableEvent, reconcileLibraryEvent } from '@/lib/libraryQuery';

const STREAM_PUBKEYS = [TUNESTR_PUBKEY, TUNESTR_STREAM_HOST_PUBKEY];
// Match TuneStr's stream page topic filters (tags are case-sensitive at relays).
const MUSIC_TAGS = ['music', 'Music', 'MUSIC'];
// TuneStr's own profile advertises Lightning Relay and nostr.land; Fountain is
// also a default stream relay in TuneStr's upstream client.
export const TUNESTR_RELAYS = [
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
  format: 'nip53' | 'n94';
  event?: NostrEvent;
  variant?: string;
  track: Track;
}

function streamPlaybackUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'stream.zapclub.io' && parsed.pathname === '/live/basement.m3u8') {
      return 'https://stream.zapclub.io/live/basement.m3u8';
    }
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

function streamCoordinate(event: NostrEvent): string | undefined {
  const d = tagValue(event, 'd');
  return event.kind === 30311 && /^[0-9a-f]{64}$/.test(event.pubkey) && d ? `${event.pubkey}:${d}` : undefined;
}

/** Select addressable revisions before parsing, including non-playable replacements. */
export function mergeTunestrPages(pages: { streams: TunestrStream[]; revisions: NostrEvent[] }[]): TunestrStream[] {
  const revisions = new Map<string, NostrEvent>();
  const n94 = new Map<string, TunestrStream>();
  for (const page of pages) {
    for (const stream of page.streams) if (stream.format === 'n94') n94.set(stream.id, stream);
    for (const event of page.revisions) {
      const coordinate = streamCoordinate(event);
      if (!coordinate) continue;
      const previous = revisions.get(coordinate);
      if (!previous || isNewerReplaceableEvent(event, previous)) revisions.set(coordinate, event);
    }
  }
  const streams = [...revisions.values()].flatMap(event => {
    const stream = parseTunestrStreamEvent(event);
    return stream ? [stream] : [];
  });
  return [...n94.values(), ...streams].sort((a, b) => b.createdAt - a.createdAt);
}

export function parseN94Stream(event: NostrEvent): TunestrStream | null {
  if (event.kind !== 1053) return null;
  const hashtags = event.tags.flatMap(([name, value]) => name === 't' && value ? [value.toLowerCase()] : []);
  const isTuneStr = STREAM_PUBKEYS.includes(event.pubkey) || event.tags.some(([name, value]) => name === 'p' && STREAM_PUBKEYS.includes(value ?? ''));
  if (!hashtags.includes('music') && !isTuneStr) return null;

  const title = tagValue(event, 'title')?.trim();
  if (!title || isOriginalSoundTitle(title)) return null;
  const variants = event.tags.flatMap(([name, ...parts]) => {
    if (name !== 'variant') return [];
    const values = parts.flatMap(part => {
      const separator = part.indexOf(' ');
      return separator > 0 ? [[part.slice(0, separator), part.slice(separator + 1)]] : [];
    });
    const mime = values.find(([key]) => key === 'm')?.[1]?.toLowerCase();
    const variant = values.find(([key]) => key === 'd')?.[1];
    return variant && mime === 'video/mp2t' ? [variant] : [];
  });
  const variant = variants[0];
  if (!variant) return null;

  const identifier = nip19.neventEncode({ id: event.id, author: event.pubkey, kind: event.kind });
  const image = sanitizeUrl(tagValue(event, 'image'));
  const summary = tagValue(event, 'summary');
  const track: Track = {
    id: event.id,
    event,
    source: 'tunestr',
    url: `nostr:${identifier}`,
    title,
    artist: 'TuneStr live stream',
    image,
    mimeType: 'video/mp4',
    pubkey: event.pubkey,
    kind: 'music',
    topics: hashtags,
    createdAt: event.created_at,
  };
  return {
    id: `tunestr:n94:${event.id}`,
    title,
    summary,
    image,
    url: `nostr:${identifier}`,
    externalUrl: `https://tunestr.io/${identifier}`,
    createdAt: event.created_at,
    status: 'live',
    isLive: true,
    format: 'n94',
    event,
    variant,
    track,
  };
}

export function parseTunestrStreamEvent(event: NostrEvent): TunestrStream | null {
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
  if (!d || !title || isOriginalSoundTitle(title) || !['live', 'ended'].includes(eventStatus)) return null;

  const isLive = eventStatus === 'live' && event.created_at >= Date.now() / 1000 - 60 * 60;
  const sourceUrl = isLive ? streamingUrl || recordingUrl : recordingUrl || streamingUrl;
  const url = sourceUrl ? streamPlaybackUrl(sourceUrl) : undefined;
  if (!url || !sourceUrl) return null;

  const summary = tagValue(event, 'summary');
  const image = sanitizeUrl(tagValue(event, 'image'));
  const thumbnailSourceUrl = streamingUrl ?? recordingUrl;
  const durationTag = tagValue(event, 'duration') ?? tagValue(event, 'duration_seconds');
  const duration = durationTag ? Number(durationTag) : undefined;
  const status = isLive ? 'live' : 'ended';
  const track: Track = {
    id: event.id,
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
  return { id: `tunestr:${event.pubkey}:${d}`, title, summary, image, thumbnailSourceUrl, url, externalUrl: sourceUrl, createdAt: event.created_at, status, isLive, format: 'nip53', event, track };
}

export function useTunestrStreams(enabled = true) {
  const { nostr } = useNostr();
  const client = useQueryClient();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const relays = [...new Set([
    ...config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url),
    ...getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', 'read', config.excludedUserRelayUrls, config.excludedUserRelayPubkey),
    ...TUNESTR_RELAYS,
  ])].sort();
  const relayKey = relays.join('|');

  return useInfiniteQuery({
    queryKey: ['tunestr-live-streams', relayKey, 'v2'],
    initialPageParam: undefined as number | undefined,
    enabled: enabled && relays.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
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
            { kinds: [1053], '#t': MUSIC_TAGS, limit: PAGE_SIZE, ...timeFilter },
          ];
          if (relay === OSTRIFY_RELAY_URL) return { relay, events: [], ok: true };
          const events = await nostr.relay(relay).query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
          return { relay, events, ok: true };
        } catch (error) {
          if (signal.aborted) throw error;
          failed.push(relay);
          return { relay, events: [], ok: false };
        }
      }));
      if (relays.some(relay => relay !== OSTRIFY_RELAY_URL) && !responses.some(response => response.ok && response.relay !== OSTRIFY_RELAY_URL)) throw new Error('Could not query TuneStr streams from your read relays.');

      const discoveredEvents = [...new Map(responses.filter(response => response.relay !== OSTRIFY_RELAY_URL).flatMap(response => response.events).map(event => [event.id, event])).values()];
      captureDiscoveredAudioEvents(nostr, discoveredEvents, user?.pubkey);
      const coordinates = new Map<string, { pubkey: string; d: string }>();
      for (const event of discoveredEvents) {
        const address = streamCoordinate(event);
        const d = tagValue(event, 'd');
        if (address && d) coordinates.set(address, { pubkey: event.pubkey, d });
      }
      // Re-query discovered coordinates without topical or time filters: a newer
      // update may have dropped those tags or changed status to unplayable.
      const byAuthor = new Map<string, string[]>();
      for (const { pubkey, d } of coordinates.values()) byAuthor.set(pubkey, [...(byAuthor.get(pubkey) ?? []), d]);
      const authors = [...byAuthor.entries()];
      const selected = authors.slice(0, 250);
      const filters = selected.map(([author, identifiers]) => ({ kinds: [30311], authors: [author], '#d': identifiers, limit: Math.max(20, identifiers.length * 10) }));
      let unconfirmed = authors.length > selected.length;
      const checkedEvents: NostrEvent[] = [];
      if (filters.length) {
        await Promise.all(responses.filter(response => response.ok && response.relay !== OSTRIFY_RELAY_URL).map(async ({ relay }) => {
          try {
            checkedEvents.push(...await nostr.relay(relay).query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) }));
          } catch (error) {
            if (signal.aborted) throw error;
            unconfirmed = true;
            if (!failed.includes(relay)) failed.push(relay);
          }
        }));
      }
      const checkedCoordinates = new Set(checkedEvents.map(streamCoordinate).filter((value): value is string => !!value && coordinates.has(value)));
      if ([...coordinates.keys()].some(address => !checkedCoordinates.has(address))) unconfirmed = true;
      const latest = new Map<string, NostrEvent>();
      for (const event of [...discoveredEvents, ...checkedEvents]) {
        const address = streamCoordinate(event);
        if (!address || !coordinates.has(address)) continue;
        const previous = latest.get(address);
        if (!previous || isNewerReplaceableEvent(event, previous)) latest.set(address, event);
      }
      const revisions = [...coordinates].flatMap(([address, { pubkey, d }]) => {
        const event = reconcileLibraryEvent(client, pubkey, 30311, d, [latest.get(address)]);
        return event ? [event] : [];
      });
      const streams = discoveredEvents.flatMap(event => {
        const stream = event.kind === 1053 ? parseN94Stream(event) : null;
        return stream ? [stream] : [];
      });
      const allEvents = responses.filter(response => response.relay !== OSTRIFY_RELAY_URL).flatMap(response => response.events);
      const oldest = allEvents.reduce<number | undefined>((cursor, event) => cursor === undefined || event.created_at < cursor ? event.created_at : cursor, undefined);
      const next = typeof until === 'number'
        ? oldest === undefined ? undefined : Math.max(0, oldest - 1)
        : Math.floor(Date.now() / 1000) - RECORDING_RECENT_WINDOW_SECONDS - 1;
      return { streams, revisions, failed, unconfirmed, next, rawCount: allEvents.length, isRecentPage: typeof until !== 'number' };
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
