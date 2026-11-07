import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';

const ID = 'ostrify-people';
const HEX = /^[0-9a-f]{64}$/;

function newest(events: NostrEvent[], author: string): NostrEvent | null {
  return events.filter(e => e.kind === 30000 && e.pubkey === author && e.tags.some(([name, value]) => name === 'd' && value === ID))
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0] ?? null;
}

/** A public NIP-51 follow set separate from the user's NIP-02 follows and friends. */
export function useFollowedPeople() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useNostrPublish();
  const client = useQueryClient();
  const readRelays = config.relayMetadata.relays.filter(relay => relay.read).map(relay => relay.url).sort();
  const relayKey = readRelays.join('|');
  const key = ['ostrify-followed-people', user?.pubkey ?? '', relayKey];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && !!relayKey,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const events = await nostr.query([{ kinds: [30000], authors: [user.pubkey], '#d': [ID], limit: 20 }], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      return newest(events, user.pubkey);
    },
  });
  const people = [...new Set((query.data?.tags ?? []).filter(([name, value]) => name === 'p' && HEX.test(value ?? '')).map(([, value]) => value))];

  const toggle = useMutation({
    mutationFn: async ({ pubkey, follow }: { pubkey: string; follow: boolean }) => {
      if (!user) throw new Error('Log in to follow people.');
      if (!HEX.test(pubkey) || pubkey === user.pubkey) throw new Error('Choose another valid Nostr profile.');
      if (!relayKey) throw new Error('Enable a read relay to check your followed people.');
      const events = await nostr.query([{ kinds: [30000], authors: [user.pubkey], '#d': [ID], limit: 20 }], { signal: AbortSignal.timeout(8000) });
      const fromRelays = newest(events, user.pubkey);
      const cached = client.getQueryData<NostrEvent | null>(key);
      const existing = fromRelays && cached ? newest([fromRelays, cached], user.pubkey) : fromRelays ?? cached ?? null;
      const already = existing?.tags.some(([name, value]) => name === 'p' && value === pubkey) ?? false;
      if (already === follow) return existing;
      // Preserve encrypted private items, metadata, relay hints and unknown tags.
      const tags = existing ? existing.tags.filter(([name, value]) => !(name === 'p' && value === pubkey)).map(tag => [...tag]) : [['d', ID], ['title', 'Ostrify followed people']];
      if (follow) tags.push(['p', pubkey]);
      const now = Math.floor(Date.now() / 1000);
      if (existing && existing.created_at >= now) throw new Error('Please wait a moment before updating your followed people again.');
      return publish({ kind: 30000, content: existing?.content ?? '', tags, created_at: now });
    },
    onSuccess: event => { if (event) client.setQueryData(key, event); },
  });
  return { ...query, people, toggle, hasReadRelays: !!relayKey };
}
