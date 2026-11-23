import { useEffect, useMemo, useState } from "react";
import { BookOpen, Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGutenbergAudiobook, useGutenbergAudiobookCatalog, type GutenbergAudiobook } from "@/hooks/useGutenbergAudiobooks";
import { audiobookPath, type SavedAudiobook } from "@/hooks/useAudiobookLibrary";
import { useLibriVoxBook, useLibriVoxCatalog, type LibriVoxBook } from "@/hooks/useLibriVox";
import { usePlayer } from "@/hooks/usePlayer";
import { sanitizeUrl } from "@/lib/sanitize";
import type { Track } from "@/lib/music";

type FeaturedBook = LibriVoxBook | GutenbergAudiobook;
type FeaturedSource = "librivox" | "gutenberg";

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

function pickFrom(books: FeaturedBook[], seed: string): FeaturedBook | undefined {
  if (!books.length) return undefined;
  const sorted = [...books].sort((left, right) => left.catalogId.localeCompare(right.catalogId));
  return sorted[hashSeed(seed) % sorted.length];
}

function chooseFeaturedBooks(books: FeaturedBook[], day: string, week: string): { weekly?: FeaturedBook; daily?: FeaturedBook } {
  const librivox = books.filter(book => book.source === "librivox");
  const gutenberg = books.filter(book => book.source === "gutenberg");
  // Alternate the weekly source by week, and use the other catalog for today's pick when possible.
  const preferredWeeklySource: FeaturedSource = hashSeed(week) % 2 === 0 ? "librivox" : "gutenberg";
  const weeklyPool = preferredWeeklySource === "librivox"
    ? librivox.length ? librivox : gutenberg
    : gutenberg.length ? gutenberg : librivox;
  const weekly = pickFrom(weeklyPool, `weekly:${week}`);
  const otherSourcePool = weekly?.source === "librivox" ? gutenberg : librivox;
  const dailyPool = otherSourcePool.length
    ? otherSourcePool
    : books.filter(book => book.id !== weekly?.id);
  const daily = pickFrom(dailyPool, `daily:${day}`);
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

function Cover({ book }: { book: SavedAudiobook }) {
  const [failed, setFailed] = useState(false);
  const cover = sanitizeUrl(book.covers[0]);
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/20 bg-white/10 shadow-md sm:size-[4.5rem]">
      {cover && !failed ? (
        <img src={cover} alt={`${book.title} cover`} loading="eager" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <BookOpen aria-hidden="true" className="size-7 text-white/75" />
      )}
    </div>
  );
}

function PickCard({
  book,
  label,
  details,
  onPlay,
  isPlaying,
}: {
  book: FeaturedBook;
  label: string;
  details: { data?: { chapters: Track[] } | null; isLoading: boolean; isError: boolean };
  onPlay: () => void;
  isPlaying: boolean;
}) {
  const sourceLabel = book.source === "gutenberg" ? "Project Gutenberg" : "LibriVox";
  const canPlay = !!details.data?.chapters.length;

  return (
    <article className="flex min-w-0 flex-col items-center gap-2 px-1 py-2 text-center sm:px-3">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-200">{label}</p>
      <Link to={audiobookPath(book)} className="flex min-w-0 flex-col items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">
        <Cover key={book.id} book={book} />
        <span className="line-clamp-2 min-h-10 max-w-full text-sm font-semibold leading-5 text-white hover:underline">{book.title}</span>
      </Link>
      <p className="max-w-full truncate text-xs text-white/75">{book.author}</p>
      <p className="text-[0.65rem] font-medium text-emerald-100/90">{sourceLabel}</p>
      <Button type="button" size="sm" variant="secondary" disabled={!canPlay} onClick={onPlay} className="mt-1 h-8 min-w-24 rounded-full border border-white/20 bg-white/90 px-3 text-xs text-slate-950 hover:bg-white disabled:bg-white/70 disabled:text-slate-600">
        {isPlaying ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
        {isPlaying ? "Pause" : details.isLoading ? "Loading" : details.isError || !canPlay ? "Unavailable" : "Listen"}
      </Button>
    </article>
  );
}

function PickSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 px-1 py-3">
      <Skeleton className="h-3 w-20 bg-white/20" />
      <Skeleton className="size-16 rounded-lg bg-white/20 sm:size-[4.5rem]" />
      <Skeleton className="h-4 w-28 bg-white/20" />
      <Skeleton className="h-3 w-20 bg-white/20" />
      <Skeleton className="h-8 w-24 rounded-full bg-white/20" />
    </div>
  );
}

export function FeaturedAudiobooks({ enabled }: { enabled: boolean }) {
  const now = useUtcDayClock();
  const { day, week } = getPeriodKeys(now);
  const librivoxCatalog = useLibriVoxCatalog("", "title", enabled);
  const gutenbergCatalog = useGutenbergAudiobookCatalog("", "title", enabled);
  const player = usePlayer();

  const books = useMemo(() => {
    const unique = new Map<string, FeaturedBook>();
    for (const book of [
      ...(librivoxCatalog.data?.pages.flatMap(page => page.books) ?? []),
      ...(gutenbergCatalog.data?.pages.flatMap(page => page.books) ?? []),
    ]) unique.set(book.id, book);
    return [...unique.values()];
  }, [librivoxCatalog.data, gutenbergCatalog.data]);
  const picks = useMemo(() => chooseFeaturedBooks(books, day, week), [books, day, week]);
  const weeklyDetails = useBookDetails(picks.weekly);
  const dailyDetails = useBookDetails(picks.daily);
  const weeklyTracks = weeklyDetails.data?.chapters ?? [];
  const dailyTracks = dailyDetails.data?.chapters ?? [];
  const weeklyIsCurrent = weeklyTracks.some(track => track.id === player.current?.id);
  const dailyIsCurrent = dailyTracks.some(track => track.id === player.current?.id);
  const isLoading = enabled && books.length === 0 && (librivoxCatalog.isLoading || gutenbergCatalog.isLoading);

  const playBook = (tracks: Track[], isCurrent: boolean) => {
    if (isCurrent) player.togglePlay();
    else if (tracks.length) player.playQueue(tracks);
  };

  if (!enabled) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-slate-950 p-4 text-white shadow-sm sm:p-5" aria-hidden="true">
        <div className="grid grid-cols-2 divide-x divide-white/15">
          <PickSkeleton />
          <PickSkeleton />
        </div>
      </div>
    );
  }

  if (!books.length && !isLoading) {
    return <p role="status" className="mx-auto max-w-xl rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Featured audiobooks are temporarily unavailable. Please try again later.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h2 className="text-center text-lg font-semibold tracking-tight">Featured audiobooks</h2>
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-950 text-white shadow-sm">
        <img src="/library-background.webp" alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 size-full object-cover opacity-40" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/75 to-slate-950/85" />
        <div className="relative grid grid-cols-2 divide-x divide-white/20 px-3 py-2 sm:px-5 sm:py-3">
          {isLoading ? <><PickSkeleton /><PickSkeleton /></> : <>
            {picks.weekly && <PickCard book={picks.weekly} label="This week" details={weeklyDetails} isPlaying={weeklyIsCurrent && player.isPlaying} onPlay={() => playBook(weeklyTracks, weeklyIsCurrent)} />}
            {picks.daily && <PickCard book={picks.daily} label="Today’s pick" details={dailyDetails} isPlaying={dailyIsCurrent && player.isPlaying} onPlay={() => playBook(dailyTracks, dailyIsCurrent)} />}
          </>}
        </div>
      </div>
    </div>
  );
}
