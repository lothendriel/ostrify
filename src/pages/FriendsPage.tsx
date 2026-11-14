import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '@/components/music/BackLink';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { Users, UserPlus, Radio, Disc3, X, Music2, Check, CheckCircle2, Play, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useFriends, useNostrFollows } from '@/hooks/useFriends';
import { useFriendLibrary, useFriendStatuses } from '@/hooks/useFriendLibrary';
import { useTracksByIds } from '@/hooks/useTracksByIds';
import { useWavlakeRelease } from '@/hooks/useWavlake';
import { TrackList } from '@/components/music/TrackList';
import { MessageFriendButton } from '@/components/music/MessageFriendButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import { useToast } from '@/hooks/useToast';
import { useOstrifyDirectory, type DirectoryPerson } from '@/hooks/useOstrifyDirectory';
import { useFollowedPeople } from '@/hooks/useFollowedPeople';
import { usePlayer } from '@/hooks/usePlayer';
import { useProfilePrivacy } from '@/hooks/useProfilePrivacy';
import { useAppContext } from '@/hooks/useAppContext';
import { queryLibraryEvents } from '@/lib/libraryQuery';

function Person({ pubkey, children }: { pubkey: string; children?: React.ReactNode }) {
  const { data } = useAuthor(pubkey);
  const name = data?.metadata?.display_name || data?.metadata?.name || genUserName(pubkey);
  const image = sanitizeUrl(data?.metadata?.picture);
  return <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3 min-w-0"><div className="size-11 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">{image ? <img src={image} alt="" className="size-full object-cover" /> : <Users className="size-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><Link to={`/${nip19.npubEncode(pubkey)}`} className="font-semibold truncate block hover:underline">{name}</Link><p className="text-xs text-muted-foreground truncate">{nip19.npubEncode(pubkey).slice(0, 18)}…</p></div>{children}</div>;
}

function Artist({ reference }: { reference: string }) {
  const wavlakeId = reference.startsWith('wavlake:') ? reference.slice(8) : undefined;
  const { data: wavlake } = useWavlakeRelease('artist', wavlakeId);
  const { data: author } = useAuthor(wavlakeId ? undefined : reference);
  const name = wavlakeId ? wavlake?.title ?? 'Wavlake artist' : author?.metadata?.display_name || author?.metadata?.name || genUserName(reference);
  const picture = sanitizeUrl(wavlake?.image ?? author?.metadata?.picture);
  const to = wavlakeId ? `/wavlake/artist/${wavlakeId}` : `/${nip19.npubEncode(reference)}`;
  return <Link to={to} className="group block min-w-0 rounded-lg p-2 transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><div className="aspect-square w-full overflow-hidden rounded-full bg-secondary shadow-lg">{picture ? <img src={picture} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" /> : <div className="flex size-full items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-800"><Disc3 className="size-10 text-white/75" /></div>}</div><span className="mt-3 block truncate text-left text-sm font-medium">{name}</span><span className="mt-1 block text-left text-xs text-muted-foreground">Artist</span></Link>;
}

function PublicPlaylist({ title, ids }: { title: string; ids: string[] }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useTracksByIds(open ? ids : undefined);
  return <div className="rounded-lg border border-border p-4"><button className="w-full flex justify-between gap-3 text-left font-semibold hover:text-primary" onClick={() => setOpen(v => !v)} aria-expanded={open}><span>{title}</span><span className="text-sm text-muted-foreground">{ids.length} tracks · {open ? 'Hide' : 'View'}</span></button>{open && <div className="mt-4"><TrackList tracks={data?.tracks ?? []} isLoading={isLoading} emptyMessage="No playable tracks could be loaded from this list." />{!!data?.unavailable && <p className="text-sm text-muted-foreground mt-2">Some tracks could not be loaded.</p>}</div>}</div>;
}

function ProfilePersonCard({ pubkey }: { pubkey: string }) {
  const { data } = useAuthor(pubkey);
  const name = data?.metadata?.display_name || data?.metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(data?.metadata?.picture);
  return <Link to={`/${nip19.npubEncode(pubkey)}`} className="group block min-w-0 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="block aspect-square w-full overflow-hidden rounded-full shadow-lg transition-transform group-hover:scale-105">{picture ? <img src={picture} alt={name} loading="lazy" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-emerald-900 to-slate-800 text-2xl text-white"><Users className="size-8" /></span>}</span><span className="mt-3 block truncate text-sm font-medium">{name}</span><span className="mt-1 block text-xs text-muted-foreground">Profile</span></Link>;
}

