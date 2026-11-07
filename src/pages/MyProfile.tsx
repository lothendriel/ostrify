import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Heart, Library, Music2, UserRound } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackList } from '@/components/music/TrackList';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePlaylists, LIKED_SONGS_ID } from '@/hooks/usePlaylists';
import { useFollowedArtists } from '@/hooks/useFollowedArtists';
import { useTracksByIds } from '@/hooks/useTracksByIds';
import { useWavlakeRelease } from '@/hooks/useWavlake';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import { nip19 } from 'nostr-tools';

function ArtistTile({ reference }: { reference: string }) {
  const wavlake = reference.startsWith('wavlake:') ? reference.slice(8) : undefined;
  const artist = useWavlakeRelease('artist', wavlake);
  const author = useAuthor(wavlake ? undefined : reference);
  const name = wavlake ? artist.data?.title ?? 'Wavlake artist' : author.data?.metadata?.display_name || author.data?.metadata?.name || genUserName(reference);
  const picture = wavlake ? artist.data?.image : sanitizeUrl(author.data?.metadata?.picture);
  return <Link to={wavlake ? `/wavlake/artist/${wavlake}` : `/${nip19.npubEncode(reference)}`} className="group flex items-center gap-3 min-w-0 rounded-xl bg-secondary/50 p-3 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
    <Avatar className="size-12 shrink-0"><AvatarImage src={picture} alt="" /><AvatarFallback><Music2 className="size-5" /></AvatarFallback></Avatar>
    <span className="min-w-0"><span className="block font-semibold truncate group-hover:underline">{name}</span><span className="block text-sm text-muted-foreground">{wavlake ? 'Wavlake artist' : 'Nostr artist'}</span></span>
  </Link>;
}

export default function MyProfile() {
  useSeoMeta({ title: 'My Profile — Ostrify' });
  const { user, metadata } = useCurrentUser();
  const playlists = usePlaylists();
  const artists = useFollowedArtists();
  const liked = playlists.data?.find(list => list.id === LIKED_SONGS_ID);
  const savedTracks = useTracksByIds(liked?.trackIds);
  if (!user) return <div className="py-20 px-6 text-center space-y-4"><UserRound className="size-12 mx-auto text-primary" /><h1 className="text-3xl font-bold">Your music profile</h1><p className="text-muted-foreground">Log in to see your followed artists, liked songs and playlists.</p><LoginArea className="max-w-60" /></div>;
  const name = metadata?.display_name || metadata?.name || genUserName(user.pubkey);
  const regular = (playlists.data ?? []).filter(list => !list.isLiked);
  return <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-8">
    <header className="rounded-xl bg-gradient-to-br from-emerald-900/70 via-teal-950 to-card p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
      <Avatar className="size-24 sm:size-32 shadow-lg"><AvatarImage src={sanitizeUrl(metadata?.picture)} alt="" /><AvatarFallback className="text-3xl">{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
      <div className="min-w-0"><p className="text-sm uppercase tracking-wider text-emerald-200 font-semibold">Your profile</p><h1 className="text-4xl font-bold tracking-tight mt-2 break-words">{name}</h1><p className="text-sm text-muted-foreground mt-2">Your public Ostrify music library</p></div>
    </header>
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-bold flex items-center gap-2"><Heart className="size-5 text-primary" /> Liked songs</h2><Link to="/liked" className="text-sm font-semibold text-primary hover:underline">View all</Link></div>
      {playlists.isLoading || savedTracks.isLoading ? <Skeleton className="h-24 w-full" /> : playlists.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load your liked songs. <button className="underline" onClick={() => void playlists.refetch()}>Try again</button></p> : <><TrackList tracks={savedTracks.data?.tracks ?? []} emptyMessage={savedTracks.data?.unavailable ? 'Your liked songs could not be loaded right now.' : 'You haven’t liked any songs yet.'} />{!!savedTracks.data?.unavailable && <p className="text-sm text-muted-foreground">{savedTracks.data.unavailable} saved track(s) could not be loaded. <button className="underline" onClick={() => void savedTracks.refetch()}>Try again</button></p>}</>}
    </section>
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-bold flex items-center gap-2"><Music2 className="size-5 text-primary" /> Followed artists</h2><Link to="/artists" className="text-sm font-semibold text-primary hover:underline">View all</Link></div>
      {artists.isLoading ? <Skeleton className="h-20 w-full" /> : artists.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load followed artists. <button className="underline" onClick={() => void artists.refetch()}>Try again</button></p> : artists.data?.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{artists.data.map(reference => <ArtistTile key={reference} reference={reference} />)}</div> : <p className="text-muted-foreground">You aren’t following any artists yet.</p>}
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-bold flex items-center gap-2"><Library className="size-5 text-primary" /> Your playlists</h2>
      {playlists.isLoading ? <Skeleton className="h-20 w-full" /> : playlists.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load playlists. <button className="underline" onClick={() => void playlists.refetch()}>Try again</button></p> : regular.length ? <div className="grid sm:grid-cols-2 gap-3">{regular.map(list => <Link key={list.id} to={`/playlist/${encodeURIComponent(list.id)}`} className="rounded-xl border border-border bg-secondary/30 p-4 hover:bg-secondary"><span className="block font-semibold truncate">{list.title}</span><span className="text-sm text-muted-foreground">{list.trackIds.length} tracks</span></Link>)}</div> : <p className="text-muted-foreground">You haven’t created a music playlist yet.</p>}
    </section>
  </div>;
}
