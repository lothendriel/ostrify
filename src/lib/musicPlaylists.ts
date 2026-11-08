import type { NostrEvent } from '@nostrify/nostrify';
import { wavlakeTrackId } from '@/hooks/useWavlake';
import { fountainTrackId } from '@/hooks/usePodcasts';

export const MUSIC_PLAYLIST_TOPIC = 'ostrify-music-playlist';
export const LIKED_TRACKS_IDENTIFIER = 'nostr-tunes-liked';

/** Known Ostrify lists include older playlists created before the music tag existed. */
export function isOstrifyMusicPlaylist(event: NostrEvent): boolean {
  const identifier = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
  return identifier === LIKED_TRACKS_IDENTIFIER || /^playlist-[0-9a-f]{8}$/i.test(identifier) ||
    event.tags.some(([name, value]) => name === 't' && value === MUSIC_PLAYLIST_TOPIC);
}

export function playlistTrackRefs(event: NostrEvent): string[] {
  return event.tags.flatMap(([name, value]) => {
    if (name === 'e' && /^[0-9a-f]{64}$/i.test(value ?? '')) return [value.toLowerCase()];
    const wavlake = name === 'i' && value ? wavlakeTrackId(value) : undefined;
    const fountain = name === 'i' && value ? fountainTrackId(value) : undefined;
    return wavlake ? [wavlake] : fountain ? [fountain] : [];
  });
}
