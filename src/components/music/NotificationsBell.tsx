import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Bell, UserRoundPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

type FollowNotification = {
  id: string;
  pubkey: string;
  createdAt: number;
  read: boolean;
};

type NotificationStore = {
  initialized: boolean;
  knownFollowers: string[];
  notifications: FollowNotification[];
};

const STORAGE_KEY_PREFIX = 'ostrify-device-notifications-v1:';
const EMPTY_STORE: NotificationStore = { initialized: false, knownFollowers: [], notifications: [] };
const HEX_PUBKEY = /^[0-9a-f]{64}$/;
const OSTRIFY_FOLLOW_SET_IDS = ['ostrify-artists', 'ostrify-people'];

function readStore(pubkey: string): NotificationStore {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${pubkey}`);
    if (!raw) return EMPTY_STORE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return EMPTY_STORE;
    const value = parsed as Record<string, unknown>;
    const knownFollowers = Array.isArray(value.knownFollowers)
      ? value.knownFollowers.filter((key): key is string => typeof key === 'string' && HEX_PUBKEY.test(key))
      : [];
    const notifications = Array.isArray(value.notifications)
      ? value.notifications.filter((item): item is FollowNotification => {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
          const notification = item as Record<string, unknown>;
          return typeof notification.id === 'string' &&
            typeof notification.pubkey === 'string' && HEX_PUBKEY.test(notification.pubkey) &&
            typeof notification.createdAt === 'number' && Number.isSafeInteger(notification.createdAt) && notification.createdAt > 0 &&
            typeof notification.read === 'boolean';
        }).slice(0, 100)
      : [];
    return { initialized: value.initialized === true, knownFollowers, notifications };
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(pubkey: string, store: NotificationStore): void {
  try {
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${pubkey}`, JSON.stringify(store));
  } catch {
    // Notifications still work for this session when storage is unavailable.
  }
}

