// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from 'unhead/plugins';
import { Suspense, useEffect } from 'react';
import NostrProvider from '@/components/NostrProvider';
import { NostrSync } from '@/components/NostrSync';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NostrLoginProvider } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import { AppConfig } from '@/contexts/AppContext';
import { APP_RELAYS } from '@/lib/appRelays';
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

const defaultConfig: AppConfig = {
  theme: "dark",
  relayMetadata: APP_RELAYS,
  blossomServerMetadata: {
    servers: [
      'https://blossom.ditto.pub/',
      'https://blossom.dreamith.to/',
      'https://blossom.primal.net/',
    ],
    updatedAt: 0,
  },
  useAppBlossomServers: true,
};

function LibraryRefreshSync() {
  useEffect(() => {
    const client = queryClient;
    const handleFocus = () => {
      void Promise.all([
        client.invalidateQueries({ queryKey: ['playlists'] }),
        client.invalidateQueries({ queryKey: ['followed-artists'] }),
        client.invalidateQueries({ queryKey: ['podcast-favorites'] }),
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
                <Suspense>
                  <AppRouter />
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
