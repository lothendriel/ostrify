import { useMemo } from "react";
import { useSeoMeta } from "@unhead/react";
import { Mic } from "lucide-react";
import { usePodcastEpisodes } from "@/hooks/usePodcasts";
import { TrackCard } from "@/components/music/TrackCard";
import { TrackList } from "@/components/music/TrackList";
import { NostrCollections } from "@/components/music/NostrCollections";
import { Skeleton } from "@/components/ui/skeleton";
import type { Track } from "@/lib/music";

const PodcastsPage = () => {
  useSeoMeta({ title: "Podcasts — Ostrify" });
  const { data: episodes = [], isLoading } = usePodcastEpisodes(120);

  // Group episodes by show (publisher pubkey) for Spotify-style shelves.
  const shows = useMemo(() => {
    const byShow = new Map<string, Track[]>();
    for (const ep of episodes) {
      const existing = byShow.get(ep.pubkey);
      if (existing) existing.push(ep);
      else byShow.set(ep.pubkey, [ep]);
    }
    return [...byShow.values()]
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);
  }, [episodes]);

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-lg bg-gradient-to-br from-fuchsia-500 to-primary flex items-center justify-center shrink-0">
          <Mic className="size-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Podcasts</h1>
          <p className="text-sm text-muted-foreground">Shows and episodes from across Nostr</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="p-3 space-y-3">
              <Skeleton className="w-full aspect-square rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-16 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto">
            No podcast episodes found right now. Try adding more relays in Settings.
          </p>
        </div>
      ) : (
        <>
          <NostrCollections tracks={episodes} podcast />

          {/* Latest episodes */}
          <section className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">Latest episodes</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {episodes.slice(0, 10).map((ep) => (
                <TrackCard key={ep.id} track={ep} queue={episodes} />
              ))}
            </div>
          </section>

          {/* Per-show shelves (shows with more than one episode) */}
          {shows
            .filter((show) => show.length > 1)
            .map((show) => (
              <ShowShelf key={show[0].pubkey} episodes={show} />
            ))}

          {/* All episodes list */}
          <section className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">All episodes</h2>
            <TrackList tracks={episodes} />
          </section>
        </>
      )}
    </div>
  );
};

function ShowShelf({ episodes }: { episodes: Track[] }) {
  // Use the artist/show name from the first episode's metadata if present.
  const title = episodes[0].artist || "More from this show";
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold tracking-tight truncate">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {episodes.slice(0, 10).map((ep) => (
          <TrackCard key={ep.id} track={ep} queue={episodes} />
        ))}
      </div>
    </section>
  );
}

export default PodcastsPage;
