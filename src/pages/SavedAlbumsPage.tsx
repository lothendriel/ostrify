import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Disc3, Globe, LockKeyhole, Music, Trash2 } from 'lucide-react';
import { BackLink } from '@/components/music/BackLink';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useSavedAlbums } from '@/hooks/useSavedAlbums';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitize';

export default function SavedAlbumsPage() {
  const library = useSavedAlbums();
  const { toast } = useToast();
  useSeoMeta({ title: 'Saved Albums — Ostrify' });
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
      <BackLink to="/music?source=wavlake" className="inline-flex items-center gap-2 text-sm text-emerald-100 hover:underline">Back to music</BackLink>
      <p className="mt-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-200"><Disc3 className="size-4" /> Your library</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Saved Albums</h1>
      <p className="mt-2 text-muted-foreground">Wavlake albums saved to your Nostr account. Your collection syncs across devices.</p>
      {library.isEnabled && <p className="mt-3 text-xs text-white/70">Public/private controls hide albums from Ostrify profiles and discovery when private. Nostr bookmark data itself remains public.</p>}
    </header>

    {!library.isEnabled && <p className="rounded-lg border border-dashed p-6 text-muted-foreground">Log in with Nostr to save albums and sync your collection across devices.</p>}
    {library.isEnabled && !library.hasReadRelays && <p className="rounded-lg border border-dashed p-6 text-muted-foreground">Enable a read relay in Settings to load and sync your saved albums.</p>}
    {library.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load Saved Albums. <button className="underline" onClick={() => void library.refetch()}>Try again</button></p>}
    {library.isEnabled && library.hasReadRelays && !library.isLoading && library.data?.complete === false && <p role="status" className="text-sm text-muted-foreground">Relay responses may be incomplete, so this list may not include every saved album. <button className="underline" onClick={() => void library.refetch()}>Try again</button></p>}

    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-2xl font-bold"><Disc3 className="size-5 text-primary" /> Albums</h2><span className="text-sm text-muted-foreground">{library.albums.length} saved</span></div>
      {library.isLoading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div> : library.albums.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{library.albums.map(album => {
        const image = sanitizeUrl(album.image);
        return <article key={album.id} className="overflow-hidden rounded-xl border border-border/60 bg-secondary/30">
          <Link to={`/wavlake/album/${album.id}`} className="group flex min-w-0 items-center gap-3 p-3 focus-visible:outline-2 focus-visible:outline-primary">
            <span className="size-16 shrink-0 overflow-hidden rounded-md bg-secondary">{image ? <img src={image} alt="" loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center"><Music className="size-7 text-muted-foreground" /></span>}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold group-hover:underline">{album.title}</span><span className="mt-1 block truncate text-sm text-muted-foreground">{album.artist ?? 'Wavlake album'}</span><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{album.isListed ? <Globe className="size-3" /> : <LockKeyhole className="size-3" />}{album.isListed ? 'Public on profile' : 'Private on profile'}</span></span>
          </Link>
          <div className="flex items-center justify-between gap-3 border-t border-border/50 px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={album.isListed} disabled={library.isSaving || !library.hasReadRelays} onCheckedChange={visible => updateVisibility(album.id, visible)} aria-label={`Show ${album.title} on public Ostrify profile`} />{album.isListed ? 'Public' : 'Private'}</label>
            <Button type="button" variant="ghost" size="sm" disabled={library.isSaving} onClick={() => remove(album.id)} aria-label={`Remove ${album.title} from Saved Albums`}><Trash2 className="size-4" /> Remove</Button>
          </div>
        </article>;
      })}</div> : <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No albums saved yet. Open a Wavlake album and choose Save album to add it here.</p>}
      {library.saveError && <p role="alert" className="text-sm text-destructive">{library.saveError.message}</p>}
      {library.isSaving && <p role="status" className="text-sm text-muted-foreground">Syncing Saved Albums to Nostr…</p>}
    </section>
  </div>;
}
