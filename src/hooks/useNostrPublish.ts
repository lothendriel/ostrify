import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { useToast } from "./useToast";
import { normalizeRelayAddress } from "@/lib/appRelays";

import type { NostrEvent } from "@nostrify/nostrify";

type EventTemplate = Pick<NostrEvent, 'kind' | 'content'> &
  Partial<Pick<NostrEvent, 'tags' | 'created_at'>>;

export function useNostrPublish(): UseMutationResult<
  NostrEvent,
  Error,
  EventTemplate
> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async (t: EventTemplate) => {
      if (user) {
        const tags = t.tags ?? [];

        const { hostname } = location;
        const isLocalhost = hostname === "localhost" || hostname.endsWith(".localhost");
        const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith("[");

        // Add the client tag if it doesn't exist
        if (location.protocol === "https:" && !isLocalhost && !isIpAddress && !tags.some(([name]) => name === "client")) {
          tags.push(["client", location.hostname]);
        }

        const event = await user.signer.signEvent({
          kind: t.kind,
          content: t.content ?? "",
          tags,
          created_at: t.created_at ?? Math.floor(Date.now() / 1000),
        });

        await nostr.event(event, { signal: AbortSignal.timeout(5000) });
        return event;
      } else {
        throw new Error("User is not logged in");
      }
    },
    onError: (error) => {
      console.error("Failed to publish event:", error);
    },
    onSuccess: (data) => {
      console.log("Event published successfully:", data);
    },
  });
}

/** Publish library updates to each configured write relay and report partial delivery. */
export function useLibraryPublish() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { toast } = useToast();

  const publish = async (template: EventTemplate): Promise<NostrEvent> => {
    if (!user) throw new Error('Log in to change your library.');
    const excluded = new Set(config.excludedUserRelayUrls.map(normalizeRelayAddress));
    const relays = [...new Set(config.relayMetadata.relays.filter(relay => relay.write && !excluded.has(normalizeRelayAddress(relay.url))).map(relay => relay.url))];
    if (!relays.length) throw new Error('Enable a write relay before changing your library.');
    const tags = (template.tags ?? []).map(tag => [...tag]);
    const { hostname, protocol } = location;
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
    const isIpAddress = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');
    if (protocol === 'https:' && !isLocalhost && !isIpAddress && !tags.some(([name]) => name === 'client')) tags.push(['client', hostname]);
    const event = await user.signer.signEvent({ kind: template.kind, content: template.content ?? '', tags, created_at: template.created_at ?? Math.floor(Date.now() / 1000) });
    if (event.pubkey !== user.pubkey) throw new Error('The signer returned a different account. No update was published; check your signer and try again.');
    const outcomes = await Promise.allSettled(relays.map(relay => nostr.relay(relay).event(event, { signal: AbortSignal.timeout(5000) })));
    const accepted = outcomes.filter(result => result.status === 'fulfilled').length;
    if (!accepted) throw new Error('No write relay confirmed the update. A relay may still have received it; refresh your library before retrying.');
    if (accepted < relays.length) toast({ title: 'Library update partially delivered', description: `${accepted} of ${relays.length} write relays accepted the update. Other relays may still have an older version.` });
    return event;
  };

  return { mutateAsync: publish };
}
