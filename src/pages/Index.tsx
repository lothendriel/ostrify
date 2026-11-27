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
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlaylists } from "@/hooks/usePlaylists";
import { useTracksByIds } from "@/hooks/useTracksByIds";
import { Shelf } from "@/components/music/Shelf";
import { MadeForYouSection } from "@/components/music/MadeForYouSection";
import { DailyDiscoverySection } from "@/components/music/DailyDiscoverySection";
import { FreshTracksCarousel } from "@/components/music/FreshTracksCarousel";
import { MusicNewsSection } from "@/components/music/MusicNewsSection";
import { DeferredHomeSection } from "@/components/music/DeferredHomeSection";
import { HomePodcastsSection } from "@/components/music/HomePodcastsSection";
import { FeaturedAudiobooks } from "@/components/music/FeaturedAudiobooks";
import { useOctober } from "@/hooks/useOctober";
import { useDecember } from "@/hooks/useDecember";
import { CATEGORIES, categoriesForTrack, groupTracksByCategory } from "@/lib/categories";
import { buildVariedHomeShelf } from "@/lib/homeRecommendations";
import { readHomeShelfHistory, writeHomeShelfHistory } from "@/lib/homeShelfHistory";
import type { Track } from "@/lib/music";
import { useHomeSessionScope } from '@/contexts/HomeSessionContext';
import { isSessionMusicTrack, readHomeSessionSnapshot, writeHomeSessionSnapshot } from '@/lib/homeSession';

const HOME_SHELF_CATEGORIES = CATEGORIES.filter(category => category.id !== "bitcoin");
const HOME_WAVLAKE_GENRES = [...new Set(HOME_SHELF_CATEGORIES.flatMap(category => category.wavlakeGenres ?? []))];
type HomeCategoryShelves = { category: typeof CATEGORIES[number]; tracks: Track[] }[];
function isSavedCategoryShelves(value: unknown): value is Record<string, Track[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const shelves = value as Record<string, unknown>;
  return HOME_SHELF_CATEGORIES.every(category => {
    const tracks = shelves[category.id];
    return Array.isArray(tracks) && tracks.every(isSessionMusicTrack);
  });
}

function readCategoryShelves(scope: string): HomeCategoryShelves | null {
  const saved = readHomeSessionSnapshot(`genres:${scope}`, isSavedCategoryShelves);
  return saved ? HOME_SHELF_CATEGORIES.map(category => ({ category, tracks: saved[category.id] })) : null;
}

function saveCategoryShelves(scope: string, shelves: HomeCategoryShelves) {
  writeHomeSessionSnapshot(`genres:${scope}`, Object.fromEntries(shelves.map(({ category, tracks }) => [category.id, tracks])));
}

function groupHomeTracksByCategory(allMusic: Track[], genreCatalogTracksByGenre: Map<string, Track[]>): Map<string, Track[]> {
  const groups = new Map(HOME_SHELF_CATEGORIES.map(category => [category.id, [] as Track[]]));
  const genreTracksByCategory = new Map(HOME_SHELF_CATEGORIES.map(category => [
    category.id,
    (category.wavlakeGenres ?? []).flatMap(genre => genreCatalogTracksByGenre.get(genre) ?? []),
  ]));
  const catalogCategoriesByTrack = new Map<Track, Set<string>>();
  for (const [categoryId, tracks] of genreTracksByCategory) {
    for (const track of tracks) {
      const categories = catalogCategoriesByTrack.get(track) ?? new Set<string>();
      categories.add(categoryId);
      catalogCategoriesByTrack.set(track, categories);
    }
  }

  for (const track of allMusic) {
    if (track.kind !== "music") continue;
    const catalogCategories = catalogCategoriesByTrack.get(track) ?? new Set<string>();
    const matchedCategories = new Set(categoriesForTrack(track).filter(categoryId => categoryId !== "general" || catalogCategories.size === 0));
    for (const categoryId of catalogCategories) matchedCategories.add(categoryId);
    for (const category of HOME_SHELF_CATEGORIES) {
      if (!matchedCategories.has(category.id)) continue;
      const groupedTrack = catalogCategories.has(category.id) && category.match.length
        ? { ...track, topics: [...track.topics, category.match[0]] }
        : track;
      groups.get(category.id)?.push(groupedTrack);
    }
  }

  for (const category of HOME_SHELF_CATEGORIES) {
    if (!category.match.length) continue;
    const categoryTracks = groups.get(category.id);
    for (const track of genreTracksByCategory.get(category.id) ?? []) {
      if (track.kind === "music") categoryTracks?.push({ ...track, topics: [...track.topics, category.match[0]] });
    }
  }
  return groups;
}

