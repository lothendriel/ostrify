import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, Menu, RefreshCw, MessageCircle, Send, X } from "lucide-react";
import { ConcordClient, KeyValue, Helpers, type ConcordChannel, type ConcordChannelMessage, type ConcordCommunity, type ConcordStorage } from '@jsr/applesauce__concord';
import { useNostr } from '@nostrify/react';
import { verifyEvent } from 'nostr-tools';
import { queryLibraryEvents } from '@/lib/libraryQuery';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/sanitize';
import { Textarea } from '@/components/ui/textarea';
import { usePreviousLocation } from "@/components/NavigationHistory";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoginArea } from "@/components/auth/LoginArea";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./QueuePanel";
import { FriendsActivityPanel, FriendsActivitySheet } from "./FriendsActivitySheet";
import { NotificationsBell, NotificationsPanel } from "./NotificationsBell";
import { GlobalSearch } from "./GlobalSearch";
import { useTunestrPlayer } from "./TunestrPlayer";
import { useIsMobile } from '@/hooks/useIsMobile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowedPeople } from '@/hooks/useFollowedPeople';
import { useFriendStatuses } from '@/hooks/useFriendLibrary';
import { useQueryClient } from '@tanstack/react-query';
import { HomeSessionProvider } from '@/contexts/HomeSessionContext';
import { useAppContext } from '@/hooks/useAppContext';
import { getUserRelayUrls } from '@/lib/appRelays';

const ARMADA_INVITE = 'https://armada.buzz/invite/naddr1qvzqqqyzz5pzql6aq5wf4zcwmwwx5t3stdx5f9ap9f02yjxsl6vsxew89wtx7xn7qqqqcz4j64#BAADAQIDgJVjMH_fET-ZLuuQN4DYNw';
const CONCORD_RELAYS = ['wss://jskitty.com/nostr', 'wss://asia.vectorapp.io/nostr', 'wss://relay.ditto.pub', 'wss://relay.dreamith.to'];
const CHAT_MEMBERSHIP_PREFIX = 'ostrify-armada-chat-joined-v1:';
const CHAT_CACHE_PREFIX = 'ostrify-armada-cache-v1:';
const CHAT_DEBUG_KEY = 'ostrify-armada-timing';

// Only the SDK's signed, NIP-44 encrypted list fragments are durable. Its
// membership mirror and recovery records may contain keys and stay in memory.
function createChatStorage(pubkey: string): ConcordStorage {
  const memory = KeyValue.memoryStorage();
  const fragmentKey = `concord:list-fragments:${pubkey}`;
  const cacheKey = `${CHAT_CACHE_PREFIX}fragments:${pubkey}`;
  return {
    async getItem(key) {
      if (key !== fragmentKey) return memory.getItem(key);
      try { return localStorage.getItem(cacheKey); } catch { return null; }
    },
    async setItem(key, value) {
      if (key !== fragmentKey) return memory.setItem(key, value);
      try { localStorage.setItem(cacheKey, value); } catch { /* Relays remain the source of truth. */ }
    },
    async removeItem(key) {
      if (key !== fragmentKey) return memory.removeItem(key);
      try { localStorage.removeItem(cacheKey); } catch { /* Storage may be unavailable. */ }
    },
  };
}

function chatTiming(label: string, startedAt: number, details?: object): void {
  try {
    if (localStorage.getItem(CHAT_DEBUG_KEY) === '1') {
      console.info('[Armada timing]', label, `${Math.round(performance.now() - startedAt)}ms`, details ?? '');
    }
  } catch { /* Timing diagnostics are optional. */ }
}

function readJoinedCommunity(pubkey: string): string | null {
  try {
    const id = localStorage.getItem(`${CHAT_MEMBERSHIP_PREFIX}${pubkey}`);
    return id && /^[0-9a-f]{64}$/.test(id) ? id : null;
  } catch { return null; }
}

function rememberJoinedCommunity(pubkey: string, communityId: string): void {
  try { localStorage.setItem(`${CHAT_MEMBERSHIP_PREFIX}${pubkey}`, communityId); } catch { /* Chat remains available until the tab closes. */ }
}

type ChatUser = NonNullable<ReturnType<typeof useCurrentUser>['user']>;

function ChatMessage({ message }: { message: ConcordChannelMessage }) {
  const { data } = useAuthor(message.rumor.pubkey);
  const name = data?.metadata?.display_name || data?.metadata?.name || genUserName(message.rumor.pubkey);
  const date = new Date(message.rumor.created_at * 1000);
  const validDate = Number.isFinite(date.getTime());
  return <article className="min-w-0 rounded-lg bg-secondary/40 p-3">
    <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{name}</span>{validDate && <time className="shrink-0 text-xs text-muted-foreground" dateTime={date.toISOString()}>{date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>}</div>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.content}</p>
    {message.edit && <span className="text-xs text-muted-foreground">Edited</span>}
  </article>;
}

