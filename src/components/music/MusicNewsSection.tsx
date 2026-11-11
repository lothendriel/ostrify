import { useQuery } from "@tanstack/react-query";
import { useNostr } from "@nostrify/react";
import type { NostrEvent } from "@nostrify/nostrify";
import { nip19 } from "nostr-tools";
import { ExternalLink, Newspaper } from "lucide-react";
import { useAuthor } from "@/hooks/useAuthor";
import { genUserName } from "@/lib/sanitize";
import { Skeleton } from "@/components/ui/skeleton";

const MUSIC_NEWS_TAGS = [
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

function newsTitle(event: NostrEvent): string {
  const title = event.tags.find(([name]) => name === "title")?.[1]?.trim();
  if (title) return title;

  const firstLine = event.content.split(/\r?\n/).find((line) => line.trim())?.trim();
  if (!firstLine) return "Music update";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117).trimEnd()}…` : firstLine;
}

function newsExcerpt(event: NostrEvent): string {
  const summary = event.tags.find(([name]) => name === "summary")?.[1]?.trim();
  const text = summary || event.content.replace(/\s+/g, " ").trim();
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
}

function eventLink(event: NostrEvent): string | undefined {
  if (event.kind === 30023) {
    const identifier = event.tags.find(([name]) => name === "d")?.[1];
    if (!identifier) return undefined;
    return `https://njump.me/${nip19.naddrEncode({ identifier, pubkey: event.pubkey, kind: event.kind })}`;
  }

  return `https://njump.me/${nip19.neventEncode({ id: event.id, author: event.pubkey, kind: event.kind })}`;
}

function MusicNewsCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const authorName = author.data?.metadata?.display_name || author.data?.metadata?.name || genUserName(event.pubkey);
  const link = eventLink(event);
  const published = new Date(event.created_at * 1000);

  return (
    <article className="flex min-h-44 flex-col rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Newspaper className="size-4 text-primary" aria-hidden="true" />
        {event.kind === 30023 ? "Article" : "Nostr post"}
      </div>
      <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug">{newsTitle(event)}</h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{newsExcerpt(event)}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span className="truncate">{authorName}</span>
        <time dateTime={published.toISOString()} className="shrink-0">{published.toLocaleDateString()}</time>
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={`Read ${newsTitle(event)} on njump.me`}
        >
          Read on Nostr <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}

export function MusicNewsSection() {
  const { nostr } = useNostr();
  const news = useQuery({
    queryKey: ["home-music-news", MUSIC_NEWS_TAGS],
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1, 30023], "#t": MUSIC_NEWS_TAGS, limit: 60 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      const unique = [...new Map(events.map((event) => [event.id, event])).values()];
      return unique
        .filter((event) => event.kind !== 30023 || Boolean(event.tags.find(([name]) => name === "d")?.[1]))
        .filter((event) => {
          const hashtags = event.tags.flatMap(([name, value]) => name === "t" && value ? [value.toLowerCase()] : []);
          const text = event.content.toLowerCase();
          const broadMusicTag = hashtags.includes("music");
          const focusedTopic = MUSIC_NEWS_TAGS.some((tag) => tag !== "music" && hashtags.includes(tag));
          const editorialCue = /\b(news|review|album|single|release|announces?|announced|tour|concert|festival|industry|label|record deal|charts?|interview|music video)\b/i.test(text);
          return focusedTopic || (broadMusicTag && editorialCue);
        })
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 4);
    },
  });
  const events = news.data ?? [];

  return (
    <section className="space-y-3" aria-labelledby="music-news-heading">
      <div>
        <h2 id="music-news-heading" className="text-2xl font-bold tracking-tight">Music news on Nostr</h2>
        <p className="text-sm text-muted-foreground">Recent music updates and articles shared across your relays.</p>
      </div>
      {news.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}
        </div>
      ) : news.isError ? (
        <div role="alert" className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Music news could not be loaded from your relays. <button type="button" className="font-medium text-primary hover:underline" onClick={() => void news.refetch()}>Try again</button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No recent music news found on your relays. Posts tagged with music topics will appear here.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {events.map((event) => <MusicNewsCard key={event.id} event={event} />)}
        </div>
      )}
    </section>
  );
}
