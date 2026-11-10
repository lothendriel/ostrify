import { useParams, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Music } from 'lucide-react';
import { usePublicMusicPlaylist } from '@/hooks/usePublicMusicPlaylist';
import { usePublicPlaylistTracks } from '@/hooks/usePublicPlaylistTracks';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import { CollectionHeader } from '@/components/music/CollectionHeader';
import { TrackList } from '@/components/music/TrackList';
import { Skeleton } from '@/components/ui/skeleton';

export default function PublicMusicPlaylistPage() {
  const { pubkey: identifier } = useParams<{ pubkey: string }>();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('d') ?? undefined;
  const playlistQuery = usePublicMusicPlaylist(identifier, id);
  const playlist = playlistQuery.data;
  const tracksQuery = usePublicPlaylistTracks(playlist?.references);
  const tracks = tracksQuery.data?.tracks ?? [];
  const authorQuery = useAuthor(playlist?.pubkey);
  const name = authorQuery.data?.metadata?.display_name || authorQuery.data?.metadata?.name || (playlist ? genUserName(playlist.pubkey) : 'Nostr publisher');
  const image = sanitizeUrl(playlist?.image);
  useSeoMeta({ title: `${playlist?.title ?? 'Nostr playlist'} — Ostrify`, description: playlist?.description ?? 'A public music playlist shared on Nostr.' });

  if (playlistQuery.isLoading) return <div className="space-y-6 p-6"><Skeleton className="h-56 w-full rounded-xl" /><Skeleton className="h-80 w-full rounded-xl" /></div>;
  if (playlistQuery.isError) return <div className="space-y-3 p-6 text-center"><h1 className="text-2xl font-bold">Couldn’t load this playlist</h1><p className="text-muted-foreground">Check your read relays and try again.</p><button type="button" className="rounded-md border px-4 py-2 hover:bg-secondary" onClick={() => void playlistQuery.refetch()}>Retry</button></div>;
  if (!playlist) return <div className="space-y-3 py-24 text-center"><p className="text-muted-foreground">Public playlist not found on the configured read relays. It may have been removed or the relays may not have synced it yet.</p><Link to="/music" className="text-primary underline">Back to music discovery</Link></div>;

  return <div>
    <CollectionHeader
      subtitle={`Public Nostr playlist · ${name}`}
      title={playlist.title}
      description={playlist.description}
      image={image}
      icon={<Music className="size-16 text-white/70" />}
      gradient="linear-gradient(to bottom, hsl(160 45% 24%), transparent)"
      tracks={tracks}
    />
    <div className="space-y-4 px-3 sm:px-6">
      {tracksQuery.isError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"><p>Couldn’t load the referenced tracks. They may be unavailable on your relays or their catalog may be temporarily unreachable.</p><button type="button" className="mt-2 font-medium text-primary underline" onClick={() => void tracksQuery.refetch()}>Retry loading tracks</button></div>}
      {!!tracksQuery.data?.unavailable && <div role="status" className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground"><p>{tracksQuery.data.unavailable} of {playlist.references.length} referenced {tracksQuery.data.unavailable === 1 ? 'tracks isn’t' : 'tracks aren’t'} available right now. They may be missing from your read relays, removed, or temporarily unreachable; remaining tracks keep their playlist order.</p><button type="button" className="mt-2 font-medium text-primary underline" onClick={() => void tracksQuery.refetch()}>Retry missing tracks</button><p className="mt-2 text-xs">If tracks stay unavailable, try enabling additional read relays in <Link to="/settings" className="underline">Settings</Link>.</p></div>}
      <section className="space-y-3"><h2 className="text-2xl font-bold">Tracks</h2><TrackList tracks={tracks} isLoading={tracksQuery.isLoading} emptyMessage="The supported track references weren’t found on your read relays or their sources could not be reached. Retry loading above, or try additional read relays." /></section>
      <p className="text-xs text-muted-foreground">Public playlist by {name} · Nostr kind 34139</p>
    </div>
  </div>;
}
