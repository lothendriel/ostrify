import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Play, Sparkles } from "lucide-react";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { buildPersonalizedMix } from "@/lib/personalizedMix";
import type { Track } from "@/lib/music";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackCard } from "./TrackCard";

export function MadeForYouSection({ candidates, isLoading }: { candidates: Track[]; isLoading: boolean }) {
  const player = usePlayer();
  const playlists = usePlaylists();
  const followedArtists = useFollowedArtists();
  const wavlake = useWavlakeCatalog();
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedTracks = useTracksByIds(likedPlaylist?.trackIds);
  const liked = likedTracks.data?.tracks ?? [];
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const mixCandidates = useMemo(() => [...candidates, ...wavlakeTracks], [candidates, wavlakeTracks]);
  const mix = useMemo(() => buildPersonalizedMix({
    candidates: mixCandidates,
    liked,
    history: player.history,
    followedArtists: followedArtists.data ?? [],
  }), [mixCandidates, liked, player.history, followedArtists.data]);
  const mixTracks = mix.map(item => item.track);
  const tasteCount = liked.length + player.history.filter(track => track.kind === "music").length + (followedArtists.data?.length ?? 0);
  const isPersonalDataLoading = playlists.isLoading || likedTracks.isLoading || followedArtists.isLoading;
  const catalogFailure = wavlake.isError && !wavlakeTracks.length;

  return (
    <section aria-labelledby="made-for-you-heading" className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-violet-950/70 via-indigo-950/40 to-card">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-violet-100"><Sparkles className="size-5" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">Your daily mix</p>
            <h2 id="made-for-you-heading" className="mt-1 text-2xl font-bold tracking-tight">Made for you</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A fresh blend shaped by your likes, recent listening, followed artists, and the sounds you return to.</p>
          </div>
        </div>
        <Button type="button" onClick={() => player.playQueue(mixTracks)} disabled={!mixTracks.length} className="rounded-full px-5">
          <Play className="mr-2 size-4 fill-current" /> Play mix
        </Button>
      </div>
      <div className="border-t border-white/10 px-5 py-3 text-xs text-muted-foreground sm:px-6">
        Private by design: recommendations run in this browser and your listening data is never published. Mixes combine Nostr discoveries with Wavlake’s catalog.
      </div>
      {isLoading || isPersonalDataLoading ? (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Building your mix">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-3 rounded-lg p-2"><Skeleton className="aspect-square w-full rounded-md" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}
        </div>
      ) : mix.length ? (
        <>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-5">
            {mix.slice(0, 10).map(({ track, reason }) => (
              <div key={track.id} className="min-w-0">
                <TrackCard track={track} showLikeAction showPlaylistAction />
                <p className="px-3 pb-2 text-xs text-violet-200/80">{reason}</p>
              </div>
            ))}
          </div>
          <p className="px-5 pb-4 text-xs text-muted-foreground sm:px-6">{mix.length} tracks in today’s mix · {wavlakeTracks.length ? "Nostr + Wavlake" : "Nostr"} · updates daily as discovery and your library change{catalogFailure ? " · Wavlake catalog unavailable right now" : ""}</p>
        </>
      ) : (
        <div className="px-5 pb-6 sm:px-6">
          <div className="rounded-xl border border-dashed border-white/15 bg-black/10 p-5 text-sm text-muted-foreground">
            {tasteCount === 0 ? (
              <><p className="font-medium text-foreground">Your mix will take shape as you listen.</p><p className="mt-1">Like a few tracks, follow artists, or start playing music. Your recommendations stay in this browser.</p><Link to="/music" className="mt-3 inline-flex font-semibold text-violet-200 hover:underline">Explore music</Link></>
            ) : (
              <><p className="font-medium text-foreground">Not enough matching music just yet.</p><p className="mt-1">We use tracks available from your Nostr discovery feed and Wavlake’s catalog. Try again after discovering more music.</p>{catalogFailure && <p className="mt-2">Wavlake’s catalog couldn’t be reached, so only Nostr results are available right now.</p>}</>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
