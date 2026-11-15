import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSavedAlbums } from '@/hooks/useSavedAlbums';
import { useToast } from '@/hooks/useToast';

export function SaveAlbumButton({ album, artist, image, className }: { album: { id: string; title: string }; artist?: string; image?: string; className?: string }) {
  const { user } = useCurrentUser();
  const library = useSavedAlbums();
  const { toast } = useToast();
  const saved = library.albums.some(item => item.id === album.id);
  const handleClick = () => {
    if (!user) {
      toast({ title: 'Log in to save albums', description: 'Sign in with Nostr to sync saved albums across your devices.' });
      return;
    }
    if (!library.hasReadRelays) {
      toast({ title: 'Enable a read relay', description: 'A read relay is needed to sync your saved albums.' });
      return;
    }
    void library.toggleSaved({ id: album.id, title: album.title, artist, image }, !saved).then(() => {
      toast({ title: saved ? 'Album removed from Saved Albums' : 'Album saved to your library' });
    }).catch(error => {
      toast({ title: 'Could not update Saved Albums', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    });
  };
  return <Button type="button" variant={saved ? 'default' : 'outline'} className={className} onClick={handleClick} disabled={library.isSaving} aria-pressed={saved} aria-label={saved ? `Remove ${album.title} from Saved Albums` : `Save ${album.title} to Saved Albums`}>
    <Heart className={saved ? 'size-4 fill-current' : 'size-4'} />{saved ? 'Saved' : 'Save album'}
  </Button>;
}
