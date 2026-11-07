import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useSeoMeta } from '@unhead/react';
import { Users, UserPlus, Radio, Disc3 } from 'lucide-react';
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
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import { useToast } from '@/hooks/useToast';
import { useOstrifyDirectory, type DirectoryPerson } from '@/hooks/useOstrifyDirectory';

function Person({ pubkey, children }: { pubkey: string; children?: React.ReactNode }) {
  const { data } = useAuthor(pubkey);
  const name = data?.metadata?.display_name || data?.metadata?.name || genUserName(pubkey);
  const image = sanitizeUrl(data?.metadata?.picture);
  return <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3 min-w-0"><div className="size-11 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">{image ? <img src={image} alt="" className="size-full object-cover" /> : <Users className="size-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><Link to={`/friends/${nip19.npubEncode(pubkey)}`} className="font-semibold truncate block hover:underline">{name}</Link><p className="text-xs text-muted-foreground truncate">{nip19.npubEncode(pubkey).slice(0, 18)}…</p></div>{children}</div>;
}

function Artist({ reference }: { reference: string }) {
  const wavlakeId = reference.startsWith('wavlake:') ? reference.slice(8) : undefined;
  const { data: wavlake } = useWavlakeRelease('artist', wavlakeId);
  const { data: author } = useAuthor(wavlakeId ? undefined : reference);
  const name = wavlakeId ? wavlake?.title ?? 'Wavlake artist' : author?.metadata?.display_name || author?.metadata?.name || genUserName(reference);
  const to = wavlakeId ? `/wavlake/artist/${wavlakeId}` : `/${nip19.npubEncode(reference)}`;
  return <Link to={to} className="rounded-lg bg-secondary/50 p-3 hover:bg-secondary truncate"><Disc3 className="size-5 text-primary mb-2" /><span className="font-medium truncate block">{name}</span></Link>;
}

function PublicPlaylist({ title, ids }: { title: string; ids: string[] }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useTracksByIds(open ? ids : undefined);
  return <div className="rounded-lg border border-border p-4"><button className="w-full flex justify-between gap-3 text-left font-semibold hover:text-primary" onClick={() => setOpen(v => !v)} aria-expanded={open}><span>{title}</span><span className="text-sm text-muted-foreground">{ids.length} tracks · {open ? 'Hide' : 'View'}</span></button>{open && <div className="mt-4"><TrackList tracks={data?.tracks ?? []} isLoading={isLoading} emptyMessage="No playable tracks could be loaded from this list." />{!!data?.unavailable && <p className="text-sm text-muted-foreground mt-2">Some tracks could not be loaded.</p>}</div>}</div>;
}

function InvitationOnProfile({ pubkey }: { pubkey: string }) {
  const { user } = useCurrentUser();
  const friends = useFriends();
  const { toast } = useToast();
  if (!user) return <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3"><p className="font-semibold">Friend invitation</p><p className="text-sm text-muted-foreground">Log in with the Nostr account that received the invitation to review it. Opening this link does not create a friendship.</p><LoginArea className="max-w-60" /></div>;
  if (user.pubkey === pubkey) return <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">This is your own profile. Sign in with the account that received the invitation to review it.</p>;
  if (friends.isLoading) return <div className="space-y-2" aria-label="Checking friend requests"><Skeleton className="h-4 w-40" /><Skeleton className="h-12 w-full" /></div>;
  if (friends.isError) return <div role="alert" className="rounded-xl border border-border p-4 text-sm">Could not check your private invitations: {friends.error.message} <button type="button" className="text-primary underline" onClick={() => void friends.refetch()}>Try again</button></div>;
  const requests = (friends.data?.incoming ?? []).filter(request => request.from === pubkey && request.to === user.pubkey);
  if (friends.data?.friends.some(friend => friend.pubkey === pubkey)) return <p className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">You are already Ostrify friends.</p>;
  if (!requests.length) return <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No pending invitation from this profile was found in your private messages. Check you’re logged in with the account that received it, then <button type="button" className="text-primary underline" onClick={() => void friends.refetch()}>check again</button>.</div>;
  return <section className="rounded-xl border border-primary/30 bg-secondary/30 p-4 space-y-3"><h2 className="font-semibold">Ostrify friend request</h2><p className="text-sm text-muted-foreground">This request was found in your private Nostr messages. Choose whether to accept it.</p>{requests.map(request => <div key={request.id} className="flex flex-wrap gap-2"><Button type="button" disabled={friends.send.isPending} onClick={() => friends.send.mutate({ peer: request.from, action: 'accept', token: request.token }, { onSuccess: () => toast({ title: 'Friend request accepted' }), onError: error => toast({ title: 'Could not accept', description: error.message, variant: 'destructive' }) })}>Accept request</Button><Button type="button" variant="outline" disabled={friends.send.isPending} onClick={() => friends.send.mutate({ peer: request.from, action: 'decline', token: request.token }, { onSuccess: () => toast({ title: 'Friend request declined' }), onError: error => toast({ title: 'Could not decline', description: error.message, variant: 'destructive' }) })}>Decline</Button></div>)}</section>;
}

