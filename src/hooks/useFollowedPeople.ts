import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';

const ID = 'ostrify-people';
const MIGRATION_TAG = 'ostrify-migration';
const MIGRATION_VALUE = 'nip17-friends-v1';
export const PROFILE_HIDDEN_TAG = 'ostrify-hide';
const HIDDEN_TAG = PROFILE_HIDDEN_TAG;
export const PROFILE_SECTIONS = ['liked', 'artists', 'people', 'playlists'] as const;
export type ProfileSection = typeof PROFILE_SECTIONS[number];
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
  const people = [...new Set((query.data?.tags ?? []).filter(([name, value]) => name === 'p' && HEX.test(value ?? '') && value !== user?.pubkey).map(([, value]) => value))];
  const hiddenSections = [...new Set((query.data?.tags ?? []).filter(([name, value]) => name === HIDDEN_TAG && PROFILE_SECTIONS.includes(value as ProfileSection)).map(([, value]) => value as ProfileSection))];
  const isHidden = (section: ProfileSection): boolean => hiddenSections.includes(section);

  const setSectionVisibility = useMutation({
    mutationFn: async ({ section, visible }: { section: ProfileSection; visible: boolean }) => {
      if (!user) throw new Error('Log in to update profile privacy.');
      if (!relayKey) throw new Error('Enable a read relay to update profile privacy.');
      const events = await nostr.query([{ kinds: [30000], authors: [user.pubkey], '#d': [ID], limit: 20 }], { signal: AbortSignal.timeout(8000) });
      const fromRelays = newest(events, user.pubkey);
      const cached = client.getQueryData<NostrEvent | null>(key);
      const existing = fromRelays && cached ? newest([fromRelays, cached], user.pubkey) : fromRelays ?? cached ?? null;
      const tags: string[][] = existing ? existing.tags.filter(([name, value]) => !(name === HIDDEN_TAG && value === section) && !(name === 'p' && HEX.test(value ?? ''))).map(tag => [...tag]) : [['d', ID], ['title', 'Ostrify followed people']];
      if (existing) {
        const people = [...new Set(existing.tags.filter(([name, value]) => name === 'p' && HEX.test(value ?? '') && value !== user.pubkey).map(([, value]) => value))];
        tags.push(...people.map(pubkey => ['p', pubkey]));
      }
      if (!visible) tags.push([HIDDEN_TAG, section]);
      const now = Math.floor(Date.now() / 1000);
      if (existing && existing.created_at >= now) throw new Error('Please wait a moment before updating profile privacy again.');
      return publish({ kind: 30000, content: existing?.content ?? '', tags, created_at: now });
    },
    onSuccess: event => {
      if (event) client.setQueryData(key, event);
      else client.invalidateQueries({ queryKey: key });
      window.dispatchEvent(new Event('ostrify-profile-privacy'));
    },
  });

  const mergePeople = useMutation({
    mutationFn: async (pubkeys: string[]) => {
      if (!user) throw new Error('Log in to follow people.');
      if (!relayKey) throw new Error('Enable a read relay to check your followed people.');
      const additions = [...new Set(pubkeys.filter(pubkey => HEX.test(pubkey) && pubkey !== user.pubkey))];
      const events = await nostr.query([{ kinds: [30000], authors: [user.pubkey], '#d': [ID], limit: 20 }], { signal: AbortSignal.timeout(8000) });
      const fromRelays = newest(events, user.pubkey);
      const cached = client.getQueryData<NostrEvent | null>(key);
      const existing = fromRelays && cached ? newest([fromRelays, cached], user.pubkey) : fromRelays ?? cached ?? null;
      const current = [...new Set((existing?.tags ?? []).filter(([name, value]) => name === 'p' && HEX.test(value ?? '') && value !== user.pubkey).map(([, value]) => value))];
      const next = [...current, ...additions.filter(pubkey => !current.includes(pubkey))];
      const hasMigrationMarker = existing?.tags.some(([name, value]) => name === MIGRATION_TAG && value === MIGRATION_VALUE) ?? false;
      if (next.length === current.length && hasMigrationMarker) return existing;
      const tags: string[][] = existing ? existing.tags.filter(([name, value]) => !(name === 'p' && HEX.test(value ?? '')) && !(name === MIGRATION_TAG && value === MIGRATION_VALUE)).map(tag => [...tag]) : [['d', ID], ['title', 'Ostrify followed people']];
      if (existing && !existing.tags.some(([name, value]) => name === 'd' && value === ID)) tags.unshift(['d', ID]);
      tags.push(...next.map(pubkey => ['p', pubkey]), [MIGRATION_TAG, MIGRATION_VALUE]);
      const now = Math.floor(Date.now() / 1000);
      if (existing && existing.created_at >= now) throw new Error('Please wait a moment before updating your followed people again.');
      return publish({ kind: 30000, content: existing?.content ?? '', tags, created_at: now });
    },
    onSuccess: async event => {
      if (event) client.setQueryData(key, event);
      else await client.invalidateQueries({ queryKey: key });
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ pubkey, follow }: { pubkey: string; follow: boolean }) => {
      if (!user) throw new Error('Log in to follow people.');
      if (!HEX.test(pubkey) || pubkey === user.pubkey) throw new Error('Choose another valid Nostr profile.');
      if (!relayKey) throw new Error('Enable a read relay to check your followed people.');
      const events = await nostr.query([{ kinds: [30000], authors: [user.pubkey], '#d': [ID], limit: 20 }], { signal: AbortSignal.timeout(8000) });
      const fromRelays = newest(events, user.pubkey);
      const cached = client.getQueryData<NostrEvent | null>(key);
      const existing = fromRelays && cached ? newest([fromRelays, cached], user.pubkey) : fromRelays ?? cached ?? null;
      const already = existing?.tags.some(([name, value]) => name === 'p' && value === pubkey && pubkey !== user.pubkey) ?? false;
      if (already === follow) return existing;
      // Preserve encrypted private items, metadata, relay hints and unknown tags.
      const tags: string[][] = existing ? existing.tags.filter(([name, value]) => !(name === 'p' && value === pubkey)).map(tag => [...tag]) : [['d', ID], ['title', 'Ostrify followed people']];
      if (follow) tags.push(['p', pubkey]);
      if (existing && !existing.tags.some(([name, value]) => name === 'd' && value === ID)) tags.unshift(['d', ID]);
      const now = Math.floor(Date.now() / 1000);
      if (existing && existing.created_at >= now) throw new Error('Please wait a moment before updating your followed people again.');
      return publish({ kind: 30000, content: existing?.content ?? '', tags, created_at: now });
    },
    onSuccess: event => {
      if (event) client.setQueryData(key, event);
      window.dispatchEvent(new Event('ostrify-profile-privacy'));
    },
  });
  return { ...query, people, hiddenSections, isHidden, setSectionVisibility, toggle, mergePeople, hasReadRelays: !!relayKey };
}
