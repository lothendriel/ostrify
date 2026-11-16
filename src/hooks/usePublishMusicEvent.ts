import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { DROPS_MUSIC_RELAY } from "@/lib/sources";
import { withMusicVisibility } from "@/lib/musicVisibility";

export type MusicVisibility = "public" | "hidden";

interface PublishMusicInput {
  kind: number;
  content: string;
  tags: string[][];
  visibility: MusicVisibility;
  /** Existing public events need a hidden revision on DROPS when changing visibility to hidden. */
  removeFromDrops?: boolean;
}

export interface PublishMusicResult {
  event: NostrEvent;
  dropsError?: string;
}

/** Publish publicly to personal write relays; also mirror Ostrify-visible tracks to DROPS. */
export function usePublishMusicEvent(): UseMutationResult<PublishMusicResult, Error, PublishMusicInput> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const publish = useNostrPublish();

  return useMutation({
    mutationFn: async ({ kind, content, tags, visibility, removeFromDrops = false }) => {
      if (!user) throw new Error("Log in to publish music.");
      const eventTags = withMusicVisibility(tags, visibility);
      const event = await publish.mutateAsync({ kind, content, tags: eventTags });
      if (visibility === "hidden" && !removeFromDrops) return { event };

      try {
        if (visibility === "hidden") {
          await nostr.event(event, { signal: AbortSignal.timeout(8000) });
          return { event };
        }
        await nostr.relay(DROPS_MUSIC_RELAY).event(event, { signal: AbortSignal.timeout(8000) });
        return { event };
      } catch (error) {
        return {
          event,
          dropsError: error instanceof Error ? error.message : "DROPS did not confirm the shared copy.",
        };
      }
    },
  });
}