function FriendProfile({ pubkey }: { pubkey: string }) {
  const library = useFriendLibrary(pubkey);
  const [params] = useSearchParams();
  return <div className="space-y-6"><Link to="/friends" className="text-sm text-muted-foreground hover:underline">← Friends</Link><Person pubkey={pubkey} />{params.has('invite') && <InvitationOnProfile pubkey={pubkey} />}<p className="text-sm text-muted-foreground">Public music library. Visibility and availability depend on the publisher and their relays.</p>
    {library.isLoading ? <Skeleton className="h-40 w-full" /> : library.isError ? <p role="alert">Could not load this library. <button className="underline" onClick={() => void library.refetch()}>Try again</button></p> : <>
      <section className="space-y-3"><h2 className="text-2xl font-bold">Public playlists & liked songs</h2>{library.data?.playlists.length ? library.data.playlists.map(p => <PublicPlaylist key={p.id} title={p.title} ids={p.tracks} />) : <p className="text-muted-foreground">No public playlists found.</p>}</section>
      <section className="space-y-3"><h2 className="text-2xl font-bold">Followed artists</h2>{library.data?.artists.length ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{library.data.artists.map(ref => <Artist key={ref} reference={ref} />)}</div> : <p className="text-muted-foreground">No public followed artists found.</p>}</section>
    </>}
  </div>;
}

function OstrifyDirectory({ me, invite, pending, friendKeys }: { me: string; invite: (pubkey: string) => void; pending: boolean; friendKeys: string[] }) {
  const directory = useOstrifyDirectory();
  const [term, setTerm] = useState('');
  const people = (directory.data ?? []).filter(person => person.pubkey !== me && person.name.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()));
  return <section className="space-y-4">
    <div><h2 className="text-2xl font-semibold">Find people on Ostrify</h2><p className="text-sm text-muted-foreground mt-1">People who opted into the public directory. Search covers the listings returned by your read relays, so it may be incomplete. <Link to="/settings" className="text-primary underline">Manage your visibility</Link>.</p></div>
    <Input value={term} onChange={event => setTerm(event.target.value)} placeholder="Search by name" aria-label="Search Ostrify directory by name" maxLength={100} />
    {!directory.hasReadRelays ? <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Enable a read relay in Settings to search the directory.</div> : directory.isLoading ? <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div> : directory.isError ? <div role="alert" className="rounded-lg border border-border p-4 text-sm">Could not load the directory from your relays. <button type="button" className="text-primary underline" onClick={() => void directory.refetch()}>Try again</button></div> : people.length === 0 ? <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{term.trim() ? 'No matching people in the listings loaded from your relays.' : 'No other discoverable Ostrify users found on your read relays yet.'}</div> : <div className="grid gap-3 sm:grid-cols-2">{people.map(person => <DirectoryResult key={person.pubkey} person={person} invite={invite} pending={pending} isFriend={friendKeys.includes(person.pubkey)} />)}</div>}
  </section>;
}

function DirectoryResult({ person, invite, pending, isFriend }: { person: DirectoryPerson; invite: (pubkey: string) => void; pending: boolean; isFriend: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3 min-w-0">
      <Link
        to={`/friends/${nip19.npubEncode(person.pubkey)}`}
        aria-label={`View ${person.name}'s Ostrify profile`}
        className="group flex flex-1 min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="size-12 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
          {person.picture ? <img src={person.picture} alt="" loading="lazy" className="size-full object-cover" /> : <Users className="size-5 text-muted-foreground" />}
        </div>
        <span className="min-w-0 font-semibold truncate group-hover:underline">{person.name}</span>
      </Link>
      <Button size="sm" variant="outline" disabled={pending || isFriend} onClick={() => invite(person.pubkey)}>{isFriend ? 'Friends' : 'Invite'}</Button>
    </div>
  );
}

