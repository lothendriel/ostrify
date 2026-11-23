import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AudiobookCover } from "@/components/music/AudiobookCover";
import { Skeleton } from "@/components/ui/skeleton";
import { useGutenbergAudiobook, useGutenbergAudiobookCatalog, type GutenbergAudiobook } from "@/hooks/useGutenbergAudiobooks";
import { audiobookPath } from "@/hooks/useAudiobookLibrary";
import { useLibriVoxBook, useLibriVoxCatalog, type LibriVoxBook } from "@/hooks/useLibriVox";
import { usePlayer } from "@/hooks/usePlayer";
import type { Track } from "@/lib/music";

type FeaturedBook = LibriVoxBook | GutenbergAudiobook;
type FeaturedSource = "librivox" | "gutenberg";
interface FeaturedPicks {
  weekly: FeaturedBook[];
  daily: FeaturedBook[];
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getPeriodKeys(date: Date): { day: string; week: string } {
  const day = date.toISOString().slice(0, 10);
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  return { day, week: weekStart.toISOString().slice(0, 10) };
}

function pickDistinct(books: FeaturedBook[], seed: string, count: number, excludedIds: Set<string> = new Set()): FeaturedBook[] {
  const sorted = books.filter(book => !excludedIds.has(book.id)).sort((left, right) => left.catalogId.localeCompare(right.catalogId));
  if (!sorted.length || count <= 0) return [];
  const start = hashSeed(seed) % sorted.length;
  return Array.from({ length: Math.min(count, sorted.length) }, (_, index) => sorted[(start + index) % sorted.length]);
}

function chooseFeaturedBooks(books: FeaturedBook[], day: string, week: string): FeaturedPicks {
  const librivox = books.filter(book => book.source === "librivox");
  const gutenberg = books.filter(book => book.source === "gutenberg");
  const preferredWeeklySource: FeaturedSource = hashSeed(week) % 2 === 0 ? "librivox" : "gutenberg";
  const weeklyPool = preferredWeeklySource === "librivox"
    ? librivox.length ? librivox : gutenberg
    : gutenberg.length ? gutenberg : librivox;
  const weekly = pickDistinct(weeklyPool, `weekly:${week}`, 2);
  const usedIds = new Set(weekly.map(book => book.id));
  weekly.push(...pickDistinct(books, `weekly-fill:${week}`, 2 - weekly.length, usedIds));
  for (const book of weekly) usedIds.add(book.id);

  const alternateSourcePool = weekly[0]?.source === "librivox" ? gutenberg : librivox;
  const daily = pickDistinct(alternateSourcePool, `daily:${day}`, 2, usedIds);
  for (const book of daily) usedIds.add(book.id);
  daily.push(...pickDistinct(books, `daily-fill:${day}`, 2 - daily.length, usedIds));

  return { weekly, daily };
}

function useUtcDayClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) + 25;
    const timer = window.setTimeout(() => setNow(new Date()), Math.max(25, nextMidnight - Date.now()));
    return () => window.clearTimeout(timer);
  }, [now]);
  return now;
}

function useBookDetails(book: FeaturedBook | undefined) {
  const librivox = useLibriVoxBook(book?.source === "librivox" ? book.catalogId : undefined);
  const gutenberg = useGutenbergAudiobook(book?.source === "gutenberg" ? book.catalogId : undefined);
  return book?.source === "gutenberg" ? gutenberg : librivox;
}

