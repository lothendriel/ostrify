import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Disc3, Globe, LoaderCircle, LockKeyhole, Pause, Play, Trash2 } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import { useWavlakeRelease } from '@/hooks/useWavlake';
import { groupIntoAlbums, useArtistTracks } from '@/hooks/useArtistTracks';
import type { SavedAlbum } from '@/lib/savedAlbums';
import type { Track } from '@/lib/music';
import { TrackArtwork } from '@/components/music/TrackArtwork';
import { LibrarySyncStatus } from '@/components/music/CollectionHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useSavedAlbums } from '@/hooks/useSavedAlbums';
import { useToast } from '@/hooks/useToast';
import { savedAlbumPath } from '@/lib/savedAlbums';

export default function SavedAlbumsPage() {
  const library = useSavedAlbums();
  const { toast } = useToast();
  const player = usePlayer();
  const [selectedAlbum, setSelectedAlbum] = useState<SavedAlbum>();
  const [loading, setLoading] = useState(false);
  const isSavedAlbumQueue = !!player.queue.length && library.albums.some(album => player.queue.every(track => album.source === 'wavlake'
    ? track.source === 'wavlake' && track.albumId?.toLowerCase() === album.id.toLowerCase()
    : track.pubkey.toLowerCase() === album.artistPubkey?.toLowerCase() && track.album?.toLocaleLowerCase() === album.title.toLocaleLowerCase()));
  const playSavedAlbum = () => {
    if (isSavedAlbumQueue) { player.togglePlay(); return; }
    if (!library.albums.length) { toast({ title: 'No saved albums', description: 'Save an album to your library first.' }); return; }
    const album = library.albums[Math.floor(Math.random() * library.albums.length)];
    if (album) { setLoading(true); setSelectedAlbum(album); }
  };
  const updateVisibility = (albumId: string, isListed: boolean) => {
    void library.setVisibility(albumId, isListed).then(() => toast({ title: `Album ${isListed ? 'made public' : 'made private'}`, description: isListed ? 'This album can appear on your public Ostrify profile.' : 'This album is hidden from your public Ostrify profile.' })).catch(error => toast({ title: 'Could not update album visibility', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' }));
  };
  const remove = (albumId: string) => {
    const album = library.albums.find(item => item.id === albumId);
    if (!album) return;
    void library.toggleSaved(album, false).then(() => toast({ title: 'Album removed from Saved Albums' })).catch(error => toast({ title: 'Could not remove album', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' }));
  };

  return <div className="space-y-8 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-emerald-950 via-teal-950 to-card p-6 sm:p-8">

      <p className="mt-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-200"><Disc3 className="size-4" /> Your library</p>
      <h2 className="mt-2 text-4xl font-bold tracking-tight">Saved Albums</h2>
      <p className="mt-2 text-muted-foreground">Nostr and Wavlake albums saved to your account. Your collection syncs across devices.</p>
      {library.isEnabled && <p className="mt-3 text-xs text-white/70">Public/private controls hide albums from Ostrify profiles and discovery when private. Nostr bookmark data itself remains public.</p>}
    </header>

    {!library.isEnabled && <p className="rounded-lg border border-dashed p-6 text-muted-foreground">Log in with Nostr to save albums and sync your collection across devices.</p>}
    {library.isEnabled && <LibrarySyncStatus name="Saved albums" hasReadRelays={library.hasReadRelays} isFetching={library.isFetching} isError={library.isError} isPartial={library.data?.complete === false} onRetry={() => void library.refetch()} />}

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h3 className="flex items-center gap-2 text-2xl font-bold"><Disc3 className="size-5 text-primary" /> Albums</h3><span className="text-sm text-muted-foreground">{library.albums.length} saved</span></div><Button variant="outline" disabled={loading || !library.isEnabled} onClick={playSavedAlbum}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : isSavedAlbumQueue && player.isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}{isSavedAlbumQueue ? player.isPlaying ? 'Pause album' : 'Resume album' : 'Play a random album'}</Button></div>
      {library.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div> : library.albums.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{library.albums.map(album => {
        return <article key={album.id} className="ostrify-audio-card overflow-hidden rounded-xl">
          <Link to={savedAlbumPath(album)} className="group flex min-w-0 items-center gap-3 p-3 focus-visible:outline-2 focus-visible:outline-primary">
            <TrackArtwork track={{ id: album.id, title: album.title, image: album.image, kind: 'music' }} className="size-16" rounded="rounded-lg" />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold group-hover:underline">{album.title}</span><span className="mt-1 block truncate text-sm text-muted-foreground">Album · {album.artist ?? (album.source === 'nostr' ? 'Nostr' : 'Wavlake')}</span><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{album.isListed ? <Globe className="size-3" /> : <LockKeyhole className="size-3" />}{album.isListed ? 'Public on profile' : 'Private on profile'}</span></span>
          </Link>
          <div className="flex items-center justify-between gap-3 border-t border-border/50 px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={album.isListed} disabled={library.isSaving || !library.hasReadRelays} onCheckedChange={visible => updateVisibility(album.id, visible)} aria-label={`Show ${album.title} on public Ostrify profile`} />{album.isListed ? 'Public' : 'Private'}</label>
            <Button type="button" variant="ghost" size="sm" disabled={library.isSaving} onClick={() => remove(album.id)} aria-label={`Remove ${album.title} from Saved Albums`}><Trash2 className="size-4" /> Remove</Button>
          </div>
        </article>;
      })}</div> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No albums saved yet. Open a Wavlake or Nostr album and choose Save album to add it here.</p>}
      {library.saveError && <p role="alert" className="text-sm text-destructive">{library.saveError.message}</p>}
      {library.isSaving && <p role="status" className="text-sm text-muted-foreground">Syncing Saved Albums to Nostr…</p>}
    </section>
    {selectedAlbum && <SavedAlbumQueueLoader album={selectedAlbum} onLoaded={tracks => { player.playQueue(tracks); setLoading(false); setSelectedAlbum(undefined); }} onError={message => { setLoading(false); setSelectedAlbum(undefined); toast({ title: 'Could not load saved album', description: message }); }} />}
  </div>;
}

function SavedAlbumQueueLoader({ album, onLoaded, onError }: { album: SavedAlbum; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  if (album.source === 'wavlake') return <WavlakeAlbumQueueLoader album={album} onLoaded={onLoaded} onError={onError} />;
  if (!album.artistPubkey) return <AlbumTracksLoader tracks={[]} loading={false} onLoaded={onLoaded} onError={onError} />;
  return <NostrAlbumQueueLoader album={album} onLoaded={onLoaded} onError={onError} />;
}

function WavlakeAlbumQueueLoader({ album, onLoaded, onError }: { album: SavedAlbum; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const query = useWavlakeRelease('album', album.id);
  return <AlbumTracksLoader tracks={query.data?.tracks ?? []} loading={query.isLoading} error={query.isError ? 'Wavlake could not load this album right now.' : undefined} onLoaded={onLoaded} onError={onError} />;
}

function NostrAlbumQueueLoader({ album, onLoaded, onError }: { album: SavedAlbum; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const query = useArtistTracks(album.artistPubkey);
  const tracks = useMemo(() => groupIntoAlbums(query.data ?? []).albums.find(item => item.title?.toLocaleLowerCase() === album.title.toLocaleLowerCase())?.tracks ?? [], [album.title, query.data]);
  return <AlbumTracksLoader tracks={tracks} loading={query.isLoading} error={query.isError ? 'This album could not be loaded from your relays.' : undefined} onLoaded={onLoaded} onError={onError} />;
}

function AlbumTracksLoader({ tracks, loading, error, onLoaded, onError }: { tracks: Track[]; loading: boolean; error?: string; onLoaded: (tracks: Track[]) => void; onError: (message: string) => void }) {
  const callbacks = useRef({ onLoaded, onError });
  callbacks.current = { onLoaded, onError };
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || loading) return;
    handled.current = true;
    if (tracks.length) callbacks.current.onLoaded(tracks);
    else callbacks.current.onError(error ?? 'No playable tracks were found for this album.');
  }, [error, loading, tracks]);
  return null;
}