function HomeFreshTracks({ candidates, enabled, sessionScope }: { candidates: Track[]; enabled: boolean; sessionScope?: string }) {
  const query = useFreshNostrTracks(enabled, sessionScope);
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
  const { ref: featuredAudiobooksRef, isNearViewport: featuredAudiobooksEnabled } = useNearViewport<HTMLDivElement>("300px 0px");
  const { user } = useCurrentUser();
  const isOctober = useOctober();
  const isDecember = useDecember();
  const homeAccountScope = useHomeSessionScope();
  const shelfSessionScope = user?.pubkey ?? "public";
  const homeTracksQuery = useHomeTracks(discoveryEnabled, homeAccountScope);
  const tracks = homeTracksQuery.data?.tracks ?? [];
  const tracksLoading = homeTracksQuery.isLoading;
  const wavlake = useWavlakeCatalog(undefined, discoveryEnabled, homeAccountScope);
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);
  const baseMusic = useMemo(() => [...tracks, ...wavlakeTracks], [tracks, wavlakeTracks]);
  const baseSourcesLoading = homeTracksQuery.isLoading || wavlake.isLoading;
  const baseTracksByCategory = useMemo(() => groupTracksByCategory(baseMusic), [baseMusic]);
  const categoriesNeedingCatalog = useMemo(() => new Set(baseSourcesLoading ? [] : HOME_SHELF_CATEGORIES
    .filter(category => category.wavlakeGenres?.length && new Set((baseTracksByCategory.get(category.id) ?? []).map(track => track.url)).size < 8)
    .flatMap(category => category.wavlakeGenres ?? [])), [baseTracksByCategory, baseSourcesLoading]);
  const genreCatalogQueries = useWavlakeGenreCatalog(HOME_WAVLAKE_GENRES, discoveryEnabled, [...categoriesNeedingCatalog], homeAccountScope, true);
  const genreCatalogVersion = genreCatalogQueries.map((query, index) => `${HOME_WAVLAKE_GENRES[index]}:${query.dataUpdatedAt}:${query.isLoading}`).join('|');
  const genreCatalogTracks = useMemo(() => genreCatalogQueries.flatMap(query => query.data ?? []), [genreCatalogVersion]);
  const genreCatalogTracksByGenre = useMemo(() => new Map(HOME_WAVLAKE_GENRES.map((genre, index) => [genre, genreCatalogQueries[index]?.data ?? []] as const)), [genreCatalogVersion]);
  const player = usePlayer();
  const followedArtists = useFollowedArtists(discoveryEnabled, homeAccountScope);
  const [pageSeed] = useState(() => crypto.randomUUID());
  const [genreShelfVariations, setGenreShelfVariations] = useState<Record<string, number>>({});
  const pendingGenreRefresh = useRef(new Set<string>());
  const recentShelfHistory = useRef(readHomeShelfHistory(user?.pubkey ?? 'anonymous'));
  const currentShelves = useRef<{ categoryId: string; tracks: Track[] }[]>([]);
  const allMusic = useMemo(() => [...tracks, ...wavlakeTracks, ...genreCatalogTracks], [tracks, wavlakeTracks, genreCatalogTracks]);
  const playlists = usePlaylists(discoveryEnabled, homeAccountScope);
  const likedPlaylist = playlists.data?.find(playlist => playlist.isLiked);
  const likedQuery = useTracksByIds(likedPlaylist?.trackIds, discoveryEnabled, [], homeAccountScope);
  const likedTracks = likedQuery.data?.tracks ?? [];
  const categoryShelves = useMemo(() => {
    const tracksByCategory = groupHomeTracksByCategory(allMusic, genreCatalogTracksByGenre);
    return HOME_SHELF_CATEGORIES.map(category => {
      const categoryTracks = [...(tracksByCategory.get(category.id) ?? [])];
      const recentlyShown = new Set(recentShelfHistory.current[category.id] ?? []);
      const freshCandidates = categoryTracks.filter(track => !recentlyShown.has(track.id) && !recentlyShown.has(track.url));
      const select = (candidates: typeof allMusic, limit: number) => buildVariedHomeShelf({
        candidates,
        history: player.history,
        liked: likedTracks,
        followedArtists: followedArtists.data ?? [],
        limit,
        variation: genreShelfVariations[category.id] ?? 0,
        seed: `${pageSeed}:${category.id}`,
        familiarSlots: 2,
      });
      const preferred = select(freshCandidates.length >= 4 ? freshCandidates : categoryTracks, 4);
      const selected = preferred.length < 4
        ? [...preferred, ...select(categoryTracks.filter(item => !preferred.some(track => track.id === item.id || track.url === item.url)), 4 - preferred.length)].slice(0, 4)
        : preferred;
      return { category, tracks: selected };
    });
  }, [allMusic, genreCatalogTracksByGenre, genreShelfVariations, pageSeed, player.history, likedTracks, followedArtists.data]);
  const [displayShelves, setDisplayShelves] = useState<{ scope: string; shelves: HomeCategoryShelves } | null>(() => {
    const shelves = readCategoryShelves(shelfSessionScope);
    return shelves ? { scope: shelfSessionScope, shelves } : null;
  });
  const savedCategoryShelves = useMemo(() => readCategoryShelves(shelfSessionScope), [shelfSessionScope]);
  const sessionCategoryShelves = displayShelves?.scope === shelfSessionScope ? displayShelves.shelves : savedCategoryShelves;
  const visibleCategoryShelves = sessionCategoryShelves ?? categoryShelves;
  const orderedCategoryShelves = useMemo(() => [
    ...visibleCategoryShelves.filter(shelf => shelf.tracks.length > 0),
    ...visibleCategoryShelves.filter(shelf => shelf.tracks.length === 0),
  ], [visibleCategoryShelves]);
  const personalizedInputsLoading = playlists.isLoading || likedQuery.isLoading || followedArtists.isLoading;
  const neededCatalogStillLoading = [...categoriesNeedingCatalog].some(genre => {
    const index = HOME_WAVLAKE_GENRES.indexOf(genre);
    return index >= 0 && genreCatalogQueries[index]?.isFetching;
  });

  useEffect(() => {
    const shouldRefreshSnapshot = !sessionCategoryShelves;
    const refreshedCategoryIds = pendingGenreRefresh.current;

    // Disabled queries report isLoading=false, so don't freeze the initially empty
    // shelves before the deferred Home discovery queries have even started.
    if (discoveryEnabled && !baseSourcesLoading && !personalizedInputsLoading && !neededCatalogStillLoading && (shouldRefreshSnapshot || refreshedCategoryIds.size > 0)) {
      const existingShelves = sessionCategoryShelves ?? categoryShelves;
      const shelves = refreshedCategoryIds.size
        ? existingShelves.map(shelf => refreshedCategoryIds.has(shelf.category.id)
          ? categoryShelves.find(candidate => candidate.category.id === shelf.category.id) ?? shelf
          : shelf)
        : categoryShelves;
      const snapshot = { scope: shelfSessionScope, shelves };
      pendingGenreRefresh.current = new Set();
      saveCategoryShelves(shelfSessionScope, shelves);
      setDisplayShelves(snapshot);
    }
  }, [sessionCategoryShelves, categoryShelves, baseSourcesLoading, personalizedInputsLoading, neededCatalogStillLoading, shelfSessionScope, discoveryEnabled]);

  useEffect(() => {
    currentShelves.current = visibleCategoryShelves.map(({ category, tracks: shelfTracks }) => ({ categoryId: category.id, tracks: shelfTracks }));
    if (!sessionCategoryShelves) return;
    const nextHistory = { ...recentShelfHistory.current };
    for (const { categoryId, tracks: shelfTracks } of currentShelves.current) {
      if (!shelfTracks.length) continue;
      nextHistory[categoryId] = [...new Set([...shelfTracks.flatMap(track => [track.id, track.url]), ...(nextHistory[categoryId] ?? [])])].slice(0, 90);
    }
    recentShelfHistory.current = nextHistory;
    writeHomeShelfHistory(nextHistory, user?.pubkey ?? 'anonymous');
  }, [visibleCategoryShelves, sessionCategoryShelves, user?.pubkey]);

  const refreshGenreShelf = (categoryId: string) => {
    const currentShelf = currentShelves.current.find(shelf => shelf.categoryId === categoryId);
    const nextHistory = { ...recentShelfHistory.current };
    if (currentShelf?.tracks.length) {
      nextHistory[categoryId] = [...new Set([
        ...currentShelf.tracks.flatMap(track => [track.id, track.url]),
        ...(recentShelfHistory.current[categoryId] ?? []),
      ])].slice(0, 90);
      recentShelfHistory.current = nextHistory;
      writeHomeShelfHistory(nextHistory, user?.pubkey ?? 'anonymous');
    }
    pendingGenreRefresh.current.add(categoryId);
    setGenreShelfVariations(current => ({ ...current, [categoryId]: (current[categoryId] ?? 0) + 1 }));
  };

  const { greeting, greetingImage } = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return { greeting: "Good morning", greetingImage: "/greeting-morning.webp" };
    if (hour < 18) return { greeting: "Good afternoon", greetingImage: "/greeting-afternoon.webp" };
    return { greeting: "Good evening", greetingImage: "/greeting-evening.webp" };
  })();

  return (
    <div className="home-page w-full min-w-0 max-w-full space-y-8 overflow-x-clip p-4 sm:p-6">
      <h1 className="home-greeting flex items-center gap-3 text-3xl font-bold tracking-tight">
        <span>{greeting}</span>
        <img src={isOctober ? "/images/october-pumpkin.webp" : isDecember ? "/images/december-hat.webp" : greetingImage} alt="" aria-hidden="true" fetchPriority="high" decoding="async" className="size-10 shrink-0 object-contain" />
      </h1>

      <section aria-labelledby="browse-genres-heading" className="home-genres relative space-y-3 text-center">
        {isOctober && <img src="/images/october-ghost.webp" alt="" aria-hidden="true" className="october-ghost pointer-events-none absolute left-0 top-0 hidden w-20 lg:block" />}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <h2 id="browse-genres-heading" className="text-sm font-semibold text-muted-foreground">Browse genres</h2>
          <Link to="/music" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">All music <ChevronRight className="size-3.5" /></Link>
        </div>
        <nav aria-label="Browse music genres" className="flex flex-wrap justify-center gap-2 pb-1">
          {CATEGORIES.map(category => <Link key={category.id} to={`/category/${category.id}`} className="genre-pill rounded-full border border-[#00ed69] bg-[#00ed69] px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:border-[#00d95f] hover:bg-[#00d95f] focus-visible:outline-2 focus-visible:outline-primary">{category.label}</Link>)}
        </nav>
      </section>

      <div ref={discoveryTriggerRef} aria-hidden="true" className="h-px" />
      <MadeForYouSection candidates={allMusic} isLoading={!discoveryEnabled || baseSourcesLoading || neededCatalogStillLoading} sessionScope={homeAccountScope} />
      <Shelf title="Jump back in" subtitle="Your recent listening" tracks={player.history.slice(0, 10)} dense compactCards />
      <div ref={featuredAudiobooksRef}>
        <FeaturedAudiobooks enabled={featuredAudiobooksEnabled} />
      </div>
      <DeferredHomeSection title="Discover something new">{near => <DailyDiscoverySection candidates={allMusic} isLoading={!discoveryEnabled || baseSourcesLoading || neededCatalogStillLoading || !near} active={near} sessionScope={homeAccountScope} />}</DeferredHomeSection>

      <DeferredHomeSection title="Music news">{near => <MusicNewsSection enabled={near} home sessionScope={homeAccountScope} />}</DeferredHomeSection>
      <DeferredHomeSection title="Fresh on Nostr">{near => <HomeFreshTracks candidates={tracks} enabled={near} sessionScope={homeAccountScope} />}</DeferredHomeSection>
      <DeferredHomeSection title="Podcasts">{near => <HomePodcastsSection enabled={near} sessionScope={homeAccountScope} />}</DeferredHomeSection>

      {homeTracksQuery.isError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">Couldn’t load music from your read relays. Genre shelves may be unavailable. <button type="button" className="font-semibold text-primary underline" onClick={() => void homeTracksQuery.refetch()}>Try again</button></div>}
      {homeTracksQuery.data?.failedRelays.length ? <p role="status" className="text-xs text-muted-foreground">Some read relays didn’t respond; showing available music while they’re unavailable.</p> : null}
      {wavlake.isError && <p role="status" className="text-xs text-muted-foreground">Wavlake catalog results aren’t available right now; genre shelves use music from responding relays.</p>}
      <section aria-label="Browse music by genre" className="grid grid-cols-1 gap-6 sm:grid-cols-2 2xl:grid-cols-3">
        {orderedCategoryShelves.map(({ category, tracks: categoryTracks }) => (
          <DeferredHomeSection key={category.id} title={category.label} rootMargin="600px 0px">
            <Shelf title={category.label} tracks={categoryTracks} dense compactCards carouselRows={2} seeAllHref={`/category/${category.id}`} carouselClassName="grid-rows-2" onRefresh={() => refreshGenreShelf(category.id)} />
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
