import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, Menu } from "lucide-react";
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
import { DeveloperZapButton } from "./DeveloperZapButton";
import { GlobalSearch } from "./GlobalSearch";
import { useIsMobile } from '@/hooks/useIsMobile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowedPeople } from '@/hooks/useFollowedPeople';
import { useFriendStatuses } from '@/hooks/useFriendLibrary';
import { useQueryClient } from '@tanstack/react-query';
import { HomeSessionProvider } from '@/contexts/HomeSessionContext';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();
  const [homeSessionScope] = useState(() => crypto.randomUUID());
  const previousHomeAccount = useRef<string | undefined>(undefined);
  const [activePanel, setActivePanel] = useState<'friends' | 'queue' | 'notifications' | null>(null);
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
  const togglePanel = (panel: 'friends' | 'queue' | 'notifications') => setActivePanel(current => current === panel ? null : panel);

  return (
    <div className="fixed inset-x-0 top-0 h-svh flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex min-h-0 gap-0 md:gap-2 md:p-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex shrink-0 h-full min-h-0">
          <Sidebar />
        </aside>

        {/* Main content and docked utility panels */}
        <div className="flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden md:gap-2">
        <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card md:rounded-lg">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[500px] bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--card) 30%, transparent) 0%, var(--card) 100%), url('/autumn-forest.webp')" }} />
          {/* Top bar */}
          <header className="relative z-10 flex h-auto shrink-0 flex-col gap-1 border-b border-border/50 bg-card/80 px-3 py-2 backdrop-blur-sm sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-0">
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
              <DeveloperZapButton />
              <NotificationsBell open={activePanel === 'notifications'} onToggle={() => togglePanel('notifications')} />
              <FriendsActivitySheet open={activePanel === 'friends'} liveFriendCount={statuses.data?.length ?? 0} onToggle={() => togglePanel('friends')} />
            </div>
            <div className="ml-auto hidden shrink-0 sm:block">
              <LoginArea className="max-w-60" />
            </div>
            <div className="flex w-full items-center justify-between border-t border-border/40 pt-1 sm:hidden">
              <div className="flex items-center gap-2">
                <DeveloperZapButton />
                <NotificationsBell open={activePanel === 'notifications'} onToggle={() => togglePanel('notifications')} />
                <FriendsActivitySheet open={activePanel === 'friends'} liveFriendCount={statuses.data?.length ?? 0} onToggle={() => togglePanel('friends')} />
              </div>
              <LoginArea className="max-w-60" />
            </div>
          </header>

          {/* Scrollable page content */}
          <ScrollArea type="always" className="app-content-scroll relative z-10 min-w-0 max-w-full flex-1 min-h-0 bg-transparent">
            <div className="min-w-0 max-w-full overflow-x-hidden pb-6">
              <HomeSessionProvider value={accountScope}>{children}</HomeSessionProvider>
            </div>
          </ScrollArea>
        </div>
        {!isMobile && <aside aria-hidden={activePanel !== 'friends' && activePanel !== 'queue' && activePanel !== 'notifications'} className={`h-full shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${activePanel === 'friends' ? 'w-72 opacity-100 lg:w-80' : activePanel === 'queue' ? 'w-80 opacity-100 xl:w-96' : activePanel === 'notifications' ? 'w-72 opacity-100 lg:w-80' : 'w-0 opacity-0'}`}>
          {activePanel === 'friends' && <FriendsActivityPanel open user={user} followedPeople={followedPeople} statuses={statuses} onClose={() => setActivePanel(null)} />}
          {activePanel === 'queue' && <QueuePanel open onClose={() => setActivePanel(null)} />}
          {activePanel === 'notifications' && <NotificationsPanel onClose={() => setActivePanel(null)} />}
        </aside>}
        {isMobile && activePanel && <button type="button" className="fixed inset-x-0 top-0 bottom-28 z-30 bg-black/45 backdrop-blur-[1px]" aria-label="Close open panel" onClick={() => setActivePanel(null)} />}
        {isMobile && <div className={`fixed inset-x-0 bottom-28 z-40 transition-[transform,opacity] duration-300 ease-in-out ${activePanel ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`} aria-hidden={!activePanel} inert={!activePanel}>
          <div className="mx-auto h-[min(72dvh,38rem)] w-full max-w-xl overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl pb-[env(safe-area-inset-bottom)]">
            {activePanel === 'friends' && <FriendsActivityPanel open user={user} followedPeople={followedPeople} statuses={statuses} onClose={() => setActivePanel(null)} />}
            {activePanel === 'queue' && <QueuePanel open onClose={() => setActivePanel(null)} />}
            {activePanel === 'notifications' && <NotificationsPanel onClose={() => setActivePanel(null)} />}
          </div>
        </div>}
        </div>
      </div>
 
      <PlayerBar onQueueToggle={() => togglePanel('queue')} queueOpen={activePanel === 'queue'} />
    </div>
  );
}
