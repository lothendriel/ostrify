import { useEffect, useMemo, useState } from "react";
import { Ban, CalendarDays, Heart, Sparkles, ThumbsDown } from "lucide-react";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { usePlayer } from "@/hooks/usePlayer";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { buildDailyDiscovery, blockDiscoveryArtist, DISCOVERY_FEEDBACK_EVENT, discoveryArtistKeys, markMoreLikeThis, markNotForMe, readDiscoveryFeedback, unblockDiscoveryArtist, type DiscoveryFeedback } from "@/lib/dailyDiscovery";
import type { Track } from "@/lib/music";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackCard } from "./TrackCard";

function todayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function artistLabel(key: string): string {
  if (key.startsWith("name:")) return key.slice(5);
  if (key.startsWith("wavlake:")) return `Wavlake artist ${key.slice(8, 16)}`;
  if (key.startsWith("pubkey:")) return `Nostr artist ${key.slice(7, 15)}`;
  return key.replace(/^publisher:/, "Publisher ").slice(0, 32);
}

export function DailyDiscoverySection({ candidates, isLoading }: { candidates: Track[]; isLoading: boolean }) {
  const player = usePlayer();
  const playlists = usePlaylists();
  const followedArtists = useFollowedArtists();
  const wavlake = useWavlakeCatalog();
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedQuery = useTracksByIds(likedPlaylist?.trackIds);
  const liked = likedQuery.data?.tracks ?? [];
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const allCandidates = useMemo(() => [...candidates, ...wavlakeTracks], [candidates, wavlakeTracks]);
  const [feedback, setFeedback] = useState<DiscoveryFeedback>(readDiscoveryFeedback);
  const [date, setDate] = useState(() => new Date());
  const [dismissedToday, setDismissedToday] = useState<string[]>([]);
  const pending = playlists.isLoading || likedQuery.isLoading || followedArtists.isLoading;

  useEffect(() => {
    const refresh = () => setFeedback(readDiscoveryFeedback());
    window.addEventListener(DISCOVERY_FEEDBACK_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DISCOVERY_FEEDBACK_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    setDismissedToday([]);
  }, [todayKey(date)]);

  useEffect(() => {
    const updateDay = () => setDate(new Date());
    const timer = window.setInterval(updateDay, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const discoveries = useMemo(() => buildDailyDiscovery({
    candidates: allCandidates,
    liked,
    history: player.history,
    followedArtists: followedArtists.data ?? [],
    feedback,
    date,
    limit: 12 + dismissedToday.length,
  }).filter(item => !dismissedToday.includes(item.track.id)).slice(0, 12), [allCandidates, liked, player.history, followedArtists.data, feedback, todayKey(date), dismissedToday]);
  const blockedTracks = useMemo(() => {
    const candidatesByArtist = new Map<string, { track: Track; keys: string[] }>();
    for (const track of allCandidates) {
      const keys = discoveryArtistKeys(track);
      if (keys.some(key => feedback.blockedArtists.includes(key))) {
        const canonicalKey = keys.find(key => feedback.blockedArtists.includes(key)) ?? keys[0];
        if (canonicalKey && !candidatesByArtist.has(canonicalKey)) candidatesByArtist.set(canonicalKey, { track, keys });
      }
    }
    return [...candidatesByArtist.entries()];
  }, [allCandidates, feedback.blockedArtists]);

  return (
    <section aria-labelledby="daily-discovery-heading" className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id="daily-discovery-heading" className="text-xl font-bold tracking-tight">Discover something new</h2>
          <span className="hidden text-xs font-medium text-emerald-300 sm:inline">Daily · {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
        <p className="text-xs text-muted-foreground">Nostr + Wavlake · feedback stays local</p>
      </header>

      {pending || (isLoading && !allCandidates.length) ? (
        <div className="flex gap-2 overflow-hidden" aria-label="Loading daily discoveries">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="w-[min(42vw,176px)] shrink-0 space-y-2 rounded-lg p-2"><Skeleton className="aspect-square rounded-md" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}
        </div>
      ) : discoveries.length ? (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {discoveries.map(({ track, reason }) => (
            <article key={track.id} className="w-[min(42vw,176px)] shrink-0 rounded-lg border border-border/50 bg-card/60 p-1.5">
              <TrackCard track={track} showLikeAction showPlaylistAction compact />
              <p className="px-2 pb-1 text-[11px] leading-tight text-emerald-200/80">{reason}</p>
              <div className="grid grid-cols-1 gap-0.5 px-1 pb-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 justify-start gap-1.5 px-1.5 text-[11px]" onClick={() => { setFeedback(markMoreLikeThis(track, date)); setDismissedToday(ids => ids.includes(track.id) ? ids : [...ids, track.id]); }}>
                  <Heart className="size-3" /> More like this
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 justify-start gap-1.5 px-1.5 text-[11px] text-muted-foreground" onClick={() => { setFeedback(markNotForMe(track, date)); setDismissedToday(ids => ids.includes(track.id) ? ids : [...ids, track.id]); }}>
                  <ThumbsDown className="size-3" /> Not for me
                </Button>
                {discoveryArtistKeys(track).length > 0 && <Button type="button" variant="ghost" size="sm" className="h-7 justify-start gap-1.5 px-1.5 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => { setFeedback(blockDiscoveryArtist(track)); setDismissedToday(ids => [...new Set([...ids, ...discoveryArtistKeys(track).flatMap(key => discoveries.filter(item => discoveryArtistKeys(item.track).includes(key)).map(item => item.track.id))])]); }}>
                  <Ban className="size-3" /> Block artist
                </Button>}
              </div>
            </article>
          ))}
        </div>
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
