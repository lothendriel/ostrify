import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSavedAlbums } from '@/hooks/useSavedAlbums';
import { useToast } from '@/hooks/useToast';
import { nostrAlbumId, type SavedAlbum } from '@/lib/savedAlbums';

type AlbumInput = Omit<SavedAlbum, 'isListed'>;

export function SaveAlbumButton({ album, artist, image, artistPubkey, className }: { album: { id?: string; title: string }; artist?: string; image?: string; artistPubkey?: string; className?: string }) {
  const { user } = useCurrentUser();
  const library = useSavedAlbums();
  const { toast } = useToast();
  const source = artistPubkey ? 'nostr' : 'wavlake';
  const id = artistPubkey ? nostrAlbumId(artistPubkey, album.title) : album.id;
  const saved = library.albums.some(item => item.id === id);
  const handleClick = () => {
    if (!user) {
      toast({ title: 'Log in to save albums', description: 'Sign in with Nostr to sync saved albums across your devices.' });
      return;
    }
    if (!library.hasReadRelays) {
      toast({ title: 'Enable a read relay', description: 'A read relay is needed to sync your saved albums.' });
      return;
    }
    if (!id) {
      toast({ title: 'Could not identify this album', description: 'This album does not have a valid stable identifier.', variant: 'destructive' });
      return;
    }
    const albumToSave: AlbumInput = { id, source, title: album.title, artist, image, artistPubkey };
    void library.toggleSaved(albumToSave, !saved).then(() => {
      toast({ title: saved ? 'Album removed from Saved Albums' : 'Album saved to your library' });
    }).catch(error => {
      toast({ title: 'Could not update Saved Albums', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    });
  };
  return <Button type="button" variant={saved ? 'default' : 'outline'} className={className} onClick={handleClick} disabled={library.isSaving || !id} aria-pressed={saved} aria-label={saved ? `Remove ${album.title} from Saved Albums` : `Save ${album.title} to Saved Albums`}>
    <Heart className={saved ? 'size-4 fill-current' : 'size-4'} />{saved ? 'Saved' : 'Save album'}
  </Button>;
}
