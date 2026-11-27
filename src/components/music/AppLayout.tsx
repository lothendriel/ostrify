import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, Menu, RefreshCw, MessageCircle, Send, X } from "lucide-react";
import { useNostr } from '@nostrify/react';
import { verifyEvent } from 'nostr-tools';
import { useQuery } from '@tanstack/react-query';
import { NSchema, type NostrEvent } from '@nostrify/nostrify';
import { isNewerReplaceableEvent } from '@/lib/libraryQuery';
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

const CHAT_OWNER = '0155373ac79b7ffb0f586c3e68396f9e82d46f7afe7016d46ed9ca46ba3e1bed';
const CHAT_COORDINATE = `34550:${CHAT_OWNER}:0a9c42eb-50c8-4953-8de0-40c50019b574`;
const CHAT_RELAYS = ['wss://nos.lol/', 'wss://relay.studio314.us/nostrrelay/ostrify'];
const CHAT_LIMIT = 100;
type ChatUser = NonNullable<ReturnType<typeof useCurrentUser>['user']>;

function ChatMessage({ message, name }: { message: NostrEvent; name?: string }) {
  const date = new Date(message.created_at * 1000);
  const validDate = Number.isFinite(date.getTime());
  return <article className="min-w-0 rounded-lg bg-secondary/40 p-3">
    <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{name || genUserName(message.pubkey)}</span>{validDate && <time className="shrink-0 text-xs text-muted-foreground" dateTime={date.toISOString()}>{date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>}</div>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.content}</p>
  </article>;
}

