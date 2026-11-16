import { useMemo, useState } from "react";
import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useHomeTracks } from "@/hooks/useHomeTracks";
import { useFreshNostrTracks } from "@/hooks/useFreshNostrTracks";
import { usePodcastEpisodes } from "@/hooks/usePodcasts";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { usePlayer } from "@/hooks/usePlayer";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { Shelf } from "@/components/music/Shelf";
import { FreshTracksCarousel } from "@/components/music/FreshTracksCarousel";
import { MadeForYouSection } from "@/components/music/MadeForYouSection";
import { DailyDiscoverySection } from "@/components/music/DailyDiscoverySection";
import { MusicNewsSection } from "@/components/music/MusicNewsSection";
import { CATEGORIES, tracksInCategory } from "@/lib/categories";
import { buildVariedHomeShelf } from "@/lib/homeRecommendations";

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const Index = () => {
  useSeoMeta({
    title: "Ostrify — Music & Podcasts on Nostr",
    description: "A Spotify-style player for music and podcasts published on the Nostr network.",
  });

  const homeTracksQuery = useHomeTracks();
  const tracks = homeTracksQuery.data?.tracks ?? [];
  const tracksLoading = homeTracksQuery.isLoading;
  const { data: newestNostrTracks = [], isLoading: freshLoading } = useFreshNostrTracks();
  const { data: podcasts = [], isLoading: podcastsLoading } = usePodcastEpisodes(40);
  const player = usePlayer();
  const wavlake = useWavlakeCatalog();
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const playlists = usePlaylists();
  const followedArtists = useFollowedArtists();
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedTracksQuery = useTracksByIds(likedPlaylist?.trackIds);
  const likedTracks = likedTracksQuery.data?.tracks ?? [];
  const [shelfVariation, setShelfVariation] = useState(0);
  const allMusic = useMemo(() => [...tracks, ...wavlakeTracks], [tracks, wavlakeTracks]);
  const nostrTracks = useMemo(() => allMusic.filter(track => track.source !== 'wavlake'), [allMusic]);
  const fresh = useMemo(() => {
    const byUrl = new Map<string, (typeof newestNostrTracks)[number]>();
    for (const track of [...newestNostrTracks, ...nostrTracks.filter(candidate => candidate.kind === "music" && !!candidate.event)]) {
      const existing = byUrl.get(track.url);
      if (!existing || track.createdAt > existing.createdAt) byUrl.set(track.url, track);
    }
    return [...byUrl.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, 15);
  }, [newestNostrTracks, nostrTracks]);
  const discoveryExcludedIds = useMemo(() => [...new Set([...player.history, ...likedTracks, ...fresh].map(track => track.id))], [player.history, likedTracks, fresh]);
  const discoveryExcludedUrls = useMemo(() => [...new Set([...player.history, ...likedTracks, ...fresh].map(track => track.url))], [player.history, likedTracks, fresh]);
  const shuffledPodcasts = useMemo(() => {
    const nostrPodcasts = podcasts.filter(track => track.source !== "fountain");
    const fountainPodcasts = podcasts.filter(track => track.source === "fountain");
    const selected = [
      ...shuffled(nostrPodcasts).slice(0, 5),
      ...shuffled(fountainPodcasts).slice(0, 5),
    ];
    const selectedIds = new Set(selected.map(track => track.id));
    const remaining = shuffled(podcasts.filter(track => !selectedIds.has(track.id)));
    return shuffled([...selected, ...remaining]).slice(0, 10);
  }, [podcasts]);
  const categoryShelves = useMemo(() => CATEGORIES.map(category => {
      const categoryTracks = tracksInCategory(allMusic, category.id);
      const selected = buildVariedHomeShelf({
        candidates: categoryTracks,
        // Category carousels may repeat tracks across shelves and include liked or heard music;
        // repeating relevant matches is better than hiding a genre shelf entirely.
        history: [],
        liked: [],
        followedArtists: followedArtists.data ?? [],
        limit: categoryTracks.length,
        variation: shelfVariation,
        familiarSlots: 1,
      });
      return { category, tracks: selected };
  }), [allMusic, followedArtists.data, shelfVariation]);

  const { greeting, greetingImage } = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return { greeting: "Good morning", greetingImage: "/greeting-morning.png" };
    if (hour < 18) return { greeting: "Good afternoon", greetingImage: "/greeting-afternoon.png" };
    return { greeting: "Good evening", greetingImage: "/greeting-evening.png" };
  })();

  return (
    <div className="w-full min-w-0 max-w-full space-y-8 overflow-x-clip p-4 sm:p-6">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <span>{greeting}</span>
        <img src={greetingImage} alt="" aria-hidden="true" className="size-10 shrink-0 object-contain" />
      </h1>

      <section aria-labelledby="browse-genres-heading" className="space-y-3 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <h2 id="browse-genres-heading" className="text-sm font-semibold text-muted-foreground">Browse genres</h2>
          <Link to="/music" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">All music <ChevronRight className="size-3.5" /></Link>
        </div>
        <nav aria-label="Browse music genres" className="flex flex-wrap justify-center gap-2 pb-1">
          {CATEGORIES.map(category => <Link key={category.id} to={`/category/${category.id}`} className="rounded-full border border-[#00ed69] bg-[#00ed69] px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:border-[#00d95f] hover:bg-[#00d95f] focus-visible:outline-2 focus-visible:outline-primary">{category.label}</Link>)}
        </nav>
      </section>

      <Shelf title="Jump back in" subtitle="Your recent listening" tracks={player.history.slice(0, 10)} dense compactCards />
      <MadeForYouSection candidates={allMusic} isLoading={tracksLoading || wavlake.isLoading} />
      <DailyDiscoverySection candidates={allMusic} isLoading={tracksLoading || wavlake.isLoading} excludeTrackIds={discoveryExcludedIds} excludeTrackUrls={discoveryExcludedUrls} variation={shelfVariation} onRefresh={() => setShelfVariation(value => value + 1)} />

      <MusicNewsSection />
      <FreshTracksCarousel tracks={fresh} isLoading={freshLoading || tracksLoading || wavlake.isLoading} />

      <Shelf title="Podcasts" subtitle="Episodes from Nostr and Fountain.fm" tracks={shuffledPodcasts} isLoading={podcastsLoading} dense seeAllHref="/podcasts/episodes" />

      {homeTracksQuery.isError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">Couldn’t load music from your read relays. Genre shelves may be unavailable. <button type="button" className="font-semibold text-primary underline" onClick={() => void homeTracksQuery.refetch()}>Try again</button></div>}
      {homeTracksQuery.data?.failedRelays.length ? <p role="status" className="text-xs text-muted-foreground">Some read relays didn’t respond; showing available music while they’re unavailable.</p> : null}
      {wavlake.isError && <p role="status" className="text-xs text-muted-foreground">Wavlake catalog results aren’t available right now; genre shelves use music from responding relays.</p>}
      {categoryShelves.map(({ category, tracks: catTracks }) => <Shelf key={category.id} title={category.label} tracks={catTracks} dense seeAllHref={`/category/${category.id}`} emptyMessage={!tracksLoading && !wavlake.isLoading && !homeTracksQuery.isError && !wavlake.isError ? "No matching tracks were found in the currently available music." : undefined} />)}

      {!tracksLoading && !wavlake.isLoading && allMusic.length === 0 && !podcastsLoading && (
        <div className="border border-dashed border-border rounded-lg py-16 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto">
            No audio found yet. Try again in a moment, or check your relay connections — music and
            podcasts load live from Nostr.
          </p>
        </div>
      )}
    </div>
  );
};

export default Index;
