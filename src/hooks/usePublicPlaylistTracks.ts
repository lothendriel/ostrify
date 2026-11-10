import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';
import { eventToTrack, type Track } from '@/lib/music';
import type { PlaylistTrackReference } from '@/lib/publicMusicPlaylists';

function referenceKey(reference: PlaylistTrackReference): string {
  return reference.type === 'event'
    ? `event:${reference.id}`
    : `address:${reference.kind}:${reference.pubkey}:${reference.identifier}`;
}

export function usePublicPlaylistTracks(references: PlaylistTrackReference[] | undefined) {
  const { nostr } = useNostr();
  const key = (references ?? []).map(referenceKey).join('|');

  return useQuery({
    queryKey: ['public-playlist-tracks', key],
    enabled: !!references?.length,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<{ tracks: Track[]; unavailable: number }> => {
      if (!references?.length) return { tracks: [], unavailable: 0 };
      const ids = [...new Set(references.flatMap(reference => reference.type === 'event' ? [reference.id] : []))];
      const addresses = [...new Map(references.flatMap(reference => reference.type === 'address' ? [[referenceKey(reference), reference] as const] : [])).values()];
      const filters: NostrFilter[] = [];
      if (ids.length) filters.push({ ids, limit: ids.length });
      const addressGroups = new Map<string, { kind: number; pubkey: string; identifiers: Set<string> }>();
      for (const reference of addresses) {
        if (reference.type !== 'address') continue;
        const groupKey = `${reference.kind}:${reference.pubkey}`;
        const group = addressGroups.get(groupKey) ?? { kind: reference.kind, pubkey: reference.pubkey, identifiers: new Set<string>() };
        group.identifiers.add(reference.identifier);
        addressGroups.set(groupKey, group);
      }
      for (const group of addressGroups.values()) {
        filters.push({ kinds: [group.kind], authors: [group.pubkey], '#d': [...group.identifiers], limit: group.identifiers.size });
      }
      const events = await nostr.query(filters, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
      const requestedAddresses = new Set(addresses.map(referenceKey));
      const byReference = new Map<string, Track>();
      for (const event of events) {
        const track = eventToTrack(event);
        if (!track || track.kind !== 'music') continue;
        byReference.set(`event:${event.id.toLowerCase()}`, track);
        if (event.kind >= 30000 && event.kind < 40000) {
          const identifier = event.tags.find(([name]) => name === 'd')?.[1];
          const addressKey = identifier ? `address:${event.kind}:${event.pubkey.toLowerCase()}:${identifier}` : undefined;
          if (addressKey && requestedAddresses.has(addressKey)) byReference.set(addressKey, track);
        }
      }
      const tracks = references.flatMap(reference => {
        const track = byReference.get(referenceKey(reference));
        return track ? [track] : [];
      });
      return { tracks, unavailable: references.length - tracks.length };
    },
  });
}
