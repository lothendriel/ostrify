import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";
import { fetchWavlakeTrack, wavlakeTrackUrl } from "./useWavlake";

/** Resolve Nostr event ids and Wavlake catalog references, preserving list order. */
export function useTracksByIds(ids: string[] | undefined) {
  const { nostr } = useNostr();
  const key = (ids ?? []).join(",");

  return useQuery({
    queryKey: ["tracks-by-ids", key],
    queryFn: async (c) => {
      if (!ids?.length) return { tracks: [] as Track[], unavailable: 0 };
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(12000)]);
      const eventIds = ids.filter((id) => /^[0-9a-f]{64}$/i.test(id));
      const catalogIds = ids.filter((id) => !!wavlakeTrackUrl(id));
      const byId = new Map<string, Track>();
      const eventsPromise = eventIds.length ? nostr.query([{ ids: eventIds }], { signal }).catch(() => []) : Promise.resolve([]);
      // Limit concurrent catalog requests so a long list does not overwhelm the API.
      for (let offset = 0; offset < catalogIds.length; offset += 5) {
        const batch = catalogIds.slice(offset, offset + 5);
        const resolved = await Promise.all(batch.map((id) => fetchWavlakeTrack(id.slice('wavlake:'.length), signal).catch(() => null)));
        for (const track of resolved) if (track) byId.set(track.id, track);
      }
      for (const event of await eventsPromise) {
        const track = eventToTrack(event);
        if (track) byId.set(event.id, track);
      }
      const tracks = ids.map((id) => byId.get(id)).filter((t): t is Track => !!t);
      return { tracks, unavailable: ids.length - tracks.length };
    },
    enabled: !!ids?.length,
  });
}
