import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { sanitizeUrl } from '@/lib/sanitize';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_PUBKEY = /^[0-9a-f]{64}$/i;
export const SAVED_ALBUMS_ID = 'ostrify-wavlake-albums-v1';
export const WAVLAKE_ALBUM_TAG = 'ostrify-album';
export const NOSTR_ALBUM_TAG = 'ostrify-nostr-album';

export interface SavedAlbum {
  id: string;
  source: 'wavlake' | 'nostr';
  title: string;
  artist?: string;
  artistPubkey?: string;
  image?: string;
  isListed: boolean;
}

export function wavlakeAlbumUrl(albumId: string): string | undefined {
  return UUID.test(albumId) ? `https://wavlake.com/album/${albumId.toLowerCase()}` : undefined;
}

export function nostrAlbumId(pubkey: string, title: string): string | undefined {
  if (!HEX_PUBKEY.test(pubkey) || !title.trim() || title.trim().length > 300) return undefined;
  return `nostr:${pubkey.toLowerCase()}:${encodeURIComponent(title.trim().toLocaleLowerCase())}`;
}

export function savedAlbumPath(album: SavedAlbum): string {
  if (album.source === 'nostr' && album.artistPubkey) {
    return `/artist/${nip19.npubEncode(album.artistPubkey)}/album?title=${encodeURIComponent(album.title)}`;
  }
  return `/wavlake/album/${encodeURIComponent(album.id)}`;
}

export function parseSavedAlbums(event: NostrEvent | undefined): SavedAlbum[] {
  if (!event || event.kind !== 30003 || !event.tags.some(([name, value]) => name === 'd' && value === SAVED_ALBUMS_ID)) return [];
  const albums = new Map<string, SavedAlbum>();
  for (const [name, id, title, artist, image, visibility] of event.tags) {
    if (name !== WAVLAKE_ALBUM_TAG || !id || !UUID.test(id) || !title?.trim()) continue;
    const normalizedId = id.toLowerCase();
    albums.set(normalizedId, {
      id: normalizedId,
      source: 'wavlake',
      title: title.trim().slice(0, 300),
      artist: artist?.trim().slice(0, 200) || undefined,
      image: sanitizeUrl(image),
      isListed: visibility !== 'private',
    });
  }
  for (const [name, pubkey, title, artist, image, visibility] of event.tags) {
    if (name !== NOSTR_ALBUM_TAG || !pubkey || !HEX_PUBKEY.test(pubkey) || !title?.trim()) continue;
    const normalizedTitle = title.trim().slice(0, 300);
    const id = nostrAlbumId(pubkey, normalizedTitle);
    if (!id) continue;
    albums.set(id, {
      id,
      source: 'nostr',
      title: normalizedTitle,
      artist: artist?.trim().slice(0, 200) || undefined,
      artistPubkey: pubkey.toLowerCase(),
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
    !(name === NOSTR_ALBUM_TAG) &&
    !(name === 'i' && value && /^https:\/\/wavlake\.com\/album\/[0-9a-f-]+$/i.test(value)),
  ).map(tag => [...tag]) ?? [];
  tags.unshift(['d', SAVED_ALBUMS_ID], ['title', 'Saved Albums']);

  for (const album of albums) {
    if (!titleIsValid(album.title) || album.artist?.length && album.artist.length > 200) continue;
    const image = sanitizeUrl(album.image) ?? '';
    const visibility = album.isListed ? 'public' : 'private';
    if (album.source === 'nostr') {
      if (!album.artistPubkey || !HEX_PUBKEY.test(album.artistPubkey)) continue;
      tags.push([NOSTR_ALBUM_TAG, album.artistPubkey.toLowerCase(), album.title.trim().slice(0, 300), album.artist?.trim().slice(0, 200) ?? '', image, visibility]);
    } else {
      const id = album.id.toLowerCase();
      const url = wavlakeAlbumUrl(id);
      if (!url) continue;
      tags.push(['i', url], [WAVLAKE_ALBUM_TAG, id, album.title.trim().slice(0, 300), album.artist?.trim().slice(0, 200) ?? '', image, visibility]);
    }
  }
  return { kind: 30003, content: existing?.content ?? '', tags };
}

function titleIsValid(value: string): boolean {
  return !!value.trim() && value.length <= 300;
}
