import { useEffect, useMemo, useRef, useState } from "react";
import { usePodcastEpisodes } from "@/hooks/usePodcasts";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Shelf } from "@/components/music/Shelf";
import { readHomeSessionSnapshot, writeHomeSessionSnapshot } from "@/lib/homeSession";
import type { Track } from "@/lib/music";

const SHELF_SIZE = 10;

function isPodcastSnapshot(value: unknown): value is Track[] {
  return Array.isArray(value) && value.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const track = item as Record<string, unknown>;
    return track.kind === "podcast" && typeof track.id === "string" && typeof track.url === "string"
      && typeof track.title === "string" && typeof track.pubkey === "string"
      && typeof track.createdAt === "number" && Array.isArray(track.topics)
      && track.topics.every(topic => typeof topic === "string");
  });
}

function distinctEpisodes(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter(track => {
    if (track.kind !== "podcast" || seen.has(track.url)) return false;
    seen.add(track.url);
    return true;
  });
}

function nextSelection(candidates: Track[], previous: Track[]): Track[] {
  const unique = distinctEpisodes(candidates);
  const previousUrls = new Set(previous.map(track => track.url));
  const fresh = unique.filter(track => !previousUrls.has(track.url));
  const familiar = unique.filter(track => previousUrls.has(track.url));
  // Prefer unseen episodes and rotate when the available catalog is small.
  if (!fresh.length && familiar.length > 1) familiar.push(familiar.shift()!);
  return [...fresh, ...familiar].slice(0, SHELF_SIZE);
}

export function HomePodcastsSection({ enabled, sessionScope }: { enabled: boolean; sessionScope?: string }) {
  const { user } = useCurrentUser();
  const snapshotKey = `podcasts:${user?.pubkey ?? "public"}`;
  const stored = useMemo(() => readHomeSessionSnapshot(snapshotKey, isPodcastSnapshot), [snapshotKey]);
  const [snapshotState, setSnapshotState] = useState<{ key: string; tracks: Track[] } | null>(() => stored ? { key: snapshotKey, tracks: stored } : null);
  const snapshot = snapshotState?.key === snapshotKey ? snapshotState.tracks : stored;
  const [refreshing, setRefreshing] = useState(false);
  const currentSnapshotKey = useRef(snapshotKey);
  currentSnapshotKey.current = snapshotKey;
  const podcasts = usePodcastEpisodes(40, 10, enabled && !snapshot, sessionScope);

  useEffect(() => {
    if (!enabled || snapshot || podcasts.isFetching || !podcasts.isSuccess) return;
    const tracks = distinctEpisodes(podcasts.data).slice(0, SHELF_SIZE);
    writeHomeSessionSnapshot(snapshotKey, tracks);
    setSnapshotState({ key: snapshotKey, tracks });
  }, [enabled, snapshot, podcasts.isFetching, podcasts.isSuccess, podcasts.data, snapshotKey]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await podcasts.refetch();
      if (!result.isSuccess || currentSnapshotKey.current !== snapshotKey) return;
      const candidates = distinctEpisodes(result.data);
      // Keep the existing shelf if the source temporarily returns no episodes.
      if (!candidates.length && snapshot?.length) return;
      const tracks = nextSelection(candidates, snapshot ?? []);
      writeHomeSessionSnapshot(snapshotKey, tracks);
      setSnapshotState({ key: snapshotKey, tracks });
    } finally {
      setRefreshing(false);
    }
  };

  return <Shelf title="Podcasts" subtitle="Episodes from Nostr and Fountain.fm" tracks={snapshot ?? []} isLoading={!snapshot && (!enabled || podcasts.isFetching)} dense seeAllHref="/podcasts/episodes" onRefresh={() => void refresh()} refreshDisabled={refreshing || !enabled || (!snapshot && podcasts.isFetching)} emptyMessage="No episodes available right now. Try refreshing or check your relay connections." />;
}
