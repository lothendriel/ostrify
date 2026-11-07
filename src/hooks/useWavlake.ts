import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { sanitizeUrl } from '@/lib/sanitize';
import type { Track } from '@/lib/music';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function wavlakeTrackUrl(trackId: string): string | undefined {
  const match = /^wavlake:([0-9a-f-]+)$/i.exec(trackId);
  return match && UUID.test(match[1]) ? `https://wavlake.com/track/${match[1].toLowerCase()}` : undefined;
}

export function wavlakeTrackId(url: string): string | undefined {
  const match = /^https:\/\/wavlake\.com\/track\/([0-9a-f-]+)$/i.exec(url);
  return match && UUID.test(match[1]) ? `wavlake:${match[1].toLowerCase()}` : undefined;
}

export function wavlakeArtistUrl(artistId: string): string | undefined {
  return UUID.test(artistId) ? `https://wavlake.com/artist/${artistId.toLowerCase()}` : undefined;
}

export function wavlakeArtistId(url: string): string | undefined {
  const match = /^https:\/\/wavlake\.com\/artist\/([0-9a-f-]+)$/i.exec(url);
  return match && UUID.test(match[1]) ? match[1].toLowerCase() : undefined;
}
const API = 'https://wavlake.com/api/v1/content/';

type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function id(value: unknown): string | undefined { const v = text(value); return v && UUID.test(v) ? v : undefined; }

async function fetchApi(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  // Paths are constructed locally, never taken from catalog data.
  const url = new URL(path, API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    // Some catalog endpoints do not expose CORS headers to browser clients.
    response = await fetch(`https://proxy.shakespeare.diy/?url=${encodeURIComponent(url.href)}`, { signal });
  }
  if (!response.ok) throw new Error(`Wavlake returned ${response.status}${response.status === 429 ? ' (rate limit)' : ''}`);
  return response.json() as Promise<unknown>;
}

export async function fetchWavlakeTrack(trackId: string, signal: AbortSignal): Promise<Track | null> {
  if (!UUID.test(trackId)) return null;
  return parseTrack(await fetchApi(`track/${trackId}`, {}, signal));
}

function parseTrack(value: unknown): Track | null {
  const item = object(value);
  if (!item) return null;
  const trackId = id(item.id);
  const url = sanitizeUrl(text(item.mediaUrl));
  const title = text(item.title);
  if (!trackId || !url || !title) return null;
  let pubkey = '';
  const artistNpub = text(item.artistNpub);
  if (artistNpub) {
    try { const decoded = nip19.decode(artistNpub); if (decoded.type === 'npub') pubkey = decoded.data; } catch { /* not an npub */ }
  }
  const date = text(item.releaseDate);
  const timestamp = date ? Date.parse(date) : NaN;
  return {
    id: `wavlake:${trackId}`, source: 'wavlake', artistId: id(item.artistId), albumId: id(item.albumId),
    url, title, artist: text(item.artist), album: text(item.albumTitle),
    image: sanitizeUrl(text(item.albumArtUrl)), pubkey,
    duration: typeof item.duration === 'number' && Number.isFinite(item.duration) ? item.duration : undefined,
    kind: 'music', topics: text(item.genre) ? [String(item.genre).toLowerCase()] : [],
    createdAt: Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0,
  };
}

export interface CatalogItem { id: string; type: 'artist' | 'album' | 'track'; title: string; artist?: string; image?: string; track?: Track }
function parseItem(value: unknown): CatalogItem | null {
  const item = object(value); if (!item) return null;
  const itemId = id(item.id); const title = text(item.title) || text(item.name);
  const type = item.type;
  if (!itemId || !title || (type !== 'track' && type !== 'album' && type !== 'artist')) return null;
  return { id: itemId, type, title, artist: text(item.artist), image: sanitizeUrl(text(item.albumArtUrl) || text(item.artistArtUrl)), track: type === 'track' ? parseTrack(item) ?? undefined : undefined };
}

export function useWavlakeCatalog(artistId?: string) {
  return useInfiniteQuery({
    queryKey: ['wavlake', 'catalog', artistId ?? ''],
    initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const params: Record<string, string> = { limit: '50' };
      if (pageParam) params.cursor = pageParam;
      if (artistId) params.artistId = artistId;
      const data = object(await fetchApi('tracks', params, signal));
      if (!data || !Array.isArray(data.tracks)) throw new Error('Invalid Wavlake catalog response');
      return { tracks: data.tracks.map(parseTrack).filter((t): t is Track => !!t), next: text(data.nextCursor), total: typeof data.total === 'number' ? data.total : undefined };
    },
    getNextPageParam: (page) => page.next,
    enabled: !artistId || UUID.test(artistId),
    retry: 1,
  });
}

export function useWavlakeSearch(term: string) {
  return useQuery({
    queryKey: ['wavlake', 'search', term],
    queryFn: async ({ signal }) => {
      const data = await fetchApi('search', { term }, signal);
      if (!Array.isArray(data)) throw new Error('Invalid Wavlake search response');
      return data.map(parseItem).filter((item): item is CatalogItem => !!item);
    },
    enabled: term.trim().length >= 2,
    retry: 1,
    staleTime: 60000,
  });
}

export function useWavlakeRelease(type: 'artist' | 'album', itemId: string | undefined) {
  return useQuery({
    queryKey: ['wavlake', type, itemId],
    queryFn: async ({ signal }) => {
      if (!itemId || !UUID.test(itemId)) throw new Error('Invalid catalog identifier');
      const data = object(await fetchApi(`${type}/${itemId}`, {}, signal));
      if (!data) throw new Error('Invalid catalog response');
      const albums = Array.isArray(data.albums) ? data.albums.map((v): CatalogItem | null => {
        const a = object(v); if (!a) return null;
        return parseItem({ ...a, type: 'album' });
      }).filter((v): v is CatalogItem => !!v) : [];
      return { title: text(data.title) || text(data.name) || 'Untitled', artist: text(data.artist), image: sanitizeUrl(text(data.albumArtUrl) || text(data.artistArtUrl)), albums, tracks: Array.isArray(data.tracks) ? data.tracks.map(parseTrack).filter((v): v is Track => !!v) : [] };
    },
    enabled: !!itemId && UUID.test(itemId), retry: 1,
  });
}
