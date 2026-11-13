import { useMemo } from "react";
import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useTracks } from "@/hooks/useTracks";
import { usePodcastEpisodes } from "@/hooks/usePodcasts";
import { useWavlakeCatalog } from "@/hooks/useWavlake";
import { usePlayer } from "@/hooks/usePlayer";
import { Shelf } from "@/components/music/Shelf";
import { MadeForYouSection } from "@/components/music/MadeForYouSection";
import { DailyDiscoverySection } from "@/components/music/DailyDiscoverySection";
import { MusicNewsSection } from "@/components/music/MusicNewsSection";
import { CATEGORIES, tracksInCategory } from "@/lib/categories";

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

  const { data: tracks = [], isLoading: tracksLoading } = useTracks({ limit: 150 });
  const { data: podcasts = [], isLoading: podcastsLoading } = usePodcastEpisodes(40);
  const player = usePlayer();
  const wavlake = useWavlakeCatalog();
  const wavlakeTracks = useMemo(() => wavlake.data?.pages.flatMap(page => page.tracks) ?? [], [wavlake.data]);

  const fresh = useMemo(() => shuffled(tracks).slice(0, 10), [tracks]);
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
  const categoryShelves = useMemo(() => {
    return CATEGORIES.map((category) => {
      const nostrMatches = tracksInCategory(tracks, category.id).filter(track => track.source !== "wavlake");
      const nostrKeys = new Set(nostrMatches.flatMap(track => [track.id, track.url]));
      const wavlakeMatches = tracksInCategory(wavlakeTracks, category.id).filter(track => !nostrKeys.has(track.id) && !nostrKeys.has(track.url));
      const selected = [
        ...shuffled(nostrMatches).slice(0, 5),
        ...shuffled(wavlakeMatches).slice(0, 5),
      ];
      const selectedKeys = new Set(selected.flatMap(track => [track.id, track.url]));
      const remaining = shuffled([...nostrMatches, ...wavlakeMatches].filter(track => !selectedKeys.has(track.id) && !selectedKeys.has(track.url)));
      return {
        category,
        tracks: shuffled([...selected, ...remaining]).slice(0, 10),
      };
    }).filter(shelf => shelf.tracks.length > 0);
  }, [tracks, wavlakeTracks]);

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

      <Shelf title="Jump back in" subtitle="Your recent listening" tracks={player.history.slice(0, 10)} dense />
      <MadeForYouSection candidates={tracks} isLoading={tracksLoading} />
      <DailyDiscoverySection candidates={tracks} isLoading={tracksLoading} />

      <MusicNewsSection />
      <Shelf title="Fresh on Nostr" subtitle="The newest tracks hitting the relays" tracks={fresh} isLoading={tracksLoading} dense />

      <Shelf title="Podcasts" subtitle="Episodes from Nostr and Fountain.fm" tracks={shuffledPodcasts} isLoading={podcastsLoading} dense />

      {categoryShelves.map(({ category, tracks: catTracks }) => (
        <Shelf key={category.id} title={category.label} tracks={catTracks} dense seeAllHref={`/category/${category.id}`} />
      ))}

      {!tracksLoading && tracks.length === 0 && !podcastsLoading && (
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
