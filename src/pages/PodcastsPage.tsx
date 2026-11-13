import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BackLink } from "@/components/music/BackLink";
import { useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import { Mic, Radio, Globe2, ChevronLeft, ChevronRight, Play, Search, ArrowLeft, Heart } from "lucide-react";
import { usePodcastEpisodes, useNostrPodcastEpisodeFeed, useNostrPodcastShows, useFountainPodcastShows, usePodcastIndexSearch, usePodcastIndexEpisodes, usePodcastFavorites, usePodcastFavoriteActions, type PodcastShow, type PodcastFavorite } from "@/hooks/usePodcasts";
import { TrackCard } from "@/components/music/TrackCard";
import { TrackList } from "@/components/music/TrackList";
import { QueueActionsMenu } from "@/components/music/QueueActionsMenu";
import { AddToPlaylistMenu } from "@/components/music/AddToPlaylistMenu";
import { LikeButton } from "@/components/music/LikeButton";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Track } from "@/lib/music";
import { sanitizeUrl } from "@/lib/sanitize";
import { useAuthor } from "@/hooks/useAuthor";
import { usePlayer } from "@/hooks/usePlayer";
import { nip19 } from "nostr-tools";
import { Input } from "@/components/ui/input";

export function CombinedPodcastEpisodesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const nostrEpisodes = useNostrPodcastEpisodeFeed();
  const fountainQuery = usePodcastEpisodes(120, 120);
  const nostrTracks = useMemo(() => nostrEpisodes.data?.pages.flatMap(batch => batch.tracks) ?? [], [nostrEpisodes.data]);
  const fountainTracks = useMemo(() => (fountainQuery.data ?? []).filter(track => track.source === "fountain"), [fountainQuery.data]);
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    return [...nostrTracks, ...fountainTracks].filter(track => {
      if (seen.has(track.url)) return false;
      seen.add(track.url);
      return true;
    }).sort((left, right) => right.createdAt - left.createdAt);
  }, [fountainTracks, nostrTracks]);
  const isLoading = nostrEpisodes.isLoading || fountainQuery.isLoading;
  const isError = nostrEpisodes.isError && fountainQuery.isError;
  const pageCount = Math.max(1, Math.ceil(tracks.length / 20));

  useSeoMeta({ title: "Podcast episodes — Ostrify" });
  useEffect(() => {
    if (!isLoading && searchParams.get("page") && page > pageCount && !nostrEpisodes.hasNextPage) {
      setSearchParams(pageCount === 1 ? {} : { page: String(pageCount) }, { replace: true });
    }
  }, [isLoading, nostrEpisodes.hasNextPage, page, pageCount, searchParams, setSearchParams]);

  const loadEpisodePage = async (requiredCount: number) => {
    if (nostrEpisodes.isFetchingNextPage) return false;
    let loadedTracks = tracks;
    let hasMore = nostrEpisodes.hasNextPage;
    while (loadedTracks.length < requiredCount && hasMore) {
      const result = await nostrEpisodes.fetchNextPage();
      const nextNostrTracks = result.data?.pages.flatMap(batch => batch.tracks) ?? [];
      const byUrl = new Map([...nextNostrTracks, ...fountainTracks].map(track => [track.url, track]));
      loadedTracks = [...byUrl.values()].sort((left, right) => right.createdAt - left.createdAt);
      hasMore = Boolean(result.hasNextPage);
    }
    return loadedTracks.length >= requiredCount || (!hasMore && loadedTracks.length > requiredCount - 20);
  };

  return <main className="space-y-6 p-4 sm:p-6">
    <BackLink to="/podcasts" className="text-sm text-muted-foreground hover:text-foreground hover:underline">← Podcasts</BackLink>
    <header>
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">Nostr + Fountain.fm</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Podcast episodes</h1>
      <p className="mt-2 text-muted-foreground">Recent playable episodes from Nostr and Fountain.fm, combined and ordered by publish date.</p>
    </header>
    {isError && <p role="alert" className="text-sm text-destructive">Couldn’t load podcast episodes. <button type="button" className="underline" onClick={() => { void nostrEpisodes.refetch(); void fountainQuery.refetch(); }}>Try again</button></p>}
    {!isLoading && !isError && !tracks.length && !nostrEpisodes.hasNextPage
      ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No playable podcast episodes were found on your relays.</div>
      : <TrackList
          tracks={tracks}
          isLoading={isLoading}
          page={page}
          onPageChange={nextPage => setSearchParams(nextPage <= 1 ? {} : { page: String(nextPage) })}
          hasMore={nostrEpisodes.hasNextPage}
          isLoadingMore={nostrEpisodes.isFetchingNextPage}
          onLoadMore={loadEpisodePage}
          emptyMessage="No playable podcast episodes were found on your relays."
        />}
  </main>;
}

