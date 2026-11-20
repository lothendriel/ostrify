import { useNostr } from "@nostrify/react";
import { useQuery } from "@tanstack/react-query";
import { eventToTrack, type Track } from "@/lib/music";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isTrackVisibleInOstrify } from "@/lib/musicVisibility";
import { parseN94Stream, parseTunestrStreamEvent } from "@/hooks/useTunestrStreams";
import { fetchWavlakeTrack, wavlakeTrackUrl } from "./useWavlake";
import { fetchFountainTrack, fetchPodcastIndexEpisodes, podcastIndexTrackUrl } from "./usePodcasts";
import { useAppContext } from '@/hooks/useAppContext';
import { captureDiscoveredAudioEvents } from '@/lib/audioCatalogCapture';

/** Resolve Nostr event ids and external catalog references, preserving list order. */
export function useTracksByIds(ids: string[] | undefined, enabled = true, additionalRelays: string[] = []) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const key = (ids ?? []).join(",");
  const relayKey = [...new Set(additionalRelays)].sort().join("|");

  return useQuery({
    queryKey: ["tracks-by-ids", key, relayKey, user?.pubkey ?? "public"],
    queryFn: async (c) => {
      if (!ids?.length) return { tracks: [] as Track[], unavailable: 0 };
      const addressRefs = ids.flatMap((id) => {
        const match = id.match(/^(\d+):([0-9a-f]{64}):(.+)$/i);
        return match && [30311, 31337, 36787, 32123, 30440].includes(Number(match[1]))
          ? [{ id, kind: Number(match[1]), pubkey: match[2].toLowerCase(), identifier: match[3] }]
          : [];
      });
      const addressIds = new Set(addressRefs.map(reference => reference.id));
      const eventIds = ids.filter((id) => /^[0-9a-f]{64}$/i.test(id) && !addressIds.has(id));
      const catalogIds = [...new Set(ids.filter((id) => !!wavlakeTrackUrl(id)))];
      const fountainIds = [...new Set(ids.filter((id) => id.startsWith("fountain:episode:id:")))];
      const podcastIndexIds = [...new Set(ids.filter((id) => !!podcastIndexTrackUrl(id)))];
      const directTuneStrIds = ids.filter(id => /^tunestr:[0-9a-f]{64}:.+/i.test(id));
      const directTuneStrEventIds = directTuneStrIds.flatMap(id => {
        const match = /^tunestr:([0-9a-f]{64}):(.+)$/i.exec(id);
        return match ? [`${match[1].toLowerCase()}:${match[2]}`] : [];
      });
      const uniqueEventIds = [...new Set([...eventIds, ...directTuneStrEventIds])];
      const byId = new Map<string, Track>();
      const queryRelays = async (filters: Parameters<typeof nostr.query>[0]) => {
        const signal = AbortSignal.any([c.signal, AbortSignal.timeout(12000)]);
        const queries = [
          nostr.query(filters, { signal }),
          ...additionalRelays.map(relay => nostr.relay(relay).query(filters, { signal })),
        ];
        const results = await Promise.allSettled(queries);
        return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
      };
      const eventsPromise = uniqueEventIds.length
        ? queryRelays([{ ids: uniqueEventIds }])
        : Promise.resolve([]);
      const addressGroups = new Map<string, { kind: number; pubkey: string; identifiers: Set<string> }>();
      for (const reference of addressRefs) {
        const groupKey = `${reference.kind}:${reference.pubkey}`;
        const group = addressGroups.get(groupKey) ?? { kind: reference.kind, pubkey: reference.pubkey, identifiers: new Set<string>() };
        group.identifiers.add(reference.identifier);
        addressGroups.set(groupKey, group);
      }
      const addressEventsPromise = Promise.all([...addressGroups.values()].map(group => queryRelays(
        [{ kinds: [group.kind], authors: [group.pubkey], '#d': [...group.identifiers], limit: group.identifiers.size }],
      ))).then(results => results.flat());
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
      for (const id of podcastIndexIds) {
        const episodeId = Number(id.slice("podcast-index:episode:id:".length));
        if (!Number.isInteger(episodeId) || episodeId < 1) continue;
        const track = await fetchPodcastIndexEpisodes(episodeId, AbortSignal.any([c.signal, AbortSignal.timeout(12000)]));
        if (track) byId.set(track.id.toLowerCase(), track);
      }
      const nostrEvents = [...await eventsPromise, ...await addressEventsPromise];
      captureDiscoveredAudioEvents(nostr, nostrEvents, user?.pubkey, config.relayMetadata.relays.filter(relay => relay.write).map(relay => relay.url));
      for (const event of nostrEvents) {
        const track = event.kind === 1053
          ? parseN94Stream(event)?.track
          : event.kind === 30311
            ? parseTunestrStreamEvent(event)?.track
            : eventToTrack(event);
        if (!track) continue;
        track.eventKind = event.kind;
        byId.set(event.id.toLowerCase(), track);
        if (event.kind === 1053) byId.set(`tunestr:n94:${event.id}`.toLowerCase(), track);
        const addressIdentifier = event.tags.find(([name]) => name === 'd')?.[1];
        if (event.kind === 30311 && addressIdentifier) {
          byId.set(`tunestr:${event.pubkey.toLowerCase()}:${addressIdentifier}`.toLowerCase(), track);
          byId.set(`30311:${event.pubkey.toLowerCase()}:${addressIdentifier}`.toLowerCase(), track);
        }
        if ([30311, 31337, 36787, 32123, 30440].includes(event.kind)) {
          const identifier = event.tags.find(([name]) => name === 'd')?.[1];
          if (identifier) byId.set(`${event.kind}:${event.pubkey.toLowerCase()}:${identifier}`, track);
          if (identifier) byId.set(`${event.pubkey.toLowerCase()}:${identifier}`, track);
        }
      }
      const tracks = ids.map((id) => byId.get(id.toLowerCase()) ?? byId.get(id)).filter((t): t is Track => !!t && (t.kind !== "music" || isTrackVisibleInOstrify(t, user?.pubkey)));
      return { tracks, unavailable: ids.length - tracks.length };
    },
    enabled: enabled && !!ids?.length,
  });
}
