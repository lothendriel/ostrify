import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Headphones, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SheetHeader } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowedPeople } from '@/hooks/useFollowedPeople';
import { useFriendStatuses } from '@/hooks/useFriendLibrary';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';

function parseListeningStatus(status: string | undefined): { title: string; artist?: string } | undefined {
  if (!status) return undefined;
  const separator = status.lastIndexOf(' — ');
  if (separator < 0) return { title: status.trim() };
  const artist = status.slice(0, separator).trim();
  const title = status.slice(separator + 3).trim();
  return title ? { title, artist: artist || undefined } : { title: status.trim() };
}

function FriendActivity({ pubkey, status, close }: { pubkey: string; status?: string; close: () => void }) {
  const { data } = useAuthor(pubkey);
  const name = data?.metadata?.display_name || data?.metadata?.name || genUserName(pubkey);
  const avatar = sanitizeUrl(data?.metadata?.picture);
  const listening = parseListeningStatus(status);
  return <article className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-2.5">
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-semibold">{avatar ? <img src={avatar} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : name.slice(0, 1)}</div>
    <div className="min-w-0 flex-1">
      <Link to={`/${nip19.npubEncode(pubkey)}`} onClick={close} className="block truncate text-sm font-semibold hover:underline">{name}</Link>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
        <Headphones className={`size-3 shrink-0 ${listening ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
        {listening ? <p className="min-w-0 truncate"><span className="font-medium text-foreground">{listening.title}</span>{listening.artist && <span className="text-muted-foreground"> · {listening.artist}</span>}</p> : <p className="truncate text-muted-foreground">Not listening right now</p>}
      </div>
    </div>
  </article>;
}

function FriendsActivityContent({ close, user, followedPeople, statuses }: { close: () => void; user: ReturnType<typeof useCurrentUser>["user"]; followedPeople: ReturnType<typeof useFollowedPeople>; statuses: ReturnType<typeof useFriendStatuses> }) {
  const friendKeys = followedPeople.people;
  const statusByFriend = new Map((statuses.data ?? []).map(event => [event.pubkey, event.content]));

  return <ScrollArea type="always" className="min-h-0 flex-1 px-4 py-3">
        {!user ? <div className="py-10 text-center"><Users className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">Sign in to see your friends</p><p className="mt-1 text-sm text-muted-foreground">Your Ostrify friends and their listening activity will appear here.</p></div> : !followedPeople.hasReadRelays ? <div className="py-10 text-center"><Users className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">Friends unavailable</p><p className="mt-1 text-sm text-muted-foreground">Enable a read relay to load your friends list.</p><Button type="button" variant="link" onClick={() => void followedPeople.refetch()}>Try again</Button></div> : followedPeople.isLoading ? <div className="space-y-2" aria-label="Loading friends"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : followedPeople.isError ? <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm"><p>Could not load your friends: {followedPeople.error.message}</p><Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => void followedPeople.refetch()}>Try again</Button></div> : !friendKeys.length ? <div className="py-10 text-center"><Users className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">No friends yet</p><p className="mt-1 text-sm text-muted-foreground">Add people on Ostrify to see when they’re listening.</p><Button asChild className="mt-4"><Link to="/friends" onClick={close}>Find friends</Link></Button></div> : <div className="space-y-2">
          <div className="mb-3 flex items-center justify-between text-sm"><span className="font-semibold">Your friends</span><Link to="/friends" onClick={close} className="text-primary hover:underline">Manage friends</Link></div>
          {friendKeys.map(pubkey => <FriendActivity key={pubkey} pubkey={pubkey} status={statusByFriend.get(pubkey)} close={close} />)}
          {statuses.isError && <p role="status" className="text-xs text-muted-foreground">Listening statuses are temporarily unavailable.</p>}
        </div>}
      </ScrollArea>;
}

export function FriendsActivitySheet({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { user } = useCurrentUser();
  const followedPeople = useFollowedPeople();
  const statuses = useFriendStatuses(followedPeople.people, false, false);
  const liveFriendCount = statuses.data?.length ?? 0;
  useEffect(() => {
    if (!user || !open || !followedPeople.hasReadRelays) return;
    void followedPeople.refetch();
  }, [user, open, followedPeople.hasReadRelays, followedPeople.refetch]);

  return <Button type="button" variant="ghost" size="icon" className={`relative rounded-full ${open ? 'bg-accent text-foreground' : ''}`} aria-label={open ? 'Close friends listening activity' : 'Friends listening activity'} aria-pressed={open} title="Friends activity" onClick={onToggle}>
    <Users className="size-5" />
    {liveFriendCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{liveFriendCount > 9 ? '9+' : liveFriendCount}</span>}
  </Button>;
}

export function FriendsActivityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useCurrentUser();
  const followedPeople = useFollowedPeople();
  const statuses = useFriendStatuses(followedPeople.people, open ? 30_000 : false, open);
  return <section className="flex h-full min-w-0 flex-col overflow-hidden bg-card md:rounded-lg md:border md:border-border/70" aria-label="Friends listening activity">
    <SheetHeader className="shrink-0 border-b border-border/70 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><Users className="size-5 text-primary" /> Friends activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">Friends and their current public listening status.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Close friends activity" onClick={onClose}><X className="size-4" /></Button>
        </div>
      </div>
    </SheetHeader>
    {open && <FriendsActivityContent close={onClose} user={user} followedPeople={followedPeople} statuses={statuses} />}
  </section>;
};
