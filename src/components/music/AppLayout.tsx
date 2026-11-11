import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoginArea } from "@/components/auth/LoginArea";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { FriendsActivitySheet } from "./FriendsActivitySheet";
import { NotificationsBell } from "./NotificationsBell";
import { GlobalSearch } from "./GlobalSearch";
import { useAudiobookLibrarySync } from '@/hooks/useAudiobookLibrarySync';

function AudiobookLibrarySyncService() {
  useAudiobookLibrarySync();
  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
    <AudiobookLibrarySyncService />
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex min-h-0 gap-0 md:gap-2 md:p-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex shrink-0 h-full min-h-0">
          <Sidebar />
        </aside>

        {/* Main content column */}
        <div className="flex-1 flex flex-col min-w-0 bg-card md:rounded-lg overflow-hidden">
          {/* Top bar */}
          <header className="h-14 shrink-0 flex items-center justify-between gap-2 px-4 border-b border-border/50 bg-card/80 backdrop-blur-sm">
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
            <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-4">
              <GlobalSearch />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <NotificationsBell />
              <FriendsActivitySheet />
              <LoginArea className="max-w-60" />
            </div>
          </header>

          {/* Scrollable page content */}
          <ScrollArea type="always" className="flex-1 min-h-0">
            <div className="pb-6">{children}</div>
          </ScrollArea>
        </div>
      </div>

      <PlayerBar />
    </div>
    </>
  );
}
