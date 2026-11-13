import type { NostrEvent } from "@nostrify/nostrify";
import { Link } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { ExternalLink, Newspaper } from "lucide-react";
import { useAuthor } from "@/hooks/useAuthor";
import { useMusicNews } from "@/hooks/useMusicNews";
import { genUserName } from "@/lib/sanitize";
import { Skeleton } from "@/components/ui/skeleton";

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

export function MusicNewsCard({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const authorName = author.data?.metadata?.display_name || author.data?.metadata?.name || genUserName(event.pubkey);
  const link = eventLink(event);
  const published = new Date(event.created_at * 1000);

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30">
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium uppercase tracking-wider">
          <Newspaper className="size-3.5 text-primary" aria-hidden="true" />
          {event.kind === 30023 ? "Article" : "Nostr post"}
        </span>
        <time dateTime={published.toISOString()} className="shrink-0">{published.toLocaleDateString()}</time>
      </div>
      <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug">{newsTitle(event)}</h3>
      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{newsExcerpt(event)}</p>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t pt-2 text-xs">
        <span className="truncate text-muted-foreground">{authorName}</span>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={`Read ${newsTitle(event)} on njump.me`}
          >
            Read <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}

export function MusicNewsSection() {
  const news = useMusicNews();
  const events = news.events.slice(0, 4);

  return (
    <section className="w-full min-w-0 max-w-full space-y-3 overflow-hidden" aria-labelledby="music-news-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="music-news-heading" className="text-2xl font-bold tracking-tight">Music news on Nostr</h2>
        <Link to="/music-news" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
          Read more <span aria-hidden="true">→</span>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">Recent music updates and articles shared across your relays.</p>
      {news.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)}
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
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {events.map((event) => <MusicNewsCard key={event.id} event={event} />)}
        </div>
      )}
    </section>
  );
}
