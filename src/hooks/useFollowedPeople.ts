import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLibraryPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { queryLibraryEvents, withLibraryWrite, readLibraryForWrite, rememberLibraryWrite, recentLibraryEvent, newestLibraryEvent, nextLibraryTimestamp, libraryWriteWarning } from '@/lib/libraryQuery';
import { useToast } from '@/hooks/useToast';
import { getUserDataReadRelays } from '@/lib/appRelays';

const ID = 'ostrify-people';
const MIGRATION_TAG = 'ostrify-migration';
const MIGRATION_VALUE = 'nip17-friends-v1';
export const PROFILE_HIDDEN_TAG = 'ostrify-hide';
const HIDDEN_TAG = PROFILE_HIDDEN_TAG;
export const PROFILE_SECTIONS = ['liked', 'artists', 'people', 'playlists', 'podcasts', 'albums'] as const;
export type ProfileSection = typeof PROFILE_SECTIONS[number];
const HEX = /^[0-9a-f]{64}$/;

function newest(events: NostrEvent[], author: string): NostrEvent | null {
  return events.filter(e => e.kind === 30000 && e.pubkey === author && e.tags.some(([name, value]) => name === 'd' && value === ID))
    .sort((a, b) => b.created_at - a.created_at)[0] ?? null;
}

