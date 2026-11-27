import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play, RefreshCw, Sparkles } from "lucide-react";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { buildPersonalizedMix } from "@/lib/personalizedMix";
import type { Track } from "@/lib/music";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackArtwork } from "./TrackArtwork";
import { HorizontalCarousel } from "@/components/music/HorizontalCarousel";
import { useTracks } from "@/hooks/useTracks";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { buildVariedHomeShelf } from "@/lib/homeRecommendations";
import { sanitizeUrl } from "@/lib/sanitize";

type DailyMix = { id: string; title: string; subtitle: string; tracks: Track[] };
type MixSnapshot = { cards: DailyMix[]; variation: number; tasteCount: number };

// Session storage survives reloads but remains private to this tab and account.
const MIX_SNAPSHOT_PREFIX = "ostrify:made-for-you:v2:";
const memorySnapshots = new Map<string, MixSnapshot>();

function readMixSnapshot(scope: string): MixSnapshot | null {
  const memory = memorySnapshots.get(scope);
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(MIX_SNAPSHOT_PREFIX + scope);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const snapshot = value as Partial<MixSnapshot>;
    if (!Array.isArray(snapshot.cards) || typeof snapshot.variation !== "number" || typeof snapshot.tasteCount !== "number") return null;
    if (!snapshot.cards.every(card => card && typeof card.id === "string" && typeof card.title === "string" && typeof card.subtitle === "string" && Array.isArray(card.tracks) && card.tracks.every(track => track && typeof track.id === "string" && typeof track.url === "string" && typeof track.title === "string" && typeof track.pubkey === "string" && track.kind === "music" && track.source !== "radio-browser" && Array.isArray(track.topics) && track.topics.every(topic => typeof topic === "string")))) return null;
    const result = snapshot as MixSnapshot;
    memorySnapshots.set(scope, result);
    return result;
  } catch {
    return null;
  }
}

function saveMixSnapshot(scope: string, snapshot: MixSnapshot) {
  memorySnapshots.set(scope, snapshot);
  try {
    sessionStorage.setItem(MIX_SNAPSHOT_PREFIX + scope, JSON.stringify(snapshot));
  } catch {
    // Keep the in-memory snapshot when storage is unavailable or full.
  }
}

function MixArtwork({ tracks, title }: { tracks: Track[]; title: string }) {
  const artworkTracks = tracks.slice(0, 4);
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-gradient-to-br from-emerald-950 to-slate-950 shadow-md">
      <div className="grid size-full grid-cols-2 grid-rows-2 gap-px bg-black/40">
        {artworkTracks.map((track, index) => {
          const image = sanitizeUrl(track.image);
          return <div key={`${track.id}-${index}`} className="min-h-0 min-w-0 overflow-hidden bg-secondary">
            {image ? <img src={image} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <TrackArtwork track={track} className="size-full" rounded="rounded-none" />}
          </div>;
        })}
      </div>
      <img src="/ostrify-logo-512.webp?v=opt-1" alt="" aria-hidden="true" className="absolute left-1.5 top-1.5 size-4 rounded-full border border-black/40 bg-primary object-cover shadow-md" />
      <span className="sr-only">{title} artwork collage</span>
    </div>
  );
}

function uniqueQueue(tracks: Track[], limit = 24): Track[] {
  const ids = new Set<string>();
  const urls = new Set<string>();
  return tracks.filter(track => {
    if (track.kind !== "music" || track.source === "radio-browser" || ids.has(track.id) || urls.has(track.url)) return false;
    ids.add(track.id);
    urls.add(track.url);
    return true;
  }).slice(0, limit);
}

function artistKeys(track: Track): string[] {
  return [track.artistPubkey?.toLowerCase(), track.artistId ? `wavlake:${track.artistId.toLowerCase()}` : undefined, track.artist?.trim().toLocaleLowerCase(), track.pubkey ? `publisher:${track.pubkey.toLowerCase()}` : undefined]
    .filter((value): value is string => Boolean(value));
}

function matchesArtists(track: Track, keys: Set<string>): boolean {
  return artistKeys(track).some(key => keys.has(key));
}

