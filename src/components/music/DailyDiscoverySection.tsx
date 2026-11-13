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
    <section aria-labelledby="daily-discovery-heading" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300"><CalendarDays className="size-4" aria-hidden="true" /> Daily picks · {date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p>
          <h2 id="daily-discovery-heading" className="mt-1 text-2xl font-bold tracking-tight">Discover something new</h2>
          <p className="mt-1 text-sm text-muted-foreground">New music from Nostr and Wavlake, with a little guidance from your taste.</p>
        </div>
      </header>

      <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-sm text-muted-foreground">
        Feedback is saved only in this browser. “Not for me” hides a track and gently reduces similar picks; “Block artist” hides their tracks until you unblock them.
      </div>

      {pending || (isLoading && !allCandidates.length) ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-label="Loading daily discoveries">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-3 rounded-lg p-3"><Skeleton className="aspect-square rounded-md" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}
        </div>
      ) : discoveries.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {discoveries.map(({ track, reason }) => (
            <article key={track.id} className="min-w-0 rounded-lg border border-border/50 bg-card/60 p-2">
              <TrackCard track={track} showLikeAction showPlaylistAction />
              <p className="px-3 pb-2 text-xs text-emerald-200/80">{reason}</p>
              <div className="grid grid-cols-1 gap-1 px-2 pb-2">
                <Button type="button" variant="ghost" size="sm" className="h-8 justify-start gap-2 px-2 text-xs" onClick={() => { setFeedback(markMoreLikeThis(track, date)); setDismissedToday(ids => ids.includes(track.id) ? ids : [...ids, track.id]); }}>
                  <Heart className="size-3.5" /> More like this
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 justify-start gap-2 px-2 text-xs text-muted-foreground" onClick={() => { setFeedback(markNotForMe(track, date)); setDismissedToday(ids => ids.includes(track.id) ? ids : [...ids, track.id]); }}>
                  <ThumbsDown className="size-3.5" /> Not for me
                </Button>
                {discoveryArtistKeys(track).length > 0 && <Button type="button" variant="ghost" size="sm" className="h-8 justify-start gap-2 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => { setFeedback(blockDiscoveryArtist(track)); setDismissedToday(ids => [...new Set([...ids, ...discoveryArtistKeys(track).flatMap(key => discoveries.filter(item => discoveryArtistKeys(item.track).includes(key)).map(item => item.track.id))])]); }}>
                  <Ban className="size-3.5" /> Block artist
                </Button>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
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
