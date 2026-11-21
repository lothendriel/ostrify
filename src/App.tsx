// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from 'unhead/plugins';
import { Suspense, useEffect, type ReactNode } from 'react';
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
      refetchOnWindowFocus: false,
      staleTime: 60000,
      gcTime: Infinity,
      retry: 2,
    },
  },
});

const defaultConfig: AppConfig = {
  theme: "dark",
  relayMetadata: APP_RELAYS,
  appRelayMetadata: APP_RELAYS,
  userRelayMetadata: { relays: [], updatedAt: 0 },
  userRelayPubkey: '',
  includeUserRelays: false,
  excludedUserRelayUrls: [],
  excludedUserRelayPubkey: '',
  blossomServerMetadata: {
    servers: [],
    updatedAt: 0,
  },
  useAppBlossomServers: true,
};

function PublicPageCacheSync({ children }: { children: ReactNode }) {
  useEffect(() => {
    let active = true;
    const stopWatching = watchPublicPageCache(queryClient);

    // Let routes and their live queries mount immediately. Cache restoration is
    // best-effort and skips queries that have already started or resolved.
    void restorePublicPageCache(queryClient, () => active).catch(() => undefined);

    return () => {
      active = false;
      stopWatching();
    };
  }, []);

  return children;
}

export function App() {
  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <NostrProvider>
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
