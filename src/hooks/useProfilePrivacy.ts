import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowedPeople, PROFILE_SECTIONS, PROFILE_HIDDEN_TAG, type ProfileSection } from '@/hooks/useFollowedPeople';

const EMPTY_SECTIONS: ProfileSection[] = [];

export function useProfilePrivacy(pubkey?: string) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const followedPeople = useFollowedPeople();
  const target = pubkey ?? user?.pubkey;
  const isOwner = !!user && target === user.pubkey;
  const remote = useQuery({
    queryKey: ['ostrify-profile-privacy', target ?? ''],
    enabled: !!target && !isOwner,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!target) return EMPTY_SECTIONS;
      const events = await nostr.query([{ kinds: [30000], authors: [target], '#d': ['ostrify-people'], limit: 5 }], { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
      const event = events.filter(item => item.pubkey === target && item.kind === 30000 && item.tags.some(([name, value]) => name === 'd' && value === 'ostrify-people')).sort((a, b) => b.created_at - a.created_at)[0];
      return [...new Set((event?.tags ?? []).filter(([name, value]) => name === PROFILE_HIDDEN_TAG && PROFILE_SECTIONS.includes(value as ProfileSection)).map(([, value]) => value as ProfileSection))];
    },
  });
  const sections = isOwner ? followedPeople.hiddenSections : remote.data;
  const isLoading = isOwner ? followedPeople.isLoading : remote.isLoading || !remote.isFetched;
  const isError = isOwner ? followedPeople.isError : remote.isError;
  const privacyUnknown = !isOwner && (remote.isError || !remote.isFetched);

  return {
    isOwner,
    hasReadRelays: followedPeople.hasReadRelays,
    isLoading,
    isError,
    data: sections,
    error: remote.error,
    refetch: isOwner ? followedPeople.refetch : remote.refetch,
    isSaving: followedPeople.setSectionVisibility.isPending,
    saveError: followedPeople.setSectionVisibility.error,
    isHidden: (section: ProfileSection) => privacyUnknown || (sections?.includes(section) ?? false),
    setVisibility: followedPeople.setSectionVisibility,
  };
}
