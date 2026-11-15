import type { NostrEvent } from '@nostrify/nostrify';
import { sanitizeUrl } from '@/lib/sanitize';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SAVED_ALBUMS_ID = 'ostrify-wavlake-albums-v1';
export const WAVLAKE_ALBUM_TAG = 'ostrify-album';

export interface SavedAlbum {
  id: string;
  title: string;
  artist?: string;
  image?: string;
  isListed: boolean;
}

export function wavlakeAlbumUrl(albumId: string): string | undefined {
  return UUID.test(albumId) ? `https://wavlake.com/album/${albumId.toLowerCase()}` : undefined;
}

export function parseSavedAlbums(event: NostrEvent | undefined): SavedAlbum[] {
  if (!event || event.kind !== 30003 || !event.tags.some(([name, value]) => name === 'd' && value === SAVED_ALBUMS_ID)) return [];
  const albums = new Map<string, SavedAlbum>();
  for (const [name, id, title, artist, image, visibility] of event.tags) {
    if (name !== WAVLAKE_ALBUM_TAG || !id || !UUID.test(id) || !title?.trim()) continue;
    const normalizedId = id.toLowerCase();
    albums.set(normalizedId, {
      id: normalizedId,
      title: title.trim().slice(0, 300),
      artist: artist?.trim().slice(0, 200) || undefined,
      image: sanitizeUrl(image),
      isListed: visibility !== 'private',
    });
  }
  return [...albums.values()];
}

export function buildSavedAlbumsEvent(existing: NostrEvent | undefined, albums: SavedAlbum[]): { kind: number; content: string; tags: string[][] } {
  const tags = existing?.tags.filter(([name, value]) =>
    !(name === 'd' && value === SAVED_ALBUMS_ID) &&
    !(name === 'title' && value === 'Saved Albums') &&
    !(name === WAVLAKE_ALBUM_TAG) &&
    !(name === 'i' && value && /^https:\/\/wavlake\.com\/album\/[0-9a-f-]+$/i.test(value)),
  ).map(tag => [...tag]) ?? [];
  tags.unshift(['d', SAVED_ALBUMS_ID], ['title', 'Saved Albums']);

  for (const album of albums) {
    const id = album.id.toLowerCase();
    const url = wavlakeAlbumUrl(id);
    if (!url || !titleIsValid(album.title) || album.artist?.length && album.artist.length > 200) continue;
    tags.push(['i', url], [WAVLAKE_ALBUM_TAG, id, album.title.trim().slice(0, 300), album.artist?.trim().slice(0, 200) ?? '', sanitizeUrl(album.image) ?? '', album.isListed ? 'public' : 'private']);
  }
  return { kind: 30003, content: existing?.content ?? '', tags };
}

function titleIsValid(value: string): boolean {
  return !!value.trim() && value.length <= 300;
}
