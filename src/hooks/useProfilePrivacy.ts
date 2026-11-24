import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reconcileLibraryEvent, useLibraryRevision } from '@/lib/libraryQuery';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowedPeople, PROFILE_SECTIONS, PROFILE_HIDDEN_TAG, type ProfileSection } from '@/hooks/useFollowedPeople';

export function useProfilePrivacy(pubkey?: string) {
  const { nostr } = useNostr();
  const client = useQueryClient();
  const { user } = useCurrentUser();
  const followedPeople = useFollowedPeople();
  const target = pubkey ?? user?.pubkey;
  const isOwner = !!user && target === user.pubkey;
  const revision = useLibraryRevision(target ?? '', 30000, 'ostrify-people');
  const remote = useQuery({
    queryKey: ['ostrify-profile-privacy', target ?? ''],
    enabled: !!target && !isOwner,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!target) return null;
      const events = await nostr.query([{ kinds: [30000], authors: [target], '#d': ['ostrify-people'], limit: 20 }], { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) });
      return reconcileLibraryEvent(client, target, 30000, 'ostrify-people', events) ?? null;
    },
  });
  const remoteSections = [...new Set((revision?.tags ?? remote.data?.tags ?? []).filter(([name, value]) => name === PROFILE_HIDDEN_TAG && PROFILE_SECTIONS.includes(value as ProfileSection)).map(([, value]) => value as ProfileSection))];
  const sections = isOwner ? followedPeople.hiddenSections : remoteSections;
  const isLoading = isOwner ? followedPeople.isLoading : remote.isLoading || !remote.isFetched;
  const isError = isOwner ? followedPeople.isError : remote.isError;
  const privacyUnknown = isOwner
    ? !followedPeople.hasReadRelays || followedPeople.isError || (followedPeople.isPartial && !followedPeople.data)
    : remote.isError || !remote.isFetched;

  return {
    isOwner,
    hasReadRelays: followedPeople.hasReadRelays,
    isLoading,
    isError,
    isPartial: isOwner && followedPeople.isPartial,
    privacyUnknown,
    data: sections,
    error: remote.error,
    refetch: isOwner ? followedPeople.refetch : remote.refetch,
    isSaving: followedPeople.setSectionVisibility.isPending,
    saveError: followedPeople.setSectionVisibility.error,
    isHidden: (section: ProfileSection) => privacyUnknown || (sections?.includes(section) ?? false),
    setVisibility: followedPeople.setSectionVisibility,
  };
}