export function PodcastBrowsePage({ type }: { type: "shows" | "episodes" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const favorites = usePodcastFavorites();
  const favoriteActions = usePodcastFavoriteActions();
  const showsQuery = useNostrPodcastShows();
  const episodesQuery = useNostrPodcastEpisodeFeed(type === "episodes");
  const shows = useMemo(() => [...new Map(showsQuery.data.map(show => [show.id, show])).values()].sort((a, b) => (b.episodeCount ?? 0) - (a.episodeCount ?? 0) || a.title.localeCompare(b.title)), [showsQuery.data]);
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    return (episodesQuery.data?.pages.flatMap(batch => batch.tracks) ?? []).filter(track => {
      if (seen.has(track.url)) return false;
      seen.add(track.url);
      return true;
    });
  }, [episodesQuery.data]);
  const itemsCount = type === "shows" ? shows.length : tracks.length;
  const pageSize = 20;
  const hasMorePages = type === "shows" ? showsQuery.hasNextPage : episodesQuery.hasNextPage;
  const pageCount = Math.max(1, Math.ceil(itemsCount / pageSize));
  const effectivePage = Math.min(page, pageCount + (hasMorePages ? 1 : 0));
  const visibleShows = type === "shows" ? shows.slice((effectivePage - 1) * pageSize, effectivePage * pageSize) : [];
  const visibleTracks = type === "episodes" ? tracks.slice((effectivePage - 1) * pageSize, effectivePage * pageSize) : [];
  const isLoading = type === "shows" ? showsQuery.isLoading : episodesQuery.isLoading;
  const isError = type === "shows" ? showsQuery.isError : episodesQuery.isError;
  const hasNextPage = type === "shows" ? showsQuery.hasNextPage : episodesQuery.hasNextPage;
  const isFetchingNextPage = type === "shows" ? showsQuery.isFetchingNextPage : episodesQuery.isFetchingNextPage;
  const title = type === "shows" ? "Top Nostr shows" : "All Nostr episodes";

  useSeoMeta({ title: `${title} — Podcasts — Ostrify` });
  useEffect(() => {
    if (!hasNextPage && searchParams.get("page") && page > pageCount) setSearchParams({ page: String(pageCount) }, { replace: true });
  }, [hasNextPage, page, pageCount, searchParams, setSearchParams]);

  const nextPage = async () => {
    if (itemsCount > effectivePage * pageSize) {
      setSearchParams({ page: String(effectivePage + 1) });
      return;
    }
    if (!hasNextPage || isFetchingNextPage) return;
    let count = itemsCount;
    let more: boolean = hasNextPage;
    while (count <= effectivePage * pageSize && more) {
      if (type === "shows") {
        const result = await showsQuery.fetchNextPage();
        const uniqueShows = [...new Map((result.data?.pages.flatMap(batch => batch.shows) ?? []).map(show => [show.id, show])).values()];
        count = uniqueShows.length;
        more = Boolean(result.hasNextPage);
      } else {
        const result = await episodesQuery.fetchNextPage();
        const uniqueTracks = [...new Map((result.data?.pages.flatMap(batch => batch.tracks) ?? []).map(track => [track.url, track])).values()];
        count = uniqueTracks.length;
        more = Boolean(result.hasNextPage);
      }
    }
    if (count > effectivePage * pageSize) setSearchParams({ page: String(effectivePage + 1) });
  };

  const loadEpisodePage = async (requiredCount: number) => {
    if (episodesQuery.isFetchingNextPage) return false;
    let count = tracks.length;
    let more: boolean = episodesQuery.hasNextPage;
    while (count < requiredCount && more) {
      const result = await episodesQuery.fetchNextPage();
      count = [...new Set((result.data?.pages.flatMap(batch => batch.tracks) ?? []).map(track => track.url))].length;
      more = Boolean(result.hasNextPage);
    }
    return count >= requiredCount;
  };

  const paginationNav = (position: "top" | "bottom") => <nav aria-label={`${type} pagination ${position}`} className={`flex flex-wrap items-center justify-between gap-3 ${position === "top" ? "border-y py-3" : "border-t py-3"}`}><Button type="button" variant="outline" onClick={() => setSearchParams(effectivePage === 2 ? {} : { page: String(effectivePage - 1) })} disabled={effectivePage <= 1}><ChevronLeft className="size-4" /> Previous</Button><p aria-live="polite" className="text-sm text-muted-foreground">Page {effectivePage}{!hasNextPage && <span> of {pageCount}</span>} <span className="hidden sm:inline">· {itemsCount} {type} {hasNextPage ? 'loaded' : 'total'}</span></p><Button type="button" variant="outline" onClick={() => void nextPage()} disabled={!hasNextPage && effectivePage >= pageCount || isFetchingNextPage}>{isFetchingNextPage ? "Loading…" : "Next →"}</Button></nav>;

  return <div className="p-4 sm:p-6 space-y-6">
    <BackLink to="/podcasts" className="text-sm text-muted-foreground hover:text-foreground hover:underline">← Nostr podcasts</BackLink>
    <header><p className="text-sm font-semibold text-primary uppercase tracking-wider">Nostr podcasts</p><h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-muted-foreground">{type === "shows" ? "Shows discovered from NIP-F4 episodes and podcast metadata on your read relays, ordered by episode references." : "Recent playable podcast episodes discovered from your read relays."}</p></header>
    {isLoading && (type === "shows" ? <ShowSkeletonGrid /> : <TrackSkeletonGrid />)}
    {isError && <p role="alert" className="text-sm text-destructive">Couldn’t load Nostr {type}. <button type="button" className="underline" onClick={() => void (type === "shows" ? showsQuery.refetch() : episodesQuery.refetch())}>Try again</button></p>}
    {!isLoading && !isError && !itemsCount && !hasNextPage && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No Nostr {type} were found on your read relays.</div>}
    {itemsCount === 0 && hasNextPage && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No Nostr {type} in the batches loaded so far. Continue to search older relay results.</div>}
    {(itemsCount > 0 || hasNextPage) && <>{type === "episodes" && tracks.length > 0 && <TrackList tracks={tracks} page={page} onPageChange={nextPageNumber => setSearchParams(nextPageNumber === 1 ? {} : { page: String(nextPageNumber) })} hasMore={hasNextPage} isLoadingMore={isFetchingNextPage} onLoadMore={loadEpisodePage} />}{type === "shows" && visibleShows.length > 0 && <>{paginationNav("top")}<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{visibleShows.map(show => <ShowCard key={show.id} show={show} tracks={[]} favorites={favorites.data} onToggleFavorite={(favorite, saved) => favoriteActions.toggleFavorite.mutate({ favorite, saved })} userLoggedIn={favorites.isEnabled} />)}</div>{paginationNav("bottom")}</>}
    </>}
  </div>;
}

