import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Mic, Radio, Globe2, ChevronRight, Play } from "lucide-react";
import { usePodcastEpisodes, useNostrPodcastShows, useFountainPodcastShows, type PodcastShow } from "@/hooks/usePodcasts";
import { TrackCard } from "@/components/music/TrackCard";
import { TrackList } from "@/components/music/TrackList";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";
import { useAuthor } from "@/hooks/useAuthor";
import { usePlayer } from "@/hooks/usePlayer";
import { nip19 } from "nostr-tools";

const PodcastsPage = () => {
  useSeoMeta({ title: "Podcasts — Ostrify" });
  const episodes = usePodcastEpisodes(120);
  const nostrShows = useNostrPodcastShows();
  const fountainShows = useFountainPodcastShows();
  const player = usePlayer();
  const [source, setSource] = useState<"nostr" | "fountain">("nostr");
  const [viewAllSource, setViewAllSource] = useState<"nostr" | "fountain" | null>(null);
  const nostrTracks = (episodes.data ?? []).filter((track) => track.source !== "fountain" && track.kind === "podcast");
  const fountainTracks = (episodes.data ?? []).filter((track) => track.source === "fountain");
  const selectedTracks = source === "nostr" ? nostrTracks : fountainTracks;
  const selectedShows = source === "nostr" ? nostrShows.data ?? [] : fountainShows.data ?? [];
  const fountainEpisodeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const episode of episodes.data ?? []) {
      if (episode.source === "fountain" && episode.showId) counts.set(episode.showId, (counts.get(episode.showId) ?? 0) + 1);
    }
    return counts;
  }, [episodes.data]);
  const sourceLoading = source === "nostr" ? nostrShows.isLoading : fountainShows.isLoading;
  const sourceError = source === "nostr" ? nostrShows.isError : fountainShows.isError;
  const isLoading = episodes.isLoading || sourceLoading;

  const perShowEpisodes = useMemo(() => {
    const grouped = new Map<string, Track[]>();
    for (const episode of selectedTracks) {
      const showId = episode.showId ?? `nostr:${episode.pubkey}`;
      const list = grouped.get(showId) ?? [];
      list.push(episode);
      grouped.set(showId, list);
    }
    return grouped;
  }, [selectedTracks]);

  const topShows = useMemo(() => [...selectedShows]
    .sort((a, b) => (source === "fountain" ? (fountainEpisodeCounts.get(b.id) ?? b.episodeCount ?? 0) - (fountainEpisodeCounts.get(a.id) ?? a.episodeCount ?? 0) : (b.episodeCount ?? perShowEpisodes.get(b.id)?.length ?? 0) - (a.episodeCount ?? perShowEpisodes.get(a.id)?.length ?? 0)))
    .slice(0, 8), [selectedShows, perShowEpisodes, fountainEpisodeCounts, source]);

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <header className="rounded-xl bg-gradient-to-br from-fuchsia-900 via-purple-950 to-card p-6 sm:p-8">
        <p className="flex items-center gap-2 text-sm uppercase tracking-wider font-semibold text-fuchsia-200"><Mic className="size-4" /> Podcasts on Ostrify</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Podcasts</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">Browse podcast shows and episodes, with separate catalogs for Nostr-native shows and Fountain-discovered shows.</p>
      </header>

      <Tabs value={source} onValueChange={(value) => { if (value === "nostr" || value === "fountain") { setSource(value); setViewAllSource(null); } }}>
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="nostr"><Radio className="size-4" /> Nostr podcasts</TabsTrigger>
          <TabsTrigger value="fountain"><Globe2 className="size-4" /> Fountain.fm</TabsTrigger>
        </TabsList>

        <TabsContent value={source} className="mt-6 space-y-8">
          {viewAllSource ? (
            <ShowCatalog
              key={viewAllSource}
              source={viewAllSource}
              shows={viewAllSource === "nostr" ? nostrShows.data ?? [] : fountainShows.data ?? []}
              isLoading={viewAllSource === "nostr" ? nostrShows.isLoading : fountainShows.isLoading}
              error={viewAllSource === "nostr" ? nostrShows.isError : fountainShows.isError}
              onBack={() => setViewAllSource(null)}
              onLoadMore={() => void (viewAllSource === "nostr" ? nostrShows.fetchNextPage() : fountainShows.fetchNextPage())}
              hasMore={viewAllSource === "nostr" ? nostrShows.hasNextPage : (fountainShows.hasNextPage || fountainShows.needsMoreScan || fountainShows.isFetching)}
              isLoadingMore={viewAllSource === "nostr" ? nostrShows.isFetchingNextPage : fountainShows.isFetchingNextPage}
              loadMoreError={viewAllSource === "nostr" ? nostrShows.isFetchNextPageError : fountainShows.isFetchNextPageError}
              loadMoreLoading={viewAllSource === "fountain" && fountainShows.isFetching}
            />
          ) : (
            <>
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h2 className="text-2xl font-bold">Top shows</h2><p className="text-sm text-muted-foreground">{source === "nostr" ? "Shows with the most playable NIP-F4 episodes found on your relays." : "Shows discovered through NIP-73 podcast feed references on Nostr."}</p></div>
                  <Button variant="outline" onClick={() => setViewAllSource(source)}>View all {source === "nostr" ? "Nostr" : "Fountain"} shows <ChevronRight className="size-4" /></Button>
                </div>
                {sourceError && <p role="alert" className="text-sm text-destructive">Couldn’t load this show catalog. <button className="underline" onClick={() => void (source === "nostr" ? nostrShows.refetch() : fountainShows.refetch())}>Try again</button></p>}
                {sourceLoading ? <ShowSkeletonGrid /> : topShows.length ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{topShows.map((show) => <ShowCard key={show.id} show={show} tracks={perShowEpisodes.get(show.id) ?? []} onPlay={(tracks) => player.playQueue(tracks)} />)}</div> : <EmptyShows source={source} />}
              </section>

              <section className="space-y-4">
                {source === "nostr" && <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">All Nostr episodes</h2><p className="text-sm text-muted-foreground">Recent episodes loaded from your relays.</p></div><Button variant="outline" onClick={() => void episodes.refetch()}>Refresh</Button></div>}
                {source === "fountain" && <div><h2 className="text-2xl font-bold">Latest Fountain episodes</h2><p className="text-sm text-muted-foreground">Fountain episodes currently referenced on Nostr.</p></div>}
                {episodes.isLoading ? <TrackSkeletonGrid /> : episodes.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load podcast episodes. <button className="underline" onClick={() => void episodes.refetch()}>Try again</button></p> : selectedTracks.length ? <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">{selectedTracks.slice(0, 10).map((episode) => <TrackCard key={episode.id} track={episode} queue={selectedTracks} />)}</div>{source === "nostr" && <TrackList tracks={selectedTracks} />}</> : <EmptyEpisodes source={source} />}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

function ShowCard({ show, tracks, onPlay }: { show: PodcastShow; tracks: Track[]; onPlay?: (tracks: Track[]) => void }) {
  const author = useAuthor(show.pubkey);
  const cover = sanitizeUrl(show.image) ?? sanitizeUrl(author.data?.metadata?.picture);
  const name = show.title || show.publisher || author.data?.metadata?.display_name || author.data?.metadata?.name || "Podcast show";
  const playTracks = tracks;
  return (
    <article className="group rounded-xl bg-secondary/40 p-3 hover:bg-secondary transition-colors">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-fuchsia-800 to-purple-950">
        {cover ? <img src={cover} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Mic className="size-12 text-white/70" /></div>}
      </div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><p className="truncate font-semibold" title={name}>{name}</p><p className="mt-1 truncate text-sm text-muted-foreground">{show.source === "fountain" ? show.publisher ?? "Fountain show" : "Nostr show"} · {show.episodeCount ?? tracks.length} episodes</p></div>
        {playTracks.length > 0 && onPlay && <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label={`Play ${name}`} onClick={() => onPlay(playTracks)}><Play className="size-4 fill-current" /></button>}
      </div>
      {show.pubkey && <Link to={`/${nip19.npubEncode(show.pubkey)}`} className="mt-2 inline-block text-xs text-primary hover:underline">Open Nostr show</Link>}
    </article>
  );
}

function ShowCatalog({ source, shows, isLoading, error, onBack, onLoadMore, hasMore, isLoadingMore, loadMoreError, loadMoreLoading }: { source: "nostr" | "fountain"; shows: PodcastShow[]; isLoading: boolean; error: boolean; onBack: () => void; onLoadMore: () => void; hasMore: boolean; isLoadingMore: boolean; loadMoreError: boolean; loadMoreLoading: boolean }) {
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><button type="button" onClick={onBack} className="text-sm text-primary hover:underline">← Back to top shows</button><h2 className="mt-2 text-2xl font-bold">All {source === "nostr" ? "Nostr" : "Fountain.fm"} shows</h2><p className="text-sm text-muted-foreground">{shows.length} shows loaded from discovered podcast references.</p></div></div>
    <p className="text-sm text-muted-foreground">{source === "fountain" ? "Fountain shows are resolved from public podcast feed GUID references found on Nostr." : "Nostr shows are collected from playable NIP-F4 episodes and show metadata on your enabled read relays."}</p>
    {error && <p role="alert" className="text-sm text-destructive">Couldn’t load the show catalog.</p>}
    {isLoading ? <ShowSkeletonGrid /> : shows.length ? <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{shows.map((show) => <ShowCard key={show.id} show={show} tracks={[]} />)}</div>{loadMoreError && <p role="alert" className="text-sm text-destructive">Couldn’t load more shows. Try again.</p>}{hasMore && <Button variant="outline" disabled={isLoadingMore || loadMoreLoading} onClick={onLoadMore}>{isLoadingMore || loadMoreLoading ? "Loading more shows…" : "Load more shows"}</Button>}</> : <EmptyShows source={source} />}
  </section>;
}

function ShowSkeletonGrid() {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" aria-label="Loading shows">{Array.from({ length: 10 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}</div>;
}

function TrackSkeletonGrid() {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" aria-label="Loading episodes">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-4 w-3/4" /></div>)}</div>;
}

function EmptyShows({ source }: { source: "nostr" | "fountain" }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">{source === "nostr" ? "No playable NIP-F4 podcast shows or episodes were found on the relays currently loaded. Try more read relays." : "No Fountain podcast feed references were found in the Nostr notes loaded so far."}</div>;
}

function EmptyEpisodes({ source }: { source: "nostr" | "fountain" }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No {source === "nostr" ? "Nostr" : "Fountain-linked"} episodes were found in the relays currently loaded.</div>;
}

export default PodcastsPage;
