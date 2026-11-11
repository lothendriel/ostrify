import type { NostrEvent } from '@nostrify/nostrify';
import { MUSIC_TRACK_KINDS } from '@/lib/music';
import { isOstrifyMusicPlaylist, LIKED_TRACKS_IDENTIFIER, PLAYLIST_VISIBILITY_TAG } from '@/lib/musicPlaylists';
import { wavlakeTrackId } from '@/hooks/useWavlake';
import { fountainTrackId, podcastIndexTrackId } from '@/hooks/usePodcasts';
import { sanitizeUrl } from '@/lib/sanitize';

export interface PublicMusicPlaylist {
  id: string;
  pubkey: string;
  title: string;
  description?: string;
  image?: string;
  createdAt: number;
  event: NostrEvent;
  /** Track ids accepted by Ostrify kind 30003 lists, for compatibility with the existing resolver. */
  trackIds: string[];
  references: PlaylistTrackReference[];
}

export type PlaylistTrackReference =
  | { type: 'event'; id: string }
  | { type: 'address'; kind: number; pubkey: string; identifier: string }
  | { type: 'wavlake'; id: string; url: string }
  | { type: 'fountain'; id: string; url: string }
  | { type: 'podcast-index'; id: string; url: string };

export function parsePlaylistTrackReference(tag: string[]): PlaylistTrackReference | undefined {
  const [name, value] = tag;
  if (name === 'i' && value) {
    const id = wavlakeTrackId(value);
    if (id) return { type: 'wavlake', id, url: value };
    const fountainId = fountainTrackId(value);
    if (fountainId) return { type: 'fountain', id: fountainId, url: value };
    const podcastIndexId = podcastIndexTrackId(value);
    if (podcastIndexId) return { type: 'podcast-index', id: podcastIndexId, url: value };
  }
  if (name === 'e' && value && /^[0-9a-f]{64}$/i.test(value)) {
    return { type: 'event', id: value.toLowerCase() };
  }
  if (name !== 'a' || !value) return undefined;
  const match = value.match(/^(\d+):([0-9a-f]{64}):(.*)$/i);
  if (!match) return undefined;
  const kind = Number(match[1]);
  const identifier = match[3];
  if (!MUSIC_TRACK_KINDS.includes(kind as (typeof MUSIC_TRACK_KINDS)[number]) || !identifier || identifier.length > 256) return undefined;
  return { type: 'address', kind, pubkey: match[2].toLowerCase(), identifier };
}

export function parsePublicMusicPlaylist(event: NostrEvent): PublicMusicPlaylist | undefined {
  if (event.kind !== 30003 || !isOstrifyMusicPlaylist(event)) return undefined;
  if (event.tags.some(([name, value]) => name === PLAYLIST_VISIBILITY_TAG && value === 'private')) return undefined;
  const tags = event.tags;
  const id = tags.find(([name]) => name === 'd')?.[1];
  if (!id || id.length > 256 || id === LIKED_TRACKS_IDENTIFIER) return undefined;
  const title = tags.find(([name]) => name === 'title')?.[1]?.trim().slice(0, 160);
  const description = (tags.find(([name]) => name === 'description')?.[1]?.trim() || event.content.trim()).slice(0, 1200) || undefined;
  const image = sanitizeUrl(tags.find(([name]) => name === 'image')?.[1]);
  const references = tags.flatMap(tag => {
    const reference = parsePlaylistTrackReference(tag);
    return reference ? [reference] : [];
  }).slice(0, 100);
  const trackIds = references.map(reference => {
    if (reference.type === 'address') return `${reference.kind}:${reference.pubkey}:${reference.identifier}`;
    return reference.id;
  }).slice(0, 100);
  if (trackIds.length === 0) return undefined;
  return {
    id,
    pubkey: event.pubkey,
    title: title || 'Untitled playlist',
    description,
    image,
    createdAt: event.created_at,
    event,
    trackIds,
    references,
  };
}