export function MadeForYouSection({ candidates, isLoading, active = true, sessionScope }: { candidates: Track[]; isLoading: boolean; active?: boolean; sessionScope?: string }) {
  const player = usePlayer();
  const { user } = useCurrentUser();
  const snapshotScope = user?.pubkey ?? "public";
  const storedSnapshot = useMemo(() => readMixSnapshot(snapshotScope), [snapshotScope]);
  const [snapshotState, setSnapshotState] = useState<{ scope: string; snapshot: MixSnapshot } | null>(() => storedSnapshot ? { scope: snapshotScope, snapshot: storedSnapshot } : null);
  const snapshot = snapshotState?.scope === snapshotScope ? snapshotState.snapshot : readMixSnapshot(snapshotScope);
  const [variationState, setVariationState] = useState(() => ({ scope: snapshotScope, value: storedSnapshot?.variation ?? 0 }));
  const mixVariation = variationState.scope === snapshotScope ? variationState.value : snapshot?.variation ?? 0;
  const playlists = usePlaylists(active, sessionScope);
  const followedArtists = useFollowedArtists(active, sessionScope);
  const followedAuthorPubkeys = useMemo(() => (followedArtists.data ?? []).filter(reference => /^[0-9a-f]{64}$/i.test(reference)).slice(0, 25), [followedArtists.data]);
  const followedTracks = useTracks({ limit: 20, authors: followedAuthorPubkeys, enabled: active && followedAuthorPubkeys.length > 0, sessionScope });
  const wavlake = useWavlakeCatalog(undefined, active, sessionScope);
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedTracks = useTracksByIds(likedPlaylist?.trackIds, active, [], sessionScope);
  const liked = likedTracks.data?.tracks ?? [];
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const mixCandidates = useMemo(() => [...candidates, ...wavlakeTracks], [candidates, wavlakeTracks]);
  const musicCandidates = useMemo(() => uniqueQueue(mixCandidates, 200), [mixCandidates]);
  const musicHistory = useMemo(() => uniqueQueue(player.history, 100), [player.history]);
  const musicLiked = useMemo(() => uniqueQueue(liked, 100), [liked]);
  const followedReferences = useMemo(() => followedArtists.data ?? [], [followedArtists.data]);
  const tasteCount = musicLiked.length + musicHistory.length + followedReferences.length;
  const personalizedMix = useMemo(() => buildPersonalizedMix({
    candidates: musicCandidates,
    liked: musicLiked,
    history: musicHistory,
    followedArtists: followedReferences,
    variation: mixVariation,
  }).map(item => item.track), [musicCandidates, musicLiked, musicHistory, followedReferences, mixVariation]);
  const recentArtists = useMemo(() => new Set(musicHistory.slice(0, 8).flatMap(artistKeys)), [musicHistory]);
  const likedArtists = useMemo(() => new Set(musicLiked.flatMap(artistKeys)), [musicLiked]);
  const mixCards = useMemo(() => {
    const followed = new Set(followedReferences.flatMap(reference => {
      const normalized = reference.toLowerCase();
      return [normalized, normalized.startsWith('wavlake:') ? normalized : undefined];
    }).filter((value): value is string => Boolean(value)));
    const followedQueue = uniqueQueue([...(followedTracks.data ?? []), ...musicCandidates.filter(track => matchesArtists(track, followed))]);
    const recentQueue = uniqueQueue([...musicHistory, ...musicCandidates.filter(track => matchesArtists(track, recentArtists))]);
    const likedQueue = uniqueQueue([...musicLiked, ...musicCandidates.filter(track => matchesArtists(track, likedArtists))]);
    const freshQueue = buildVariedHomeShelf({
      candidates: musicCandidates,
      liked: musicLiked,
      history: musicHistory,
      followedArtists: followedReferences,
      limit: 24,
      variation: mixVariation,
      familiarSlots: 0,
      excludeIds: [...musicHistory, ...musicLiked].map(track => track.id),
      excludeUrls: [...musicHistory, ...musicLiked].map(track => track.url),
    });
    const choices: DailyMix[] = [
      ...(tasteCount > 0 ? [{ id: 'daily', title: 'Daily Mix', subtitle: 'A little of everything you love', tracks: uniqueQueue(personalizedMix) }] : []),
      ...(musicHistory.length > 0 ? [{ id: 'on-repeat', title: 'On Repeat', subtitle: 'Inspired by your recent listening', tracks: recentQueue }] : []),
      ...(musicLiked.length > 0 ? [{ id: 'favorites', title: 'Liked & Loved', subtitle: 'Your favorites and more like them', tracks: likedQueue }] : []),
      ...(followedReferences.length > 0 ? [{ id: 'following', title: 'From Your Artists', subtitle: 'New sounds from artists you follow', tracks: followedQueue }] : []),
      ...(tasteCount > 0 ? [{ id: 'fresh', title: 'Fresh Finds', subtitle: 'Discoveries picked for your taste', tracks: freshQueue }] : []),
    ];
    const visible: DailyMix[] = [];
    for (const choice of choices) {
      if (choice.tracks.length < 4) continue;
      const ids = new Set(choice.tracks.slice(0, 12).map(track => track.id));
      const tooSimilar = visible.some(existing => {
        const overlap = existing.tracks.slice(0, 12).filter(track => ids.has(track.id)).length;
        return overlap / Math.max(1, Math.min(ids.size, Math.min(existing.tracks.length, 12))) > 0.75;
      });
      if (!tooSimilar) visible.push({ ...choice, tracks: choice.tracks.slice(0, 24) });
    }
    return visible;
  }, [followedReferences, followedTracks.data, musicCandidates, musicHistory, musicLiked, recentArtists, likedArtists, personalizedMix, mixVariation, tasteCount]);
  const followedSet = useMemo(() => new Set((followedArtists.data ?? []).map(reference => reference.toLowerCase())), [followedArtists.data]);
  const allTracks = useMemo(() => [...candidates, ...wavlakeTracks], [candidates, wavlakeTracks]);
  const newFromFollows = useMemo(() => {
    const unique = new Map<string, Track>();
    const recentAfter = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    for (const track of [...allTracks, ...(followedTracks.data ?? [])]) {
      if (track.source === "radio-browser" || track.createdAt < recentAfter) continue;
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
  const isPersonalDataLoading = active && (playlists.isLoading || likedTracks.isLoading || followedArtists.isLoading || followedTracks.isLoading || wavlake.isLoading);
  const catalogFailure = wavlake.isError && !wavlakeTracks.length;

  useEffect(() => {
    if (!active || isLoading || isPersonalDataLoading || snapshot?.variation === mixVariation) return;
    const next = { cards: mixCards, variation: mixVariation, tasteCount };
    saveMixSnapshot(snapshotScope, next);
    setSnapshotState({ scope: snapshotScope, snapshot: next });
  }, [active, isLoading, isPersonalDataLoading, snapshot, mixVariation, mixCards, tasteCount, snapshotScope]);

  const visibleCards = snapshot?.cards ?? mixCards;
  const visibleTasteCount = snapshot?.tasteCount ?? tasteCount;
  const refreshMixes = () => setVariationState({ scope: snapshotScope, value: mixVariation + 1 });

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
          <Button type="button" variant="ghost" size="icon" onClick={refreshMixes} disabled={!snapshot || isLoading || isPersonalDataLoading || snapshot.variation !== mixVariation} aria-label="Refresh Made for You mixes" title="Refresh mixes" className="size-8 rounded-full text-muted-foreground hover:text-foreground">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      {!snapshot ? (
        <HorizontalCarousel label="Building your Made for You mixes" className="px-2">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="min-w-0 snap-start space-y-2 p-2"><Skeleton className="aspect-square rounded-md" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}
        </HorizontalCarousel>
      ) : visibleCards.length ? (
        <>
          <HorizontalCarousel label="Made for you mixes" className="px-2" centerWhenFits>
            {visibleCards.map(mix => <article key={mix.id} className="ostrify-audio-card min-w-0 snap-start rounded-xl p-2">
              <button type="button" onClick={() => player.playQueue(mix.tracks)} aria-label={`Play ${mix.title}, ${mix.tracks.length} tracks`} className="group block w-full rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <span className="relative block"><MixArtwork tracks={mix.tracks} title={mix.title} /><span className="ostrify-card-label">Mix</span></span>
                <span className="mt-3 flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-foreground">{mix.title}</span><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Play className="size-4 fill-current" aria-hidden="true" /></span></span>
                <span className="mt-1 line-clamp-2 block min-h-8 text-xs leading-4 text-muted-foreground">{mix.subtitle}</span>
              </button>
            </article>)}
          </HorizontalCarousel>
        </>
      ) : (
        <div className="px-4 pb-4 sm:px-5">
          <div className="rounded-lg border border-dashed border-white/15 bg-black/10 p-3 text-sm text-muted-foreground">
            {visibleTasteCount === 0 ? (
              <><p className="font-medium text-foreground">Your mixes will take shape as you listen.</p><p className="mt-1">Like a few tracks, follow artists, or start playing music. Your recommendations stay in this browser.</p><Link to="/music" className="mt-3 inline-flex font-semibold text-violet-200 hover:underline">Explore music</Link></>
            ) : (
              <><p className="font-medium text-foreground">Your mixes are still taking shape.</p><p className="mt-1">We need at least four suitable tracks for a mix. Explore music or try again after more tracks load.</p>{catalogFailure && <p className="mt-2">Wavlake’s catalog couldn’t be reached, so only Nostr results are available right now.</p>}</>
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
