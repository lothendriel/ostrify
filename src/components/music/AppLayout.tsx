import { useState } from "react";
import { Link } from "react-router-dom";
import { Home, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoginArea } from "@/components/auth/LoginArea";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./QueuePanel";
import { FriendsActivityPanel, FriendsActivitySheet } from "./FriendsActivitySheet";
import { NotificationsBell } from "./NotificationsBell";
import { DeveloperZapButton } from "./DeveloperZapButton";
import { GlobalSearch } from "./GlobalSearch";
import { useAudiobookLibrarySync } from '@/hooks/useAudiobookLibrarySync';
import { useIsMobile } from '@/hooks/useIsMobile';

function AudiobookLibrarySyncService() {
  useAudiobookLibrarySync();
  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'friends' | 'queue' | null>(null);
  const isMobile = useIsMobile();
  const togglePanel = (panel: 'friends' | 'queue') => setActivePanel(current => current === panel ? null : panel);

  return (
    <>
    <AudiobookLibrarySyncService />
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex min-h-0 gap-0 md:gap-2 md:p-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex shrink-0 h-full min-h-0">
          <Sidebar />
        </aside>

        {/* Main content and docked utility panels */}
        <div className="flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden md:gap-2">
        <div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card md:rounded-lg">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[500px] bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--card) 30%, transparent) 0%, var(--card) 100%), url('/autumn-forest.png')" }} />
          {/* Top bar */}
          <header className="relative z-10 h-14 shrink-0 flex items-center justify-between gap-2 px-4 border-b border-border/50 bg-card/80 backdrop-blur-sm">
            <div className="flex shrink-0 items-center gap-2">
              {/* Mobile menu */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
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
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-1 sm:px-4">
              <Link to="/" aria-label="Home" title="Home" className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:flex">
                <Home className="size-5 fill-current" />
              </Link>
              <GlobalSearch />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <DeveloperZapButton />
              <NotificationsBell />
              <FriendsActivitySheet open={activePanel === 'friends'} onToggle={() => togglePanel('friends')} />
              <LoginArea className="max-w-60" />
            </div>
          </header>

          {/* Scrollable page content */}
          <ScrollArea type="always" className="app-content-scroll relative z-10 min-w-0 max-w-full flex-1 min-h-0 bg-transparent">
            <div className="min-w-0 max-w-full overflow-x-hidden pb-6">{children}</div>
          </ScrollArea>
        </div>
        {!isMobile && <aside aria-hidden={activePanel !== 'friends' && activePanel !== 'queue'} className={`h-full shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${activePanel === 'friends' ? 'w-72 opacity-100 lg:w-80' : activePanel === 'queue' ? 'w-80 opacity-100 xl:w-96' : 'w-0 opacity-0'}`}>
          {activePanel === 'friends' && <FriendsActivityPanel open onClose={() => setActivePanel(null)} onSwitch={() => togglePanel('queue')} />}
          {activePanel === 'queue' && <QueuePanel open onClose={() => setActivePanel(null)} onSwitch={() => togglePanel('friends')} />}
        </aside>}
        {isMobile && activePanel && <button type="button" className="fixed inset-x-0 top-0 bottom-20 z-30 bg-black/45 backdrop-blur-[1px]" aria-label="Close open panel" onClick={() => setActivePanel(null)} />}
        {isMobile && <div className={`fixed inset-x-0 bottom-20 z-40 transition-[transform,opacity] duration-300 ease-in-out ${activePanel ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}`} aria-hidden={!activePanel} inert={!activePanel}>
          <div className="mx-auto h-[min(72dvh,38rem)] w-full max-w-xl overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl pb-[env(safe-area-inset-bottom)]">
            {activePanel === 'friends' && <FriendsActivityPanel open onClose={() => setActivePanel(null)} onSwitch={() => togglePanel('queue')} />}
            {activePanel === 'queue' && <QueuePanel open onClose={() => setActivePanel(null)} onSwitch={() => togglePanel('friends')} />}
          </div>
        </div>}
        </div>
      </div>
 
      <PlayerBar onQueueToggle={() => togglePanel('queue')} queueOpen={activePanel === 'queue'} />
    </div>
    </>
  );
}