/** A public NIP-51 follow set separate from the user's NIP-02 follows and friends. */
export function useFollowedPeople() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const { mutateAsync: publish } = useLibraryPublish();
  const client = useQueryClient();
  const { toast } = useToast();
  const readRelays = getUserDataReadRelays(config.appRelayMetadata, config.userRelayMetadata, config.userRelayPubkey, user?.pubkey ?? '', config.excludedUserRelayUrls, config.excludedUserRelayPubkey);
  const relayKey = readRelays.join('|');
  const key = ['ostrify-followed-people', user?.pubkey ?? '', relayKey];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && !!relayKey,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const { events } = await queryLibraryEvents(nostr, readRelays, [{ kinds: [30000], authors: [user.pubkey], '#d': [ID], limit: 20 }], AbortSignal.any([signal, AbortSignal.timeout(8000)]));
      const relay = newest(events, user.pubkey);
      const recent = recentLibraryEvent(user.pubkey, 30000, ID);
      return newestLibraryEvent([relay, recent].filter((event): event is NostrEvent => !!event)) ?? null;
    },
  });
  const people = [...new Set((query.data?.tags ?? []).filter(([name, value]) => name === 'p' && HEX.test(value ?? '') && value !== user?.pubkey).map(([, value]) => value))];
  const hiddenSections = [...new Set((query.data?.tags ?? []).filter(([name, value]) => name === HIDDEN_TAG && PROFILE_SECTIONS.includes(value as ProfileSection)).map(([, value]) => value as ProfileSection))];
  const isHidden = (section: ProfileSection): boolean => hiddenSections.includes(section);

  async function withPeopleWrite(action: (existing: NostrEvent | undefined) => Promise<NostrEvent | undefined>): Promise<NostrEvent | undefined> {
    if (!user) throw new Error('Log in to change your followed people.');
    return withLibraryWrite(user.pubkey, 30000, ID, async () => {
      const result = await readLibraryForWrite(nostr, readRelays, user.pubkey, 30000, ID, client.getQueryData<NostrEvent | null>(key) ?? undefined);
      const event = await action(result.event);
      if (event) client.setQueryData(key, event);
      const warning = libraryWriteWarning(result.partial);
      if (warning) toast({ title: 'Library sync may be incomplete', description: warning });
      return event;
    });
  }

  async function savePeople(existing: NostrEvent | undefined, tags: string[][]): Promise<NostrEvent> {
    const created_at = await nextLibraryTimestamp(existing?.created_at);
    const event = await publish({ kind: 30000, content: existing?.content ?? '', tags, created_at });
    rememberLibraryWrite(event, ID);
    return event;
  }

  const setSectionVisibility = useMutation({
    mutationFn: async ({ section, visible }: { section: ProfileSection; visible: boolean }) => {
      if (!user) throw new Error('Log in to update profile privacy.');
      if (!relayKey) throw new Error('Enable a read relay to update profile privacy.');
      return withPeopleWrite(async existing => {
        const tags: string[][] = existing ? existing.tags.filter(([name, value]) => !(name === HIDDEN_TAG && value === section) && !(name === 'p' && HEX.test(value ?? ''))).map(tag => [...tag]) : [['d', ID], ['title', 'Ostrify followed people']];
        if (existing) {
          const people = [...new Set(existing.tags.filter(([name, value]) => name === 'p' && HEX.test(value ?? '') && value !== user.pubkey).map(([, value]) => value))];
          tags.push(...people.map(pubkey => ['p', pubkey]));
        }
        if (!visible) tags.push([HIDDEN_TAG, section]);
        return savePeople(existing, tags);
      });
    },
    onSuccess: () => {
      window.dispatchEvent(new Event('ostrify-profile-privacy'));
    },
  });

  const mergePeople = useMutation({
    mutationFn: async (pubkeys: string[]) => {
      if (!user) throw new Error('Log in to follow people.');
      if (!relayKey) throw new Error('Enable a read relay to check your followed people.');
      const additions = [...new Set(pubkeys.filter(pubkey => HEX.test(pubkey) && pubkey !== user.pubkey))];
      return withPeopleWrite(async existing => {
        const current = [...new Set((existing?.tags ?? []).filter(([name, value]) => name === 'p' && HEX.test(value ?? '') && value !== user.pubkey).map(([, value]) => value))];
        const next = [...current, ...additions.filter(pubkey => !current.includes(pubkey))];
        const hasMigrationMarker = existing?.tags.some(([name, value]) => name === MIGRATION_TAG && value === MIGRATION_VALUE) ?? false;
        if (next.length === current.length && hasMigrationMarker) return existing;
        const tags: string[][] = existing ? existing.tags.filter(([name, value]) => !(name === 'p' && HEX.test(value ?? '')) && !(name === MIGRATION_TAG && value === MIGRATION_VALUE)).map(tag => [...tag]) : [['d', ID], ['title', 'Ostrify followed people']];
        if (existing && !existing.tags.some(([name, value]) => name === 'd' && value === ID)) tags.unshift(['d', ID]);
        tags.push(...next.map(pubkey => ['p', pubkey]), [MIGRATION_TAG, MIGRATION_VALUE]);
        return savePeople(existing, tags);
      });
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: key }); },
  });

  const toggle = useMutation({
    mutationFn: async ({ pubkey, follow }: { pubkey: string; follow: boolean }) => {
      if (!user) throw new Error('Log in to follow people.');
      if (!HEX.test(pubkey) || pubkey === user.pubkey) throw new Error('Choose another valid Nostr profile.');
      if (!relayKey) throw new Error('Enable a read relay to check your followed people.');
      return withPeopleWrite(async existing => {
        const current = [...new Set((existing?.tags ?? []).filter(([name, value]) => name === 'p' && HEX.test(value ?? '') && value !== user.pubkey).map(([, value]) => value))];
        const next = follow
          ? (current.includes(pubkey) ? current : [...current, pubkey])
          : current.filter(person => person !== pubkey);
        if (next.length === current.length) return existing;
        // Keep exactly one `p` tag per friend; preserve metadata, privacy and unknown tags.
        const tags: string[][] = existing ? existing.tags.filter(([name, value]) => !(name === 'p' && HEX.test(value ?? ''))).map(tag => [...tag]) : [['d', ID], ['title', 'Ostrify followed people']];
        if (existing && !existing.tags.some(([name, value]) => name === 'd' && value === ID)) tags.unshift(['d', ID]);
        tags.push(...next.map(person => ['p', person]));
        return savePeople(existing, tags);
      });
    },
    onSuccess: () => {
      window.dispatchEvent(new Event('ostrify-profile-privacy'));
    },
  });
  return { ...query, people, hiddenSections, isHidden, setSectionVisibility, toggle, mergePeople, hasReadRelays: !!relayKey };
}
