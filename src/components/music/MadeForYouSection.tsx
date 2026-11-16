import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play, RefreshCw, Sparkles } from "lucide-react";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { buildPersonalizedMix } from "@/lib/personalizedMix";
import type { Track } from "@/lib/music";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackCard } from "./TrackCard";
import { TrackArtwork } from "./TrackArtwork";
import { useTracks } from "@/hooks/useTracks";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { buildVariedHomeShelf } from "@/lib/homeRecommendations";

export function MadeForYouSection({ candidates, isLoading, active = true }: { candidates: Track[]; isLoading: boolean; active?: boolean }) {
  const player = usePlayer();
  const [mixVariation, setMixVariation] = useState(0);
  const playlists = usePlaylists(active);
  const followedArtists = useFollowedArtists(active);
  const followedAuthorPubkeys = useMemo(() => (followedArtists.data ?? []).filter(reference => /^[0-9a-f]{64}$/i.test(reference)).slice(0, 25), [followedArtists.data]);
  const followedTracks = useTracks({ limit: 20, authors: followedAuthorPubkeys, enabled: active && followedAuthorPubkeys.length > 0 });
  const wavlake = useWavlakeCatalog(undefined, active);
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedTracks = useTracksByIds(likedPlaylist?.trackIds, active);
  const liked = likedTracks.data?.tracks ?? [];
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const mixCandidates = useMemo(() => [...candidates, ...wavlakeTracks], [candidates, wavlakeTracks]);
  const personalizedMix = useMemo(() => buildPersonalizedMix({
    candidates: mixCandidates,
    liked,
    history: player.history,
    followedArtists: followedArtists.data ?? [],
    variation: mixVariation,
  }), [mixCandidates, liked, player.history, followedArtists.data, mixVariation]);
  const diversifiedMix = useMemo(() => personalizedMix.length ? buildVariedHomeShelf({
    candidates: mixCandidates,
    liked,
    history: player.history,
    followedArtists: followedArtists.data ?? [],
    limit: 24,
    variation: mixVariation,
    familiarSlots: 4,
    excludeIds: [...new Set([...personalizedMix.map(item => item.track.id), ...player.history.map(track => track.id), ...liked.map(track => track.id)])],
    excludeUrls: [...new Set([...personalizedMix.map(item => item.track.url), ...player.history.map(track => track.url), ...liked.map(track => track.url)])],
  }) : [], [personalizedMix, mixCandidates, liked, player.history, followedArtists.data, mixVariation]);
  const mix = useMemo(() => {
    const reasons = new Map(personalizedMix.map(item => [item.track.id, item.reason]));
    const personalizedIds = new Set(personalizedMix.map(item => item.track.id));
    const extras = diversifiedMix.filter(track => !personalizedIds.has(track.id)).map(track => ({ track, reason: reasons.get(track.id) ?? 'A fresh find in a sound you enjoy' }));
    return [...personalizedMix, ...extras];
  }, [personalizedMix, diversifiedMix]);
  const mixTracks = mix.map(item => item.track);
  const followedSet = useMemo(() => new Set((followedArtists.data ?? []).map(reference => reference.toLowerCase())), [followedArtists.data]);
  const allTracks = useMemo(() => [...candidates, ...wavlakeTracks], [candidates, wavlakeTracks]);
  const newFromFollows = useMemo(() => {
    const unique = new Map<string, Track>();
    const recentAfter = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    for (const track of [...allTracks, ...(followedTracks.data ?? [])]) {
      if (track.createdAt < recentAfter) continue;
      if (!unique.has(track.id)) unique.set(track.id, track);
    }
    return [...unique.values()]
    .filter(track => {
      const artistPubkey = track.artistPubkey?.toLowerCase();
      const publisher = track.pubkey.toLowerCase();
      const artistId = track.artistId ? `wavlake:${track.artistId.toLowerCase()}` : undefined;
      return (artistPubkey && followedSet.has(artistPubkey)) || (artistId && followedSet.has(artistId)) || followedSet.has(publisher);
    })
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 4);
  }, [allTracks, followedTracks.data, followedSet]);
  const spokenProgress = useMemo(() => {
    const track = player.current;
    if (!track || (track.kind !== 'podcast' && track.kind !== 'audiobook')) return [];
    if (player.progress < 30 || (track.duration && player.progress >= track.duration - 30)) return [];
    return [{ track, progress: player.progress, duration: player.duration || track.duration }];
  }, [player.current, player.progress, player.duration]);
  const tasteCount = liked.length + player.history.filter(track => track.kind === "music").length + (followedArtists.data?.length ?? 0);
  const isPersonalDataLoading = active && (playlists.isLoading || likedTracks.isLoading || followedArtists.isLoading);
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
          <p className="px-4 pb-3 text-[11px] text-muted-foreground sm:px-5">{mix.length} in today’s mix · focused on your taste with occasional nearby discoveries · {wavlakeTracks.length ? "Nostr + Wavlake" : "Nostr"}{catalogFailure ? " · Wavlake unavailable" : ""} · private to this browser</p>
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
      {(newFromFollows.length > 0 || spokenProgress.length > 0) && <div className="space-y-4 border-t border-white/10 px-4 py-4 sm:px-5">
        {newFromFollows.length > 0 && <section aria-labelledby="new-from-follows-heading" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><h3 id="new-from-follows-heading" className="font-semibold">New from people you follow</h3><p className="text-xs text-muted-foreground">Recent releases from your followed artists</p></div>
            <Link to="/artists" className="shrink-0 text-xs font-semibold text-primary hover:underline">See all</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {newFromFollows.map(track => <button key={track.id} type="button" onClick={() => player.playTrack(track)} aria-label={`Play ${track.title}`} className="flex min-w-0 items-center gap-2 rounded-lg bg-black/10 p-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary">
              <TrackArtwork track={track} className="size-11" />
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{track.title}</span><span className="block truncate text-xs text-muted-foreground">{track.artist ?? 'New release'}</span></span>
            </button>)}
          </div>
        </section>}
        {spokenProgress.length > 0 && <section aria-labelledby="resume-listening-heading" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><h3 id="resume-listening-heading" className="font-semibold">Pick up where you left off</h3><p className="text-xs text-muted-foreground">Continue spoken audio on this device</p></div>
            <Link to={spokenProgress[0].track.kind === 'audiobook' ? '/audiobook-library' : '/podcast-library'} className="shrink-0 text-xs font-semibold text-primary hover:underline">See all</Link>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {spokenProgress.map(({ track, progress, duration }) => <button key={track.id} type="button" onClick={() => player.togglePlay()} aria-label={`${player.isPlaying ? 'Pause' : 'Resume'} ${track.title}`} className="flex min-w-0 items-center gap-3 rounded-lg bg-black/10 p-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-primary">
              <TrackArtwork track={track} className="size-12" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{track.title}</span><span className="block truncate text-xs text-muted-foreground">{track.artist ?? 'Spoken audio'} · {Math.floor(progress / 60)} min listened{duration ? ` · ${Math.max(1, Math.ceil((duration - progress) / 60))} min left` : ''}</span><span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, duration ? (progress / duration) * 100 : 8))}%` }} /></span></span>
              {player.isPlaying ? <Pause className="size-4 shrink-0 text-primary" aria-hidden="true" /> : <Play className="size-4 shrink-0 text-primary" aria-hidden="true" />}
            </button>)}
          </div>
        </section>}
      </div>}
    </section>
  );
}
