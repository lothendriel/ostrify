import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { useTracks } from "@/hooks/useTracks";
import { usePodcastEpisodes } from "@/hooks/usePodcasts";
import { CATEGORIES, categoryColor } from "@/lib/categories";
import { TrackList } from "@/components/music/TrackList";
import type { Track } from "@/lib/music";

const SearchPage = () => {
  useSeoMeta({ title: "Search — Ostrify" });
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') ?? "";
  const { data: tracks = [], isLoading: tracksLoading } = useTracks({ limit: 200 });
  const { data: podcasts = [], isLoading: podcastsLoading } = usePodcastEpisodes(60);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return [] as Track[];
    const all = [...tracks, ...podcasts];
    return all.filter((t) =>
      q.split(/\s+/).every(term => `${t.title} ${t.artist ?? ''} ${t.album ?? ''} ${t.topics.join(' ')}`.toLowerCase().includes(term)),
    );
  }, [q, tracks, podcasts]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {q ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">
            Results for "{query}"
          </h2>
          <p className="text-sm text-muted-foreground">These results search recently loaded Nostr audio. For Wavlake’s full catalog, <Link to="/music?source=wavlake" className="text-primary underline">search Wavlake</Link>.</p>
          <TrackList
            tracks={results}
            isLoading={tracksLoading || podcastsLoading}
            emptyMessage="No matches. Try a different search term."
          />
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Browse all</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Link to="/audiobooks" className="relative h-28 rounded-lg overflow-hidden p-4 flex items-end font-bold text-white text-lg shadow-md hover:scale-[1.02] transition-transform" style={{ background: categoryColor('audiobooks') }}>Audiobooks</Link>
            <Link to="/podcasts" className="relative h-28 rounded-lg overflow-hidden p-4 flex items-end font-bold text-white text-lg shadow-md hover:scale-[1.02] transition-transform" style={{ background: categoryColor('podcasts') }}>Podcasts</Link>
            {CATEGORIES.map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.id}`}
                className="relative h-28 rounded-lg overflow-hidden p-4 flex items-end font-bold text-white text-lg shadow-md hover:scale-[1.02] transition-transform"
                style={{ background: categoryColor(c.id) }}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default SearchPage;
