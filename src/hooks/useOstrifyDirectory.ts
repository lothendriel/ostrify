import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { sanitizeUrl } from '@/lib/sanitize';

const DIRECTORY_ID = 'ostrify-directory-v1';
const DIRECTORY_TOPIC = 'ostrify-directory-v1';
const KIND = 30078;
const HEX = /^[0-9a-f]{64}$/;

function isDirectoryEvent(event: NostrEvent): boolean {
  return event.kind === KIND && HEX.test(event.pubkey) &&
    event.tags.some(([name, value]) => name === 'd' && value === DIRECTORY_ID) &&
    event.tags.some(([name, value]) => name === 't' && value === DIRECTORY_TOPIC) &&
    event.tags.filter(([name]) => name === 'status').length === 1 &&
    event.tags.some(([name, value]) => name === 'status' && (value === 'active' || value === 'inactive'));
}

/** NIP-01 replaceable tie-breaking: lower event id wins at equal timestamps. */
function newer(a: NostrEvent, b: NostrEvent): boolean {
  return a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);
}

function latestByAuthor(events: NostrEvent[]): NostrEvent[] {
  const map = new Map<string, NostrEvent>();
  for (const event of events) {
    if (!isDirectoryEvent(event)) continue;
    const previous = map.get(event.pubkey);
    if (!previous || newer(event, previous)) map.set(event.pubkey, event);
  }
  return [...map.values()];
}

export function useDirectoryEnrollment() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publish } = useNostrPublish();
  const client = useQueryClient();
  const { config } = useAppContext();
  const relayKey = config.relayMetadata.relays.filter(r => r.read).map(r => r.url).sort().join('|');
  const key = ['ostrify-directory-enrollment', user?.pubkey ?? '', relayKey];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && !!relayKey,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!user) return undefined;
      const events = await nostr.query([{ kinds: [KIND], authors: [user.pubkey], '#d': [DIRECTORY_ID], limit: 20 }], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      return latestByAuthor(events.filter(event => event.pubkey === user.pubkey))[0] ?? null;
    },
  });
  const update = useMutation({
    mutationFn: async (active: boolean) => {
      if (!user) throw new Error('Log in to change directory visibility.');
      if (!relayKey) throw new Error('Enable a read relay before changing directory visibility.');
      // Check the author's latest listing before replacing it. Never infer absence
      // from a failed query or overwrite a different user's addressable event.
      const events = await nostr.query([{ kinds: [KIND], authors: [user.pubkey], '#d': [DIRECTORY_ID], limit: 20 }], { signal: AbortSignal.timeout(8000) });
      const previous = latestByAuthor(events.filter(event => event.pubkey === user.pubkey))[0];
      const now = Math.floor(Date.now() / 1000);
      if (previous && previous.created_at >= now) throw new Error('Please wait a moment before changing visibility again.');
      return publish({ kind: KIND, content: '', created_at: now, tags: [['d', DIRECTORY_ID], ['t', DIRECTORY_TOPIC], ['status', active ? 'active' : 'inactive'], ['alt', active ? 'Ostrify directory listing' : 'Ostrify directory listing withdrawn']] });
    },
    onSuccess: event => {
      client.setQueryData(key, event);
      void client.invalidateQueries({ queryKey: ['ostrify-directory'] });
    },
  });
  return { ...query, enabled: query.data?.tags.some(([name, value]) => name === 'status' && value === 'active') ?? false, update, hasReadRelays: !!relayKey };
}

export interface DirectoryPerson { pubkey: string; name: string; picture?: string }

/** This is public discovery, not a trusted-owner lookup: each listing speaks only for its own author. */
export function useOstrifyDirectory() {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const relays = [...new Set(config.relayMetadata.relays.filter(r => r.read).map(r => r.url))].sort();
  const relayKey = relays.join('|');
  const query = useQuery({
    queryKey: ['ostrify-directory', relayKey], enabled: !!relayKey, retry: false,
    queryFn: async ({ signal }): Promise<DirectoryPerson[]> => {
      // Query active AND withdrawn versions under the same indexed topic; querying
      // active only would allow an old opt-in to survive a newer withdrawal.
      const events = await nostr.query([{ kinds: [KIND], '#d': [DIRECTORY_ID], '#t': [DIRECTORY_TOPIC], limit: 500 }], { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      const active = latestByAuthor(events).filter(event => event.tags.some(([name, value]) => name === 'status' && value === 'active'));
      if (!active.length) return [];
      const authors = active.map(event => event.pubkey);
      const profiles = await nostr.query([{ kinds: [0], authors, limit: Math.max(100, authors.length * 2) }], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      const newest = new Map<string, NostrEvent>();
      for (const event of profiles) {
        if (event.kind !== 0 || !authors.includes(event.pubkey)) continue;
        const previous = newest.get(event.pubkey);
        if (!previous || newer(event, previous)) newest.set(event.pubkey, event);
      }
      return authors.map(pubkey => {
        const event = newest.get(pubkey);
        let metadata: Record<string, unknown> = {};
        try { const parsed: unknown = JSON.parse(event?.content ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>; } catch { /* no profile metadata */ }
        const display = typeof metadata.display_name === 'string' ? metadata.display_name.trim() : '';
        const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
        const picture = sanitizeUrl(typeof metadata.picture === 'string' ? metadata.picture : undefined);
        return { pubkey, name: display || name || `User ${pubkey.slice(0, 8)}`, picture };
      }).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  return { ...query, hasReadRelays: !!relayKey };
}
