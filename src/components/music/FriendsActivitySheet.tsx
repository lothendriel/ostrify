import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Headphones, LoaderCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-semibold">{avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : name.slice(0, 1)}</div>
    <div className="min-w-0 flex-1">
      <Link to={`/${nip19.npubEncode(pubkey)}`} onClick={close} className="block truncate text-sm font-semibold hover:underline">{name}</Link>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
        <Headphones className={`size-3 shrink-0 ${listening ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
        {listening ? <p className="min-w-0 truncate"><span className="font-medium text-foreground">{listening.title}</span>{listening.artist && <span className="text-muted-foreground"> · {listening.artist}</span>}</p> : <p className="truncate text-muted-foreground">Not listening right now</p>}
      </div>
    </div>
  </article>;
}

function FriendsActivityContent({ close, friendCount, open }: { close: () => void; friendCount: (count: number) => void; open: boolean }) {
  const { user } = useCurrentUser();
  const followedPeople = useFollowedPeople();
  const friendKeys = followedPeople.people;
  useEffect(() => {
    if (!user || !open || !followedPeople.hasReadRelays) return;
    void followedPeople.refetch();
  }, [user, open, followedPeople.hasReadRelays, followedPeople.refetch]);
  useEffect(() => friendCount(friendKeys.length), [friendKeys.length, friendCount]);
  const statuses = useFriendStatuses(friendKeys);
  const statusByFriend = new Map((statuses.data ?? []).map(event => [event.pubkey, event.content]));

  return <ScrollArea type="always" className="min-h-0 flex-1 px-4 py-3">
        {!user ? <div className="py-10 text-center"><Users className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">Sign in to see your friends</p><p className="mt-1 text-sm text-muted-foreground">Your Ostrify friends and their listening activity will appear here.</p></div> : !followedPeople.hasReadRelays ? <div className="py-10 text-center"><Users className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">Friends unavailable</p><p className="mt-1 text-sm text-muted-foreground">Enable a read relay to load your friends list.</p><Button type="button" variant="link" onClick={() => void followedPeople.refetch()}>Try again</Button></div> : followedPeople.isLoading ? <div className="space-y-2" aria-label="Loading friends"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : followedPeople.isError ? <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm"><p>Could not load your friends: {followedPeople.error.message}</p><Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={() => void followedPeople.refetch()}>Try again</Button></div> : !friendKeys.length ? <div className="py-10 text-center"><Users className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">No friends yet</p><p className="mt-1 text-sm text-muted-foreground">Add people on Ostrify to see when they’re listening.</p><Button asChild className="mt-4"><Link to="/friends" onClick={close}>Find friends</Link></Button></div> : <div className="space-y-2">
          <div className="mb-3 flex items-center justify-between text-sm"><span className="font-semibold">Your friends</span><Link to="/friends" onClick={close} className="text-primary hover:underline">Manage friends</Link></div>
          {friendKeys.map(pubkey => <FriendActivity key={pubkey} pubkey={pubkey} status={statusByFriend.get(pubkey)} close={close} />)}
          {statuses.isFetching && <p className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" /> Updating activity…</p>}
          {statuses.isError && <p role="status" className="text-xs text-muted-foreground">Listening statuses are temporarily unavailable.</p>}
        </div>}
      </ScrollArea>;
}

export function FriendsActivitySheet() {
  const [open, setOpen] = useState(false);
  const [friendCount, setFriendCount] = useState(0);

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
      <Button type="button" variant="ghost" size="icon" className="relative rounded-full" aria-label="Friends listening activity" title="Friends activity">
        <Users className="size-5" />
        {friendCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{friendCount > 9 ? '9+' : friendCount}</span>}
      </Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-[min(24rem,90vw)] gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b border-border/70 pr-12">
        <SheetTitle className="flex items-center gap-2"><Users className="size-5 text-primary" /> Friends activity</SheetTitle>
        <SheetDescription>Friends and their current public listening status.</SheetDescription>
      </SheetHeader>
      {open && <FriendsActivityContent close={() => setOpen(false)} friendCount={setFriendCount} open={open} />}
    </SheetContent>
  </Sheet>;
}