function FollowNotificationRow({ notification, close }: { notification: FollowNotification; close: () => void }) {
  const author = useAuthor(notification.pubkey);
  const metadata = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(notification.pubkey);
  const avatar = sanitizeUrl(metadata?.picture);

  return <article className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-sm font-semibold">
      {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : name.slice(0, 1)}
    </div>
    <div className="min-w-0 flex-1">
      <Link to={`/${nip19.npubEncode(notification.pubkey)}`} onClick={close} className="font-semibold hover:underline">{name}</Link>
      <p className="text-sm text-muted-foreground">followed you on Ostrify</p>
      <time className="text-xs text-muted-foreground" dateTime={new Date(notification.createdAt * 1000).toISOString()}>
        {new Date(notification.createdAt * 1000).toLocaleString()}
      </time>
    </div>
    {!notification.read && <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-primary" />}
  </article>;
}

export function NotificationsBell() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const [open, setOpen] = useState(false);
  const [accountStore, setAccountStore] = useState<{ pubkey: string; store: NotificationStore } | null>(() =>
    user ? { pubkey: user.pubkey, store: readStore(user.pubkey) } : null,
  );
  const readRelays = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort();
  const relayKey = readRelays.join('|');
  const followQuery = useQuery({
    queryKey: ['ostrify-notifications-follow-events', user?.pubkey ?? '', relayKey],
    enabled: !!user && !!relayKey,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const candidateEvents = await nostr.query(
        [{ kinds: [30000], '#p': [user.pubkey], '#d': OSTRIFY_FOLLOW_SET_IDS, limit: 500 }],
        { signal: querySignal },
      );
      const candidateAuthors = [...new Set(candidateEvents
        .filter(event => event.kind === 30000 && event.pubkey !== user.pubkey &&
          OSTRIFY_FOLLOW_SET_IDS.some(id => event.tags.some(([name, value]) => name === 'd' && value === id)) &&
          event.tags.some(([name, value]) => name === 'p' && value === user.pubkey))
        .map(event => event.pubkey))];
      if (!candidateAuthors.length) return [];
      const currentSets = await nostr.query(
        candidateAuthors.map(author => ({ kinds: [30000], authors: [author], '#d': OSTRIFY_FOLLOW_SET_IDS, limit: 10 })),
        { signal: querySignal },
      );
      const latestSetsByAuthor = new Map<string, Map<string, NostrEvent>>();
      for (const event of currentSets) {
        if (event.kind !== 30000) continue;
        const setId = event.tags.find(([name, value]) => name === 'd' && OSTRIFY_FOLLOW_SET_IDS.includes(value ?? ''))?.[1];
        if (!setId) continue;
        const sets = latestSetsByAuthor.get(event.pubkey) ?? new Map<string, NostrEvent>();
        const existing = sets.get(setId);
        if (!existing || event.created_at > existing.created_at) sets.set(setId, event);
        latestSetsByAuthor.set(event.pubkey, sets);
      }
      const currentFollowers = [...latestSetsByAuthor].flatMap(([author, sets]) =>
        [...sets.values()]
          .filter(event => event.tags.some(([name, value]) => name === 'p' && value === user.pubkey))
          .map(event => ({ id: event.id, pubkey: author, created_at: event.created_at })),
      );
      const latestNotificationByAuthor = new Map<string, { id: string; pubkey: string; created_at: number }>();
      for (const event of currentFollowers) {
        const existing = latestNotificationByAuthor.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) latestNotificationByAuthor.set(event.pubkey, event);
      }
      return [...latestNotificationByAuthor.values()];
    },
  });

  useEffect(() => {
    if (!user) {
      setAccountStore(null);
      return;
    }
    setAccountStore({ pubkey: user.pubkey, store: readStore(user.pubkey) });
  }, [user?.pubkey]);

  useEffect(() => {
    if (!user || !followQuery.data) return;
    const previous = readStore(user.pubkey);
    const currentAuthors = [...new Set(followQuery.data.map(event => event.pubkey))];
    const newNotifications = previous.initialized
      ? followQuery.data
          .filter(event => !previous.knownFollowers.includes(event.pubkey))
          .map(event => ({ id: event.id, pubkey: event.pubkey, createdAt: event.created_at, read: false }))
      : [];
    const notifications = [...newNotifications, ...previous.notifications]
      .filter((notification, index, all) => all.findIndex(item => item.id === notification.id) === index)
      .slice(0, 100);
    const next: NotificationStore = {
      initialized: true,
      knownFollowers: [...new Set([...previous.knownFollowers, ...currentAuthors])],
      notifications,
    };
    writeStore(user.pubkey, next);
    setAccountStore({ pubkey: user.pubkey, store: next });
  }, [user?.pubkey, followQuery.data]);

  const store = accountStore && accountStore.pubkey === user?.pubkey ? accountStore.store : EMPTY_STORE;
  const unreadCount = store.notifications.filter(notification => !notification.read).length;

  const markAllRead = () => {
    if (!user) return;
    const next = { ...store, notifications: store.notifications.map(notification => ({ ...notification, read: true })) };
    writeStore(user.pubkey, next);
    setAccountStore({ pubkey: user.pubkey, store: next });
  };

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative rounded-full"
        aria-label={`Ostrify notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        title="Ostrify notifications"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-[min(24rem,90vw)] gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b border-border/70 pr-12">
        <div className="flex items-center justify-between gap-3">
          <SheetTitle className="flex items-center gap-2"><Bell className="size-5 text-primary" /> Ostrify notifications</SheetTitle>
          {unreadCount > 0 && <Button type="button" variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>}
        </div>
        <SheetDescription>Updates from Ostrify, saved only on this device.</SheetDescription>
      </SheetHeader>
      <ScrollArea type="always" className="min-h-0 flex-1 px-4 py-4">
        {!user ? <div className="py-10 text-center"><Bell className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">Sign in for notifications</p><p className="mt-1 text-sm text-muted-foreground">Ostrify follow notifications will appear here.</p></div>
          : !relayKey ? <div className="py-10 text-center"><Bell className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">Notifications unavailable</p><p className="mt-1 text-sm text-muted-foreground">Enable a read relay to check for Ostrify follows.</p></div>
            : followQuery.isLoading ? <div className="space-y-3" aria-label="Loading notifications"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
              : followQuery.isError ? <div role="alert" className="py-8 text-center"><p className="font-semibold">Could not check for new follows</p><p className="mt-1 text-sm text-muted-foreground">Your saved notifications are still available below.</p><Button type="button" variant="link" onClick={() => void followQuery.refetch()}>Try again</Button>{store.notifications.length > 0 && <div className="mt-4 space-y-3">{store.notifications.map(notification => <FollowNotificationRow key={notification.id} notification={notification} close={() => setOpen(false)} />)}</div>}</div>
                : store.notifications.length > 0 ? <div className="space-y-3">{store.notifications.map(notification => <FollowNotificationRow key={notification.id} notification={notification} close={() => setOpen(false)} />)}</div>
                  : <div className="py-10 text-center"><UserRoundPlus className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">You’re all caught up</p><p className="mt-1 text-sm text-muted-foreground">When someone follows you on Ostrify, it’ll show up here.</p></div>}
      </ScrollArea>
    </SheetContent>
  </Sheet>;
}
