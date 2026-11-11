import { useInfiniteQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";

export const MUSIC_NEWS_TAGS = [
  "music",
  "musicnews",
  "newmusic",
  "musicindustry",
  "musicjournalism",
  "musicreview",
  "albumreview",
  "musicbusiness",
  "musictechnology",
  "concert",
  "livemusic",
];

const PAGE_SIZE = 60;

export function isMusicNewsEvent(event: NostrEvent): boolean {
  if (event.kind !== 1 && event.kind !== 30023) return false;
  if (event.kind === 30023 && !event.tags.find(([name]) => name === "d")?.[1]) return false;

  const hashtags = event.tags.flatMap(([name, value]) => name === "t" && value ? [value.toLowerCase()] : []);
  const text = event.content.toLowerCase();
  const broadMusicTag = hashtags.includes("music");
  const focusedTopic = MUSIC_NEWS_TAGS.some((tag) => tag !== "music" && hashtags.includes(tag));
  const editorialCue = /\b(news|review|album|single|release|announces?|announced|tour|concert|festival|industry|label|record deal|charts?|interview|music video)\b/i.test(text);
  return focusedTopic || (broadMusicTag && editorialCue);
}

export function useMusicNews() {
  const { nostr } = useNostr();
  const query = useInfiniteQuery({
    queryKey: ["music-news", MUSIC_NEWS_TAGS],
    initialPageParam: undefined as number | undefined,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ pageParam, signal }): Promise<NostrEvent[]> => {
      const events = await nostr.query(
        [{ kinds: [1, 30023], "#t": MUSIC_NEWS_TAGS, limit: PAGE_SIZE, ...(pageParam !== undefined ? { until: pageParam } : {}) }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      return [...new Map(events.map((event) => [event.id, event])).values()]
        .sort((a, b) => b.created_at - a.created_at);
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const oldest = Math.min(...lastPage.map((event) => event.created_at));
      return oldest - 1;
    },
  });

  const events = [...new Map((query.data?.pages.flat() ?? [])
    .filter(isMusicNewsEvent)
    .map((event) => [event.id, event])).values()]
    .sort((a, b) => b.created_at - a.created_at);

  return { ...query, events };
}
