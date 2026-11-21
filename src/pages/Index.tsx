import { useEffect, useMemo, useState } from "react";
import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useHomeTracks } from "@/hooks/useHomeTracks";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { useFreshNostrTracks } from "@/hooks/useFreshNostrTracks";
import { useNearViewport } from "@/hooks/useNearViewport";
import { usePlayer } from "@/hooks/usePlayer";
import { useFollowedArtists } from "@/hooks/useFollowedArtists";
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
  const player = usePlayer();
  const followedArtists = useFollowedArtists(discoveryEnabled);
  const [pageSeed] = useState(() => crypto.randomUUID());
  const [shelfVariation, setShelfVariation] = useState(0);
  const [recentShelfHistory] = useState(readHomeShelfHistory);
  const allMusic = useMemo(() => [...tracks, ...wavlakeTracks], [tracks, wavlakeTracks]);
  const categoryShelves = useMemo(() => CATEGORIES.map(category => {
    const categoryTracks = tracksInCategory(allMusic, category.id);
    const recentlyShown = new Set(recentShelfHistory[category.id] ?? []);
    const alternateTracks = categoryTracks.filter(track => !recentlyShown.has(track.id));
    const select = (candidates: typeof allMusic, limit: number) => buildVariedHomeShelf({
      candidates,
      history: [],
      liked: [],
      followedArtists: followedArtists.data ?? [],
      limit,
      variation: shelfVariation,
      seed: pageSeed,
      familiarSlots: 1,
    });
    const preferred = select(alternateTracks, 15);
    const selected = preferred.length < 15
      ? [...preferred, ...select(categoryTracks.filter(item => !preferred.some(track => track.id === item.id)), 15 - preferred.length)].slice(0, 15)
      : preferred;
    return { category, tracks: selected };
  }), [allMusic, followedArtists.data, shelfVariation, pageSeed, recentShelfHistory]);

  useEffect(() => {
    if (!homeTracksQuery.data && !wavlake.data) return;
    const nextHistory = { ...recentShelfHistory };
    for (const { category, tracks: categoryTracks } of categoryShelves) {
      const freshCategoryTracks = categoryTracks.filter(track => tracksInCategory([track], category.id).length > 0);
      if (!freshCategoryTracks.length) continue;
      nextHistory[category.id] = [...new Set([...freshCategoryTracks.map(track => track.id), ...(recentShelfHistory[category.id] ?? [])])].slice(0, 45);
    }
    writeHomeShelfHistory(nextHistory);
  }, [categoryShelves, homeTracksQuery.data, wavlake.data, recentShelfHistory]);

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
      <DeferredHomeSection title="Discover something new" rootMargin="0px">{near => <DailyDiscoverySection candidates={allMusic} isLoading={tracksLoading || wavlake.isLoading || !near} active={near} variation={shelfVariation} onRefresh={() => setShelfVariation(value => value + 1)} />}</DeferredHomeSection>

      <DeferredHomeSection title="Music news" rootMargin="0px">{near => <MusicNewsSection enabled={near} home />}</DeferredHomeSection>
      <DeferredHomeSection title="Fresh on Nostr" rootMargin="0px">{near => <HomeFreshTracks candidates={tracks} enabled={near} />}</DeferredHomeSection>
      <DeferredHomeSection title="Podcasts" rootMargin="0px">{near => <HomePodcastsSection enabled={near} />}</DeferredHomeSection>

      {homeTracksQuery.isError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">Couldn’t load music from your read relays. Genre shelves may be unavailable. <button type="button" className="font-semibold text-primary underline" onClick={() => void homeTracksQuery.refetch()}>Try again</button></div>}
      {homeTracksQuery.data?.failedRelays.length ? <p role="status" className="text-xs text-muted-foreground">Some read relays didn’t respond; showing available music while they’re unavailable.</p> : null}
      {wavlake.isError && <p role="status" className="text-xs text-muted-foreground">Wavlake catalog results aren’t available right now; genre shelves use music from responding relays.</p>}
      {categoryShelves.map(({ category, tracks: categoryTracks }) => (
        <DeferredHomeSection key={category.id} title={category.label}>
          <Shelf title={category.label} tracks={categoryTracks} dense seeAllHref={`/category/${category.id}`} />
        </DeferredHomeSection>
      ))}

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