function ProfileFollowers({ pubkey }: { pubkey: string }) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const readRelays = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort();
  const followers = useQuery({
    queryKey: ['public-ostrify-followers', pubkey, readRelays.join('|')],
    enabled: readRelays.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { events } = await queryLibraryEvents(nostr, readRelays, [{ kinds: [30000], '#p': [pubkey], limit: 500 }], AbortSignal.any([signal, AbortSignal.timeout(8000)]));
      return [...new Set(events.filter(event => event.kind === 30000 && event.pubkey !== pubkey && event.tags.some(([name, value]) => name === 'd' && value === 'ostrify-people') && event.tags.some(([name, value]) => name === 'p' && value === pubkey)).map(event => event.pubkey))];
    },
  });
  if (followers.isLoading) return <div className="flex gap-3 overflow-hidden">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="size-36 shrink-0 rounded-full" />)}</div>;
  if (followers.isError) return <p role="status" className="text-sm text-muted-foreground">Followers aren’t available from your relays right now.</p>;
  if (!followers.data?.length) return <p className="text-sm text-muted-foreground">No Ostrify followers found on your read relays yet.</p>;
  return <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-3 [scrollbar-width:thin]">{followers.data.map(follower => <div key={follower} className="w-32 shrink-0 sm:w-36"><ProfilePersonCard pubkey={follower} /></div>)}</div>;
}

function FollowedPeopleList({ pubkey }: { pubkey: string }) {
  const { nostr } = useNostr();
  const privacy = useProfilePrivacy(pubkey);
  const people = useQuery({
    queryKey: ['public-ostrify-followed-people', pubkey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [30000], authors: [pubkey], '#d': ['ostrify-people'], limit: 5 }], { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
      const event = events.filter(item => item.pubkey === pubkey && item.kind === 30000 && item.tags.some(([name, value]) => name === 'd' && value === 'ostrify-people')).sort((a, b) => b.created_at - a.created_at)[0];
      return [...new Set((event?.tags ?? []).filter(([name, value]) => name === 'p' && /^[0-9a-f]{64}$/.test(value ?? '')).map(([, value]) => value))];
    },
  });
  if (privacy.isLoading || people.isLoading) return <Skeleton className="h-20 w-full" />;
  if (privacy.isError || people.isError) return <p role="status" className="text-sm text-muted-foreground">Followed users aren’t available from your relays right now.</p>;
  if (privacy.isHidden('people')) return <p className="text-sm text-muted-foreground">This person has hidden their friends list.</p>;
  if (!people.data?.length) return <p className="text-sm text-muted-foreground">No public followed users found.</p>;
  return <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-3 [scrollbar-width:thin]">{people.data.map(pubkey => <div key={pubkey} className="w-36 shrink-0 sm:w-40"><ProfilePersonCard pubkey={pubkey} /></div>)}</div>;
}



