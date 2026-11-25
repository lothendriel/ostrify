import { useEffect, useMemo, useState } from "react";
import { Ban, Heart, RefreshCw, Sparkles, ThumbsDown } from "lucide-react";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { usePlayer } from "@/hooks/usePlayer";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { isSessionMusicTrack, readHomeSessionSnapshot, writeHomeSessionSnapshot } from "@/lib/homeSession";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { buildDailyDiscovery, blockDiscoveryArtist, DISCOVERY_FEEDBACK_EVENT, discoveryArtistKeys, markMoreLikeThis, markNotForMe, readDiscoveryFeedback, unblockDiscoveryArtist, type DiscoveryFeedback, type DailyDiscoveryTrack } from "@/lib/dailyDiscovery";
import type { Track } from "@/lib/music";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackCard } from "./TrackCard";
import { HorizontalCarousel } from "@/components/music/HorizontalCarousel";

interface DiscoverySnapshot {
  items: DailyDiscoveryTrack[];
  date: string;
  variation: number;
  dismissed: string[];
}

function isDiscoverySnapshot(value: unknown): value is DiscoverySnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.date === 'string' && Number.isFinite(Date.parse(snapshot.date))
    && typeof snapshot.variation === 'number' && Number.isSafeInteger(snapshot.variation)
    && Array.isArray(snapshot.dismissed) && snapshot.dismissed.every(id => typeof id === 'string')
    && Array.isArray(snapshot.items) && snapshot.items.every((value: unknown) => {
      if (!value || typeof value !== 'object') return false;
      const item = value as Record<string, unknown>;
      return typeof item.reason === 'string' && isSessionMusicTrack(item.track);
    });
}

function artistLabel(key: string): string {
  if (key.startsWith("name:")) return key.slice(5);
  if (key.startsWith("wavlake:")) return `Wavlake artist ${key.slice(8, 16)}`;
  if (key.startsWith("pubkey:")) return `Nostr artist ${key.slice(7, 15)}`;
  return key.replace(/^publisher:/, "Publisher ").slice(0, 32);
}