function FriendsHome() {
  const { user } = useCurrentUser();
  const friends = useFriends(); const follows = useNostrFollows();
  const [input, setInput] = useState(''); const [params] = useSearchParams();
  const { toast } = useToast();
  const list = friends.data?.friends ?? [];
  const statuses = useFriendStatuses(list.map(f => f.pubkey));
  const invite = (peer: string) => friends.send.mutate({ peer, action: 'request' }, { onSuccess: () => toast({ title: 'Invitation sent', description: 'Your friend must accept it in Ostrify.' }), onError: error => toast({ title: 'Invitation not completed', description: error.message, variant: 'destructive' }) });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try { const decoded = nip19.decode(input.trim()); if (decoded.type !== 'npub' && decoded.type !== 'nprofile') throw new Error(); invite(decoded.type === 'npub' ? decoded.data : decoded.data.pubkey); }
    catch { toast({ title: 'Enter a valid npub or nprofile', variant: 'destructive' }); }
  };
  if (!user) return <div className="text-center py-20 space-y-4"><Users className="size-12 text-primary mx-auto" /><h1 className="text-3xl font-bold">Friends on Ostrify</h1><p className="text-muted-foreground">Log in to send and receive private invitations.</p><LoginArea className="max-w-60" /></div>;
  return <div className="space-y-8"><div><h1 className="text-4xl font-bold">Friends</h1><p className="text-muted-foreground mt-2">Connect with people you know, independently of your Nostr follow list.</p></div>
    {params.has('invite') && <p className="rounded-lg bg-secondary p-4 text-sm">Open your private invitation below to accept it. The link alone does not create a friendship.</p>}
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Invite a friend</h2><p className="text-sm text-muted-foreground">Invitations are encrypted Nostr messages. Both people need NIP-17 DM relays configured in a Nostr messaging client.</p><form onSubmit={submit} className="flex flex-wrap gap-2"><Input value={input} onChange={e => setInput(e.target.value)} placeholder="Paste an npub or nprofile" aria-label="Friend's npub" className="flex-1 min-w-48" /><Button disabled={friends.send.isPending}><UserPlus className="size-4" /> Send invitation</Button></form>
      {follows.data?.length ? <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Choose from your Nostr follows</summary><div className="space-y-2 max-h-80 overflow-y-auto mt-3">{follows.data.map(pk => <Person key={pk} pubkey={pk}><Button size="sm" variant="outline" disabled={friends.send.isPending || list.some(f => f.pubkey === pk)} onClick={() => invite(pk)}>Invite</Button></Person>)}</div></details> : <p className="text-sm text-muted-foreground">{follows.isLoading ? 'Loading follows…' : 'No Nostr follows found on your read relays.'}</p>}
    </section>
    <OstrifyDirectory me={user.pubkey} invite={invite} pending={friends.send.isPending} friendKeys={list.map(friend => friend.pubkey)} />
    {friends.isLoading && <Skeleton className="h-32 w-full" />}
    {friends.isError && <div role="alert" className="rounded-lg border p-4 text-sm text-destructive">{friends.error.message} <button className="underline" onClick={() => void friends.refetch()}>Retry</button></div>}
    {!!friends.data?.incoming.length && <section className="space-y-3"><h2 className="text-2xl font-semibold">Friend requests</h2>{friends.data.incoming.map(req => <Person key={req.id} pubkey={req.from}><div className="flex gap-2"><Button size="sm" disabled={friends.send.isPending} onClick={() => friends.send.mutate({ peer: req.from, action: 'accept', token: req.token }, { onError: error => toast({ title: 'Could not accept', description: error.message, variant: 'destructive' }) })}>Accept</Button><Button size="sm" variant="outline" disabled={friends.send.isPending} onClick={() => friends.send.mutate({ peer: req.from, action: 'decline', token: req.token }, { onError: error => toast({ title: 'Could not decline', description: error.message, variant: 'destructive' }) })}>Decline</Button></div></Person>)}</section>}
    <section className="space-y-3"><h2 className="text-2xl font-semibold">Your friends</h2>{list.length ? list.map(friend => <Person key={friend.pubkey} pubkey={friend.pubkey}><Button size="sm" variant="ghost" disabled={friends.send.isPending} onClick={() => { if (window.confirm('Remove this Ostrify friend?')) friends.send.mutate({ peer: friend.pubkey, action: 'remove' }, { onError: error => toast({ title: 'Could not remove friend', description: error.message, variant: 'destructive' }) }); }}>Remove</Button></Person>) : !friends.isLoading && <p className="text-muted-foreground">No confirmed friends yet. Send an invitation to get started.</p>}</section>
    <section className="space-y-3"><h2 className="text-2xl font-semibold flex items-center gap-2"><Radio className="size-5" /> Listening now</h2><p className="text-sm text-muted-foreground">Public music statuses shared by your friends. Sharing is optional.</p>{statuses.data?.length ? statuses.data.map(status => <div key={status.pubkey} className="space-y-1"><Person pubkey={status.pubkey} /><p className="ml-4 text-sm text-primary">{status.content}</p></div>) : <p className="text-muted-foreground">No friends are sharing a current listening status.</p>}</section>
  </div>;
}

export default function FriendsPage() {
  useSeoMeta({ title: 'Friends — Ostrify' });
  const { nip19: identifier } = useParams<{ nip19: string }>();
  let pubkey: string | undefined;
  if (identifier) { try { const d = nip19.decode(identifier); if (d.type === 'npub') pubkey = d.data; else if (d.type === 'nprofile') pubkey = d.data.pubkey; } catch { /* invalid */ } }
  return <div className="p-4 sm:p-6 max-w-4xl mx-auto">{identifier ? pubkey ? <FriendProfile pubkey={pubkey} /> : <p>Profile not found.</p> : <FriendsHome />}</div>;
}