function ProfileFriendAction({ pubkey, compact = false }: { pubkey: string; compact?: boolean }) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const follows = useFollowedPeople();
  const { toast } = useToast();
  const readRelays = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort();
  const hasReadRelays = readRelays.length > 0;
  const reciprocalFollow = useQuery({
    queryKey: ['public-ostrify-follow-back', pubkey, user?.pubkey ?? '', readRelays.join('|')],
    enabled: !!user && user.pubkey !== pubkey && hasReadRelays && follows.people.includes(pubkey),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { events } = await queryLibraryEvents(nostr, readRelays, [{ kinds: [30000], authors: [pubkey], '#d': ['ostrify-people'], limit: 20 }], AbortSignal.any([signal, AbortSignal.timeout(8000)]));
      const event = events.filter(item => item.kind === 30000 && item.pubkey === pubkey && item.tags.some(([name, value]) => name === 'd' && value === 'ostrify-people')).sort((a, b) => b.created_at - a.created_at)[0];
      return (event?.tags ?? []).some(([name, value]) => name === 'p' && value === user?.pubkey);
    },
  });
  if (!user || user.pubkey === pubkey) return null;
  if (!follows.hasReadRelays) return compact ? null : <p className="text-sm text-muted-foreground">Enable a read relay to add Ostrify friends.</p>;
  if (follows.isLoading) return compact ? <Skeleton className="h-9 w-24 rounded-full" /> : <Skeleton className="h-10 w-40" />;
  if (follows.isError) return compact ? <p role="alert" className="text-xs text-destructive">Friend status unavailable. <button className="underline" onClick={() => void follows.refetch()}>Retry</button></p> : <p role="alert" className="text-sm text-destructive">Could not load your Ostrify friends. <button className="underline" onClick={() => void follows.refetch()}>Try again</button></p>;
  const isFriend = follows.people.includes(pubkey);
  return <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><Button type="button" variant={isFriend ? 'secondary' : 'outline'} aria-pressed={isFriend} disabled={follows.toggle.isPending} className={compact ? 'h-9 rounded-full px-4 text-xs' : undefined} onClick={() => follows.toggle.mutate({ pubkey, follow: !isFriend }, {
    onSuccess: () => toast({ title: isFriend ? 'Removed from friends' : 'Added to friends' }),
    onError: error => toast({ title: 'Could not update friends', description: error.message, variant: 'destructive' }),
  })}>{isFriend ? <CheckCircle2 className="size-4" /> : <UserPlus className="size-4" />} {follows.toggle.isPending ? 'Saving…' : isFriend ? 'Following' : 'Follow'}</Button>{reciprocalFollow.data && <span className="text-sm text-muted-foreground">(Follows you)</span>}{isFriend && reciprocalFollow.data && <MessageFriendButton pubkey={pubkey} />}</div>{!compact && <p className="text-sm text-muted-foreground">Following is one-way and immediately adds this person to your Ostrify friends. This relationship is public on Nostr.</p>}</div>;
}

