import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { ArrowLeft, Mic, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrackCard } from "@/components/music/TrackCard";
import { useFountainShow, useFountainShowEpisodes } from "@/hooks/usePodcasts";
import { usePlayer } from "@/hooks/usePlayer";
import { sanitizeUrl } from "@/lib/sanitize";

export default function FountainShowPage() {
  const { feedGuid: routeGuid } = useParams<{ feedGuid: string }>();
  const feedGuid = routeGuid;
  const show = useFountainShow(feedGuid);
  const episodes = useFountainShowEpisodes(feedGuid);
  const player = usePlayer();
  const tracks = useMemo(() => [...new Map((episodes.data?.pages.flatMap(page => page.tracks) ?? []).map(track => [track.id, track])).values()], [episodes.data]);
  const image = sanitizeUrl(show.data?.image);

  useSeoMeta({ title: `${show.data?.title ?? "Fountain show"} — Ostrify` });

  if (!feedGuid) return <section className="p-6"><p className="text-muted-foreground">This Fountain show link is invalid.</p><Link to="/podcasts?source=fountain" className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> Back to Fountain podcasts</Link></section>;

  return <div className="space-y-6 p-4 sm:p-6">
    <Link to="/podcasts?source=fountain" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> Back to Fountain episodes</Link>
    {show.isLoading ? <div className="flex flex-col gap-5 rounded-xl border bg-card p-6 sm:flex-row sm:items-center"><Skeleton className="size-32 shrink-0 rounded-xl" /><div className="w-full space-y-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /></div></div> : show.isError ? <div role="alert" className="rounded-xl border border-dashed p-8 text-center"><p className="text-destructive">Couldn’t load Fountain show details.</p><Button className="mt-4" variant="outline" onClick={() => void show.refetch()}>Try again</Button></div> : <header className="flex flex-col gap-5 rounded-xl bg-gradient-to-br from-fuchsia-900/70 via-purple-950 to-card p-6 sm:flex-row sm:items-center">
      <div className="size-32 shrink-0 overflow-hidden rounded-xl bg-secondary">{image ? <img src={image} alt="" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Mic className="size-12 text-muted-foreground" /></div>}</div>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold uppercase tracking-wider text-fuchsia-200">Fountain podcast show</p><h1 className="mt-2 break-words text-3xl font-bold sm:text-4xl">{show.data?.title ?? "Fountain show"}</h1>{show.data?.publisher && <p className="mt-1 text-muted-foreground">{show.data.publisher}</p>}{show.data?.description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{show.data.description}</p>}<p className="mt-3 text-xs text-muted-foreground">Episodes discovered from references on your enabled Nostr relays; this may not be the complete Fountain catalog.</p></div>
    </header>}

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Episodes</h2><p className="text-sm text-muted-foreground">Latest playable episodes Ostrify has found for this show.</p></div><Button type="button" disabled={!tracks.length} onClick={() => player.playQueue(tracks)}><Play className="size-4 fill-current" /> Play loaded episodes</Button></div>
      {episodes.isLoading ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}</div> : episodes.isError ? <div role="alert" className="rounded-xl border border-dashed p-8 text-center"><p className="text-destructive">Couldn’t load this show’s episodes.</p><Button className="mt-4" variant="outline" onClick={() => void episodes.refetch()}>Try again</Button></div> : <>{tracks.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{tracks.map(track => <TrackCard key={track.id} track={track} showPlaylistAction showLikeAction />)}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No playable episodes found in the references scanned so far.</div>}{episodes.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load more episodes. Please try again.</p>}{episodes.hasNextPage && <div className="flex justify-center"><Button type="button" variant="outline" disabled={episodes.isFetchingNextPage} onClick={() => void episodes.fetchNextPage()}>{episodes.isFetchingNextPage ? "Loading more episodes…" : "Load more episodes"}</Button></div>}</>}
    </section>
  </div>;
}
