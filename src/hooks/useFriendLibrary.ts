import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { wavlakeTrackUrl, wavlakeArtistId } from '@/hooks/useWavlake';
import { isOstrifyMusicPlaylist, playlistTrackRefs } from '@/lib/musicPlaylists';
import { eventToTrack } from '@/lib/music';

/** Public library content is always queried for the specific profile owner. */
export function useFriendLibrary(pubkey: string | undefined) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['friend-library', pubkey], enabled: !!pubkey && /^[0-9a-f]{64}$/.test(pubkey),
    queryFn: async ({ signal }) => {
      if (!pubkey) throw new Error('Missing profile');
      const events = await nostr.query([
        { kinds: [30003], authors: [pubkey], limit: 100 },
        { kinds: [30000], authors: [pubkey], '#d': ['ostrify-artists', 'ostrify-people'], limit: 20 },
      ], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      const byId = new Map<string, typeof events[number]>();
      for (const event of events.filter(e => e.pubkey === pubkey && e.kind === 30003)) {
        const d = event.tags.find(([n]) => n === 'd')?.[1];
        if (d && (!byId.has(d) || byId.get(d)!.created_at < event.created_at)) byId.set(d, event);
      }
      const candidates = [...byId.entries()];
      // Other apps also use bookmark sets for books and articles. Resolve only
      // unmarked event references and include a foreign list only when at least
      // one reference actually resolves to supported audio (or a Wavlake track).
      const unknownIds = [...new Set(candidates.filter(([, event]) => !isOstrifyMusicPlaylist(event)).flatMap(([, event]) => playlistTrackRefs(event).filter(ref => /^[0-9a-f]{64}$/.test(ref))))];
      let audioIds = new Set<string>();
      let otherListsUnverified = false;
      if (unknownIds.length) {
        try {
          const referenced = await nostr.query([{ ids: unknownIds }], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
          audioIds = new Set(referenced.filter(event => !!eventToTrack(event)).map(event => event.id));
          otherListsUnverified = unknownIds.some(id => !referenced.some(event => event.id === id));
        } catch {
          if (signal.aborted) throw signal.reason;
          otherListsUnverified = true;
        }
      }
      const privacyHideLiked = candidates.some(([, event]) => event.tags.some(([name, value]) => name === 'ostrify-hide' && value === 'liked'));
      const playlists = candidates.flatMap(([id, event]) => {
        if (event.tags.some(([name, value]) => name === 'ostrify-hide' && value === 'playlists')) return [];
        if (id === 'nostr-tunes-liked' && privacyHideLiked) return [];
        const refs = playlistTrackRefs(event);
        const known = isOstrifyMusicPlaylist(event);
        const tracks = known ? refs : refs.filter(ref => !!wavlakeTrackUrl(ref) || audioIds.has(ref));
        if (!known && !tracks.length) return [];
        return [{ id, title: event.tags.find(([n]) => n === 'title')?.[1] || (id === 'nostr-tunes-liked' ? 'Liked Songs' : 'Playlist'), tracks }];
      });
      const artistEvent = events.filter(e => e.kind === 30000 && e.pubkey === pubkey && e.tags.some(([n, d]) => n === 'd' && d === 'ostrify-artists')).sort((a, b) => b.created_at - a.created_at)[0];
      const artists = artistEvent?.tags.some(([name, value]) => name === 'ostrify-hide' && value === 'artists') ? [] : (artistEvent?.tags ?? []).flatMap(([name, value]) => {
        if (name === 'p' && /^[0-9a-f]{64}$/.test(value ?? '')) return [value];
        const artistId = name === 'i' && value ? wavlakeArtistId(value) : undefined;
        return artistId ? [`wavlake:${artistId}`] : [];
      });
      const peopleEvent = events.filter(e => e.kind === 30000 && e.pubkey === pubkey && e.tags.some(([n, d]) => n === 'd' && d === 'ostrify-people')).sort((a, b) => b.created_at - a.created_at)[0];
      const people = peopleEvent?.tags.some(([name, value]) => name === 'ostrify-hide' && value === 'people') ? [] : [...new Set((peopleEvent?.tags ?? []).filter(([name, value]) => name === 'p' && /^[0-9a-f]{64}$/.test(value ?? '') && value !== pubkey).map(([, value]) => value))];
      return { playlists, artists, people, otherListsUnverified };
    },
  });
}

export function useFriendStatuses(pubkeys: string[]) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['friend-statuses', ...pubkeys.slice().sort()], enabled: pubkeys.length > 0, refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [30315], authors: pubkeys, '#d': ['music'], limit: Math.max(50, pubkeys.length * 3) }], { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
      const latest = new Map<string, typeof events[number]>();
      for (const event of events) if (pubkeys.includes(event.pubkey) && (!latest.has(event.pubkey) || latest.get(event.pubkey)!.created_at < event.created_at)) latest.set(event.pubkey, event);
      return [...latest.values()].filter(e => {
        const expiry = Number(e.tags.find(([name]) => name === 'expiration')?.[1]);
        return !!e.content && Number.isFinite(expiry) && expiry > Date.now() / 1000;
      });
    },
  });
}
