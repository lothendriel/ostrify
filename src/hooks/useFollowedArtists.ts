import { useNostr } from "@nostrify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { useLibraryPublish } from "./useNostrPublish";
import type { NostrEvent } from "@nostrify/nostrify";
import { wavlakeArtistId, wavlakeArtistUrl } from "./useWavlake";
import { queryLibraryEvents, withLibraryWrite, readLibraryForWrite, rememberLibraryWrite, recentLibraryEvent, reconcileLibraryEvent, saveLibraryCoverage, libraryReadRetryOptions, useLibraryCoverage, useLibraryRevision, nextLibraryTimestamp, libraryWriteWarning } from '@/lib/libraryQuery';
import { useToast } from '@/hooks/useToast';
import { getUserDataReadRelays } from '@/lib/appRelays';
import { homeSessionQueryKey } from '@/lib/homeSession';

function artistRefs(event: NostrEvent | undefined): string[] {
  return event?.tags.flatMap(([name, value]) => {
    if (name === 'p' && value && /^[0-9a-f]{64}$/i.test(value)) return [value];
    const artistId = name === 'i' && value ? wavlakeArtistId(value) : undefined;
    return artistId ? [`wavlake:${artistId}`] : [];
  }) ?? [];
}

/** d-tag for the Ostrify "followed artists" follow set (NIP-51 kind 30000). */
export const FOLLOWED_ARTISTS_ID = "ostrify-artists";
const FOLLOW_SET_KIND = 30000;

/** Fetch the pubkeys of artists the current user follows in Ostrify. */
export function useFollowedArtists(enabled = true, sessionScope?: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const readRelayKey = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', config.excludedUserRelayUrls, config.excludedUserRelayPubkey).join("|");
  const queryKey = homeSessionQueryKey(
    sessionScope ? `${sessionScope}:${user?.pubkey ?? 'public'}` : undefined,
    ["followed-artists", user?.pubkey ?? "", readRelayKey],
  );

  const coverage = useLibraryCoverage(queryKey);
  useLibraryRevision(user?.pubkey ?? '', FOLLOW_SET_KIND, FOLLOWED_ARTISTS_ID);
  const query = useQuery({
    queryKey,
    staleTime: sessionScope ? Infinity : 60_000,
    placeholderData: (previousData: string[] | undefined, previousQuery) =>
      previousQuery?.queryKey[1] === user?.pubkey ? previousData : undefined,
    queryFn: async (c) => {
      if (!user || !readRelayKey) return [] as string[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(8000)]);
      const result = await queryLibraryEvents(
        nostr,
        readRelayKey.split("|"),
        [{ kinds: [FOLLOW_SET_KIND], authors: [user.pubkey], "#d": [FOLLOWED_ARTISTS_ID], limit: 1 }],
        signal,
        libraryReadRetryOptions(queryClient, queryKey),
      );
      saveLibraryCoverage(queryClient, queryKey, result);
      const recent = recentLibraryEvent(user.pubkey, FOLLOW_SET_KIND, FOLLOWED_ARTISTS_ID);
      const event = reconcileLibraryEvent(queryClient, user.pubkey, FOLLOW_SET_KIND, FOLLOWED_ARTISTS_ID, [...result.events, recent]);
      if (!event && !result.complete) return queryClient.getQueryData<string[]>(queryKey) ?? [];
      return artistRefs(event);
    },
    enabled: enabled && !!user && !!readRelayKey,
  });
  return { ...query, coverage, isPartial: !!coverage && !coverage.complete };
}

/** Whether the current user follows a given artist. */
export function useIsFollowingArtist(pubkey: string | undefined): boolean {
  const { data } = useFollowedArtists();
  if (!pubkey) return false;
  return !!data?.includes(pubkey);
}

/** Follow / unfollow an artist, persisted to a NIP-51 follow set. */
export function useFollowArtistActions() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useLibraryPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["followed-artists", user?.pubkey ?? ""], refetchType: 'all' });

  async function save(pubkeys: string[], existing?: NostrEvent) {
    const tags = existing ? existing.tags.filter(([name, value]) =>
      name !== 'd' && name !== 'title' && !(name === 'p' && value && /^[0-9a-f]{64}$/i.test(value)) && !(name === 'i' && value && wavlakeArtistId(value))
    ).map(tag => [...tag]) : [];
    tags.unshift(['d', FOLLOWED_ARTISTS_ID], ['title', 'Followed Artists']);
    for (const ref of pubkeys) {
      const url = ref.startsWith('wavlake:') ? wavlakeArtistUrl(ref.slice(8)) : undefined;
      const previous = existing?.tags.find(([name, value]) => url ? name === 'i' && value === url : name === 'p' && value === ref);
      if (previous) tags.push([...previous]);
      else if (url) tags.push(['i', url]);
      else if (/^[0-9a-f]{64}$/i.test(ref)) tags.push(['p', ref]);
    }
    const created_at = await nextLibraryTimestamp(existing?.created_at);
    const event = await publish({ kind: FOLLOW_SET_KIND, content: existing?.content ?? '', tags, created_at });
    rememberLibraryWrite(event, FOLLOWED_ARTISTS_ID);
    if (user) {
      queryClient.setQueriesData<string[]>({ queryKey: ['followed-artists', user.pubkey] }, artistRefs(event));
      queryClient.invalidateQueries({ queryKey: ['followed-artists', user.pubkey] });
    }
  }

  const toggleFollow = useMutation({
    mutationFn: async (input: { pubkey: string; follow: boolean }) => {
      if (!user) throw new Error('Log in to follow artists.');
      return withLibraryWrite(user.pubkey, FOLLOW_SET_KIND, FOLLOWED_ARTISTS_ID, async () => {
        const relays = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, user.pubkey, config.excludedUserRelayUrls, config.excludedUserRelayPubkey);
        const result = await readLibraryForWrite(nostr, relays, user.pubkey, FOLLOW_SET_KIND, FOLLOWED_ARTISTS_ID);
        const existing = result.event;
        const current = artistRefs(existing);
        const has = current.includes(input.pubkey);
        let next = current;
        if (input.follow && !has) next = [...current, input.pubkey];
        else if (!input.follow && has) next = current.filter((pk) => pk !== input.pubkey);
        else return;
        await save(next, existing);
        const warning = libraryWriteWarning(result.partial);
        if (warning) toast({ title: 'Library sync may be incomplete', description: warning });
      });
    },
    onSuccess: invalidate,
  });

  return { toggleFollow, isReady: !!user };
}
