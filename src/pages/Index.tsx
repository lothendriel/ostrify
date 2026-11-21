import { useEffect, useMemo, useRef, useState } from "react";
import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useHomeTracks } from "@/hooks/useHomeTracks";
import { useWavlakeCatalog, useWavlakeGenreCatalog } from "@/hooks/useWavlake";
import { useFreshNostrTracks } from "@/hooks/useFreshNostrTracks";
import { useNearViewport } from "@/hooks/useNearViewport";
import { usePlayer } from "@/hooks/usePlayer";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { Shelf } from "@/components/music/Shelf";
import { MadeForYouSection } from "@/components/music/MadeForYouSection";
import { DailyDiscoverySection } from "@/components/music/DailyDiscoverySection";
import { FreshTracksCarousel } from "@/components/music/FreshTracksCarousel";
import { MusicNewsSection } from "@/components/music/MusicNewsSection";
import { DeferredHomeSection } from "@/components/music/DeferredHomeSection";
import { HomePodcastsSection } from "@/components/music/HomePodcastsSection";
import { CATEGORIES, tracksInCategory } from "@/lib/categories";
import { buildVariedHomeShelf } from "@/lib/homeRecommendations";
import { readHomeShelfHistory, writeHomeShelfHistory } from "@/lib/homeShelfHistory";
import type { Track } from "@/lib/music";

const HOME_WAVLAKE_GENRES = [...new Set(CATEGORIES.flatMap(category => category.wavlakeGenres ?? []))];

function HomeFreshTracks({ candidates, enabled }: { candidates: Track[]; enabled: boolean }) {
  const query = useFreshNostrTracks(enabled);
  const tracks = useMemo(() => {
    const byUrl = new Map<string, Track>();
    for (const track of [...(query.data ?? []), ...candidates.filter(candidate => candidate.kind === "music" && !!candidate.event)]) {
      const existing = byUrl.get(track.url);
      if (!existing || track.createdAt > existing.createdAt) byUrl.set(track.url, track);
    }
    return [...byUrl.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, 15);
  }, [candidates, query.data]);
  return <FreshTracksCarousel tracks={tracks} isLoading={query.isLoading && tracks.length === 0} />;
}

