import { useMemo } from 'react';
import { SaveAlbumButton } from '@/components/music/SaveAlbumButton';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import { Disc3, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackList } from '@/components/music/TrackList';
import { useArtistTracks, groupIntoAlbums } from '@/hooks/useArtistTracks';
import { useAuthor } from '@/hooks/useAuthor';
import { usePlayer } from '@/hooks/usePlayer';
import { sanitizeUrl, genUserName } from '@/lib/sanitize';

export default function ArtistAlbumPage() {
  const { nip19: identifier } = useParams<{ nip19: string }>();
  const [searchParams] = useSearchParams();
  const title = searchParams.get('title')?.trim() ?? '';
  const albumId = searchParams.get('albumId')?.trim() ?? '';
  let pubkey: string | undefined;
  if (identifier) {
    try {
      const decoded = nip19.decode(identifier);
      if (decoded.type === 'npub') pubkey = decoded.data;
      else if (decoded.type === 'nprofile') pubkey = decoded.data.pubkey;
    } catch {
      // Invalid identifiers are handled by the not-found state below.
    }
  }
  const author = useAuthor(pubkey, { persistForPublicArtistPage: true });
  const query = useArtistTracks(pubkey);
  const player = usePlayer();
  const album = useMemo(() => groupIntoAlbums(query.data ?? []).albums.find(item => albumId ? item.id === `id:${albumId}` : item.title?.toLocaleLowerCase() === title.toLocaleLowerCase()), [query.data, albumId, title]);
  const artist = author.data?.metadata?.display_name || author.data?.metadata?.name || (pubkey ? genUserName(pubkey) : 'Nostr artist');
  useSeoMeta({ title: title ? `${title} — ${artist} — Ostrify` : 'Album — Ostrify' });

  if (!pubkey || !title) return <div className="p-6"><h1 className="text-2xl font-bold">Album not found</h1></div>;

  const artistPath = `/artist/${identifier}`;

  if (query.isLoading) return <div className="space-y-6 p-4 sm:p-6"><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-72 w-full rounded-xl" /></div>;
  if (query.isError) return <div className="space-y-4 p-6"><p role="alert" className="text-sm text-destructive">Couldn’t load this album’s tracks from your selected relays. <button className="underline" onClick={() => void query.refetch()}>Try again</button></p></div>;
  if (!album) return <div className="space-y-4 p-6"><div className="rounded-lg border border-dashed p-8 text-center"><h1 className="text-2xl font-bold">Album not found</h1><p className="mt-2 text-sm text-muted-foreground">This album title is not present in the tracks currently returned by your relays.</p></div></div>;

  const image = sanitizeUrl(album.image);
  return <div className="space-y-6 p-4 sm:p-6">
    <header className="flex flex-col items-start gap-5 rounded-xl bg-gradient-to-br from-emerald-950 via-teal-950 to-card p-5 sm:flex-row sm:items-end sm:p-8">
      <div className="size-40 shrink-0 overflow-hidden rounded-lg bg-secondary shadow-xl sm:size-52">{image ? <img src={image} alt="" fetchPriority="high" decoding="async" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center"><Disc3 className="size-16 text-white/60" /></div>}</div>
      <div className="min-w-0 flex-1 text-white"><p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">Nostr album</p><h1 className="mt-2 break-words text-4xl font-extrabold tracking-tight sm:text-6xl">{album.title}</h1><Link to={artistPath} className="mt-3 inline-block text-sm text-white/80 hover:text-white hover:underline">{artist}</Link><p className="mt-2 text-sm text-white/70">{album.tracks.length} {album.tracks.length === 1 ? 'track' : 'tracks'}</p></div>
    </header>
    <div className="space-y-2"><div className="flex flex-wrap items-center gap-3"><SaveAlbumButton album={{ title: album.title ?? title }} artist={artist} image={image} artistPubkey={pubkey} className="rounded-full" /><Button type="button" size="icon" className="size-12 rounded-full" aria-label={`Play ${album.title}`} onClick={() => player.playTrack(album.tracks[0])}><Play className="size-5 fill-current" /></Button><span className="text-sm text-muted-foreground">Tracks are grouped by the album name published with each track. Availability depends on your enabled relays.</span></div><p className="text-xs text-muted-foreground">Saved Albums sync across your devices. Private albums are hidden from your Ostrify profile, but bookmark data remains public on Nostr.</p></div>
    <section className="space-y-3"><h2 className="text-2xl font-bold">Tracks</h2><TrackList tracks={album.tracks} /></section>
  </div>;
}