function CommunityChatPanel({ user, onClose }: { user: ChatUser; onClose: () => void }) {
  const { nostr } = useNostr();
  const [messages, setMessages] = useState<NostrEvent[]>([]);
  const [relayStatus, setRelayStatus] = useState<Record<string, 'connecting' | 'ready' | 'retrying'>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const authors = [...new Set(messages.map(message => message.pubkey))].sort();
  const authorKey = authors.join('|');
  const authorProfiles = useQuery({
    queryKey: ['community-chat-authors', authorKey],
    enabled: authors.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const requested = new Set(authorKey.split('|').filter(Boolean));
      const events = await nostr.query([{ kinds: [0], authors: [...requested], limit: Math.max(100, requested.size * 3) }], { signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) });
      const latest = new Map<string, NostrEvent>();
      for (const event of events) {
        if (event.kind !== 0 || !requested.has(event.pubkey)) continue;
        const prior = latest.get(event.pubkey);
        if (!prior || isNewerReplaceableEvent(event, prior)) latest.set(event.pubkey, event);
      }
      const names: Record<string, string> = {};
      for (const [pubkey, event] of latest) {
        try {
          const metadata = NSchema.json().pipe(NSchema.metadata()).parse(event.content);
          const name = metadata.display_name || metadata.name;
          if (name) names[pubkey] = name;
        } catch { /* A malformed profile uses the fallback name. */ }
      }
      return names;
    },
  });

  useEffect(() => {
    const controller = new AbortController();
    const updateStatus = (relay: string, status: 'connecting' | 'ready' | 'retrying') => {
      if (!controller.signal.aborted) setRelayStatus(current => ({ ...current, [relay]: status }));
    };
    const watch = async (relay: string) => {
      while (!controller.signal.aborted) {
        updateStatus(relay, 'connecting');
        const attempt = new AbortController();
        const timer = setTimeout(() => attempt.abort(), 8000);
        try {
          for await (const message of nostr.relay(relay).req([{ kinds: [1111], '#A': [CHAT_COORDINATE], limit: CHAT_LIMIT }], { signal: AbortSignal.any([controller.signal, attempt.signal]) })) {
            if (message[0] === 'EOSE') { clearTimeout(timer); updateStatus(relay, 'ready'); }
            if (message[0] !== 'EVENT') continue;
            const event = message[2];
            if (event.kind !== 1111 || !event.tags.some(tag => tag[0] === 'A' && tag[1] === CHAT_COORDINATE) || !verifyEvent(event)) continue;
            setMessages(current => [...new Map([...current, event].map(item => [item.id, item])).values()].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)).slice(0, CHAT_LIMIT));
          }
        } catch { /* A relay can fail independently; retry without losing messages. */ }
        finally { clearTimeout(timer); }
        if (controller.signal.aborted) break;
        updateStatus(relay, 'retrying');
        await new Promise<void>(resolve => {
          const timeout = setTimeout(done, 5000);
          function done() { clearTimeout(timeout); controller.signal.removeEventListener('abort', done); resolve(); }
          controller.signal.addEventListener('abort', done, { once: true });
        });
      }
    };
    for (const relay of CHAT_RELAYS) void watch(relay);
    return () => controller.abort();
  }, [nostr]);

  useEffect(() => {
    const viewport = messagesEndRef.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setNotice('');
    try {
      const event = await user.signer.signEvent({
        kind: 1111, content: body, created_at: Math.floor(Date.now() / 1000),
        tags: [['A', CHAT_COORDINATE, CHAT_RELAYS[0]], ['a', CHAT_COORDINATE, CHAT_RELAYS[0]], ['P', CHAT_OWNER], ['p', CHAT_OWNER], ['K', '34550'], ['k', '34550']],
      });
      if (event.pubkey !== user.pubkey || !verifyEvent(event)) throw new Error('The signer returned an invalid event or a different account.');
      const outcomes = await Promise.allSettled(CHAT_RELAYS.map(relay => nostr.relay(relay).event(event, { signal: AbortSignal.timeout(5000) })));
      const accepted = outcomes.filter(outcome => outcome.status === 'fulfilled').length;
      if (!accepted) throw new Error('No relay confirmed the message. It may still have arrived; check before retrying.');
      setMessages(current => [...new Map([...current, event].map(item => [item.id, item])).values()].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)).slice(0, CHAT_LIMIT));
      setText('');
      if (accepted < CHAT_RELAYS.length) setNotice(`Message accepted by ${accepted} of ${CHAT_RELAYS.length} relays. It may not appear everywhere.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the message.');
    } finally { setSending(false); }
  };
  const connected = CHAT_RELAYS.filter(relay => relayStatus[relay] === 'ready').length;
  const waiting = CHAT_RELAYS.some(relay => !relayStatus[relay] || relayStatus[relay] === 'connecting');
  return <section aria-label="Ostrify Chat" className="flex h-full min-w-0 flex-col overflow-hidden bg-card md:rounded-lg md:border md:border-border/70">
    <div className="flex items-start justify-between gap-2 border-b border-border/70 px-4 py-4">
      <div><h2 className="flex items-center gap-2 font-semibold"><MessageCircle className="size-5 text-primary" /> Ostrify Chat</h2><p className="mt-1 text-sm text-muted-foreground">Public Nostr community</p></div>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Close chat" onClick={onClose}><X className="size-4" /></Button>
    </div>
    <div className="border-b border-border/50 px-4 py-2 text-xs text-muted-foreground" role="status">{waiting && !connected ? 'Connecting to chat relays…' : `${connected} of ${CHAT_RELAYS.length} chat relays connected${connected < CHAT_RELAYS.length ? ' · Messages may be incomplete' : ''}`}</div>
    <ScrollArea type="always" className="min-h-0 flex-1 px-4 py-3"><div className="space-y-2">
      {messages.length === 0 ? <p className="text-sm text-muted-foreground">{waiting ? 'Loading recent messages…' : 'No messages found on responding relays yet.'}</p> : [...messages].reverse().map(message => <ChatMessage key={message.id} message={message} name={authorProfiles.data?.[message.pubkey]} />)}
      <div ref={messagesEndRef} />
    </div></ScrollArea>
    <div className="space-y-2 border-t border-border/70 p-4">
      <p className="text-xs text-muted-foreground">Messages are public, not encrypted. Submissions appear here without moderator approval; other clients may show only approved posts.</p>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <Textarea aria-label="Message Ostrify Chat" placeholder="Message Ostrify Chat" value={text} maxLength={4000} onChange={event => setText(event.target.value)} disabled={sending} />
      <Button className="w-full" disabled={!text.trim() || sending} onClick={() => void send()}><Send className="size-4" /> {sending ? 'Sending…' : 'Send message'}</Button>
    </div>
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
  const shouldMountChat = !!user && chatOpenedFor === user.pubkey;

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
              {user && <Button type="button" variant="ghost" size="icon" className={`rounded-full ${visiblePanel === 'chat' ? 'bg-accent' : ''}`} aria-label="Ostrify Chat" aria-pressed={visiblePanel === 'chat'} onClick={() => togglePanel('chat')}><MessageCircle className="size-5" /></Button>}
              <NotificationsBell open={activePanel === 'notifications'} onToggle={() => togglePanel('notifications')} />
              <FriendsActivitySheet open={activePanel === 'friends'} liveFriendCount={statuses.data?.length ?? 0} onToggle={() => togglePanel('friends')} />
            </div>
            <div className="ml-auto hidden shrink-0 sm:block">
              <LoginArea className="max-w-60" />
            </div>
            <div className="flex w-full items-center justify-between border-t border-border/40 pt-1 sm:hidden">
              <div className="flex items-center gap-2">
                {user && <Button type="button" variant="ghost" size="icon" className={`rounded-full ${visiblePanel === 'chat' ? 'bg-accent' : ''}`} aria-label="Ostrify Chat" aria-pressed={visiblePanel === 'chat'} onClick={() => togglePanel('chat')}><MessageCircle className="size-5" /></Button>}
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
          <CommunityChatPanel key={user.pubkey} user={user} onClose={() => setActivePanel(null)} />
        </div>}
        </div>
      </div>
 
      <PlayerBar onQueueToggle={() => togglePanel('queue')} queueOpen={activePanel === 'queue'} />
    </div>
  );
}
