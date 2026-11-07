import { useMemo } from "react";
import { useSeoMeta } from "@unhead/react";
import { Link } from "react-router-dom";
import { useTracks } from "@/hooks/useTracks";
import { usePodcastEpisodes } from "@/hooks/usePodcasts";
import { Shelf } from "@/components/music/Shelf";
import { CATEGORIES, categoryColor, tracksInCategory } from "@/lib/categories";

const Index = () => {
  useSeoMeta({
    title: "Ostrify — Music & Podcasts on Nostr",
    description: "A Spotify-style player for music and podcasts published on the Nostr network.",
  });

  const { data: tracks = [], isLoading: tracksLoading } = useTracks({ limit: 150 });
  const { data: podcasts = [], isLoading: podcastsLoading } = usePodcastEpisodes(40);

  const fresh = useMemo(() => tracks.slice(0, 10), [tracks]);
  const categoryShelves = useMemo(() => {
    return CATEGORIES.map((c) => ({
      category: c,
      tracks: tracksInCategory(tracks, c.id).slice(0, 10),
    })).filter((s) => s.tracks.length > 0);
  }, [tracks]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>

      {/* Browse categories */}
      <section className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">Browse all</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Link to="/audiobooks" className="relative h-24 rounded-lg overflow-hidden p-4 flex items-end font-bold text-white text-lg shadow-md hover:scale-[1.02] transition-transform" style={{ background: categoryColor('audiobooks') }}>Audiobooks</Link>
          <Link to="/podcasts" className="relative h-24 rounded-lg overflow-hidden p-4 flex items-end font-bold text-white text-lg shadow-md hover:scale-[1.02] transition-transform" style={{ background: categoryColor('podcasts') }}>Podcasts</Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              to={`/category/${c.id}`}
              className="relative h-24 rounded-lg overflow-hidden p-4 flex items-end font-bold text-white text-lg shadow-md hover:scale-[1.02] transition-transform"
              style={{ background: categoryColor(c.id) }}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      <Link to="/wavlake" className="block rounded-lg bg-gradient-to-r from-emerald-900 to-teal-950 p-5 hover:brightness-110 transition-colors"><span className="block text-xs uppercase tracking-wider text-emerald-200 font-semibold">More music to discover</span><span className="block text-xl font-bold mt-1">Explore the Wavlake catalog →</span><span className="block text-sm text-emerald-100 mt-1">Search artists, explore albums and browse more tracks.</span></Link>

      <Link to="/music" className="block text-sm font-semibold text-primary hover:underline">Browse more Nostr music →</Link>
      <Shelf title="Fresh on Nostr" subtitle="The newest tracks hitting the relays" tracks={fresh} isLoading={tracksLoading} />

      <Shelf title="Podcasts" subtitle="Episodes from across the network" tracks={podcasts.slice(0, 10)} isLoading={podcastsLoading} />

      {categoryShelves.map(({ category, tracks: catTracks }) => (
        <Shelf key={category.id} title={category.label} tracks={catTracks} />
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
