import type { NostrEvent } from '@nostrify/nostrify';
import { MUSIC_TRACK_KINDS } from '@/lib/music';
import { wavlakeTrackId } from '@/hooks/useWavlake';
import { fountainTrackId } from '@/hooks/usePodcasts';
import { sanitizeUrl } from '@/lib/sanitize';

export interface PublicMusicPlaylist {
  id: string;
  pubkey: string;
  title: string;
  description?: string;
  image?: string;
  createdAt: number;
  event: NostrEvent;
  references: PlaylistTrackReference[];
}

export type PlaylistTrackReference =
  | { type: 'event'; id: string }
  | { type: 'address'; kind: number; pubkey: string; identifier: string }
  | { type: 'wavlake'; id: string; url: string }
  | { type: 'fountain'; id: string; url: string };

const TRACK_KINDS = new Set<number>(MUSIC_TRACK_KINDS);

export function parsePlaylistTrackReference(tag: string[]): PlaylistTrackReference | undefined {
  const [name, value] = tag;
  if (name === 'i' && value) {
    const id = wavlakeTrackId(value);
    if (id) return { type: 'wavlake', id, url: value };
    const fountainId = fountainTrackId(value);
    if (fountainId) return { type: 'fountain', id: fountainId, url: value };
  }
  if (name === 'e' && value && /^[0-9a-f]{64}$/i.test(value)) {
    return { type: 'event', id: value.toLowerCase() };
  }
  if (name !== 'a' || !value) return undefined;
  const match = value.match(/^(\d+):([0-9a-f]{64}):(.*)$/i);
  if (!match) return undefined;
  const kind = Number(match[1]);
  const identifier = match[3];
  if (!TRACK_KINDS.has(kind) || !identifier || identifier.length > 256) return undefined;
  return { type: 'address', kind, pubkey: match[2].toLowerCase(), identifier };
}

export function parsePublicMusicPlaylist(event: NostrEvent): PublicMusicPlaylist | undefined {
  if (event.kind !== 34139) return undefined;
  const tags = event.tags;
  const id = tags.find(([name]) => name === 'd')?.[1];
  if (!id || id.length > 256) return undefined;
  const isPublic = tags.find(([name]) => name === 'public')?.[1];
  const isPrivate = tags.find(([name]) => name === 'private')?.[1] === 'true';
  if (isPrivate || isPublic === 'false') return undefined;
  const title = tags.find(([name]) => name === 'title')?.[1]?.trim().slice(0, 160);
  const description = (tags.find(([name]) => name === 'description')?.[1]?.trim() || event.content.trim()).slice(0, 1200) || undefined;
  const image = sanitizeUrl(tags.find(([name]) => name === 'image')?.[1]);
  const references = tags.flatMap(tag => {
    const reference = parsePlaylistTrackReference(tag);
    return reference ? [reference] : [];
  }).slice(0, 250);
  return {
    id,
    pubkey: event.pubkey,
    title: title || 'Untitled playlist',
    description,
    image,
    createdAt: event.created_at,
    event,
    references,
  };
}