const Index = () => {
  useSeoMeta({
    title: "Ostrify — Music & Podcasts on Nostr",
    description: "A Spotify-style player for music and podcasts published on the Nostr network.",
  });

  const { ref: discoveryTriggerRef, isNearViewport: discoveryEnabled } = useNearViewport<HTMLDivElement>("100px 0px");
  const homeTracksQuery = useHomeTracks(discoveryEnabled);
  const tracks = homeTracksQuery.data?.tracks ?? [];
  const tracksLoading = homeTracksQuery.isLoading;
  const wavlake = useWavlakeCatalog(undefined, discoveryEnabled);
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const baseMusic = useMemo(() => [...tracks, ...wavlakeTracks], [tracks, wavlakeTracks]);
  const baseSourcesLoading = homeTracksQuery.isLoading || wavlake.isLoading;
  const categoriesNeedingCatalog = useMemo(() => new Set(baseSourcesLoading ? [] : CATEGORIES
    .filter(category => category.wavlakeGenres?.length && new Set(tracksInCategory(baseMusic, category.id).map(track => track.url)).size < 8)
    .flatMap(category => category.wavlakeGenres ?? [])), [baseMusic, baseSourcesLoading]);
  const genreCatalogQueries = useWavlakeGenreCatalog(HOME_WAVLAKE_GENRES, discoveryEnabled, [...categoriesNeedingCatalog]);
  const genreCatalogVersion = genreCatalogQueries.map((query, index) => `${HOME_WAVLAKE_GENRES[index]}:${query.dataUpdatedAt}:${query.isLoading}`).join('|');
  const genreCatalogTracks = useMemo(() => genreCatalogQueries.flatMap(query => query.data ?? []), [genreCatalogVersion]);
  const genreCatalogTracksByGenre = useMemo(() => new Map(HOME_WAVLAKE_GENRES.map((genre, index) => [genre, genreCatalogQueries[index]?.data ?? []] as const)), [genreCatalogVersion]);
  const player = usePlayer();
  const followedArtists = useFollowedArtists(discoveryEnabled);
  const [pageSeed] = useState(() => crypto.randomUUID());
  const [shelfVariation, setShelfVariation] = useState(0);
  const recentShelfHistory = useRef(readHomeShelfHistory());
  const currentShelves = useRef<{ categoryId: string; tracks: Track[] }[]>([]);
  const allMusic = useMemo(() => [...tracks, ...wavlakeTracks, ...genreCatalogTracks], [tracks, wavlakeTracks, genreCatalogTracks]);
  const playlists = usePlaylists(discoveryEnabled);
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedQuery = useTracksByIds(likedPlaylist?.trackIds, discoveryEnabled);
  const likedTracks = likedQuery.data?.tracks ?? [];
  const categoryShelves = useMemo(() => {
    const shownOnPage = new Set<string>();
    return CATEGORIES.map(category => {
      const genreTracks = (category.wavlakeGenres ?? []).flatMap(genre => genreCatalogTracksByGenre.get(genre) ?? []);
      const categoryPool = category.wavlakeGenres?.length
        ? [...allMusic, ...genreTracks].map(track => genreTracks.includes(track) && category.match.length ? { ...track, topics: [...track.topics, category.match[0]] } : track)
        : allMusic;
      const categoryTracks = tracksInCategory(categoryPool, category.id);
      const recentlyShown = new Set(recentShelfHistory.current[category.id] ?? []);
      const freshCandidates = categoryTracks.filter(track => !recentlyShown.has(track.id) && !recentlyShown.has(track.url));
      const unshownCandidates = freshCandidates.filter(track => !shownOnPage.has(track.id) && !shownOnPage.has(track.url));
      const select = (candidates: typeof allMusic, limit: number) => buildVariedHomeShelf({
        candidates,
        history: player.history,
        liked: likedTracks,
        followedArtists: followedArtists.data ?? [],
        limit,
        variation: shelfVariation,
        seed: pageSeed,
        familiarSlots: 2,
      });
      const preferred = select(unshownCandidates.length >= 4 ? unshownCandidates : freshCandidates, 4);
      const selected = preferred.length < 4
        ? [...preferred, ...select(categoryTracks.filter(item => !preferred.some(track => track.id === item.id || track.url === item.url)), 4 - preferred.length)].slice(0, 4)
        : preferred;
      for (const track of selected) {
        shownOnPage.add(track.id);
        shownOnPage.add(track.url);
      }
      return { category, tracks: selected };
    });
  }, [allMusic, genreCatalogTracksByGenre, shelfVariation, pageSeed, player.history, likedTracks, followedArtists.data]);
  const [displayShelves, setDisplayShelves] = useState<typeof categoryShelves | null>(null);
  const previousShelfVariation = useRef(shelfVariation);
  const visibleCategoryShelves = displayShelves ?? categoryShelves;
  const personalizedInputsLoading = playlists.isLoading || likedQuery.isLoading || followedArtists.isLoading;
  const neededCatalogStillLoading = [...categoriesNeedingCatalog].some(genre => {
    const index = HOME_WAVLAKE_GENRES.indexOf(genre);
    return index >= 0 && genreCatalogQueries[index]?.isFetching;
  });

  useEffect(() => {
    if (previousShelfVariation.current !== shelfVariation) {
      previousShelfVariation.current = shelfVariation;
      if (!baseSourcesLoading && !personalizedInputsLoading && !neededCatalogStillLoading) setDisplayShelves(categoryShelves);
      return;
    }
    if (displayShelves || baseSourcesLoading || personalizedInputsLoading || neededCatalogStillLoading) return;
    setDisplayShelves(categoryShelves);
  }, [displayShelves, categoryShelves, shelfVariation, baseSourcesLoading, personalizedInputsLoading, neededCatalogStillLoading]);

  useEffect(() => {
    if (!homeTracksQuery.data && !wavlake.data && !genreCatalogTracks.length) return;
    currentShelves.current = visibleCategoryShelves.map(({ category, tracks: shelfTracks }) => ({ categoryId: category.id, tracks: shelfTracks }));
    const nextHistory = { ...recentShelfHistory.current };
    for (const { categoryId, tracks: shelfTracks } of currentShelves.current) {
      if (!shelfTracks.length) continue;
      nextHistory[categoryId] = [...new Set([...shelfTracks.flatMap(track => [track.id, track.url]), ...(nextHistory[categoryId] ?? [])])].slice(0, 90);
    }
    recentShelfHistory.current = nextHistory;
    writeHomeShelfHistory(nextHistory);
  }, [visibleCategoryShelves]);

  const refreshGenreShelves = () => {
    const nextHistory = { ...recentShelfHistory.current };
    for (const { categoryId, tracks: shelfTracks } of currentShelves.current) {
      if (!shelfTracks.length) continue;
      nextHistory[categoryId] = [...new Set([...shelfTracks.flatMap(track => [track.id, track.url]), ...(recentShelfHistory.current[categoryId] ?? [])])].slice(0, 90);
    }
    recentShelfHistory.current = nextHistory;
    writeHomeShelfHistory(nextHistory);
    setShelfVariation(value => value + 1);
  };

  const { greeting, greetingImage } = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return { greeting: "Good morning", greetingImage: "/greeting-morning.webp" };
    if (hour < 18) return { greeting: "Good afternoon", greetingImage: "/greeting-afternoon.webp" };
    return { greeting: "Good evening", greetingImage: "/greeting-evening.webp" };
  })();

  return (
    <div className="w-full min-w-0 max-w-full space-y-8 overflow-x-clip p-4 sm:p-6">
      <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
        <span>{greeting}</span>
        <img src={greetingImage} alt="" aria-hidden="true" fetchPriority="high" decoding="async" className="size-10 shrink-0 object-contain" />
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
      <div ref={discoveryTriggerRef} aria-hidden="true" className="h-px" />
      <DeferredHomeSection title="Made for you">{near => <MadeForYouSection candidates={allMusic} isLoading={tracksLoading || !near} active={near} />}</DeferredHomeSection>
      <DeferredHomeSection title="Discover something new">{near => <DailyDiscoverySection candidates={allMusic} isLoading={tracksLoading || wavlake.isLoading || !near} active={near} variation={shelfVariation} onRefresh={() => setShelfVariation(value => value + 1)} />}</DeferredHomeSection>

      <DeferredHomeSection title="Music news">{near => <MusicNewsSection enabled={near} home />}</DeferredHomeSection>
      <DeferredHomeSection title="Fresh on Nostr">{near => <HomeFreshTracks candidates={tracks} enabled={near} />}</DeferredHomeSection>
      <DeferredHomeSection title="Podcasts">{near => <HomePodcastsSection enabled={near} />}</DeferredHomeSection>

      {homeTracksQuery.isError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">Couldn’t load music from your read relays. Genre shelves may be unavailable. <button type="button" className="font-semibold text-primary underline" onClick={() => void homeTracksQuery.refetch()}>Try again</button></div>}
      {homeTracksQuery.data?.failedRelays.length ? <p role="status" className="text-xs text-muted-foreground">Some read relays didn’t respond; showing available music while they’re unavailable.</p> : null}
      {wavlake.isError && <p role="status" className="text-xs text-muted-foreground">Wavlake catalog results aren’t available right now; genre shelves use music from responding relays.</p>}
      <section aria-label="Browse music by genre" className="grid grid-cols-1 gap-6 sm:grid-cols-2 2xl:grid-cols-3">
        {visibleCategoryShelves.map(({ category, tracks: categoryTracks }) => (
          <DeferredHomeSection key={category.id} title={category.label} rootMargin="600px 0px">
            <Shelf title={category.label} tracks={categoryTracks} dense compactCards carouselRows={2} seeAllHref={`/category/${category.id}`} carouselClassName="grid-rows-2" onRefresh={refreshGenreShelves} />
          </DeferredHomeSection>
        ))}
      </section>

      {discoveryEnabled && !tracksLoading && !wavlake.isLoading && allMusic.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-8 py-16 text-center">
          <p className="mx-auto max-w-sm text-muted-foreground">
            No audio found yet. Try again in a moment, or check your relay connections — music and
            podcasts load live from Nostr.
          </p>
        </div>
      )}
    </div>
  );
};

export default Index;