export function FountainBrowsePage({ type }: { type: "shows" | "episodes" }) {
  return type === "shows" ? <FountainShowsPage /> : <FountainEpisodesPage />;
}

function FountainShowsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const showsQuery = useFountainPodcastShows();
  const favorites = usePodcastFavorites();
  const favoriteActions = usePodcastFavoriteActions();
  const shows = showsQuery.data.filter(show => show.feedUrl && show.feedGuid);
  const pageCount = Math.max(1, Math.ceil(shows.length / 20));
  const visibleShows = shows.slice((page - 1) * 20, page * 20);

  useSeoMeta({ title: "Fountain RSS shows — Podcasts — Ostrify" });
  useEffect(() => {
    if (!showsQuery.hasNextPage && searchParams.get("page") && page > pageCount) setSearchParams({ page: String(pageCount) }, { replace: true });
  }, [page, pageCount, searchParams, setSearchParams, showsQuery.hasNextPage]);

  const nextPage = async () => {
    if (shows.length > page * 20) {
      setSearchParams({ page: String(page + 1) });
      return;
    }
    if (!showsQuery.hasNextPage || showsQuery.isFetchingNextPage) return;
    let count = shows.length;
    let hasMore: boolean = showsQuery.hasNextPage;
    while (count <= page * 20 && hasMore) {
      const result = await showsQuery.fetchNextPage();
      const allShows = result.data?.pages.flatMap(batch => batch.shows) ?? [];
      count = [...new Map(allShows.filter(show => show.feedUrl && show.feedGuid).map(show => [show.id, show])).values()].length;
      hasMore = Boolean(result.hasNextPage);
    }
    if (count > page * 20) setSearchParams({ page: String(page + 1) });
  };

  return <main className="space-y-6 p-4 sm:p-6">
    <BackLink to="/podcasts?source=fountain" className="text-sm text-muted-foreground hover:text-foreground hover:underline">← Fountain.fm podcasts</BackLink>
    <header><p className="text-sm font-semibold uppercase tracking-wider text-primary">Fountain.fm</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Fountain RSS shows</h1><p className="mt-2 text-muted-foreground">Shows found through Nostr references with a public Fountain RSS feed.</p></header>
    {showsQuery.isLoading && <ShowSkeletonGrid />}
    {showsQuery.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load Fountain shows. <button type="button" className="underline" onClick={() => void showsQuery.refetch()}>Try again</button></p>}
    {!showsQuery.isLoading && !showsQuery.isError && !shows.length && !showsQuery.hasNextPage && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No Fountain RSS shows were found on your read relays.</div>}
    {shows.length > 0 && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visibleShows.map(show => <ShowCard key={show.id} show={show} tracks={[]} favorites={favorites.data} onToggleFavorite={(favorite, saved) => favoriteActions.toggleFavorite.mutate({ favorite, saved })} userLoggedIn={favorites.isEnabled} />)}</div><nav aria-label="Fountain RSS show pagination" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={() => setSearchParams(page === 2 ? {} : { page: String(page - 1) })} disabled={page <= 1 || showsQuery.isFetchingNextPage}>← Previous</Button><p aria-live="polite" className="text-sm text-muted-foreground">Page {page}{!showsQuery.hasNextPage && <span> of {pageCount}</span>} <span className="hidden sm:inline">· {shows.length} shows loaded</span></p><Button type="button" variant="outline" onClick={() => void nextPage()} disabled={!showsQuery.hasNextPage && page >= pageCount || showsQuery.isFetchingNextPage}>{showsQuery.isFetchingNextPage ? "Searching…" : "Next →"}</Button></nav></>}
  </main>;
}

function FountainEpisodesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
  const [episodeLimit, setEpisodeLimit] = useState(() => Math.min(Math.max(20, page * 20), 120));
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const episodes = usePodcastEpisodes(120, episodeLimit);
  const tracks = (episodes.data ?? []).filter(track => track.source === "fountain");
  const pageCount = Math.max(1, Math.ceil(tracks.length / 20));
  const visibleTracks = tracks.slice((page - 1) * 20, page * 20);

  useSeoMeta({ title: "Latest Fountain episodes — Podcasts — Ostrify" });
  useEffect(() => {
    if (pendingPage === null || episodes.isFetching) return;
    if (tracks.length < episodeLimit || episodeLimit >= 120) setExhausted(true);
    setSearchParams({ page: String(Math.min(pendingPage, Math.max(1, Math.ceil(tracks.length / 20)))) });
    setPendingPage(null);
  }, [episodeLimit, episodes.isFetching, pendingPage, setSearchParams, tracks.length]);
  useEffect(() => {
    if (!episodes.isFetching && tracks.length < episodeLimit) setExhausted(true);
  }, [episodeLimit, episodes.isFetching, tracks.length]);
  useEffect(() => {
    if (page > pageCount && exhausted) setSearchParams({ page: String(pageCount) }, { replace: true });
  }, [exhausted, page, pageCount, setSearchParams]);

  const nextPage = () => {
    if (tracks.length > page * 20) {
      setSearchParams({ page: String(page + 1) });
      return;
    }
    if (episodes.isFetching || episodeLimit >= 120 || exhausted) return;
    setPendingPage(page + 1);
    setEpisodeLimit(limit => Math.min(limit + 20, 120));
  };
  const pagination = (position: "top" | "bottom") => <nav aria-label={`Latest Fountain episodes pagination ${position}`} className={`flex flex-wrap items-center justify-between gap-3 ${position === "top" ? "border-y py-3" : "border-t py-3"}`}><Button type="button" variant="outline" onClick={() => setSearchParams(page === 2 ? {} : { page: String(page - 1) })} disabled={page <= 1 || episodes.isFetching}><ChevronLeft className="size-4" /> Previous</Button><p aria-live="polite" className="text-sm text-muted-foreground">Page {page}{exhausted && <span> of {pageCount}</span>} <span className="hidden sm:inline">· {tracks.length} episodes loaded</span></p><Button type="button" variant="outline" onClick={nextPage} disabled={episodes.isFetching || exhausted && page * 20 >= tracks.length}>{episodes.isFetching && pendingPage !== null ? "Loading…" : "Next →"}</Button></nav>;

  return <main className="space-y-6 p-4 sm:p-6">
    <BackLink to="/podcasts?source=fountain" className="text-sm text-muted-foreground hover:text-foreground hover:underline">← Fountain.fm podcasts</BackLink>
    <header><p className="text-sm font-semibold uppercase tracking-wider text-primary">Fountain.fm</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Latest Fountain episodes</h1><p className="mt-2 text-muted-foreground">Fountain episodes currently referenced on Nostr.</p></header>
    {episodes.isLoading && <TrackSkeletonGrid />}
    {episodes.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load podcast episodes. <button type="button" className="underline" onClick={() => void episodes.refetch()}>Try again</button></p>}
    {!episodes.isLoading && !episodes.isError && !tracks.length && exhausted && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No Fountain-linked episodes were found in the relays currently loaded.</div>}
    {tracks.length > 0 && <>{pagination("top")}<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{visibleTracks.map(track => <TrackCard key={track.id} track={track} showPlaylistAction showLikeAction />)}</div>{pagination("bottom")}</>}
  </main>;
}