export function DailyDiscoverySection({ candidates, isLoading, excludeTrackIds = [], excludeTrackUrls = [], active = true, sessionScope }: { candidates: Track[]; isLoading: boolean; excludeTrackIds?: string[]; excludeTrackUrls?: string[]; active?: boolean; sessionScope?: string }) {
  const player = usePlayer();
  const { user } = useCurrentUser();
  const snapshotKey = `discovery:${user?.pubkey ?? 'public'}`;
  const storedSnapshot = useMemo(() => readHomeSessionSnapshot(snapshotKey, isDiscoverySnapshot), [snapshotKey]);
  const [snapshotState, setSnapshotState] = useState<{ key: string; value: DiscoverySnapshot } | null>(() => storedSnapshot ? { key: snapshotKey, value: storedSnapshot } : null);
  const snapshot = snapshotState?.key === snapshotKey ? snapshotState.value : storedSnapshot;
  const playlists = usePlaylists(active, sessionScope);
  const followedArtists = useFollowedArtists(active, sessionScope);
  const wavlake = useWavlakeCatalog(undefined, active, sessionScope);
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedQuery = useTracksByIds(likedPlaylist?.trackIds, active, [], sessionScope);
  const liked = likedQuery.data?.tracks ?? [];
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const allCandidates = useMemo(() => [...candidates, ...wavlakeTracks], [candidates, wavlakeTracks]);
  const [feedback, setFeedback] = useState<DiscoveryFeedback>(readDiscoveryFeedback);
  const pending = active && (playlists.isLoading || likedQuery.isLoading || followedArtists.isLoading || wavlake.isLoading);

  useEffect(() => {
    const refresh = () => setFeedback(readDiscoveryFeedback());
    window.addEventListener(DISCOVERY_FEEDBACK_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DISCOVERY_FEEDBACK_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const buildSnapshot = (date: Date, variation: number, currentFeedback: DiscoveryFeedback, dismissed: string[]): DiscoverySnapshot => ({
    date: date.toISOString(), variation, dismissed,
    items: buildDailyDiscovery({
      candidates: allCandidates, liked, history: player.history,
      followedArtists: followedArtists.data ?? [], feedback: currentFeedback,
      date, limit: 10 + dismissed.length, variation, excludeTrackIds, excludeTrackUrls,
    }).filter(item => !dismissed.includes(item.track.id)).slice(0, 10),
  });

  useEffect(() => {
    if (snapshot || !active || isLoading || pending) return;
    const date = new Date();
    const next: DiscoverySnapshot = {
      date: date.toISOString(), variation: 0, dismissed: [],
      items: buildDailyDiscovery({ candidates: allCandidates, liked, history: player.history, followedArtists: followedArtists.data ?? [], feedback, date, limit: 10, excludeTrackIds, excludeTrackUrls }),
    };
    writeHomeSessionSnapshot(snapshotKey, next);
    setSnapshotState({ key: snapshotKey, value: next });
  }, [snapshot, active, isLoading, pending, allCandidates, liked, player.history, followedArtists.data, feedback, snapshotKey, excludeTrackIds.join('|'), excludeTrackUrls.join('|')]);

  const saveSnapshot = (next: DiscoverySnapshot) => {
    writeHomeSessionSnapshot(snapshotKey, next);
    setSnapshotState({ key: snapshotKey, value: next });
  };
  const date = snapshot ? new Date(snapshot.date) : new Date();
  const discoveries = (snapshot?.items ?? []).filter(({ track }) =>
    !feedback.hiddenTrackIds.includes(track.id) && !discoveryArtistKeys(track).some(key => feedback.blockedArtists.includes(key)));
  const refreshDiscoveries = () => {
    if (!snapshot) return;
    saveSnapshot(buildSnapshot(new Date(), snapshot.variation + 1, feedback, snapshot.dismissed));
  };
  const applyFeedback = (track: Track, action: 'more' | 'less' | 'block') => {
    if (!snapshot) return;
    const nextFeedback = action === 'more' ? markMoreLikeThis(track, new Date()) : action === 'less' ? markNotForMe(track, new Date()) : blockDiscoveryArtist(track);
    setFeedback(nextFeedback);
    const artistKeys = new Set(discoveryArtistKeys(track));
    const dismissed = [...new Set([...snapshot.dismissed, ...snapshot.items.filter(item => item.track.id === track.id || (action === 'block' && discoveryArtistKeys(item.track).some(key => artistKeys.has(key)))).map(item => item.track.id)])];
    const retained = snapshot.items.filter(item => !dismissed.includes(item.track.id));
    const replacements = buildSnapshot(new Date(snapshot.date), snapshot.variation, nextFeedback, dismissed).items
      .filter(item => !retained.some(existing => existing.track.id === item.track.id || existing.track.url === item.track.url));
    saveSnapshot({ ...snapshot, dismissed, items: [...retained, ...replacements].slice(0, 10) });
  };
  const blockedTracks = useMemo(() => {
    const candidatesByArtist = new Map<string, { track: Track; keys: string[] }>();
    for (const track of [...allCandidates, ...(snapshot?.items.map(item => item.track) ?? [])]) {
      const keys = discoveryArtistKeys(track);
      if (keys.some(key => feedback.blockedArtists.includes(key))) {
        const canonicalKey = keys.find(key => feedback.blockedArtists.includes(key)) ?? keys[0];
        if (canonicalKey && !candidatesByArtist.has(canonicalKey)) candidatesByArtist.set(canonicalKey, { track, keys });
      }
    }
    return [...candidatesByArtist.entries()];
  }, [allCandidates, feedback.blockedArtists, snapshot]);

  return (
    <section aria-labelledby="daily-discovery-heading" className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id="daily-discovery-heading" className="text-xl font-bold tracking-tight">Discover something new</h2>
          <span className="hidden text-xs font-medium text-emerald-300 sm:inline">Fresh · {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs text-muted-foreground sm:block">Fresh finds shaped by your listening · feedback stays local</p>
          <Button type="button" variant="ghost" size="icon" onClick={refreshDiscoveries} disabled={!snapshot || isLoading || pending} aria-label="Refresh discoveries" title="Show another set of discoveries" className="size-8 rounded-full text-muted-foreground hover:text-foreground"><RefreshCw className="size-4" /></Button>
        </div>
      </header>

      {!snapshot ? (
        <HorizontalCarousel label="Loading daily discoveries">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="min-w-0 snap-start space-y-2 rounded-lg p-2"><Skeleton className="aspect-square rounded-md" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}
        </HorizontalCarousel>
      ) : discoveries.length ? (
        <HorizontalCarousel label="Daily discoveries">
          {discoveries.map(({ track, reason }) => (
            <article key={track.id} className="min-w-0 snap-start max-w-full overflow-hidden rounded-lg border border-border/50 bg-card/60 p-1.5">
              <TrackCard track={track} showLikeAction showPlaylistAction compact />
              <p className="px-2 pb-1 text-[11px] leading-tight text-emerald-200/80">{reason}</p>
              <div className="grid grid-cols-1 gap-0 px-1 pb-1">
                <Button type="button" variant="ghost" size="sm" className="h-6 justify-start gap-1.5 px-1.5 text-[11px]" onClick={() => applyFeedback(track, 'more')}>
                  <Heart className="size-3" /> More like this
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 justify-start gap-1.5 px-1.5 text-[11px] text-muted-foreground" onClick={() => applyFeedback(track, 'less')}>
                  <ThumbsDown className="size-3" /> Not for me
                </Button>
                {discoveryArtistKeys(track).length > 0 && <Button type="button" variant="ghost" size="sm" className="h-6 justify-start gap-1.5 px-1.5 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => applyFeedback(track, 'block')}>
                  <Ban className="size-3" /> Block artist
                </Button>}
              </div>
            </article>
          ))}
        </HorizontalCarousel>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <Sparkles className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">Your next discoveries are still taking shape.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Try again after more music is available from your read relays or Wavlake, or adjust your artist blocks below.</p>
        </div>
      )}

      {blockedTracks.length > 0 && <section aria-labelledby="blocked-artists-heading" className="rounded-xl border border-border/60 p-4">
        <h3 id="blocked-artists-heading" className="font-semibold">Blocked artists</h3>
        <p className="mt-1 text-xs text-muted-foreground">Only affects this browser’s Daily Discovery feed.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {blockedTracks.map(([key, { track, keys }]) => <li key={key} className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm"><span className="max-w-48 truncate">{track.artist || artistLabel(key)}</span><button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setFeedback(unblockDiscoveryArtist(keys))} aria-label={`Unblock ${track.artist || artistLabel(key)}`}>Unblock</button></li>)}
        </ul>
      </section>}
    </section>
  );
}
