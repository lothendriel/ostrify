import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useQuery } from '@tanstack/react-query';
import { NSchema as n, type NostrEvent, type NostrMetadata } from '@nostrify/nostrify';
import { sanitizeUrl } from '@/lib/sanitize';

const PROFILE_CACHE_PREFIX = 'ostrify:avatar-profile:v1:';
const PROFILE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PROFILE_QUERY_TIMEOUT_MS = 4000;

interface CachedProfile {
  metadata: NostrMetadata;
  cachedAt: number;
}

function readCachedProfile(pubkey: string): NostrMetadata | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${pubkey}`);
    if (!raw) return undefined;

    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const record = value as Record<string, unknown>;
    if (typeof record.cachedAt !== 'number' || Date.now() - record.cachedAt > PROFILE_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(`${PROFILE_CACHE_PREFIX}${pubkey}`);
      return undefined;
    }

    const metadata = n.metadata().parse(record.metadata);
    return {
      name: metadata.name,
      display_name: metadata.display_name,
      picture: sanitizeUrl(metadata.picture),
    };
  } catch {
    return undefined;
  }
}

function cacheProfile(pubkey: string, metadata: NostrMetadata): void {
  const cachedProfile: CachedProfile = {
    metadata: {
      name: metadata.name,
      display_name: metadata.display_name,
      picture: sanitizeUrl(metadata.picture),
    },
    cachedAt: Date.now(),
  };

  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${PROFILE_CACHE_PREFIX}${pubkey}`, JSON.stringify(cachedProfile));
  } catch {
    // Storage may be disabled or full; the live profile lookup still works.
  }
}

function getCachedAccounts(logins: readonly { id: string; pubkey: string }[]): Account[] | undefined {
  const cachedAccounts = logins.map(({ id, pubkey }) => {
    const metadata = readCachedProfile(pubkey);
    return metadata ? { id, pubkey, metadata } : undefined;
  });

  return cachedAccounts.some((account) => account !== undefined)
    ? logins.map(({ id, pubkey }, index) => cachedAccounts[index] ?? { id, pubkey, metadata: {} })
    : undefined;
}

export interface Account {
  id: string;
  pubkey: string;
  event?: NostrEvent;
  metadata: NostrMetadata;
}

export function useLoggedInAccounts() {
  const { nostr } = useNostr();
  const { logins, setLogin, removeLogin } = useNostrLogin();

  const { data: authors = [], isLoading, isFetching } = useQuery({
    queryKey: ['nostr', 'logins', logins.map((l) => l.id).join(';')],
    queryFn: async () => {
      const events = await nostr.query(
        [{ kinds: [0], authors: logins.map((l) => l.pubkey) }],
        { signal: AbortSignal.timeout(PROFILE_QUERY_TIMEOUT_MS) },
      );
      const latestEvents = new Map<string, NostrEvent>();
      for (const event of events) {
        const previous = latestEvents.get(event.pubkey);
        if (!previous || event.created_at > previous.created_at) latestEvents.set(event.pubkey, event);
      }

      const validProfiles = new Set<string>();
      const accounts = logins.map(({ id, pubkey }): Account => {
        const event = latestEvents.get(pubkey);
        if (event) {
          try {
            const metadata = n.json().pipe(n.metadata()).parse(event.content);
            validProfiles.add(pubkey);
            cacheProfile(pubkey, metadata);
            return { id, pubkey, metadata, event };
          } catch {
            // Keep a previously validated public profile if this event is malformed.
          }
        }

        return { id, pubkey, metadata: readCachedProfile(pubkey) ?? {}, event };
      });

      // An empty result is not a successful profile lookup. Throwing lets the
      // bounded query retries run while any cached avatar remains visible.
      if (logins.length > 0 && !validProfiles.has(logins[0].pubkey)) {
        throw new Error('Current account profile could not be validated from the relay response');
      }

      return accounts;
    },
    initialData: () => getCachedAccounts(logins),
    initialDataUpdatedAt: 0,
    staleTime: 0,
    enabled: logins.length > 0,
    retry: 2,
  });

  // Current user is the first login
  const currentUser: Account | undefined = (() => {
    const login = logins[0];
    if (!login) return undefined;
    const author = authors.find((a) => a.id === login.id);
    return { metadata: {}, ...author, id: login.id, pubkey: login.pubkey };
  })();

  // Other users are all logins except the current one
  const otherUsers = (authors || []).slice(1) as Account[];

  return {
    authors,
    currentUser,
    otherUsers,
    isLoading,
    isFetching,
    setLogin,
    removeLogin,
  };
}