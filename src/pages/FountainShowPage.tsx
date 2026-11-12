import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BackLink } from "@/components/music/BackLink";
import { useSeoMeta } from "@unhead/react";
import { ArrowLeft, Heart, Mic, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackCard } from "@/components/music/TrackCard";
import { fountainShowFavorite, useFountainRssEpisodes, useFountainShow, usePodcastFavoriteActions, usePodcastFavorites } from "@/hooks/usePodcasts";
import { usePlayer } from "@/hooks/usePlayer";
import { sanitizeUrl } from "@/lib/sanitize";

export default function FountainShowPage() {
  const { feedGuid: routeGuid } = useParams<{ feedGuid: string }>();
  const feedGuid = routeGuid;
  const show = useFountainShow(feedGuid);
  const episodes = useFountainRssEpisodes(show.data);
  const favorites = usePodcastFavorites();
  const favoriteActions = usePodcastFavoriteActions();
  const player = usePlayer();
  const [visibleEpisodeCount, setVisibleEpisodeCount] = useState(5);
  const tracks = useMemo(() => episodes.data?.slice(0, visibleEpisodeCount) ?? [], [episodes.data, visibleEpisodeCount]);
  const image = sanitizeUrl(show.data?.image);
  const favorite = show.data ? fountainShowFavorite(show.data) : undefined;
  const isSaved = favorite ? favorites.data.some(item => item.id === favorite.id) : false;
  const showLoadFailed = show.isError;
  const showIsLoading = show.isLoading;

  useSeoMeta({ title: `${show.data?.title ?? "Fountain show"} — Ostrify` });

  if (!feedGuid) return <section className="p-6"><p className="text-muted-foreground">This Fountain show link is invalid.</p><BackLink to="/podcasts?source=fountain" className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> Back to Fountain podcasts</BackLink></section>;

  return <div className="space-y-6 p-4 sm:p-6">
    <BackLink to="/podcasts?source=fountain" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> Back to Fountain episodes</BackLink>
    {show.isLoading ? <div className="flex flex-col gap-5 rounded-xl border bg-card p-6 sm:flex-row sm:items-center"><Skeleton className="size-32 shrink-0 rounded-xl" /><div className="w-full space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /></div></div> : show.isError ? <div role="alert" className="rounded-xl border border-dashed p-8 text-center"><p className="text-destructive">Couldn’t load Fountain show details.</p><Button className="mt-4" variant="outline" onClick={() => void show.refetch()}>Try again</Button></div> : <header className="flex flex-col gap-5 rounded-xl bg-gradient-to-br from-fuchsia-900/70 via-purple-950 to-card p-6 sm:flex-row sm:items-center">
      <div className="size-32 shrink-0 overflow-hidden rounded-xl bg-secondary">{image ? <img src={image} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Mic className="size-12 text-muted-foreground" /></div>}</div>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold uppercase tracking-wider text-fuchsia-200">Fountain podcast show</p><h1 className="mt-2 break-words text-3xl font-bold sm:text-4xl">{show.data?.title ?? "Fountain show"}</h1>{show.data?.publisher && <p className="mt-1 text-muted-foreground">{show.data.publisher}</p>}{show.data?.description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{show.data.description}</p>}<p className="mt-3 text-xs text-muted-foreground">Episodes from the show’s public Fountain RSS feed. The feed may not contain the complete catalog.</p>{favorite && <Button type="button" variant={isSaved ? "secondary" : "outline"} size="sm" className="mt-3" disabled={!favorites.isEnabled || favorites.isLoading || favoriteActions.toggleFavorite.isPending} aria-pressed={isSaved} onClick={() => favoriteActions.toggleFavorite.mutate({ favorite, saved: !isSaved })}><Heart className="size-4" fill={isSaved ? "currentColor" : "none"} />{!favorites.isEnabled ? "Log in to save show" : favorites.isLoading ? "Checking saved state…" : isSaved ? "Saved to library" : "Save show"}</Button>}{show.data?.feedUrl && <a href={show.data.feedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary hover:underline">Open RSS feed</a>}</div>
    </header>}

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Episodes</h2><p className="text-sm text-muted-foreground">Latest playable episodes from the show’s RSS feed.</p></div><Button type="button" disabled={!tracks.length || showLoadFailed || showIsLoading} onClick={() => player.playQueue(tracks)}><Play className="size-4 fill-current" /> Play loaded episodes</Button></div>
      {show.isError ? <div role="alert" className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Show details could not be loaded, so its RSS episodes are unavailable.</div> : show.isLoading || episodes.isLoading ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}</div> : !show.data?.feedUrl ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">A public RSS feed could not be resolved for this show.</div> : episodes.isError ? <div role="alert" className="rounded-xl border border-dashed p-8 text-center"><p className="text-destructive">Couldn’t load this show’s RSS episodes.</p><Button className="mt-4" variant="outline" onClick={() => void episodes.refetch()}>Try again</Button></div> : <>{tracks.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{tracks.map(track => <TrackCard key={track.id} track={track} showPlaylistAction showLikeAction />)}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No playable episodes were found in this show’s RSS feed.</div>}{episodes.data && visibleEpisodeCount < episodes.data.length && <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => setVisibleEpisodeCount(count => count + 5)}>Load more episodes</Button></div>}</>}
    </section>
  </div>;
}