function PickCard({ book }: { book: FeaturedBook }) {
  const details = useBookDetails(book);
  const player = usePlayer();
  const tracks = details.data?.chapters ?? [];
  const isCurrent = tracks.some(track => track.id === player.current?.id);
  const isPlaying = isCurrent && player.isPlaying;
  const sourceLabel = book.source === "gutenberg" ? "Project Gutenberg" : "LibriVox";
  const canPlay = tracks.length > 0;

  const playBook = () => {
    if (isCurrent) player.togglePlay();
    else if (canPlay) player.playQueue(tracks);
  };

  return (
    <article className="flex min-w-0 flex-col items-center gap-1 px-1.5 py-1 text-center sm:px-2">
      <Link to={audiobookPath(book)} className="flex min-w-0 flex-col items-center gap-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">
        <AudiobookCover key={book.id} book={book} className="h-28 w-20 shrink-0 rounded-lg border border-white/20 bg-white/10 shadow-md sm:h-32 sm:w-24" />
        <span className="line-clamp-2 min-h-9 max-w-full text-sm font-semibold leading-tight text-white hover:underline">{book.title}</span>
      </Link>
      <p className="max-w-full truncate text-xs leading-tight text-white/75">{book.author}</p>
      <p className="text-[0.65rem] font-medium leading-none text-emerald-100/90">{sourceLabel}</p>
      <Button type="button" size="sm" variant="secondary" disabled={!canPlay} onClick={playBook} className="mt-0.5 h-8 min-w-24 rounded-full border border-white/20 bg-white/90 px-3 text-xs text-slate-950 hover:bg-white disabled:bg-white/70 disabled:text-slate-600">
        {isPlaying ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
        {isPlaying ? "Pause" : details.isLoading ? "Loading" : details.isError || !canPlay ? "Unavailable" : "Listen"}
      </Button>
    </article>
  );
}

function PickSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1 px-1.5 py-1">
      <Skeleton className="h-28 w-20 rounded-lg bg-white/20 sm:h-32 sm:w-24" />
      <Skeleton className="h-4 w-24 bg-white/20" />
      <Skeleton className="h-3 w-16 bg-white/20" />
      <Skeleton className="h-8 w-24 rounded-full bg-white/20" />
    </div>
  );
}

export function FeaturedAudiobooks({ enabled }: { enabled: boolean }) {
  const now = useUtcDayClock();
  const { day, week } = getPeriodKeys(now);
  const librivoxCatalog = useLibriVoxCatalog("", "title", enabled);
  const gutenbergCatalog = useGutenbergAudiobookCatalog("", "title", enabled);

  const books = useMemo(() => {
    const unique = new Map<string, FeaturedBook>();
    for (const book of [
      ...(librivoxCatalog.data?.pages.flatMap(page => page.books) ?? []),
      ...(gutenbergCatalog.data?.pages.flatMap(page => page.books) ?? []),
    ]) unique.set(book.id, book);
    return [...unique.values()];
  }, [librivoxCatalog.data, gutenbergCatalog.data]);
  const picks = useMemo(() => chooseFeaturedBooks(books, day, week), [books, day, week]);
  const isLoading = enabled && (
    (!librivoxCatalog.data && librivoxCatalog.isLoading)
    || (!gutenbergCatalog.data && gutenbergCatalog.isLoading)
  );
  const showSkeletons = !enabled || isLoading;

  if (enabled && !books.length && !isLoading) {
    return <p role="status" className="mx-auto max-w-xl rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Featured audiobooks are temporarily unavailable. Please try again later.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h2 className="text-center text-lg font-semibold tracking-tight">Featured audiobooks</h2>
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-950 text-white shadow-sm">
        <img src="/library-background.webp" alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 size-full object-cover opacity-40" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/75 to-slate-950/85" />
        <div className="relative grid grid-cols-1 divide-y divide-white/20 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <section aria-labelledby="weekly-featured-audiobooks" className="min-w-0 space-y-1.5 px-3 py-3 sm:px-4">
            <h3 id="weekly-featured-audiobooks" className="text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-200">This week’s picks</h3>
            <div className="grid grid-cols-2 divide-x divide-white/15">
              {showSkeletons ? <><PickSkeleton /><PickSkeleton /></> : picks.weekly.map(book => <PickCard key={book.id} book={book} />)}
            </div>
          </section>
          <section aria-labelledby="daily-featured-audiobooks" className="min-w-0 space-y-1.5 px-3 py-3 sm:px-4">
            <h3 id="daily-featured-audiobooks" className="text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-200">Today’s picks</h3>
            <div className="grid grid-cols-2 divide-x divide-white/15">
              {showSkeletons ? <><PickSkeleton /><PickSkeleton /></> : picks.daily.map(book => <PickCard key={book.id} book={book} />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
