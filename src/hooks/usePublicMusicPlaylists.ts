import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isOstrifyMusicPlaylist } from '@/lib/musicPlaylists';
import { parsePublicMusicPlaylist, type PublicMusicPlaylist } from '@/lib/publicMusicPlaylists';

interface PlaylistDiscovery {
  playlists: PublicMusicPlaylist[];
  failedRelayCount: number;
}

function readLocalDeletion(pubkey: string, id: string): number | undefined {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`nostr:deleted-playlists:v1:${pubkey}`) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const value: unknown = (parsed as Record<string, unknown>)[`30003:${pubkey}:${id}`];
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function usePublicMusicPlaylists(enabled = true) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const relays = [...new Set(config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url))].sort();
  const relayKey = relays.join('|');

  return useQuery({
    queryKey: ['ostrify-public-playlists', relayKey, user?.pubkey ?? ''],
    enabled: enabled && relays.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }): Promise<PlaylistDiscovery> => {
      const filters: NostrFilter[] = [
        { kinds: [30003], limit: 200 },
        ...(user ? [{ kinds: [5], authors: [user.pubkey], limit: 200 }] : []),
      ];
      const results = await Promise.allSettled(relays.map(url =>
        nostr.relay(url).query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) }),
      ));
      if (signal.aborted) throw signal.reason;
      const failedRelayCount = results.filter(result => result.status === 'rejected').length;
      if (results.every(result => result.status === 'rejected')) throw new Error('Could not query any read relays');
      const byAddress = new Map<string, PublicMusicPlaylist>();
      const events = [...new Map(results.flatMap(result => result.status === 'fulfilled' ? result.value : []).map(event => [event.id, event])).values()];
      const deletionTimes = new Map<string, number>();
      if (user) {
        const knownCoordinates = [...new Set(events.flatMap(event => {
          const playlistId = event.tags.find(([name]) => name === 'd')?.[1];
          return event.kind === 30003 && event.pubkey === user.pubkey && playlistId && isOstrifyMusicPlaylist(event)
            ? [`30003:${user.pubkey}:${playlistId}`]
            : [];
        }))].slice(0, 100);
        const deletionResults = knownCoordinates.length && !events.some(event => event.kind === 5 && event.pubkey === user.pubkey)
          ? await Promise.allSettled(relays.map(url => nostr.relay(url).query(
              [{ kinds: [5], authors: [user.pubkey], '#a': knownCoordinates, limit: 200 }],
              { signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) },
            )))
          : [];
        for (const deletion of deletionResults.flatMap(result => result.status === 'fulfilled' ? result.value : [])) {
          if (deletion.pubkey !== user.pubkey) continue;
          for (const [name, value] of deletion.tags) {
            const coordinate = name === 'a' && value.startsWith(`30003:${user.pubkey}:`)
              ? value
              : name === 'd' ? `30003:${user.pubkey}:${value}` : undefined;
            if (coordinate && knownCoordinates.includes(coordinate) && (name === 'a' || deletion.tags.some(([tagName, tagValue]) => tagName === 'a' && tagValue === coordinate))) {
              deletionTimes.set(coordinate, Math.max(deletionTimes.get(coordinate) ?? 0, deletion.created_at));
            }
          }
        }
      }
      const discoveryEvents = events.filter(event => event.kind === 30003 && isOstrifyMusicPlaylist(event));
      for (const event of discoveryEvents) {
        const playlist = parsePublicMusicPlaylist(event);
        if (!playlist || playlist.trackIds.length === 0) continue;
        const coordinate = `30003:${playlist.pubkey}:${playlist.id}`;
        const deletedAt = Math.max(deletionTimes.get(coordinate) ?? 0, playlist.pubkey === user?.pubkey ? readLocalDeletion(user.pubkey, playlist.id) ?? 0 : 0);
        if (deletedAt > 0 && playlist.createdAt <= deletedAt) continue;
        const key = `${playlist.pubkey}:${playlist.id}`;
        const existing = byAddress.get(key);
        if (!existing || playlist.createdAt > existing.createdAt) byAddress.set(key, playlist);
      }
      return { playlists: [...byAddress.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, 100), failedRelayCount };
    },
  });
}
