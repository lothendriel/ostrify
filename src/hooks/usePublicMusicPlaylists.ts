import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isOstrifyMusicPlaylist } from '@/lib/musicPlaylists';
import { clearPlaylistVisibilityOverride, parsePublicMusicPlaylist, readPlaylistVisibilityOverrides, type PublicMusicPlaylist, type PublicMusicPlaylistDiscovery } from '@/lib/publicMusicPlaylists';

function isNewerPlaylistEvent(candidate: NostrEvent, current: NostrEvent): boolean {
  return candidate.created_at > current.created_at ||
    (candidate.created_at === current.created_at && candidate.id < current.id);
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
    queryFn: async ({ signal }): Promise<PublicMusicPlaylistDiscovery> => {
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
      const eventMap = new Map(results.flatMap(result => result.status === 'fulfilled' ? result.value : []).map(event => [event.id, event]));
      const visibilityOverrides = user ? readPlaylistVisibilityOverrides(user.pubkey) : {};
      for (const [coordinate, override] of Object.entries(visibilityOverrides)) {
        const [kind, pubkey, id] = coordinate.split(':');
        const eventId = override.event.tags.find(([name]) => name === 'd')?.[1];
        if (kind === '30003' && pubkey === user?.pubkey && id === eventId && ![...eventMap.values()].some(event => event.pubkey === pubkey && event.kind === 30003 && event.tags.some(([name, value]) => name === 'd' && value === id))) {
          eventMap.set(override.event.id, override.event);
        }
      }
      const events = [...eventMap.values()];
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
      const latestByAddress = new Map<string, NostrEvent>();
      for (const event of events) {
        if (event.kind !== 30003 || !isOstrifyMusicPlaylist(event)) continue;
        const id = event.tags.find(([name]) => name === 'd')?.[1];
        if (!id) continue;
        const coordinate = `30003:${event.pubkey}:${id}`;
        if (event.pubkey === user?.pubkey && visibilityOverrides[coordinate] && !eventMap.has(visibilityOverrides[coordinate].event.id)) {
          latestByAddress.set(coordinate, visibilityOverrides[coordinate].event);
          continue;
        }
        const previous = latestByAddress.get(coordinate);
        if (!previous || isNewerPlaylistEvent(event, previous)) latestByAddress.set(coordinate, event);
      }
      for (const [coordinate, relayEvent] of latestByAddress) {
        const id = relayEvent.tags.find(([name]) => name === 'd')?.[1];
        if (!id) continue;
        const override = relayEvent.pubkey === user?.pubkey ? visibilityOverrides[coordinate] : undefined;
        const effectiveEvent = override && isNewerPlaylistEvent(override.event, relayEvent) ? override.event : relayEvent;
        if (user && override && isNewerPlaylistEvent(relayEvent, override.event)) clearPlaylistVisibilityOverride(user.pubkey, id);
        const playlist = parsePublicMusicPlaylist(effectiveEvent);
        if (!playlist || playlist.trackIds.length === 0) continue;
        const deletedAt = Math.max(deletionTimes.get(coordinate) ?? 0, playlist.pubkey === user?.pubkey ? readLocalDeletion(user.pubkey, playlist.id) ?? 0 : 0);
        if (deletedAt > 0 && playlist.createdAt <= deletedAt) continue;
        const key = `${playlist.pubkey}:${playlist.id}`;
        const existing = byAddress.get(key);
        if (!existing || isNewerPlaylistEvent(playlist.event, existing.event)) byAddress.set(key, playlist);
      }
      return { playlists: [...byAddress.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, 100), failedRelayCount };
    },
  });
}
