import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RefreshCw } from "lucide-react";
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
const WEEKLY_PICK_COUNT = 2;
const DAILY_PICK_COUNT = 4;

interface FeaturedPicks {
  weekly: FeaturedBook[];
  daily: FeaturedBook[];
}

const FEATURED_SESSION_KEY = "ostrify:featured-audiobooks:v1";
let sessionPicks: FeaturedPicks | null = null;

function readSessionPicks(): FeaturedPicks | null {
  if (sessionPicks) return sessionPicks;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(FEATURED_SESSION_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const picks = value as Partial<FeaturedPicks>;
    const isBook = (book: FeaturedBook) => book && (book.source === "librivox" || book.source === "gutenberg")
      && typeof book.id === "string" && typeof book.catalogId === "string"
      && typeof book.title === "string" && typeof book.author === "string"
      && Array.isArray(book.covers) && book.covers.every(cover => typeof cover === "string");
    if (!Array.isArray(picks.weekly) || !Array.isArray(picks.daily)
      || ![...picks.weekly, ...picks.daily].every(isBook)
      || picks.weekly.length + picks.daily.length === 0) return null;
    sessionPicks = { weekly: picks.weekly, daily: picks.daily };
    return sessionPicks;
  } catch {
    return null;
  }
}

function saveSessionPicks(picks: FeaturedPicks) {
  sessionPicks = picks;
  try {
    sessionStorage.setItem(FEATURED_SESSION_KEY, JSON.stringify(picks));
  } catch {
    // Preserve the selection in memory if session storage is unavailable.
  }
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

function chooseFeaturedBooks(books: FeaturedBook[], day: string, week: string, variation = ""): FeaturedPicks {
  const librivox = books.filter(book => book.source === "librivox");
  const gutenberg = books.filter(book => book.source === "gutenberg");
  const preferredWeeklySource: FeaturedSource = hashSeed(week) % 2 === 0 ? "librivox" : "gutenberg";
  const weeklyPool = preferredWeeklySource === "librivox"
    ? librivox.length ? librivox : gutenberg
    : gutenberg.length ? gutenberg : librivox;
  const weekly = pickDistinct(weeklyPool, `weekly:${week}:${variation}`, WEEKLY_PICK_COUNT);
  const usedIds = new Set(weekly.map(book => book.id));
  weekly.push(...pickDistinct(books, `weekly-fill:${week}:${variation}`, WEEKLY_PICK_COUNT - weekly.length, usedIds));
  for (const book of weekly) usedIds.add(book.id);

  const alternateSourcePool = weekly[0]?.source === "librivox" ? gutenberg : librivox;
  const daily = pickDistinct(alternateSourcePool, `daily:${day}:${variation}`, DAILY_PICK_COUNT, usedIds);
  for (const book of daily) usedIds.add(book.id);
  daily.push(...pickDistinct(books, `daily-fill:${day}:${variation}`, DAILY_PICK_COUNT - daily.length, usedIds));

  return { weekly, daily };
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
    <article className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors sm:px-2 ${isPlaying ? "border-emerald-300 bg-emerald-950/60" : "border-white/15 bg-black/15 hover:bg-black/25"}`}>
      <Link to={audiobookPath(book)} className="flex min-w-0 flex-col items-center gap-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">
        <span className="relative"><AudiobookCover key={book.id} book={book} className="h-28 w-20 shrink-0 rounded-lg border border-white/20 bg-white/10 shadow-md sm:h-32 sm:w-24" /><span className="absolute left-1 top-1 rounded-full bg-black/80 px-1.5 py-1 text-[9px] font-semibold leading-none text-white">{isPlaying ? "Playing" : "Audiobook"}</span></span>
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
  const [picks, setPicks] = useState(readSessionPicks);
  const [refreshPending, setRefreshPending] = useState(false);
  const catalogEnabled = enabled && !picks;
  const librivoxCatalog = useLibriVoxCatalog("", "title", catalogEnabled);
  const gutenbergCatalog = useGutenbergAudiobookCatalog("", "title", catalogEnabled);

  const books = useMemo(() => {
    const unique = new Map<string, FeaturedBook>();
    for (const book of [
      ...(librivoxCatalog.data?.pages.flatMap(page => page.books) ?? []),
      ...(gutenbergCatalog.data?.pages.flatMap(page => page.books) ?? []),
    ]) unique.set(book.id, book);
    return [...unique.values()];
  }, [librivoxCatalog.data, gutenbergCatalog.data]);
  const isLoading = catalogEnabled && (librivoxCatalog.isFetching || gutenbergCatalog.isFetching);

  useEffect(() => {
    if (!catalogEnabled || isLoading || picks || !books.length) return;
    const { day, week } = getPeriodKeys(new Date());
    const next = chooseFeaturedBooks(books, day, week);
    saveSessionPicks(next);
    setPicks(next);
  }, [books, catalogEnabled, isLoading, picks]);

  const refreshPicks = async () => {
    setRefreshPending(true);
    try {
      const [librivox, gutenberg] = await Promise.all([librivoxCatalog.refetch(), gutenbergCatalog.refetch()]);
      const refreshedBooks = [
        ...(librivox.data?.pages.flatMap(page => page.books) ?? []),
        ...(gutenberg.data?.pages.flatMap(page => page.books) ?? []),
      ];
      if (!refreshedBooks.length) return;
      const { day, week } = getPeriodKeys(new Date());
      const next = chooseFeaturedBooks([...new Map(refreshedBooks.map(book => [book.id, book])).values()], day, week, crypto.randomUUID());
      saveSessionPicks(next);
      setPicks(next);
    } finally {
      setRefreshPending(false);
    }
  };
  const showSkeletons = !picks && (!enabled || isLoading || books.length > 0);
  const unavailable = !picks && enabled && !isLoading && !books.length;

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="relative flex items-center justify-center">
        <h2 className="text-center text-lg font-semibold tracking-tight">Featured audiobooks</h2>
        <Button type="button" variant="ghost" size="icon" onClick={() => void refreshPicks()} disabled={(!enabled && !picks) || isLoading || refreshPending} aria-label="Refresh featured audiobooks" title="Refresh featured audiobooks" className="absolute right-0 size-8 rounded-full text-muted-foreground hover:text-foreground">
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {unavailable ? <p role="status" className="mx-auto max-w-xl rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Featured audiobooks are temporarily unavailable. Use refresh to try again.</p> : <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-slate-950 text-white shadow-sm">
        <img src="/library-background.webp" alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 size-full object-cover opacity-40" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/75 to-slate-950/85" />
        <div className="relative grid grid-cols-1 divide-y divide-white/20 lg:grid-cols-[2fr_4fr] lg:divide-x lg:divide-y-0">
          <section aria-labelledby="weekly-featured-audiobooks" className="min-w-0 space-y-1.5 px-3 py-3 sm:px-4">
            <h3 id="weekly-featured-audiobooks" className="text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-200">This week’s picks</h3>
            <div className="grid grid-cols-2 divide-x divide-white/15">
              {showSkeletons ? Array.from({ length: WEEKLY_PICK_COUNT }, (_, index) => <PickSkeleton key={`weekly-skeleton-${index}`} />) : picks?.weekly.map(book => <PickCard key={book.id} book={book} />)}
            </div>
          </section>
          <section aria-labelledby="daily-featured-audiobooks" className="min-w-0 space-y-1.5 px-3 py-3 sm:px-4">
            <h3 id="daily-featured-audiobooks" className="text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-200">Today’s picks</h3>
            <div className="grid grid-cols-2 xl:grid-cols-4">
              {showSkeletons ? Array.from({ length: DAILY_PICK_COUNT }, (_, index) => <div key={`daily-skeleton-${index}`} className={index === 0 ? "" : index % 2 === 1 ? "border-l border-white/15" : "xl:border-l xl:border-white/15"}><PickSkeleton /></div>) : picks?.daily.map((book, index) => <div key={book.id} className={index === 0 ? "" : index % 2 === 1 ? "border-l border-white/15" : "xl:border-l xl:border-white/15"}><PickCard book={book} /></div>)}
            </div>
          </section>
        </div>
      </div>}
    </div>
  );
}
