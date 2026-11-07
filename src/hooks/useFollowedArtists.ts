import { useNostr } from "@nostrify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";
import { useNostrPublish } from "./useNostrPublish";

/** d-tag for the Ostrify "followed artists" follow set (NIP-51 kind 30000). */
export const FOLLOWED_ARTISTS_ID = "ostrify-artists";
const FOLLOW_SET_KIND = 30000;

/** Fetch the pubkeys of artists the current user follows in Ostrify. */
export function useFollowedArtists() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ["followed-artists", user?.pubkey ?? ""],
    queryFn: async (c) => {
      if (!user) return [] as string[];
      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query(
        [
          {
            kinds: [FOLLOW_SET_KIND],
            authors: [user.pubkey],
            "#d": [FOLLOWED_ARTISTS_ID],
            limit: 1,
          },
        ],
        { signal },
      );
      const event = events[0];
      if (!event) return [];
      return event.tags
        .filter(([n]) => n === "p")
        .map(([, pubkey]) => pubkey)
        .filter(Boolean);
    },
    enabled: !!user,
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

  async function fetchCurrent(): Promise<string[]> {
    if (!user) return [];
    const cached = queryClient.getQueryData<string[]>(["followed-artists", user.pubkey]);
    if (cached) return cached;
    const events = await nostr.query(
      [{ kinds: [FOLLOW_SET_KIND], authors: [user.pubkey], "#d": [FOLLOWED_ARTISTS_ID], limit: 1 }],
      { signal: AbortSignal.timeout(4000) },
    );
    return events[0]?.tags.filter(([n]) => n === "p").map(([, pk]) => pk).filter(Boolean) ?? [];
  }

  async function save(pubkeys: string[]) {
    await publish({
      kind: FOLLOW_SET_KIND,
      content: "",
      tags: [
        ["d", FOLLOWED_ARTISTS_ID],
        ["title", "Followed Artists"],
        ...pubkeys.map((pk) => ["p", pk]),
      ],
    });
  }

  const toggleFollow = useMutation({
    mutationFn: async (input: { pubkey: string; follow: boolean }) => {
      const current = await fetchCurrent();
      const has = current.includes(input.pubkey);
      let next = current;
      if (input.follow && !has) next = [...current, input.pubkey];
      else if (!input.follow && has) next = current.filter((pk) => pk !== input.pubkey);
      else return;
      await save(next);
    },
    onSuccess: invalidate,
  });

  return { toggleFollow, isReady: !!user };
}