const PodcastsPage = () => {
  useSeoMeta({ title: "Podcasts — Ostrify" });
  const episodes = usePodcastEpisodes(120, 20);
  const nostrShows = useNostrPodcastShows();
  const fountainShows = useFountainPodcastShows();
  const fountainRssShows = (fountainShows.data ?? []).filter(show => show.feedUrl && show.feedGuid);
  const fountainTracks = (episodes.data ?? []).filter(track => track.source === "fountain");
  const player = usePlayer();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSource = searchParams.get("source");
  const [source, setSource] = useState<"nostr" | "fountain" | "directory">(initialSource === "directory" ? "directory" : initialSource === "fountain" ? "fountain" : "nostr");
  const nostrEpisodes = useNostrPodcastEpisodeFeed(source === "nostr");
  const [viewAllSource, setViewAllSource] = useState<"nostr" | "fountain" | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedShow, setSelectedShow] = useState<PodcastShow | null>(null);
  const podcastSearch = usePodcastIndexSearch(debouncedSearch);
  const selectedIndexShowId = searchParams.get("show");
  const cachedPodcastSearches = useQueryClient();
  const selectedIndexShow = useMemo(() => {
    if (!selectedIndexShowId) return null;
    const cachedShow = cachedPodcastSearches.getQueryCache().getAll()
      .filter(entry => entry.queryKey[0] === "podcast-index" && entry.queryKey[1] === "search")
      .flatMap(entry => Array.isArray(entry.state.data) ? entry.state.data.filter((show): show is PodcastShow => !!show && typeof show === "object" && "id" in show) : [])
      .find(show => show.id === selectedIndexShowId);
    if (cachedShow) return cachedShow;
    const feedId = /^podcast-index:(\d+)$/.exec(selectedIndexShowId)?.[1];
    return feedId ? { id: selectedIndexShowId, feedId: Number(feedId), title: 'Podcast show', source: 'podcast-index' as const } : null;
  }, [cachedPodcastSearches, selectedIndexShowId]);
  const podcastFavorites = usePodcastFavorites();
  const podcastFavoriteActions = usePodcastFavoriteActions();
  const favoriteShowSelection = searchParams.get("show") ? podcastFavorites.data.find(item => item.id === searchParams.get("show") && !item.episode) : undefined;
  const activeShow = selectedShow ?? (favoriteShowSelection ? favoriteSelectionToShow(favoriteShowSelection) : null) ?? selectedIndexShow;
  const directoryEpisodes = usePodcastIndexEpisodes(activeShow?.feedId, activeShow?.feedUrl, activeShow?.title);
  const nostrTracks = (episodes.data ?? []).filter((track) => track.source !== "fountain" && track.kind === "podcast");
  const relayedNostrTracks = (nostrEpisodes.data?.pages.flatMap(batch => batch.tracks) ?? []).filter(track => track.kind === "podcast");
  const [nostrPage, setNostrPage] = useState(1);
  const nostrPageRef = useRef(1);
  const updateNostrPage = (nextPage: number) => { nostrPageRef.current = nextPage; setNostrPage(nextPage); };
  const loadNostrEpisodePage = async (requiredCount: number) => {
    if (nostrEpisodes.isFetchingNextPage) return false;
    let loaded = relayedNostrTracks.length;
    let hasMore = nostrEpisodes.hasNextPage;
    while (loaded < requiredCount && hasMore) {
      const result = await nostrEpisodes.fetchNextPage();
      loaded = (result.data?.pages.flatMap(batch => batch.tracks) ?? []).filter(track => track.kind === "podcast").length;
      hasMore = Boolean(result.hasNextPage);
    }
    if (loaded >= requiredCount) updateNostrPage(nostrPageRef.current + 1);
    return false;
  };
  const nostrTrackPageCount = Math.max(1, Math.ceil(relayedNostrTracks.length / 20));
  const nostrTrackPage = Math.min(nostrPage, nostrTrackPageCount + (nostrEpisodes.hasNextPage ? 1 : 0));
  const selectedTracks = source === "nostr" ? nostrTracks : fountainTracks;
  const nostrShowList = nostrShows.data ?? [];
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { if (nostrPage > nostrTrackPageCount + (nostrEpisodes.hasNextPage ? 1 : 0)) updateNostrPage(nostrTrackPageCount); }, [nostrPage, nostrTrackPageCount, nostrEpisodes.hasNextPage]);
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

  return (
    <div className="p-4 sm:p-6 space-y-8">
      <header className="rounded-xl bg-gradient-to-br from-fuchsia-900 via-purple-950 to-card p-6 sm:p-8">
        <p className="flex items-center gap-2 text-sm uppercase tracking-wider font-semibold text-fuchsia-200"><Mic className="size-4" /> Podcasts on Ostrify</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Podcasts</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">Browse Nostr podcasts or search the Podcast Index directory for shows from across the open podcast ecosystem.</p>
      </header>

      <Tabs value={source} onValueChange={(value) => { if (value === "nostr" || value === "fountain" || value === "directory") { setSource(value); setSearchParams(value === "nostr" ? {} : { source: value }); setViewAllSource(null); setSelectedShow(null); } }}>
        <TabsList className="grid h-auto w-full max-w-2xl grid-cols-3 gap-1">
          <TabsTrigger value="nostr"><Radio className="size-4" /> Nostr podcasts</TabsTrigger>
          <TabsTrigger value="fountain"><Globe2 className="size-4" /> Fountain.fm</TabsTrigger>
          <TabsTrigger value="directory"><Search className="size-4" /> Discover podcasts</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-6 space-y-8">
          {activeShow ? <PodcastIndexShow show={activeShow} tracks={directoryEpisodes.data ?? []} isLoading={directoryEpisodes.isLoading} isError={directoryEpisodes.isError} onRetry={() => void directoryEpisodes.refetch()} onBack={() => { setSelectedShow(null); setSearchParams({ source: "directory" }); }} onPlay={() => { if (directoryEpisodes.data?.length) player.playQueue(directoryEpisodes.data); }} onPlayTrack={track => player.playQueue([track])} favorites={podcastFavorites.data} onToggleFavorite={(favorite, saved) => podcastFavoriteActions.toggleFavorite.mutate({ favorite, saved })} saving={podcastFavoriteActions.toggleFavorite.isPending} userLoggedIn={podcastFavorites.isEnabled} /> : <section className="space-y-4">
            <div><h2 className="text-2xl font-bold">Search podcasts</h2><p className="text-sm text-muted-foreground">Find shows in the Podcast Index directory and browse their latest episodes.</p></div>
            <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search shows, hosts, and topics" aria-label="Search podcasts" maxLength={120} className="pl-10" /></div>
            {search.trim().length < 2 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Enter at least two characters to search the podcast directory.</div> : podcastSearch.isLoading || debouncedSearch !== search.trim() ? <ShowSkeletonGrid /> : podcastSearch.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t search Podcast Index: {podcastSearch.error.message}. <button type="button" className="underline" onClick={() => void podcastSearch.refetch()}>Try again</button></p> : podcastSearch.data?.length ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{podcastSearch.data.map(show => <article key={show.id} className="rounded-xl bg-secondary/40 p-3"><button type="button" onClick={() => setSelectedShow(show)} className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-primary"><div className="mb-3 aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-fuchsia-800 to-purple-950">{show.image ? <img src={show.image} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Mic className="size-12 text-white/70" /></div>}</div><p className="truncate font-semibold">{show.title}</p><p className="mt-1 truncate text-sm text-muted-foreground">{show.publisher || "Podcast show"}</p></button></article>)}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No shows found. Try another search.</div>}
          </section>}
        </TabsContent>

        <TabsContent value={source === "directory" ? "catalog-hidden" : source} className="mt-6 space-y-8">
          {viewAllSource ? (
            <ShowCatalog
              key={viewAllSource}
              favorites={podcastFavorites.data}
              onToggleFavorite={(favorite, saved) => podcastFavoriteActions.toggleFavorite.mutate({ favorite, saved })}
              userLoggedIn={podcastFavorites.isEnabled}
              source={viewAllSource}
              shows={viewAllSource === "nostr" ? nostrShows.data ?? [] : fountainRssShows}
              isLoading={viewAllSource === "nostr" ? nostrShows.isLoading : fountainShows.isLoading}
              error={viewAllSource === "nostr" ? nostrShows.isError : fountainShows.isError}
              onBack={() => setViewAllSource(null)}
              onLoadMore={() => void (viewAllSource === "nostr" ? nostrShows.fetchNextPage() : fountainShows.fetchNextPage())}
              hasMore={viewAllSource === "nostr" ? nostrShows.hasNextPage : fountainShows.hasNextPage}
              isLoadingMore={viewAllSource === "nostr" ? nostrShows.isFetchingNextPage : fountainShows.isFetchingNextPage}
              loadMoreError={viewAllSource === "nostr" ? nostrShows.isFetchNextPageError : fountainShows.isFetchNextPageError}
              loadMoreLoading={viewAllSource === "fountain" && fountainShows.isFetching}
            />
          ) : (
            <>
              {source === "fountain" && <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Fountain RSS shows</h2><p className="text-sm text-muted-foreground">Shows found through Nostr references with a public Fountain RSS feed.</p></div><Button asChild variant="outline"><Link to="/podcasts/fountain/shows">See all</Link></Button></div>
                {fountainShows.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load Fountain shows. <button className="underline" onClick={() => void fountainShows.refetch()}>Try again</button></p>}
                {fountainShows.isLoading && !fountainShows.data?.length ? <ShowSkeletonGrid /> : fountainRssShows.length ? <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{fountainRssShows.slice(0, 8).map(show => <ShowCard key={show.id} show={show} tracks={[]} favorites={podcastFavorites.data} onToggleFavorite={(favorite, saved) => podcastFavoriteActions.toggleFavorite.mutate({ favorite, saved })} userLoggedIn={podcastFavorites.isEnabled} />)}</div>{fountainShows.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load more Fountain shows. <button className="underline" onClick={() => void fountainShows.fetchNextPage()}>Try again</button></p>}</> : fountainShows.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load Fountain shows. <button className="underline" onClick={() => void fountainShows.refetch()}>Try again</button></p> : fountainShows.hasNextPage ? <div className="rounded-xl border border-dashed p-8 text-center"><p className="text-muted-foreground">Searching Nostr for Fountain shows…</p><Button className="mt-4" variant="outline" disabled={fountainShows.isFetchingNextPage} onClick={() => void fountainShows.fetchNextPage()}>{fountainShows.isFetchingNextPage ? "Searching…" : "Search for shows"}</Button></div> : <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No Fountain shows with a public RSS feed were found in the Nostr references currently loaded.</div>}
              </section>}
              {source === "nostr" && <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h2 className="text-2xl font-bold">Top shows</h2><p className="text-sm text-muted-foreground">Shows with the most playable NIP-F4 episodes found on your relays.</p></div>
                  <Button asChild variant="outline"><Link to="/podcasts/nostr/shows">See all</Link></Button>
                </div>
                {nostrShows.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load this show catalog. <button className="underline" onClick={() => void nostrShows.refetch()}>Try again</button></p>}
                {nostrShows.isLoading ? <ShowSkeletonGrid /> : nostrShowList.length ? <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{nostrShowList.slice().sort((a, b) => (b.episodeCount ?? perShowEpisodes.get(b.id)?.length ?? 0) - (a.episodeCount ?? perShowEpisodes.get(a.id)?.length ?? 0)).slice(0, 8).map((show) => <ShowCard key={show.id} show={show} tracks={perShowEpisodes.get(show.id) ?? []} onPlay={(tracks) => player.playQueue(tracks)} favorites={podcastFavorites.data} onToggleFavorite={(favorite, saved) => podcastFavoriteActions.toggleFavorite.mutate({ favorite, saved })} userLoggedIn={podcastFavorites.isEnabled} />)}</div>{nostrShows.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load more shows. <button type="button" className="underline" onClick={() => void nostrShows.fetchNextPage()}>Try again</button></p>}</> : <EmptyShows source="nostr" />}
              </section>}

              <section className="space-y-4">
                {source === "nostr" && <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">All Nostr episodes</h2><p className="text-sm text-muted-foreground">Recent episodes loaded from your relays.</p></div><div className="flex gap-2"><Button asChild variant="outline"><Link to="/podcasts/nostr/episodes">See all</Link></Button><Button variant="outline" onClick={() => void episodes.refetch()}>Refresh</Button></div></div>}
                {source === "fountain" && <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Latest Fountain episodes</h2><p className="text-sm text-muted-foreground">Fountain episodes currently referenced on Nostr.</p></div><Button asChild variant="outline"><Link to="/podcasts/fountain/episodes">See all</Link></Button></div>}
                {episodes.isLoading ? <TrackSkeletonGrid /> : episodes.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load podcast episodes. <button className="underline" onClick={() => void episodes.refetch()}>Try again</button></p> : selectedTracks.length ? <>{source === "nostr" && <TrackList tracks={relayedNostrTracks} page={nostrTrackPage} onPageChange={nextPage => updateNostrPage(Math.min(nostrTrackPageCount + (nostrEpisodes.hasNextPage ? 1 : 0), nextPage))} hasMore={nostrEpisodes.hasNextPage} isLoadingMore={nostrEpisodes.isFetchingNextPage} onLoadMore={loadNostrEpisodePage} />}<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">{(source === "fountain" ? fountainTracks.slice(0, 10) : selectedTracks.slice(0, 10)).map((episode) => <TrackCard key={episode.id} track={episode} showPlaylistAction showLikeAction />)}</div></> : <EmptyEpisodes source={source === "nostr" ? "nostr" : "fountain"} />}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

function ShowCard({ show, tracks, onPlay, favorites, onToggleFavorite, userLoggedIn }: { show: PodcastShow; tracks: Track[]; onPlay?: (tracks: Track[]) => void; favorites: PodcastFavorite[]; onToggleFavorite: (favorite: PodcastFavorite, saved: boolean) => void; userLoggedIn: boolean }) {
  const author = useAuthor(show.pubkey);
  const cover = sanitizeUrl(show.image) ?? sanitizeUrl(author.data?.metadata?.picture);
  const name = show.title || show.publisher || author.data?.metadata?.display_name || author.data?.metadata?.name || "Podcast show";
  const playTracks = tracks;
  const favorite = podcastFavoriteFromShow(show);
  return (
    <article className="group rounded-xl bg-secondary/40 p-3 hover:bg-secondary transition-colors">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-fuchsia-800 to-purple-950">
        {cover ? <img src={cover} alt="" loading="lazy" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Mic className="size-12 text-white/70" /></div>}
      </div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{show.source === "fountain" && show.feedGuid ? <Link to={`/podcasts/fountain/${encodeURIComponent(show.feedGuid)}`} className="block truncate font-semibold hover:text-primary hover:underline focus-visible:underline" title={`Open ${name}`}>{name}</Link> : <p className="truncate font-semibold" title={name}>{name}</p>}<p className="mt-1 truncate text-sm text-muted-foreground">{show.source === "fountain" ? show.publisher ?? "Fountain show" : show.source === "podcast-index" ? show.publisher ?? "Podcast Index" : "Nostr show"} · {show.episodeCount !== undefined ? `${show.episodeCount} Nostr references` : show.source === "fountain" ? "RSS available" : `${tracks.length} episodes`}</p></div>
        {playTracks.length > 0 && onPlay && <button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label={`Play ${name}`} onClick={() => onPlay(playTracks)}><Play className="size-4 fill-current" /></button>}
      </div>
      {show.pubkey && <Link to={`/${nip19.npubEncode(show.pubkey)}`} className="mt-2 inline-block text-xs text-primary hover:underline">Open Nostr show</Link>}
      {show.source !== "fountain" && <PodcastFavoriteButton favorite={favorite} saved={false} onToggle={saved => onToggleFavorite(favorite, saved)} userLoggedIn={userLoggedIn} />}
    </article>
  );
}

function favoriteSelectionToShow(favorite: PodcastFavorite): PodcastShow {
  return {
    id: favorite.id,
    title: favorite.title,
    source: favorite.source === "nostr" ? "nostr" : "podcast-index",
    feedId: favorite.feedId,
    feedUrl: favorite.feedUrl,
    pubkey: favorite.pubkey,
    publisher: favorite.publisher,
    image: favorite.image,
  };
}

function podcastFavoriteFromShow(show: PodcastShow): PodcastFavorite {
  return { id: show.id, source: show.source === "nostr" ? "nostr" : "podcast-index", title: show.title, publisher: show.publisher, image: show.image, feedId: show.feedId, feedUrl: show.feedUrl, pubkey: show.pubkey };
}

function PodcastFavoriteButton({ favorite, saved, onToggle, pending = false, userLoggedIn, showLoginHint = false }: { favorite: PodcastFavorite; saved: boolean; onToggle: (saved: boolean) => void; pending?: boolean; userLoggedIn: boolean; showLoginHint?: boolean }) {
  const label = favorite.episode ? "episode" : "show";
  return <Button type="button" variant="ghost" size="sm" className="mt-2 gap-2" disabled={pending} aria-pressed={saved} aria-label={saved ? `Remove ${favorite.title} from saved podcasts` : `Save ${favorite.title}`} onClick={event => { event.stopPropagation(); if (userLoggedIn) onToggle(!saved); }}><Heart className="size-4" fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : userLoggedIn ? `Save ${label}` : showLoginHint ? "Log in to save" : `Save ${label}`}</Button>;
}

function PodcastIndexShow({ show, tracks, isLoading, isError, onRetry, onBack, onPlay, onPlayTrack, favorites, onToggleFavorite, saving, userLoggedIn }: { show: PodcastShow; tracks: Track[]; isLoading: boolean; isError: boolean; onRetry: () => void; onBack: () => void; onPlay: () => void; onPlayTrack: (track: Track) => void; favorites: PodcastFavorite[]; onToggleFavorite: (favorite: PodcastFavorite, saved: boolean) => void; saving: boolean; userLoggedIn: boolean }) {
  const favorite = podcastFavoriteFromShow(show);
  return <section className="space-y-5">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> Back to search</button>
    <header className="flex flex-col gap-5 rounded-xl bg-gradient-to-br from-fuchsia-900/70 via-purple-950 to-card p-6 sm:flex-row sm:items-center">
      <div className="size-32 shrink-0 overflow-hidden rounded-xl bg-secondary">{show.image ? <img src={show.image} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Mic className="size-12 text-muted-foreground" /></div>}</div>
      <div className="min-w-0"><p className="text-sm font-semibold uppercase tracking-wider text-fuchsia-200">{show.source === "nostr" ? "Nostr podcast" : "Podcast Index show"}</p><h2 className="mt-2 break-words text-3xl font-bold">{show.title}</h2>{show.publisher && <p className="mt-1 text-muted-foreground">{show.publisher}</p>}{show.description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{show.description}</p>}<PodcastFavoriteButton favorite={favorite} saved={false} onToggle={saved => onToggleFavorite(favorite, saved)} pending={saving} userLoggedIn={userLoggedIn} /></div>
    </header>
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-2xl font-bold">Episodes</h3><p className="text-sm text-muted-foreground">Latest episodes from this show’s RSS feed.</p></div>{show.source !== "nostr" && <Button type="button" onClick={onPlay} disabled={!tracks.length || isLoading}><Play className="size-4 fill-current" /> Play latest</Button>}</div>
    {isLoading ? <TrackSkeletonGrid /> : isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load episodes. <button type="button" className="underline" onClick={onRetry}>Try again</button></p> : tracks.length ? <PodcastEpisodeList tracks={tracks} show={show} favorites={favorites} onToggleFavorite={onToggleFavorite} onPlayTrack={onPlayTrack} saving={saving} userLoggedIn={userLoggedIn} /> : <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No playable episodes were found for this show.</div>}
    {show.feedUrl && <a href={show.feedUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-primary hover:underline">Open the show’s RSS feed</a>}
    {show.pubkey && <Link to={`/${nip19.npubEncode(show.pubkey)}`} className="inline-block text-sm text-primary hover:underline">Open Nostr show profile</Link>}
  </section>;
}

function ShowCatalog({ source, shows, isLoading, error, onBack, onLoadMore, hasMore, isLoadingMore, loadMoreError, loadMoreLoading, favorites, onToggleFavorite, userLoggedIn }: { source: "nostr" | "fountain"; shows: PodcastShow[]; isLoading: boolean; error: boolean; onBack: () => void; onLoadMore: () => void; hasMore: boolean; isLoadingMore: boolean; loadMoreError: boolean; loadMoreLoading: boolean; favorites: PodcastFavorite[]; onToggleFavorite: (favorite: PodcastFavorite, saved: boolean) => void; userLoggedIn: boolean }) {
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><button type="button" onClick={onBack} className="text-sm text-primary hover:underline">← Back to top shows</button><h2 className="mt-2 text-2xl font-bold">All {source === "nostr" ? "Nostr" : "Fountain.fm"} shows</h2><p className="text-sm text-muted-foreground">{shows.length} shows loaded from discovered podcast references.</p></div></div>
    <p className="text-sm text-muted-foreground">{source === "fountain" ? "Fountain shows are resolved from public podcast feed GUID references found on Nostr." : "Nostr shows are collected from playable NIP-F4 episodes and show metadata on your enabled read relays."}</p>
    {error && <p role="alert" className="text-sm text-destructive">Couldn’t load the show catalog.</p>}
    {isLoading ? <ShowSkeletonGrid /> : shows.length ? <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{shows.map((show) => <ShowCard key={show.id} show={show} tracks={[]} favorites={favorites} onToggleFavorite={onToggleFavorite} userLoggedIn={userLoggedIn} />)}</div>{loadMoreError && <p role="alert" className="text-sm text-destructive">Couldn’t load more shows. Try again.</p>}{hasMore && <Button variant="outline" disabled={isLoadingMore || loadMoreLoading} onClick={onLoadMore}>{isLoadingMore || loadMoreLoading ? "Loading more shows…" : "Load more shows"}</Button>}</> : <EmptyShows source={source} />}
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

function PodcastEpisodeList({ tracks, show, favorites, onToggleFavorite, onPlayTrack, saving, userLoggedIn }: { tracks: Track[]; show: PodcastShow; favorites: PodcastFavorite[]; onToggleFavorite: (favorite: PodcastFavorite, saved: boolean) => void; onPlayTrack: (track: Track) => void; saving: boolean; userLoggedIn: boolean }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(tracks.length / 20));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * 20;
  const visibleTracks = tracks.slice(pageStart, pageStart + 20);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const pagination = (position: "top" | "bottom") => <nav aria-label={`Podcast episode pagination ${position}`} className={`flex flex-wrap items-center justify-between gap-3 ${position === "top" ? "mb-3 border-y py-3" : "mt-4 border-t pt-4"}`}><Button type="button" variant="outline" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage <= 1}><ChevronLeft className="size-4" /> Previous</Button><p aria-live="polite" className="text-sm text-muted-foreground">Page {currentPage} of {pageCount} · {tracks.length} episodes</p><Button type="button" variant="outline" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount}>Next <ChevronRight className="size-4" /></Button></nav>;
  return <div>{tracks.length > 20 && pagination("top")}<div className="grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_minmax(0,14rem)_auto] items-center gap-3 border-b border-border/50 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground"><span className="text-center">#</span><span>Episode</span><span className="hidden md:block">Show</span><span className="pr-14">Actions</span></div>{visibleTracks.map((track, index) => {
    const episodeId = track.podcastIndexEpisodeId;
    const favorite: PodcastFavorite | undefined = episodeId ? { id: `podcast-index:episode:id:${episodeId}`, source: "podcast-index", title: track.title, publisher: show.title, image: track.image ?? show.image, feedId: show.feedId, episode: true, episodeId } : undefined;
    const isSaved = false;
    return <div key={track.id} className="grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_1fr_minmax(0,14rem)_auto] items-center gap-3 rounded-md px-3 py-2 hover:bg-accent/10"><span className="text-center text-sm text-muted-foreground">{pageStart + index + 1}</span><button type="button" className="min-w-0 truncate text-left font-medium hover:text-primary" onClick={() => onPlayTrack(track)}>{track.title}</button><span className="hidden truncate text-sm text-muted-foreground md:block">{show.title}</span><div className="flex items-center gap-1">{favorite ? <PodcastFavoriteButton favorite={favorite} saved={isSaved} onToggle={saved => onToggleFavorite(favorite, saved)} pending={saving} userLoggedIn={userLoggedIn} /> : null}<LikeButton trackId={track.id} /><AddToPlaylistMenu trackId={track.id} /><QueueActionsMenu track={track} /></div></div>;
  })}{tracks.length > 20 && pagination("bottom")}</div>;
}

export default PodcastsPage;
