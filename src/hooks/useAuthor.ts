import { type NostrEvent, type NostrMetadata, NSchema as n } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { newestEventForCoordinate } from '@/lib/libraryQuery';

export function useAuthor(pubkey: string | undefined, options: { persistForPublicArtistPage?: boolean } = {}) {
  const { nostr } = useNostr();
  const queryKey = options.persistForPublicArtistPage
    ? ['nostr', 'author', pubkey ?? '', 'public-artist-page']
    : ['nostr', 'author', pubkey ?? ''];

  return useQuery<{ event?: NostrEvent; metadata?: NostrMetadata }>({
    queryKey,
    queryFn: async () => {
      if (!pubkey) {
        return {};
      }

      const events = await nostr.query(
        [{ kinds: [0], authors: [pubkey], limit: 10 }],
        { signal: AbortSignal.timeout(1500) },
      );
      const event = newestEventForCoordinate(events, pubkey, 0);

      if (!event) {
        throw new Error('No event found');
      }

      try {
        const metadata = n.json().pipe(n.metadata()).parse(event.content);
        return { metadata, event };
      } catch {
        return { event };
      }
    },
    staleTime: 5 * 60 * 1000, // Keep cached data fresh for 5 minutes
    enabled: !!pubkey,
    retry: 1,
  });
}
