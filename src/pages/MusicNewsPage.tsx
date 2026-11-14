import { useSeoMeta } from "@unhead/react";
import { BackLink } from "@/components/music/BackLink";
import { MusicNewsCard } from "@/components/music/MusicNewsSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMusicNews } from "@/hooks/useMusicNews";

export default function MusicNewsPage() {
  const news = useMusicNews();

  useSeoMeta({
    title: "Music news on Nostr — Ostrify",
    description: "Discover recent music news, reviews, releases, and articles shared across Nostr.",
  });

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <BackLink to="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary" />
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">From your Nostr relays</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Music news on Nostr</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Recent music updates, reviews, releases, and articles shared across your enabled read relays.</p>
      </header>

      {news.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading music news">
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
        </div>
      ) : news.isError && news.events.length === 0 ? (
        <div role="alert" className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
          Music news could not be loaded from your relays. <button type="button" className="font-medium text-primary hover:underline" onClick={() => void news.refetch()}>Try again</button>
        </div>
      ) : news.events.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No recent music news found on your relays. Posts tagged with music topics will appear here.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">{news.events.length} news {news.events.length === 1 ? "item" : "items"} loaded</p>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {news.events.map((event) => <MusicNewsCard key={event.id} event={event} />)}
          </div>
          {news.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              Couldn’t load more music news. <button type="button" className="underline" onClick={() => void news.fetchNextPage()}>Try again</button>
            </p>
          )}
          {news.hasNextPage && (
            <div className="flex justify-center border-t pt-5">
              <Button type="button" variant="outline" onClick={() => void news.fetchNextPage()} disabled={news.isFetchingNextPage}>
                {news.isFetchingNextPage ? "Loading more news…" : "Load more news"}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
