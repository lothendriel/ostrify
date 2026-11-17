// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from 'unhead/plugins';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import NostrProvider from '@/components/NostrProvider';
import { NostrSync } from '@/components/NostrSync';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NostrLoginProvider } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import { AppConfig } from '@/contexts/AppContext';
import { APP_RELAYS } from '@/lib/appRelays';
import { ServiceWorkerUpdateNotice } from '@/components/ServiceWorkerUpdateNotice';
import { restorePublicPageCache, watchPublicPageCache } from '@/lib/publicPageCache';
import AppRouter from './AppRouter';

const head = createHead({
  plugins: [
    InferSeoMetaPlugin(),
  ],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 60000,
      gcTime: Infinity,
      retry: 2,
    },
  },
});

const PUBLIC_CACHE_RESTORE_TIMEOUT_MS = 1500;

const defaultConfig: AppConfig = {
  theme: "dark",
  relayMetadata: APP_RELAYS,
  blossomServerMetadata: {
    servers: [],
    updatedAt: 0,
  },
  useAppBlossomServers: true,
};

function StartupLoadingShell() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-center">
        <img src="/ostrify-logo.png?v=ostrich-note" alt="" className="size-14 rounded-xl object-contain" />
        <div className="space-y-2">
          <p className="text-lg font-semibold">Opening Ostrify</p>
          <p className="text-sm text-muted-foreground">Getting your audio space ready…</p>
        </div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
      </div>
    </main>
  );
}

function PublicPageCacheSync({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let restoreTimedOut = false;
    let stopWatching: (() => void) | undefined;
    const timeout = window.setTimeout(() => {
      restoreTimedOut = true;
      if (!active) return;
      stopWatching = watchPublicPageCache(queryClient);
      setReady(true);
    }, PUBLIC_CACHE_RESTORE_TIMEOUT_MS);

    void restorePublicPageCache(queryClient, () => active && !restoreTimedOut).catch(() => undefined).finally(() => {
      window.clearTimeout(timeout);
      if (!active) return;
      if (!restoreTimedOut) {
        stopWatching = watchPublicPageCache(queryClient);
        setReady(true);
      }
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      stopWatching?.();
    };
  }, []);

  // Restored data is available before normal page queries mount. If IndexedDB
  // stalls, show a shell briefly and then proceed without waiting for the cache.
  return ready ? children : <StartupLoadingShell />;
}

function LibraryRefreshSync() {
  useEffect(() => {
    const client = queryClient;
    const handleFocus = () => {
      void Promise.all([
        client.invalidateQueries({ queryKey: ['playlists'] }),
        client.invalidateQueries({ queryKey: ['followed-artists'] }),
        client.invalidateQueries({ queryKey: ['podcast-favorites'] }),
        client.invalidateQueries({ queryKey: ['ostrify-followed-people'] }),
        client.invalidateQueries({ queryKey: ['ostrify-friends'] }),
        client.invalidateQueries({ queryKey: ['friend-invite-follows'] }),
        client.invalidateQueries({ queryKey: ['friend-statuses'] }),
      ]);
      window.dispatchEvent(new Event('ostrify-library-refresh'));
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, []);
  return null;
}

export function App() {
  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <NostrProvider>
              <LibraryRefreshSync />
              <NostrSync />
              <TooltipProvider>
                <Toaster />
                <ServiceWorkerUpdateNotice />
                <Suspense>
                  <PublicPageCacheSync>
                    <AppRouter />
                  </PublicPageCacheSync>
                </Suspense>
              </TooltipProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
