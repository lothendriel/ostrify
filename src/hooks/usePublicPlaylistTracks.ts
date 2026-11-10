import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';
import { eventToTrack, type Track } from '@/lib/music';
import { fetchWavlakeTrack } from '@/hooks/useWavlake';
import { fetchFountainTrack } from '@/hooks/usePodcasts';
import type { PlaylistTrackReference } from '@/lib/publicMusicPlaylists';

function referenceKey(reference: PlaylistTrackReference): string {
  if (reference.type === 'event') return `event:${reference.id}`;
  if (reference.type === 'address') return `address:${reference.kind}:${reference.pubkey}:${reference.identifier}`;
  if (reference.type === 'wavlake') return `wavlake:${reference.id}`;
  return `fountain:${reference.id}`;
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
      const ids = [...new Set(references.flatMap(reference => reference.type === 'event' ? [reference.id] : []))].slice(0, 250);
      const wavlake = [...new Map(references.flatMap(reference => reference.type === 'wavlake' ? [[referenceKey(reference), reference] as const] : [])).values()].slice(0, 250);
      const fountain = [...new Map(references.flatMap(reference => reference.type === 'fountain' ? [[referenceKey(reference), reference] as const] : [])).values()].slice(0, 250);
      const addresses = [...new Map(references.flatMap(reference => reference.type === 'address' ? [[referenceKey(reference), reference] as const] : [])).values()].slice(0, 250);
      const filters: NostrFilter[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const batch = ids.slice(offset, offset + 100);
        filters.push({ ids: batch, limit: batch.length });
      }
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
      const events = filters.length
        ? (await Promise.all(filters.map(filter => nostr.query([filter], { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) }))).then(results => results.flat()))
        : [];
      const externalTracks = await Promise.all([
        ...wavlake.map(reference => reference.type === 'wavlake'
          ? fetchWavlakeTrack(reference.id.slice('wavlake:'.length), AbortSignal.any([signal, AbortSignal.timeout(12000)])).catch(() => null)
          : Promise.resolve(null)),
        ...fountain.map(reference => reference.type === 'fountain'
          ? fetchFountainTrack(reference.id, AbortSignal.any([signal, AbortSignal.timeout(12000)])).catch(() => null)
          : Promise.resolve(null)),
      ]);
      const requestedAddresses = new Set(addresses.map(referenceKey));
      const byReference = new Map<string, Track>();
      for (const track of externalTracks) {
        if (track?.source === 'wavlake') byReference.set(`wavlake:${track.id}`, track);
        else if (track?.source === 'fountain') byReference.set(`fountain:${track.id}`, track);
      }
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
