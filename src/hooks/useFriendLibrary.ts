import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { wavlakeTrackId, wavlakeArtistId } from '@/hooks/useWavlake';

/** Public library content is always queried for the specific profile owner. */
export function useFriendLibrary(pubkey: string | undefined) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['friend-library', pubkey], enabled: !!pubkey && /^[0-9a-f]{64}$/.test(pubkey),
    queryFn: async ({ signal }) => {
      if (!pubkey) throw new Error('Missing profile');
      const events = await nostr.query([
        { kinds: [30003], authors: [pubkey], limit: 100 },
        { kinds: [30000], authors: [pubkey], '#d': ['ostrify-artists'], limit: 5 },
      ], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      const byId = new Map<string, typeof events[number]>();
      for (const event of events.filter(e => e.pubkey === pubkey && e.kind === 30003)) {
        const d = event.tags.find(([n]) => n === 'd')?.[1];
        if (d && (!byId.has(d) || byId.get(d)!.created_at < event.created_at)) byId.set(d, event);
      }
      const playlists = [...byId.entries()].map(([id, event]) => ({
        id, title: event.tags.find(([n]) => n === 'title')?.[1] || (id === 'nostr-tunes-liked' ? 'Liked Songs' : 'Playlist'),
        tracks: event.tags.flatMap(([name, value]) => {
          if (name === 'e' && /^[0-9a-f]{64}$/.test(value ?? '')) return [value];
          const external = name === 'i' && value ? wavlakeTrackId(value) : undefined;
          return external ? [external] : [];
        }),
      }));
      const artistEvent = events.filter(e => e.kind === 30000 && e.pubkey === pubkey).sort((a, b) => b.created_at - a.created_at)[0];
      const artists = (artistEvent?.tags ?? []).flatMap(([name, value]) => {
        if (name === 'p' && /^[0-9a-f]{64}$/.test(value ?? '')) return [value];
        const artistId = name === 'i' && value ? wavlakeArtistId(value) : undefined;
        return artistId ? [`wavlake:${artistId}`] : [];
      });
      return { playlists, artists };
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
