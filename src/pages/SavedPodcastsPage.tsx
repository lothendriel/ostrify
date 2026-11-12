import { Link } from 'react-router-dom';
import { BackLink } from '@/components/music/BackLink';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Heart, Mic, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFountainShow, usePodcastFavoriteActions, usePodcastFavorites, usePodcastIndexFeed, type PodcastFavorite } from '@/hooks/usePodcasts';
import { useTracksByIds } from '@/hooks/useTracksByIds';
import { usePlayer } from '@/hooks/usePlayer';
import { QueueActionsMenu } from '@/components/music/QueueActionsMenu';

function SavedShowCard({ show, onRemove, pending }: { show: PodcastFavorite; onRemove: () => void; pending: boolean }) {
  const rssDetails = usePodcastIndexFeed(show.source === 'podcast-index' && !show.feedId ? show.feedUrl : undefined);
  const fountainDetails = useFountainShow(show.source === 'fountain' ? show.feedGuid : undefined);
  const title = fountainDetails.data?.title ?? rssDetails.data?.title ?? show.title;
  const image = fountainDetails.data?.image ?? rssDetails.data?.image ?? show.image;
  const subtitle = fountainDetails.data?.publisher ?? rssDetails.data?.publisher ?? show.publisher;
  const to = show.source === 'nostr' && show.pubkey ? `/${nip19.npubEncode(show.pubkey)}` : show.source === 'fountain' && show.feedGuid ? `/podcasts/fountain/${encodeURIComponent(show.feedGuid)}` : `/podcasts?source=directory&show=${encodeURIComponent(show.id)}`;
  return <article className="group overflow-hidden rounded-xl border border-border/60 bg-secondary/30 transition-colors hover:bg-secondary/60"><Link to={to} className="block focus-visible:outline-2 focus-visible:outline-primary"><div className="aspect-square overflow-hidden bg-gradient-to-br from-fuchsia-800 to-purple-950">{image ? <img src={image} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.02]" /> : <div className="flex size-full items-center justify-center"><Mic className="size-16 text-white/70" /></div>}</div><div className="p-4"><h3 className="truncate font-semibold group-hover:underline">{title}</h3><p className="mt-1 truncate text-sm text-muted-foreground">{subtitle ?? 'Podcast'}</p></div></Link><div className="px-2 pb-2"><Button type="button" variant="ghost" size="sm" aria-label={`Remove ${show.title} from saved podcasts`} disabled={pending} onClick={onRemove}><Trash2 className="size-4" /> Remove</Button></div></article>;
}

export default function SavedPodcastsPage() {
  useSeoMeta({ title: 'Saved Podcasts — Ostrify' });
  const favorites = usePodcastFavorites();
  const actions = usePodcastFavoriteActions();
  const player = usePlayer();
  const episodeIds = favorites.data.flatMap(item => item.episode ? item.episodeId ? [`podcast-index:episode:id:${item.episodeId}`] : [] : []);
  const episodes = useTracksByIds(episodeIds);
  const shows = favorites.data.filter(item => !item.episode);
  const savedEpisodes = favorites.data.filter(item => item.episode);
  const rssShow = usePodcastIndexFeed(shows[0]?.source === 'podcast-index' && !shows[0].feedId ? shows[0].feedUrl : undefined);
  const tracksById = new Map((episodes.data?.tracks ?? []).map(track => [track.id, track]));
  const playable = savedEpisodes.flatMap(item => {
    if (!item.episodeId) return [];
    const track = tracksById.get(`podcast-index:episode:id:${item.episodeId}`);
    return track ? [{ ...track, artist: track.artist ?? item.publisher }] : [];
  });
  const remove = (favorite: PodcastFavorite) => actions.toggleFavorite.mutate({ favorite, saved: false });

  return <div className="space-y-8 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-fuchsia-900 via-purple-950 to-card p-6 sm:p-8">
      <BackLink to="/podcasts?source=directory" className="inline-flex items-center gap-2 text-sm text-fuchsia-100 hover:underline"><ArrowLeft className="size-4" /> Discover podcasts</BackLink>
      <p className="mt-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-fuchsia-200"><Heart className="size-4" /> Your library</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Saved Podcasts</h1>
      <p className="mt-2 text-muted-foreground">Shows and episodes saved to your Nostr account.</p>
    </header>

    {!favorites.isEnabled && <p className="rounded-lg border border-dashed p-6 text-muted-foreground">Log in with Nostr to save podcasts and sync them across your devices.</p>}
    {favorites.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load your saved podcasts. <button className="underline" onClick={() => void favorites.refetch()}>Try again</button></p>}

    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-2xl font-bold"><Mic className="size-5 text-primary" /> Shows</h2>
      {favorites.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div> : shows.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shows.map(show => <SavedShowCard key={show.id} show={show} onRemove={() => remove(show)} pending={actions.toggleFavorite.isPending} />)}</div> : <p className="rounded-lg border border-dashed p-6 text-muted-foreground">No shows saved yet. Find a show in Discover Podcasts and choose Save show.</p>}
    </section>

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-2xl font-bold"><Heart className="size-5 text-primary" /> Episodes</h2><p className="text-sm text-muted-foreground">Saved episodes remain in your library even if they disappear from search.</p></div><Button type="button" variant="outline" disabled={!playable.length} onClick={() => player.playQueue(playable)}><Play className="size-4" /> Play all</Button></div>
      {episodes.isLoading ? <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)}</div> : savedEpisodes.length ? <div className="space-y-2">{savedEpisodes.map(episode => {
        const track = episode.episodeId ? tracksById.get(`podcast-index:episode:id:${episode.episodeId}`) : undefined;
        const playableTrack = track ? { ...track, artist: track.artist ?? episode.publisher } : undefined;
        return <article key={episode.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3"><div className="size-12 shrink-0 overflow-hidden rounded-md bg-secondary">{episode.image && <img src={episode.image} alt="" className="size-full object-cover" />}</div><button type="button" className="min-w-0 flex-1 text-left" disabled={!playableTrack} onClick={() => { if (playableTrack) player.playQueue([playableTrack]); }}><span className="line-clamp-2 break-words font-semibold hover:text-primary">{track?.title ?? episode.title}</span><span className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{episode.publisher ?? track?.artist ?? 'Podcast episode'}</span></button>{playableTrack && <QueueActionsMenu track={playableTrack} />}<Button type="button" variant="ghost" size="icon" aria-label={`Remove ${episode.title} from saved episodes`} disabled={actions.toggleFavorite.isPending} onClick={() => remove(episode)}><Trash2 className="size-4" /></Button></article>;
      })}</div> : <p className="rounded-lg border border-dashed p-6 text-muted-foreground">No episodes saved yet. Save an episode from a show’s page.</p>}
      {!!episodes.data?.unavailable && <p className="text-sm text-muted-foreground">{episodes.data.unavailable} saved episode(s) couldn’t be loaded from Podcast Index.</p>}
    </section>
  </div>;
}