function FriendProfile({ pubkey }: { pubkey: string }) {
  const player = usePlayer();
  const [showAllLiked, setShowAllLiked] = useState(false);
  const [showAllArtists, setShowAllArtists] = useState(false);
  const library = useFriendLibrary(pubkey);
  const privacy = useProfilePrivacy(pubkey);
  const { data: author } = useAuthor(pubkey);
  const metadata = author?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const picture = sanitizeUrl(metadata?.picture);
  const banner = sanitizeUrl(metadata?.banner);
  const liked = library.data?.playlists.find(item => item.id === 'nostr-tunes-liked');
  const regular = (library.data?.playlists ?? []).filter(item => item.id !== 'nostr-tunes-liked');
  const likedTracks = useTracksByIds(privacy.isHidden('liked') ? undefined : liked?.tracks);
  const allTracks = likedTracks.data?.tracks ?? [];
  const featuredTracks = allTracks.slice(0, showAllLiked ? 18 : 8);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase();
  return <div className="min-h-full w-full pb-10">
    <header className="relative isolate flex min-h-[320px] flex-col justify-end gap-5 overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-950 to-[#121212] px-5 pb-7 pt-16 sm:min-h-[340px] sm:flex-row sm:items-end sm:gap-6 sm:px-6 sm:pb-7">
      {banner && <img src={banner} alt="" className="absolute inset-0 z-0 size-full object-cover opacity-40" />}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#121212]/70 via-emerald-950/25 to-black/5" aria-hidden="true" />
      <BackLink to="/friends" className="absolute left-5 top-5 z-20 rounded-full bg-black/35 px-3 py-1.5 text-sm text-white/90 backdrop-blur hover:bg-black/50 sm:left-6">← Friends</BackLink>
      <div className="relative z-20 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="size-36 shrink-0 overflow-hidden rounded-full bg-emerald-950 shadow-2xl ring-1 ring-white/15 sm:size-52">{picture ? <img src={picture} alt={name} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-4xl font-bold text-white sm:text-6xl">{initials}</div>}</div>
        <div className="min-w-0 pb-1 text-white"><p className="text-sm font-medium">Ostrify profile</p><h1 className="mt-1 break-words text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl">{name}</h1><p className="mt-3 text-sm text-white/85">{allTracks.length} liked {allTracks.length === 1 ? 'track' : 'tracks'} <span className="px-1">·</span> {library.data?.artists.length ?? 0} artists <span className="px-1">·</span> {library.data?.people.length ?? 0} Ostrify friends</p></div>
      </div>
    </header>
    <div className="min-h-[calc(100vh-9rem)] bg-gradient-to-b from-[#3b2727] via-[#201919] to-[#121212] px-4 sm:px-6 lg:px-7">
      <div className="flex flex-wrap items-center gap-4 py-4 sm:py-5"><Button type="button" size="icon" aria-label="Play liked songs" disabled={!allTracks.length} className="size-14 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => player.playQueue(allTracks)}><Play className="size-6 fill-current" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Shuffle liked songs" disabled={!allTracks.length} className="size-11 rounded-full text-muted-foreground hover:text-foreground" onClick={() => { player.toggleShuffle(); player.playQueue(allTracks); }}><Shuffle className="size-5" /></Button><ProfileFriendAction pubkey={pubkey} compact /></div>
      {metadata?.about && <p className="mb-5 max-w-4xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{metadata.about}</p>}
      {privacy.isError && <p role="status" className="mb-6 text-sm text-muted-foreground">Profile privacy settings couldn’t be checked, so public sections are hidden for now. <button className="underline" onClick={() => void privacy.refetch()}>Try again</button></p>}
      {privacy.isLoading || privacy.isError ? <div className="space-y-3 pb-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-56 w-full" /></div> : library.isLoading ? <div className="space-y-4 pb-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-56 w-full" /></div> : library.isError ? <p role="alert" className="pb-8 text-sm text-destructive">Could not load this library. <button className="underline" onClick={() => void library.refetch()}>Try again</button></p> : <>
        {!privacy.isHidden('artists') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Followed artists</h2>{(library.data?.artists.length ?? 0) > 10 && <button type="button" onClick={() => setShowAllArtists(value => !value)} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">{showAllArtists ? 'Show less' : 'Show all'}</button>}</div>{library.data?.artists.length ? <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-3 [scrollbar-width:thin]">{library.data.artists.slice(0, showAllArtists ? undefined : 10).map(reference => <div key={reference} className="w-36 shrink-0 sm:w-40"><Artist reference={reference} /></div>)}</div> : <p className="text-sm text-muted-foreground">No public followed artists found.</p>}</section>}
        {!privacy.isHidden('people') && <><section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Followers</h2></div><ProfileFollowers pubkey={pubkey} /></section><section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Following</h2></div><FollowedPeopleList pubkey={pubkey} /></section></>}
        {!privacy.isHidden('liked') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Liked songs</h2>{allTracks.length > 8 && <button type="button" onClick={() => setShowAllLiked(value => !value)} className="shrink-0 text-xs font-semibold text-muted-foreground hover:text-foreground">{showAllLiked ? 'Show less' : 'Show all'}</button>}</div>{featuredTracks.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{featuredTracks.map((track, index) => <button type="button" key={track.id} onClick={() => player.playQueue(allTracks, index)} className="group min-w-0 rounded-lg bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><div className="relative aspect-square overflow-hidden rounded-md bg-secondary shadow-lg">{track.image ? <img src={sanitizeUrl(track.image)} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" /> : <div className="flex size-full items-center justify-center bg-gradient-to-br from-emerald-800 to-slate-900"><Music2 className="size-9 text-white/75" /></div>}<span className="absolute bottom-2 right-2 grid size-10 translate-y-2 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100"><Play className="size-5 fill-current" /></span></div><span className="mt-3 block truncate text-sm font-semibold">{track.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{track.artist || track.album || 'Audio'}</span></button>)}</div> : likedTracks.isLoading ? <TrackList tracks={[]} isLoading emptyMessage="Loading liked songs…" /> : <p className="text-sm text-muted-foreground">{liked ? 'No playable liked songs were found.' : 'This person has no public liked songs.'}</p>}{allTracks.length > 0 && showAllLiked && <TrackList tracks={allTracks} isLoading={likedTracks.isLoading} emptyMessage="No playable liked songs were found." />}{!!likedTracks.data?.unavailable && <p className="text-sm text-muted-foreground">{likedTracks.data.unavailable} saved track(s) weren’t available from your relays.</p>}</section>}
        {!privacy.isHidden('playlists') && <section className="space-y-4 border-t border-white/10 py-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Playlists</h2><span className="shrink-0 text-xs font-semibold text-muted-foreground">{regular.length} playlists</span></div>{regular.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{regular.map(playlist => <PublicPlaylist key={playlist.id} title={playlist.title} ids={playlist.tracks} />)}</div> : <p className="text-sm text-muted-foreground">No public playlists found.</p>}{library.data?.otherListsUnverified && <p className="text-sm text-muted-foreground">Some public lists couldn’t be checked because their referenced events weren’t available on your relays.</p>}</section>}
      </>}

    </div>
  </div>;
}

function OstrifyDirectory({ me, friendKeys, onFollow, pending }: { me: string; friendKeys: string[]; onFollow: (pubkey: string) => void; pending: boolean }) {
  const directory = useOstrifyDirectory();
  const [term, setTerm] = useState('');
  const people = (directory.data ?? []).filter(person => person.pubkey !== me && person.name.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()));
  return <section className="space-y-4">
    <div><h2 className="text-2xl font-semibold">Find people on Ostrify</h2><p className="text-sm text-muted-foreground mt-1">People who opted into the public directory. Add someone to follow them as an Ostrify friend. Search covers listings returned by your read relays, so it may be incomplete. <Link to="/settings" className="text-primary underline">Manage your visibility</Link>.</p></div>
    <div className="relative">
      <Input value={term} onChange={event => setTerm(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setTerm(''); }} placeholder="Search by name" aria-label="Search Ostrify directory by name" maxLength={100} className="pr-10" />
      {term && <button type="button" onClick={() => setTerm('')} aria-label="Clear people search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><X className="size-4" /></button>}
    </div>
    {!term.trim() ? <p className="text-sm text-muted-foreground">Enter a name to find people. Clear your search to hide the results.</p> : !directory.hasReadRelays ? <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Enable a read relay in Settings to search the directory.</div> : directory.isLoading ? <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div> : directory.isError ? <div role="alert" className="rounded-lg border border-border p-4 text-sm">Could not load the directory from your relays. <button type="button" className="text-primary underline" onClick={() => void directory.refetch()}>Try again</button></div> : people.length === 0 ? <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No matching people in the listings loaded from your relays.</div> : <div className="grid gap-3 sm:grid-cols-2">{people.map(person => <DirectoryResult key={person.pubkey} person={person} onFollow={onFollow} isFriend={friendKeys.includes(person.pubkey)} pending={pending} />)}</div>}
  </section>;
}

function DirectoryResult({ person, onFollow, isFriend, pending }: { person: DirectoryPerson; onFollow: (pubkey: string) => void; isFriend: boolean; pending: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3 min-w-0">
      <Link
        to={`/friends/${nip19.npubEncode(person.pubkey)}`}
        aria-label={`View ${person.name}'s Ostrify profile`}
        className="group flex flex-1 min-w-0 items-center gap-3 rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="size-12 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
          {person.picture ? <img src={person.picture} alt="" loading="lazy" className="size-full object-cover" /> : <Users className="size-5 text-muted-foreground" />}
        </div>
        <span className="min-w-0"><span className="block font-semibold truncate group-hover:underline">{person.name}</span><span className="block text-xs text-muted-foreground">View profile</span></span>
      </Link>
      <Button size="sm" variant={isFriend ? 'secondary' : 'outline'} disabled={pending || isFriend} onClick={() => onFollow(person.pubkey)}>{isFriend ? <><Check className="size-4" /> Friend</> : <><UserPlus className="size-4" /> Add friend</>}</Button>
    </div>
  );
}

function FriendsHome() {
  const { user } = useCurrentUser();
  const friends = useFriends();
  const follows = useNostrFollows();
  const followedPeople = useFollowedPeople();
  const { toast } = useToast();
  const migrationStarted = useRef(false);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const hasCheckedMigration = followedPeople.data?.tags.some(([name, value]) => name === 'ostrify-migration' && value === 'nip17-friends-v1') ?? false;
  const list = followedPeople.people;
  const statuses = useFriendStatuses(list);
  const outgoingInvites = new Set((friends.data?.outgoing ?? []).map(request => request.to));
  const inviteToFollowBack = (pubkey: string) => friends.send.mutate({ peer: pubkey, action: 'request' }, {
    onSuccess: () => toast({ title: 'Invite sent', description: 'Your private invite was sent. They can choose to follow you back.' }),
    onError: error => toast({ title: 'Could not send invite', description: error.message, variant: 'destructive' }),
  });
  const addFriend = (pubkey: string) => followedPeople.toggle.mutate({ pubkey, follow: true }, {
    onSuccess: () => toast({ title: 'Added to friends' }),
    onError: error => toast({ title: 'Could not add friend', description: error.message, variant: 'destructive' }),
  });
  const removeFriend = (pubkey: string) => followedPeople.toggle.mutate({ pubkey, follow: false }, {
    onSuccess: () => toast({ title: 'Removed from friends' }),
    onError: error => toast({ title: 'Could not remove friend', description: error.message, variant: 'destructive' }),
  });

  useEffect(() => {
    const oldFriendPubkeys = friends.data?.friends.map(friend => friend.pubkey) ?? [];
    if (!user || !followedPeople.hasReadRelays || followedPeople.isLoading || followedPeople.isError || friends.isLoading || friends.isError || hasCheckedMigration || migrationStarted.current) return;
    migrationStarted.current = true;
    setMigrationRunning(true);
    void followedPeople.mergePeople.mutateAsync(oldFriendPubkeys).then(() => {
      toast({ title: 'Existing Ostrify friends moved into your friends list' });
    }).catch(error => {
      migrationStarted.current = false;
      toast({ title: 'Could not migrate existing friends', description: error instanceof Error ? error.message : 'Please retry from Friends.', variant: 'destructive' });
    }).finally(() => setMigrationRunning(false));
  }, [user, followedPeople.hasReadRelays, followedPeople.isLoading, followedPeople.isError, hasCheckedMigration, followedPeople.mergePeople, friends.isLoading, friends.isError, friends.data, toast]);

  if (!user) return <div className="text-center py-20 space-y-4"><Users className="size-12 text-primary mx-auto" /><h1 className="text-3xl font-bold">Friends on Ostrify</h1><p className="text-muted-foreground">Log in to follow people on Ostrify and see their listening activity.</p><LoginArea className="max-w-60" /></div>;
  return <div className="space-y-8">
    <div><h1 className="text-4xl font-bold">Friends</h1><p className="mt-2 text-muted-foreground">Follow someone on Ostrify to add them as a friend instantly. Artist follows stay separate. Ostrify follows are public on Nostr; existing confirmed friends will be added to this public list.</p>{migrationRunning && <p role="status" className="mt-2 text-sm text-muted-foreground">Moving your existing Ostrify friends to your follow list…</p>}</div>
    {!followedPeople.hasReadRelays && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Enable a read relay in Settings to add Ostrify friends.</p>}
    {friends.isLoading && <p role="status" className="text-sm text-muted-foreground">Checking for existing friends to migrate…</p>}
    {friends.isError && <div role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Existing friends couldn’t be checked for migration. The new follow-based friends list is still available. {friends.error.message} <button type="button" className="underline" onClick={() => void friends.refetch()}>Retry migration check</button></div>}
    {followedPeople.isError && <div role="alert" className="rounded-lg border border-border p-4 text-sm text-destructive">Could not load your friends: {followedPeople.error.message} <button className="underline" onClick={() => void followedPeople.refetch()}>Try again</button></div>}
    {followedPeople.hasReadRelays && !followedPeople.isLoading && !friends.isLoading && !friends.isError && !hasCheckedMigration && !migrationStarted.current && <p className="text-sm text-muted-foreground">Checking for existing friends to migrate…</p>}
    <section className="space-y-3 rounded-xl border border-border/60 bg-secondary/20 p-4 sm:p-5">
      <div><h2 className="text-xl font-semibold">Invite someone to follow you</h2><p className="mt-1 text-sm text-muted-foreground">Enter their Nostr npub to send a private Ostrify invite. They can review your profile and choose to follow you.</p></div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={event => {
        event.preventDefault();
        let recipient: string;
        try {
          const decoded = nip19.decode(inviteIdentifier.trim().replace(/^nostr:/, ""));
          if (decoded.type === "npub") recipient = decoded.data;
          else if (decoded.type === "nprofile") recipient = decoded.data.pubkey;
          else throw new Error("Enter an npub or nprofile.");
        } catch (error) {
          toast({ title: "Invalid Nostr public key", description: error instanceof Error ? error.message : "Enter a valid npub or nprofile.", variant: "destructive" });
          return;
        }
        friends.send.mutate({ peer: recipient, action: "request" }, {
          onSuccess: () => { setInviteIdentifier(""); toast({ title: "Invite sent", description: "Your private Ostrify invite was delivered to their NIP-17 inbox." }); },
          onError: error => toast({ title: "Could not send invite", description: error.message, variant: "destructive" }),
        });
      }}><Input value={inviteIdentifier} onChange={event => setInviteIdentifier(event.target.value)} placeholder="npub1…" aria-label="Nostr public key to invite" autoComplete="off" className="sm:max-w-lg" /><Button type="submit" disabled={friends.send.isPending || !inviteIdentifier.trim()}>{friends.send.isPending ? "Sending…" : "Send invite"}</Button></form>
      {friends.send.isPending && <p role="status" className="text-sm text-muted-foreground">Looking up their NIP-17 inbox and sending your private invite…</p>}
      <p className="text-xs text-muted-foreground">Invites are private Nostr messages. Both you and the recipient need NIP-44 support and NIP-17 DM relays configured.</p>
    </section>
    {friends.isError && <div role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Private invites may be unavailable until your NIP-17 inbox relays are configured. {friends.error.message}</div>}
    <OstrifyDirectory me={user.pubkey} onFollow={addFriend} friendKeys={list} pending={followedPeople.toggle.isPending} />
    {follows.data?.length ? <section className="space-y-3"><h2 className="text-2xl font-semibold">Invite from your Nostr follows</h2><p className="text-sm text-muted-foreground">Send a private Ostrify invite to someone you already follow. They can choose to follow you back; this won’t change your Nostr follow list.</p><div className="max-h-80 space-y-2 overflow-y-auto">{follows.data.filter(pubkey => pubkey !== user.pubkey && !list.includes(pubkey)).map(pubkey => <Person key={pubkey} pubkey={pubkey}><Button size="sm" variant="outline" disabled={friends.send.isPending || outgoingInvites.has(pubkey)} onClick={() => inviteToFollowBack(pubkey)}>{outgoingInvites.has(pubkey) ? 'Invite sent' : friends.send.isPending ? 'Sending…' : 'Invite to follow back'}</Button></Person>)}</div></section> : <p className="text-sm text-muted-foreground">{follows.isLoading ? 'Loading Nostr follows…' : 'No Nostr follows available to add.'}</p>}
      <section className="space-y-3"><h2 className="text-2xl font-semibold">Your friends · {list.length}</h2>{followedPeople.isLoading ? <Skeleton className="h-20 w-full" /> : list.length ? list.map(pubkey => <Person key={pubkey} pubkey={pubkey}><Button size="sm" variant="ghost" disabled={followedPeople.toggle.isPending} onClick={() => removeFriend(pubkey)}>Remove</Button></Person>) : <p className="text-muted-foreground">You haven’t added any friends on Ostrify yet. Search the directory above to get started.</p>}</section>
    <section className="space-y-3"><h2 className="flex items-center gap-2 text-2xl font-semibold"><Radio className="size-5" /> Listening now</h2><p className="text-sm text-muted-foreground">Public music statuses shared by people you follow on Ostrify. Sharing is optional.</p>{statuses.data?.length ? statuses.data.map(status => <div key={status.pubkey} className="space-y-1"><Person pubkey={status.pubkey} /><p className="ml-4 text-sm text-primary">{status.content}</p></div>) : <p className="text-muted-foreground">No friends are sharing a current listening status.</p>}</section>
  </div>;
}

export default function FriendsPage({ profilePubkey }: { profilePubkey?: string }) {
  useSeoMeta({ title: 'Friends — Ostrify' });
  const { nip19: identifier } = useParams<{ nip19: string }>();
  let pubkey: string | undefined = profilePubkey;
  if (!pubkey && identifier) { try { const d = nip19.decode(identifier); if (d.type === 'npub') pubkey = d.data; else if (d.type === 'nprofile') pubkey = d.data.pubkey; } catch { /* invalid */ } }
  return <div className={pubkey ? '' : 'p-4 sm:p-6 max-w-4xl mx-auto'}>{pubkey ? <FriendProfile pubkey={pubkey} /> : identifier ? <p>Profile not found.</p> : <FriendsHome />}</div>;
}
