import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Play, RefreshCw, Sparkles } from "lucide-react";
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
  const [mixVariation, setMixVariation] = useState(0);
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
    variation: mixVariation,
  }), [mixCandidates, liked, player.history, followedArtists.data, mixVariation]);
  const mixTracks = mix.map(item => item.track);
  const tasteCount = liked.length + player.history.filter(track => track.kind === "music").length + (followedArtists.data?.length ?? 0);
  const isPersonalDataLoading = playlists.isLoading || likedTracks.isLoading || followedArtists.isLoading;
  const catalogFailure = wavlake.isError && !wavlakeTracks.length;

  return (
    <section aria-labelledby="made-for-you-heading" className="overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-violet-950/65 via-indigo-950/35 to-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-violet-100"><Sparkles className="size-4" aria-hidden="true" /></div>
          <div className="min-w-0">
            <h2 id="made-for-you-heading" className="text-lg font-bold tracking-tight">Made for you</h2>
            <p className="hidden text-xs text-muted-foreground sm:block">A private mix from your likes, listening, and followed artists.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => setMixVariation(value => value + 1)} disabled={!mix.length || isLoading || isPersonalDataLoading} aria-label="Refresh Made for You mix" title="Refresh mix" className="size-8 rounded-full text-muted-foreground hover:text-foreground">
            <RefreshCw className="size-4" />
          </Button>
          <Button type="button" size="sm" onClick={() => player.playQueue(mixTracks)} disabled={!mixTracks.length} className="h-8 rounded-full px-4">
            <Play className="mr-1.5 size-3.5 fill-current" /> Play mix
          </Button>
        </div>
      </div>
      {isLoading || isPersonalDataLoading ? (
        <div className="flex gap-2 overflow-hidden p-2" aria-label="Building your mix">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="w-[min(42vw,176px)] shrink-0 space-y-2 rounded-lg p-1"><Skeleton className="aspect-square w-full rounded-md" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}
        </div>
      ) : mix.length ? (
        <>
          <div className="grid w-full min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2 px-2 pb-2 sm:grid-cols-[repeat(4,minmax(0,1fr))] lg:grid-cols-[repeat(6,minmax(0,1fr))]">
            {mix.slice(0, 6).map(({ track, reason }) => (
              <div key={track.id} className="min-w-0 max-w-full overflow-hidden">
                <TrackCard track={track} showLikeAction showPlaylistAction compact />
                <p className="px-2 pb-1 text-[11px] leading-tight text-violet-200/80">{reason}</p>
              </div>
            ))}
          </div>
          <p className="px-4 pb-3 text-[11px] text-muted-foreground sm:px-5">{mix.length} in today’s mix · {wavlakeTracks.length ? "Nostr + Wavlake" : "Nostr"}{catalogFailure ? " · Wavlake unavailable" : ""} · private to this browser</p>
        </>
      ) : (
        <div className="px-4 pb-4 sm:px-5">
          <div className="rounded-lg border border-dashed border-white/15 bg-black/10 p-3 text-sm text-muted-foreground">
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
