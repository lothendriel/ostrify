import { useNostr } from "@nostrify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { useNostrPublish } from "./useNostrPublish";
import type { NostrEvent } from "@nostrify/nostrify";
import { wavlakeArtistId, wavlakeArtistUrl } from "./useWavlake";

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
export function useFollowedArtists() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const readRelayKey = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort().join("|");

  return useQuery({
    queryKey: ["followed-artists", user?.pubkey ?? "", readRelayKey],
    queryFn: async (c) => {
      if (!user || !readRelayKey) return [] as string[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(12000)]);
      const events = await nostr.query(
        [
          {
            kinds: [FOLLOW_SET_KIND],
            authors: [user.pubkey],
            "#d": [FOLLOWED_ARTISTS_ID],
            limit: 1,
          },
        ],
        { signal, relays: readRelayKey.split("|") },
      );
      const event = events.filter(item => item.pubkey === user.pubkey && item.kind === FOLLOW_SET_KIND && item.tags.some(([name, value]) => name === 'd' && value === FOLLOWED_ARTISTS_ID)).sort((a, b) => b.created_at - a.created_at)[0];
      return artistRefs(event);
    },
    enabled: !!user && !!readRelayKey,
  });
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
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["followed-artists", user?.pubkey ?? ""] });

  async function fetchCurrent(): Promise<NostrEvent | undefined> {
    if (!user) throw new Error('Log in to follow artists');
    const events = await nostr.query(
      [{ kinds: [FOLLOW_SET_KIND], authors: [user.pubkey], "#d": [FOLLOWED_ARTISTS_ID], limit: 10 }],
      { signal: AbortSignal.timeout(5000) },
    );
    return events.sort((a, b) => b.created_at - a.created_at)[0];
  }

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
    const event = await publish({ kind: FOLLOW_SET_KIND, content: existing?.content ?? '', tags });
    if (user) queryClient.setQueryData(['followed-artists', user.pubkey], artistRefs(event));
  }

  const toggleFollow = useMutation({
    mutationFn: async (input: { pubkey: string; follow: boolean }) => {
      const existing = await fetchCurrent();
      const current = artistRefs(existing);
      const has = current.includes(input.pubkey);
      let next = current;
      if (input.follow && !has) next = [...current, input.pubkey];
      else if (!input.follow && has) next = current.filter((pk) => pk !== input.pubkey);
      else return;
      await save(next, existing);
    },
    onSuccess: invalidate,
  });

  return { toggleFollow, isReady: !!user };
}
