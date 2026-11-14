import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Library, Music2, UserRound, Mic, Play, Shuffle } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackList } from '@/components/music/TrackList';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePlaylists, LIKED_SONGS_ID } from '@/hooks/usePlaylists';
import { useFollowedArtists } from '@/hooks/useFollowedArtists';
import { useFollowedPeople } from '@/hooks/useFollowedPeople';
import { useProfilePrivacy } from '@/hooks/useProfilePrivacy';
import { useTracksByIds } from '@/hooks/useTracksByIds';
import { useWavlakeRelease } from '@/hooks/useWavlake';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import { nip19 } from 'nostr-tools';
import { usePodcastFavorites } from '@/hooks/usePodcasts';
import { usePlayer } from '@/hooks/usePlayer';

function FollowedPersonTile({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.display_name || author.data?.metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(author.data?.metadata?.picture);
  return <Link to={`/${nip19.npubEncode(pubkey)}`} className="group block min-w-0 rounded-lg p-2 transition-colors hover:bg-white/[0.08]"><span className="block aspect-square w-full overflow-hidden rounded-full shadow-lg transition-transform group-hover:scale-105">{picture ? <img src={picture} alt={name} loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center rounded-full bg-secondary"><UserRound className="size-8" /></span>}</span><span className="mt-3 block truncate text-sm font-medium">{name}</span><span className="mt-1 block text-xs text-muted-foreground">Ostrify friend</span></Link>;
}

function ArtistTile({ reference }: { reference: string }) {
  const wavlake = reference.startsWith('wavlake:') ? reference.slice(8) : undefined;
  const artist = useWavlakeRelease('artist', wavlake);
  const author = useAuthor(wavlake ? undefined : reference);
  const name = wavlake ? artist.data?.title ?? 'Wavlake artist' : author.data?.metadata?.display_name || author.data?.metadata?.name || genUserName(reference);
  const picture = wavlake ? artist.data?.image : sanitizeUrl(author.data?.metadata?.picture);
  return <Link to={wavlake ? `/wavlake/artist/${wavlake}` : `/${nip19.npubEncode(reference)}`} className="group block min-w-0 rounded-lg p-2 transition-colors hover:bg-white/[0.08]"><span className="block aspect-square w-full overflow-hidden rounded-full bg-secondary shadow-lg transition-transform group-hover:scale-105">{picture ? <img src={picture} alt={name} loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center"><Music2 className="size-8" /></span>}</span><span className="mt-3 block truncate text-sm font-medium">{name}</span><span className="mt-1 block text-xs text-muted-foreground">{wavlake ? 'Wavlake artist' : 'Nostr artist'}</span></Link>;
}

export default function MyProfile() {
  useSeoMeta({ title: 'My Profile — Ostrify' });
  const { user, metadata } = useCurrentUser();
  const playlists = usePlaylists();
  const artists = useFollowedArtists();
  const followedPeople = useFollowedPeople();
  const privacy = useProfilePrivacy();
  const podcastFavorites = usePodcastFavorites();
  const player = usePlayer();
  const liked = playlists.data?.find(list => list.id === LIKED_SONGS_ID);
  const savedTracks = useTracksByIds(privacy.isHidden('liked') ? undefined : liked?.trackIds);
  if (!user) return <div className="py-20 px-6 text-center space-y-4"><UserRound className="size-12 mx-auto text-primary" /><h1 className="text-3xl font-bold">Your music profile</h1><p className="text-muted-foreground">Log in to see your followed artists, liked songs and playlists.</p><LoginArea className="max-w-60" /></div>;
  const name = metadata?.display_name || metadata?.name || genUserName(user.pubkey);
  const picture = sanitizeUrl(metadata?.picture);
  const banner = sanitizeUrl(metadata?.banner);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase();
  const regular = (playlists.data ?? []).filter(list => !list.isLiked);
  const tracks = savedTracks.data?.tracks ?? [];
  return <div className="min-h-full w-full pb-10">
    <header className="relative isolate flex min-h-[320px] flex-col justify-start gap-5 overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-[#121212] px-5 pb-7 pt-16 sm:min-h-[340px] sm:flex-row sm:items-end sm:gap-6 sm:px-6 sm:pb-7">
      {banner && <img src={banner} alt="" className="absolute inset-0 z-0 size-full object-cover opacity-40" />}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#121212]/70 via-emerald-950/25 to-black/5" aria-hidden="true" />
      <div className="relative z-20 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="size-36 shrink-0 overflow-hidden rounded-full bg-emerald-950 shadow-2xl ring-1 ring-white/15 sm:size-52">{picture ? <img src={picture} alt={name} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-4xl font-bold text-white sm:text-6xl">{initials}</div>}</div>
        <div className="min-w-0 pb-1 text-white"><p className="text-sm font-medium">Your Ostrify profile</p><h1 className="mt-1 break-words text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl">{name}</h1><p className="mt-3 text-sm text-white/85">{tracks.length} liked {tracks.length === 1 ? 'track' : 'tracks'} · {artists.data?.length ?? 0} artists · {followedPeople.people.length} Ostrify friends</p></div>
      </div>
    </header>
    <div className="min-h-[calc(100vh-9rem)] bg-gradient-to-b from-[#3b2727] via-[#201919] to-[#121212] px-4 sm:px-6 lg:px-7">
      <div className="flex flex-wrap items-center gap-4 py-4 sm:py-5"><button type="button" aria-label="Play liked songs" disabled={!tracks.length} className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground transition hover:scale-105 disabled:opacity-40" onClick={() => player.playQueue(tracks)}><Play className="size-6 fill-current" /></button><button type="button" aria-label="Shuffle liked songs" disabled={!tracks.length} className="grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40" onClick={() => { player.toggleShuffle(); player.playQueue(tracks); }}><Shuffle className="size-5" /></button></div>
      {privacy.isError && <p role="alert" className="py-4 text-sm text-destructive">Couldn’t load your profile privacy settings. Profile sections are hidden for now. <button className="underline" onClick={() => void privacy.refetch()}>Try again</button></p>}
      {privacy.isLoading || privacy.isError ? <div className="space-y-3 pb-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div> : <>
        {metadata?.about && <p className="mb-5 max-w-4xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{metadata.about}</p>}
        {!privacy.isHidden('artists') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold sm:text-2xl">Followed artists</h2><Link to="/artists" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Show all</Link></div>{artists.isLoading ? <Skeleton className="h-40 w-full" /> : artists.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load followed artists. <button className="underline" onClick={() => void artists.refetch()}>Try again</button></p> : artists.data?.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{artists.data.slice(0, 6).map(reference => <ArtistTile key={reference} reference={reference} />)}</div> : <p className="text-sm text-muted-foreground">You aren’t following any artists yet.</p>}</section>}
        {!privacy.isHidden('people') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold sm:text-2xl">Following</h2><span className="text-xs font-semibold text-muted-foreground">Ostrify friends</span></div>{followedPeople.isLoading ? <Skeleton className="h-40 w-full" /> : followedPeople.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load friends. <button className="underline" onClick={() => void followedPeople.refetch()}>Try again</button></p> : followedPeople.people.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{followedPeople.people.slice(0, 6).map(pubkey => <FollowedPersonTile key={pubkey} pubkey={pubkey} />)}</div> : <p className="text-sm text-muted-foreground">You haven’t added any friends on Ostrify yet.</p>}</section>}
        {!privacy.isHidden('podcasts') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold sm:text-2xl">Saved podcasts</h2><Link to="/podcast-library" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Show all</Link></div>{podcastFavorites.isLoading ? <Skeleton className="h-20 w-full" /> : podcastFavorites.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load saved podcasts. <button className="underline" onClick={() => void podcastFavorites.refetch()}>Try again</button></p> : podcastFavorites.data.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{podcastFavorites.data.slice(0, 6).map(item => <Link key={item.id} to={item.episode ? '/podcast-library' : item.feedId ? `/podcasts?source=directory&show=${encodeURIComponent(item.id)}` : '/podcast-library'} className="rounded-lg bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.1]">{item.image ? <img src={item.image} alt="" className="aspect-square w-full rounded-md object-cover" /> : <span className="flex aspect-square items-center justify-center rounded-md bg-secondary"><Mic className="size-8" /></span>}<span className="mt-3 block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{item.publisher ?? (item.episode ? 'Podcast episode' : 'Podcast')}</span></Link>)}</div> : <p className="text-sm text-muted-foreground">You haven’t saved any podcasts or episodes yet.</p>}</section>}
        {!privacy.isHidden('playlists') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold sm:text-2xl">Playlists</h2><span className="text-xs text-muted-foreground">{regular.length} playlists</span></div>{playlists.isLoading ? <Skeleton className="h-20 w-full" /> : playlists.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load playlists. <button className="underline" onClick={() => void playlists.refetch()}>Try again</button></p> : regular.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{regular.map(list => <Link key={list.id} to={`/playlist/${encodeURIComponent(list.id)}`} className="rounded-lg bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.1]"><span className="flex aspect-square items-center justify-center rounded-md bg-gradient-to-br from-emerald-900 to-slate-800"><Library className="size-10 text-white/70" /></span><span className="mt-3 block truncate text-sm font-semibold">{list.title}</span><span className="mt-1 block text-xs text-muted-foreground">{list.trackIds.length} tracks</span></Link>)}</div> : <p className="text-sm text-muted-foreground">You haven’t created a music playlist yet.</p>}</section>}
        {!privacy.isHidden('liked') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between"><h2 className="text-xl font-bold sm:text-2xl">Liked songs</h2><Link to="/liked" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Show all</Link></div>{playlists.isLoading || savedTracks.isLoading ? <TrackList tracks={[]} isLoading /> : playlists.isError ? <p role="alert" className="text-sm text-muted-foreground">Couldn’t load your liked songs. <button className="underline" onClick={() => void playlists.refetch()}>Try again</button></p> : tracks.length ? <TrackList tracks={tracks} /> : <p className="text-sm text-muted-foreground">You haven’t liked any songs yet.</p>}{!!savedTracks.data?.unavailable && <p className="text-sm text-muted-foreground">{savedTracks.data.unavailable} saved track(s) could not be loaded.</p>}</section>}
      </>}
    </div>
  </div>;
}