function ArmadaChatPanel({ user, onClose }: { user: ChatUser; onClose: () => void }) {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const clientRef = useRef<ConcordClient | null>(null);
  const syncStartedAt = useRef<number | null>(null);
  const subscriptionsRef = useRef<Array<{ unsubscribe: () => void }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ConcordChannel | null>(null);
  const alive = useRef(true);
  const startedRef = useRef(false);
  const [savedCommunityId] = useState(() => readJoinedCommunity(user.pubkey));
  const [phase, setPhase] = useState<'intro' | 'joining' | 'connected' | 'error'>(() => savedCommunityId ? 'joining' : 'intro');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState<ConcordChannel | null>(null);
  const [messages, setMessages] = useState<ConcordChannelMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; channelRef.current = null; subscriptionsRef.current.forEach(subscription => subscription.unsubscribe()); subscriptionsRef.current = []; clientRef.current?.dispose(); clientRef.current = null; };
  }, []);

  useEffect(() => {
    if (!channel) return;
    let measured = false;
    const subscription = channel.messages$.subscribe(next => {
      if (!measured && next.length && syncStartedAt.current !== null) {
        measured = true;
        chatTiming('First messages', syncStartedAt.current, { count: next.length });
      }
      setMessages(next);
    });
    return () => subscription.unsubscribe();
  }, [channel]);

  useEffect(() => {
    const viewport = messagesEndRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [channel, messages.length]);

  const join = useCallback(async (restore = false) => {
    if (!user.signer.nip44) { setError('Your signer must support NIP-44 encryption to join this chat.'); setPhase('error'); return; }
    setPhase('joining'); setError(''); setNotice(''); setStatus('Connecting to community relays…');
    const userRelays = getUserRelayUrls(config.userRelayMetadata, config.userRelayPubkey, user.pubkey, 'read', config.excludedUserRelayUrls, config.excludedUserRelayPubkey);
    const relays = [...new Set([...CONCORD_RELAYS, ...config.relayMetadata.relays.filter(relay => relay.read || relay.write).map(relay => relay.url), ...userRelays])];
    const startedAt = performance.now();
    syncStartedAt.current = startedAt;
    const client = new ConcordClient({ signer: user.signer, relays, storage: createChatStorage(user.pubkey), autoUnlock: true, autoSaveCommunityList: false, watchDirectInvites: false });
    clientRef.current = client;
    try {
      // First-time invite discovery runs alongside the account-list sync rather
      // than waiting for it and then waiting for a second relay pool timeout.
      const parsed = Helpers.parseInviteLink(ARMADA_INVITE);
      const inviteRead = restore ? null : queryLibraryEvents(nostr, parsed.bootstrapRelays, [{ kinds: [33301], authors: [parsed.linkSigner] }], AbortSignal.timeout(8000)).then(result => {
        chatTiming('Invite lookup', startedAt, { completed: result.completedRelays.length, incomplete: result.incompleteRelays.length });
        return result;
      });
      const startup = client.start().then(() => chatTiming('Account startup', startedAt));
      const [result] = await Promise.all([inviteRead, startup]);
      if (!alive.current) return;
      let community: ConcordCommunity;
      if (restore && savedCommunityId) {
        const restored = client.getCommunity(savedCommunityId);
        if (!restored) throw new Error('Your saved community could not be restored from your relays. Check your connection and try again.');
        community = restored;
        chatTiming('Community restored', startedAt);
      } else {
        if (!result) throw new Error('The invite could not be checked.');
        setStatus('Checking the invite and joining…');
        if (!result.complete) setNotice('Some invite relays did not respond; a newer revocation may not have been seen.');
        const events = result.events.filter(event => event.kind === 33301 && event.pubkey === parsed.linkSigner && event.tags.some(tag => tag[0] === 'd' && tag[1] === '') && verifyEvent(event))
          .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
        const winner = events[0];
        if (!winner) throw new Error('The invite was not found on the responding relays. Please try again.');
        if (Helpers.isInviteBundleRevoked(winner)) throw new Error('This invite has been revoked. A new invite is needed.');
        const bundle = Helpers.validateInviteBundle(Helpers.getInviteBundle(winner, parsed.token));
        if (!bundle) throw new Error('The invite could not be verified.');
        community = await client.joinByBundle(bundle);
        chatTiming('Community joined', startedAt);
        rememberJoinedCommunity(user.pubkey, community.communityId);
      }
      if (!alive.current) return;
      const updateChannel = () => {
        const state = community.state$.value;
        const matches = state.channels.filter(item => item.name.toLowerCase() === 'ostrify-site-chat');
        setCanSend(!state.banlist.has(user.pubkey) && !state.dissolved);
        if (matches.length !== 1) { channelRef.current = null; setChannel(null); return; }
        const next = community.getChannel(matches[0].channel_id) ?? null;
        if (channelRef.current !== next) { channelRef.current = next; setChannel(next); setMessages([]); }
      };
      const channelsSub = community.state$.subscribe(updateChannel);
      let recordedLive = false;
      const statusSub = community.status$.subscribe(value => {
        if (!alive.current) return;
        if (!recordedLive && value.phase === 'live' && value.connected) {
          recordedLive = true;
          chatTiming('Chat ready', startedAt);
        }
        setLive(value.phase === 'live' && value.connected);
        setStatus(value.error ? `Chat sync error: ${value.error}` : value.phase === 'live' ? (value.connected ? 'Connected' : 'Relay connection unavailable') : `Syncing community (${value.phase})…`);
      });
      const diagnosticsSub = community.diagnostics$.subscribe(diagnostic => {
        if (alive.current && diagnostic.stage === 'plane-publish' && diagnostic.plane === 'channel') setError('The message may not have reached a relay. Check your connection before retrying.');
      });
      subscriptionsRef.current.push(channelsSub, statusSub, diagnosticsSub);
      setPhase('connected');
    } catch (cause) {
      chatTiming('Startup failed', startedAt);
      client.dispose(); if (clientRef.current === client) clientRef.current = null;
      if (alive.current) { setError(cause instanceof Error ? cause.message : 'Unable to connect to Armada.'); setPhase('error'); }
    }
  }, [config, nostr, savedCommunityId, user]);

  useEffect(() => {
    if (savedCommunityId && !startedRef.current) {
      startedRef.current = true;
      void join(true);
    }
  }, [join, savedCommunityId]);

  const send = async () => {
    const body = text.trim();
    if (!body || !channel || sending || !canSend || !live || channel.community.phase$.value !== 'live' || channel.community.state$.value.banlist.has(user.pubkey)) return;
    setSending(true); setError('');
    try { await channel.sendMessage({ text: body }); if (alive.current) setText(''); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not send message.'); }
    finally { if (alive.current) setSending(false); }
  };

  return <section aria-label="Ostrify Armada chat" className="flex h-full min-w-0 flex-col overflow-hidden bg-card md:rounded-lg md:border md:border-border/70">
    <div className="flex items-start justify-between gap-2 border-b border-border/70 px-4 py-4">
      <div><h2 className="flex items-center gap-2 font-semibold"><MessageCircle className="size-5 text-primary" /> Ostrify Armada</h2><p className="mt-1 text-sm text-muted-foreground">#ostrify-site-chat · Community chat</p></div>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Close chat" onClick={onClose}><X className="size-4" /></Button>
    </div>
    {phase === 'intro' || phase === 'error' ? <div className="space-y-4 overflow-y-auto p-4">
      <p className="text-sm text-muted-foreground">Join the Ostrify Armada community to chat in #ostrify-site-chat with your Nostr identity.</p>
      <p className="text-sm text-muted-foreground">This invite is public. Anyone with it can join and read messages in the channels it grants. Joining publishes your membership and an encrypted community list using your signer.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={() => void join(Boolean(savedCommunityId))}>{phase === 'error' ? 'Try again' : 'Join chat'}</Button>
    </div> : phase === 'joining' ? <div className="p-4 text-sm text-muted-foreground" role="status">{status}</div> : <>
      <div role="status" className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">{status}{notice && <p className="mt-1">{notice}</p>}</div>
      <ScrollArea type="always" className="min-h-0 flex-1 px-4 py-3"><div className="space-y-2">
        {!channel ? <p className="text-sm text-muted-foreground">Waiting for the #ostrify-site-chat channel. If it doesn’t appear, check the invite and relay connections.</p> : messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages loaded yet. Relay results may take a moment.</p> : [...messages].reverse().slice(-100).map(message => <ChatMessage key={message.rumor.id} message={message} />)}
      <div ref={messagesEndRef} /></div></ScrollArea>
      <div className="space-y-2 border-t border-border/70 p-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!canSend && <p className="text-xs text-muted-foreground">Messaging is unavailable for this account or community.</p>}
        <Textarea aria-label="Message #ostrify-site-chat" placeholder="Message #ostrify-site-chat" value={text} maxLength={4000} onChange={event => setText(event.target.value)} disabled={!channel || !canSend || !live || sending} />
        <Button className="w-full" disabled={!channel || !canSend || !live || !text.trim() || sending} onClick={() => void send()}><Send className="size-4" /> {sending ? 'Sending…' : 'Send message'}</Button>
      </div>
    </>}
  </section>;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatOpenedFor, setChatOpenedFor] = useState<string | null>(null);
  const { setContentPane, expanded } = useTunestrPlayer();
  const queryClient = useQueryClient();
  const [homeSessionScope] = useState(() => crypto.randomUUID());
  const previousHomeAccount = useRef<string | undefined>(undefined);
  const [activePanel, setActivePanel] = useState<'friends' | 'queue' | 'notifications' | 'chat' | null>(null);
  const { pathname } = useLocation();
  const friendsPageOpen = pathname === '/friends';
  const { user } = useCurrentUser();
  const accountScope = `${homeSessionScope}:${user?.pubkey ?? 'public'}`;
  useEffect(() => {
    const previousScope = previousHomeAccount.current;
    previousHomeAccount.current = accountScope;
    if (previousScope && previousScope !== accountScope) {
      void queryClient.removeQueries({ queryKey: ['home-session', previousScope] });
    }
  }, [accountScope, queryClient]);
  const followedPeople = useFollowedPeople();
  const friendKey = followedPeople.people.join('|');
  const statuses = useFriendStatuses(followedPeople.people, friendsPageOpen ? 30_000 : activePanel === 'friends' ? 30_000 : 60_000);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { previousTo } = usePreviousLocation();
  useEffect(() => {
    if ((!friendsPageOpen && activePanel !== 'friends') || !user || !followedPeople.hasReadRelays || !followedPeople.people.length) return;
    void statuses.refetch();
  }, [friendsPageOpen, activePanel, user, followedPeople.hasReadRelays, friendKey, statuses.refetch]);
  const togglePanel = (panel: 'friends' | 'queue' | 'notifications' | 'chat') => {
    if (panel === 'chat' && user) setChatOpenedFor(user.pubkey);
    setActivePanel(current => current === panel ? null : panel);
  };
  const visiblePanel = activePanel === 'chat' && !user ? null : activePanel;
  const shouldMountChat = !!user && (chatOpenedFor === user.pubkey || !!readJoinedCommunity(user.pubkey));

  return (
    <div className="ostrify-shell fixed inset-x-0 top-0 flex h-svh flex-col overflow-hidden text-foreground">
      <div className="flex-1 flex min-h-0 gap-0 md:gap-2 md:p-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex shrink-0 h-full min-h-0">
          <Sidebar />
        </aside>

        {/* Main content and docked utility panels */}
        <div className="flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden md:gap-2">
        <div className="ostrify-main relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:rounded-2xl">
          <div aria-hidden="true" className="ostrify-atmosphere pointer-events-none absolute inset-x-0 top-0 z-0 h-[500px]" />
          {/* Top bar */}
          <header className="ostrify-header relative z-10 flex h-auto shrink-0 flex-col gap-1 border-b px-3 py-2 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-5 sm:py-0">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 sm:gap-2">
              {/* Mobile menu */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label="Open menu">
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72 bg-sidebar">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Browse Ostrify and your library
                  </SheetDescription>
                  <Sidebar onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
              <Button type="button" variant="ghost" size="icon" aria-label="Back" title="Back" onClick={() => previousTo ? navigate(-1) : navigate("/", { replace: true })} className="hidden size-10 shrink-0 rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:flex">
                <ArrowLeft className="size-5" />
              </Button>
              <Link to="/" aria-label="Home" title="Home" className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:flex">
                <Home className="size-5 fill-current" />
              </Link>
              <div className="flex min-w-0 flex-1 items-center justify-center sm:px-2">
                <GlobalSearch />
              </div>
            </div>
            <div className="hidden shrink-0 items-center gap-1 sm:flex">
              {user && <Button type="button" variant="ghost" size="icon" className={`rounded-full ${visiblePanel === 'chat' ? 'bg-accent' : ''}`} aria-label="Ostrify Armada chat" aria-pressed={visiblePanel === 'chat'} onClick={() => togglePanel('chat')}><MessageCircle className="size-5" /></Button>}
              <NotificationsBell open={activePanel === 'notifications'} onToggle={() => togglePanel('notifications')} />
              <FriendsActivitySheet open={activePanel === 'friends'} liveFriendCount={statuses.data?.length ?? 0} onToggle={() => togglePanel('friends')} />
            </div>
            <div className="ml-auto hidden shrink-0 sm:block">
              <LoginArea className="max-w-60" />
            </div>
            <div className="flex w-full items-center justify-between border-t border-border/40 pt-1 sm:hidden">
              <div className="flex items-center gap-2">
                {user && <Button type="button" variant="ghost" size="icon" className={`rounded-full ${visiblePanel === 'chat' ? 'bg-accent' : ''}`} aria-label="Ostrify Armada chat" aria-pressed={visiblePanel === 'chat'} onClick={() => togglePanel('chat')}><MessageCircle className="size-5" /></Button>}
                <NotificationsBell open={activePanel === 'notifications'} onToggle={() => togglePanel('notifications')} />
                <FriendsActivitySheet open={activePanel === 'friends'} liveFriendCount={statuses.data?.length ?? 0} onToggle={() => togglePanel('friends')} />
                <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Refresh page" title="Refresh page" onClick={() => window.location.reload()}>
                  <RefreshCw className="size-5" />
                </Button>
              </div>
              <LoginArea className="max-w-60" />
            </div>
          </header>

          {/* The player stays mounted here while switching between the pane and the floating dock. */}
          <div ref={setContentPane} className="relative z-10 flex min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1" inert={expanded} aria-hidden={expanded}>
              <ScrollArea type="always" className="app-content-scroll relative min-w-0 max-w-full flex-1 min-h-0 bg-transparent">
                <div className="min-w-0 max-w-full overflow-x-hidden pb-6">
                  <HomeSessionProvider value={accountScope}>{children}</HomeSessionProvider>
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
        {!isMobile && <aside aria-hidden={!visiblePanel || visiblePanel === 'chat'} className={`h-full shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${visiblePanel === 'friends' ? 'w-72 opacity-100 lg:w-80' : visiblePanel === 'queue' ? 'w-80 opacity-100 xl:w-96' : visiblePanel === 'notifications' ? 'w-72 opacity-100 lg:w-80' : 'w-0 opacity-0'}`}>
          {visiblePanel === 'friends' && <FriendsActivityPanel open user={user} followedPeople={followedPeople} statuses={statuses} onClose={() => setActivePanel(null)} />}
          {visiblePanel === 'queue' && <QueuePanel open onClose={() => setActivePanel(null)} />}
          {visiblePanel === 'notifications' && <NotificationsPanel onClose={() => setActivePanel(null)} />}

        </aside>}
        {isMobile && visiblePanel && <button type="button" className="fixed inset-x-0 top-0 bottom-28 z-30 bg-black/45 backdrop-blur-[1px]" aria-label="Close open panel" onClick={() => setActivePanel(null)} />}
        {isMobile && <div className={`fixed inset-x-0 bottom-28 z-40 transition-[transform,opacity] duration-300 ease-in-out ${visiblePanel && visiblePanel !== 'chat' ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`} aria-hidden={!visiblePanel || visiblePanel === 'chat'} inert={!visiblePanel || visiblePanel === 'chat'}>
          <div className="mx-auto h-[min(72dvh,38rem)] w-full max-w-xl overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl pb-[env(safe-area-inset-bottom)]">
            {visiblePanel === 'friends' && <FriendsActivityPanel open user={user} followedPeople={followedPeople} statuses={statuses} onClose={() => setActivePanel(null)} />}
            {visiblePanel === 'queue' && <QueuePanel open onClose={() => setActivePanel(null)} />}
            {visiblePanel === 'notifications' && <NotificationsPanel onClose={() => setActivePanel(null)} />}

          </div>
        </div>}
        {shouldMountChat && user && <div
          aria-hidden={visiblePanel !== 'chat'}
          inert={visiblePanel !== 'chat'}
          className={isMobile
            ? `fixed inset-x-0 bottom-28 z-40 mx-auto h-[min(72dvh,38rem)] w-full max-w-xl overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl transition-[transform,opacity] duration-300 ${visiblePanel === 'chat' ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`
            : `h-full shrink-0 overflow-hidden transition-[width,opacity] duration-300 ${visiblePanel === 'chat' ? 'w-80 opacity-100 xl:w-96' : 'w-0 opacity-0'}`}
        >
          <ArmadaChatPanel key={user.pubkey} user={user} onClose={() => setActivePanel(null)} />
        </div>}
        </div>
      </div>
 
      <PlayerBar onQueueToggle={() => togglePanel('queue')} queueOpen={activePanel === 'queue'} />
    </div>
  );
}
