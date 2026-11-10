import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { parsePublicMusicPlaylist, type PublicMusicPlaylist } from '@/lib/publicMusicPlaylists';

interface PlaylistDiscovery {
  playlists: PublicMusicPlaylist[];
  failedRelayCount: number;
}

export function usePublicMusicPlaylists(enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const relays = [...new Set(config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url))].sort();
  const relayKey = relays.join('|');

  return useQuery({
    queryKey: ['public-music-playlists', relayKey],
    enabled: enabled && relays.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<PlaylistDiscovery> => {
      const filters: NostrFilter[] = [{ kinds: [34139], limit: 200 }];
      const results = await Promise.allSettled(relays.map(url =>
        nostr.relay(url).query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) }),
      ));
      if (signal.aborted) throw signal.reason;
      const failedRelayCount = results.filter(result => result.status === 'rejected').length;
      if (results.every(result => result.status === 'rejected')) throw new Error('Could not query any read relays');
      const byAddress = new Map<string, PublicMusicPlaylist>();
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        for (const event of result.value) {
          const playlist = parsePublicMusicPlaylist(event);
          if (!playlist) continue;
          const key = `${playlist.pubkey}:${playlist.id}`;
          const existing = byAddress.get(key);
          if (!existing || playlist.createdAt > existing.createdAt) byAddress.set(key, playlist);
        }
      }
      return { playlists: [...byAddress.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, 100), failedRelayCount };
    },
  });
}
