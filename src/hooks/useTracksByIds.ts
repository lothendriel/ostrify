import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";

/** Resolve a list of event ids into playable Tracks, preserving order. */
export function useTracksByIds(ids: string[] | undefined) {
  const { nostr } = useNostr();
  const key = (ids ?? []).join(",");

  return useQuery({
    queryKey: ["tracks-by-ids", key],
    queryFn: async (c) => {
      if (!ids || ids.length === 0) return [] as Track[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(6000)]);
      const events = await nostr.query([{ ids }], { signal });

      const byId = new Map<string, Track>();
      for (const event of events) {
        const track = eventToTrack(event);
        if (track) byId.set(event.id, track);
      }
      // Preserve playlist order, drop unresolved.
      return ids.map((id) => byId.get(id)).filter((t): t is Track => !!t);
    },
    enabled: !!ids && ids.length > 0,
  });
}
