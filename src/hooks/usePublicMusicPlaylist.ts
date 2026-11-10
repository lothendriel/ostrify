import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import { useAppContext } from '@/hooks/useAppContext';
import { parsePublicMusicPlaylist, type PublicMusicPlaylist } from '@/lib/publicMusicPlaylists';

export function usePublicMusicPlaylist(identifier: string | undefined, id: string | undefined) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  return useQuery({
    queryKey: ['public-music-playlist', identifier ?? '', id ?? '', config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join('|')],
    enabled: !!identifier && !!id && config.relayMetadata.relays.some(relay => relay.read),
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<PublicMusicPlaylist | undefined> => {
      if (!identifier || !id) return undefined;
      let pubkey: string;
      try {
        const decoded = nip19.decode(identifier);
        if (decoded.type === 'npub') pubkey = decoded.data;
        else if (decoded.type === 'nprofile') pubkey = decoded.data.pubkey;
        else throw new Error('Invalid playlist publisher');
      } catch {
        throw new Error('Invalid playlist publisher identifier');
      }
      const readUrls = [...new Set(config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url))];
      if (!readUrls.length) return undefined;
      const results = await Promise.allSettled(readUrls.map(url =>
        nostr.relay(url).query(
          [{ kinds: [34139], authors: [pubkey], '#d': [id], limit: 1 }],
          { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
        ),
      ));
      if (signal.aborted) throw signal.reason;
      if (results.every(result => result.status === 'rejected')) throw new Error('Could not query any read relays');
      const events = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const event = events.sort((left, right) => right.created_at - left.created_at)[0];
      return event ? parsePublicMusicPlaylist(event) : undefined;
    },
  });
}
