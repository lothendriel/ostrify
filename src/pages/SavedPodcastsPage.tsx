import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Heart, Mic, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePodcastFavoriteActions, usePodcastFavorites, type PodcastFavorite } from '@/hooks/usePodcasts';
import { useTracksByIds } from '@/hooks/useTracksByIds';
import { usePlayer } from '@/hooks/usePlayer';

export default function SavedPodcastsPage() {
  useSeoMeta({ title: 'Saved Podcasts — Ostrify' });
  const favorites = usePodcastFavorites();
  const actions = usePodcastFavoriteActions();
  const player = usePlayer();
  const episodeIds = favorites.data.flatMap(item => item.episodeId ? [`podcast-index:episode:id:${item.episodeId}`] : []);
  const episodes = useTracksByIds(episodeIds);
  const shows = favorites.data.filter(item => !item.episode);
  const savedEpisodes = favorites.data.filter(item => item.episode);
  const tracksById = new Map((episodes.data?.tracks ?? []).map(track => [track.id, track]));
  const playable = savedEpisodes.flatMap(item => item.episodeId ? [tracksById.get(`podcast-index:episode:id:${item.episodeId}`)].filter((track): track is NonNullable<typeof track> => !!track) : []);
  const remove = (favorite: PodcastFavorite) => actions.toggleFavorite.mutate({ favorite, saved: false });

  return <div className="space-y-8 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-fuchsia-900 via-purple-950 to-card p-6 sm:p-8">
      <Link to="/podcasts?source=directory" className="inline-flex items-center gap-2 text-sm text-fuchsia-100 hover:underline"><ArrowLeft className="size-4" /> Discover podcasts</Link>
      <p className="mt-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-fuchsia-200"><Heart className="size-4" /> Your library</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Saved Podcasts</h1>
      <p className="mt-2 text-muted-foreground">Shows and episodes saved to your Nostr account.</p>
    </header>

    {!favorites.isEnabled && <p className="rounded-lg border border-dashed p-6 text-muted-foreground">Log in with Nostr to save podcasts and sync them across your devices.</p>}
    {favorites.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load your saved podcasts. <button className="underline" onClick={() => void favorites.refetch()}>Try again</button></p>}

    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-2xl font-bold"><Mic className="size-5 text-primary" /> Shows</h2>
      {favorites.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div> : shows.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shows.map(show => <article key={show.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3"><div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary">{show.image ? <img src={show.image} alt="" className="size-full object-cover" /> : <Mic className="size-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1">{show.feedId ? <Link to={`/podcasts?source=directory&show=${encodeURIComponent(show.id)}`} className="block truncate font-semibold hover:underline">{show.title}</Link> : <p className="truncate font-semibold">{show.title}</p>}<p className="truncate text-sm text-muted-foreground">{show.publisher ?? 'Podcast'}</p></div><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${show.title} from saved podcasts`} disabled={actions.toggleFavorite.isPending} onClick={() => remove(show)}><Trash2 className="size-4" /></Button></article>)}</div> : <p className="rounded-lg border border-dashed p-6 text-muted-foreground">No shows saved yet. Find a show in Discover Podcasts and choose Save show.</p>}
    </section>

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-2xl font-bold"><Heart className="size-5 text-primary" /> Episodes</h2><p className="text-sm text-muted-foreground">Saved episodes remain in your library even if they disappear from search.</p></div><Button type="button" variant="outline" disabled={!playable.length} onClick={() => player.playQueue(playable)}><Play className="size-4" /> Play all</Button></div>
      {episodes.isLoading ? <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)}</div> : savedEpisodes.length ? <div className="space-y-2">{savedEpisodes.map(episode => {
        const track = episode.episodeId ? tracksById.get(`podcast-index:episode:id:${episode.episodeId}`) : undefined;
        return <article key={episode.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3"><div className="size-12 shrink-0 overflow-hidden rounded-md bg-secondary">{episode.image && <img src={episode.image} alt="" className="size-full object-cover" />}</div><button type="button" className="min-w-0 flex-1 text-left" disabled={!track} onClick={() => { if (track) player.playQueue([track]); }}><span className="block truncate font-semibold hover:text-primary">{track?.title ?? episode.title}</span><span className="block truncate text-sm text-muted-foreground">{episode.publisher ?? track?.artist ?? 'Podcast episode'}</span></button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${episode.title} from saved episodes`} disabled={actions.toggleFavorite.isPending} onClick={() => remove(episode)}><Trash2 className="size-4" /></Button></article>;
      })}</div> : <p className="rounded-lg border border-dashed p-6 text-muted-foreground">No episodes saved yet. Save an episode from a show’s page.</p>}
      {!!episodes.data?.unavailable && <p className="text-sm text-muted-foreground">{episodes.data.unavailable} saved episode(s) couldn’t be loaded from Podcast Index.</p>}
    </section>
  </div>;
}
