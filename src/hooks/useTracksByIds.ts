import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";
import { fetchWavlakeTrack, wavlakeTrackUrl } from "./useWavlake";
import { fetchFountainTrack } from "./usePodcasts";

/** Resolve Nostr event ids and external catalog references, preserving list order. */
export function useTracksByIds(ids: string[] | undefined) {
  const { nostr } = useNostr();
  const key = (ids ?? []).join(",");

  return useQuery({
    queryKey: ["tracks-by-ids", key],
    queryFn: async (c) => {
      if (!ids?.length) return { tracks: [] as Track[], unavailable: 0 };
      const eventIds = ids.filter((id) => /^[0-9a-f]{64}$/i.test(id));
      const catalogIds = [...new Set(ids.filter((id) => !!wavlakeTrackUrl(id)))];
      const fountainIds = [...new Set(ids.filter((id) => id.startsWith("fountain:episode:id:")))];
      const byId = new Map<string, Track>();
      const eventsPromise = eventIds.length
        ? nostr.query([{ ids: eventIds }], { signal: AbortSignal.any([c.signal, AbortSignal.timeout(12000)]) }).catch(() => [])
        : Promise.resolve([]);
      const externalPromises = Promise.all(fountainIds.map((id) => fetchFountainTrack(
        id, AbortSignal.any([c.signal, AbortSignal.timeout(12000)]),
      ).catch(() => null)));
      // Give each batch its own timeout; a large playlist shouldn't expire all
      // remaining tracks while earlier requests are still being resolved.
      for (let offset = 0; offset < catalogIds.length; offset += 5) {
        if (c.signal.aborted) throw c.signal.reason;
        const batch = catalogIds.slice(offset, offset + 5);
        const resolved = await Promise.all(batch.map((id) => fetchWavlakeTrack(
          id.slice('wavlake:'.length), AbortSignal.any([c.signal, AbortSignal.timeout(12000)]),
        ).catch(() => null)));
        for (const track of resolved) if (track) byId.set(track.id.toLowerCase(), track);
      }
      if (c.signal.aborted) throw c.signal.reason;
      for (const track of await externalPromises) if (track) byId.set(track.id.toLowerCase(), track);
      for (const event of await eventsPromise) {
        const track = eventToTrack(event);
        if (track) byId.set(event.id, track);
      }
      const tracks = ids.map((id) => byId.get(id.toLowerCase())).filter((t): t is Track => !!t);
      return { tracks, unavailable: ids.length - tracks.length };
    },
    enabled: !!ids?.length,
  });
}
