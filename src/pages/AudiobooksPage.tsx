import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { BookOpen, Headphones, Play, Pause, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackList } from '@/components/music/TrackList';
import { usePlayer } from '@/hooks/usePlayer';
import { useLibriVoxBook, useLibriVoxCatalog, type LibriVoxBook } from '@/hooks/useLibriVox';
import { formatDuration } from '@/lib/music';

function BookCover({ covers, title, className, iconClassName }: { covers: string[]; title: string; className: string; iconClassName: string }) {
  const [failedIndex, setFailedIndex] = useState(0);
  const cover = covers[failedIndex];
  return <div className={className}>
    {cover ? <img src={cover} alt={`${title} cover`} loading="lazy" onError={() => setFailedIndex(index => index + 1)} className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground"><BookOpen className={iconClassName} aria-hidden /><span className="text-xs">Cover art unavailable</span></div>}
  </div>;
}

function BookCard({ book }: { book: LibriVoxBook }) {
  return <Link to={`/audiobooks/${book.id}`} className="group rounded-xl bg-secondary/40 p-3 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary">
    <BookCover covers={book.covers} title={book.title} className="mb-3 aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-teal-800 to-emerald-950" iconClassName="size-12 text-white/75" />
    <p className="font-semibold truncate group-hover:underline">{book.title}</p><p className="text-sm text-muted-foreground truncate mt-1">{book.author}</p>
  </Link>;
}

function Catalog() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'title' | 'author'>('title');
  const [onlyPlayableWithCovers, setOnlyPlayableWithCovers] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setQuery(term.trim()), 400); return () => clearTimeout(timer); }, [term]);
  const catalog = useLibriVoxCatalog(query, searchBy);
  const books = catalog.data?.pages.flat() ?? [];
  const visibleBooks = onlyPlayableWithCovers ? books.filter(book => book.chapters.length > 0 && book.covers.length > 0) : books;
  const loadedPages = catalog.data?.pages.length ?? 0;
  const shouldScanMore = onlyPlayableWithCovers && visibleBooks.length < 8 && loadedPages < 5;
  useEffect(() => {
    if (shouldScanMore && catalog.hasNextPage && !catalog.isFetchingNextPage && !catalog.isFetchNextPageError) {
      void catalog.fetchNextPage();
    }
  }, [shouldScanMore, catalog.hasNextPage, catalog.isFetchingNextPage, catalog.isFetchNextPageError, catalog.fetchNextPage]);
  return <div className="p-4 sm:p-6 space-y-8">
    <header className="rounded-xl bg-gradient-to-br from-teal-900 via-emerald-950 to-card p-6 sm:p-8"><p className="flex items-center gap-2 text-sm uppercase tracking-wider font-semibold text-emerald-200"><Headphones className="size-4" /> Free public-domain audiobooks</p><h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Audiobooks</h1><p className="mt-3 text-muted-foreground max-w-2xl">Discover stories read by volunteers from LibriVox. Choose a book to listen chapter by chapter.</p></header>
    <section className="space-y-4"><div className="flex flex-wrap gap-2 items-center"><div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" /><Input value={term} onChange={event => setTerm(event.target.value)} aria-label="Search audiobooks" placeholder="Search LibriVox" className="pl-10 h-11" /></div><label htmlFor="book-search-type" className="sr-only">Search by</label><select id="book-search-type" value={searchBy} onChange={event => setSearchBy(event.target.value as 'title' | 'author')} className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"><option value="title">Title</option><option value="author">Author</option></select></div>
      <p className="text-sm text-muted-foreground">Search from the beginning of a title or author’s name. LibriVox audio and cover art are hosted by third parties.</p>
      <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={onlyPlayableWithCovers} onChange={event => setOnlyPlayableWithCovers(event.target.checked)} className="size-4 accent-green-500" />Only show books with playable chapters and cover art</label>
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-bold">{query ? `Results for “${query}”` : 'Explore audiobooks'}</h2>
      {catalog.isLoading || query !== term.trim() ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{Array.from({ length: 10 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-4 w-3/4" /></div>)}</div> : catalog.isError && !books.length ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Unable to load LibriVox audiobooks. <button className="text-primary underline" onClick={() => void catalog.refetch()}>Try again</button></div> : !visibleBooks.length && shouldScanMore && catalog.isFetchingNextPage ? <div className="rounded-lg border border-dashed p-6 text-muted-foreground" role="status">Looking through LibriVox results for books with playable chapters and cover art…</div> : !visibleBooks.length && shouldScanMore && catalog.isFetchNextPageError ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Couldn’t search further for books with audio and cover art. <button className="text-primary underline" onClick={() => void catalog.fetchNextPage()}>Try again</button></div> : !visibleBooks.length ? <div className="rounded-lg border border-dashed p-6 text-muted-foreground">{onlyPlayableWithCovers ? 'No books with both playable chapters and cover art were found in the loaded results.' : 'No audiobooks found. Try a different title or author.'}</div> : <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{visibleBooks.map((book, index) => <BookCard key={`${book.id}-${index}`} book={book} />)}</div>{catalog.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load more books. Please try again.</p>}{catalog.hasNextPage && <Button variant="outline" disabled={catalog.isFetchingNextPage} onClick={() => void catalog.fetchNextPage()}>{catalog.isFetchingNextPage ? 'Loading…' : 'Load more audiobooks'}</Button>}</>}
    </section>
  </div>;
}

function BookDetail({ id }: { id: string }) {
  const book = useLibriVoxBook(id);
  const player = usePlayer();
  if (!/^\d{1,12}$/.test(id)) return <div className="p-6">Audiobook not found. <Link to="/audiobooks" className="text-primary underline">Browse audiobooks</Link></div>;
  if (book.isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (book.isError) return <div role="alert" className="p-6">Couldn’t load this audiobook. <button className="text-primary underline" onClick={() => void book.refetch()}>Try again</button></div>;
  if (!book.data) return <div className="p-6">Audiobook not found. <Link to="/audiobooks" className="text-primary underline">Browse audiobooks</Link></div>;
  const data = book.data;
  const isCurrent = data.chapters.some(chapter => chapter.id === player.current?.id);
  return <div className="p-4 sm:p-6 space-y-6"><Link to="/audiobooks" className="text-sm text-muted-foreground hover:underline">← Audiobooks</Link>
    <div className="rounded-xl bg-gradient-to-br from-teal-900/70 via-emerald-950 to-card p-6 flex flex-col sm:flex-row gap-6 sm:items-end"><BookCover key={data.id} covers={data.covers} title={data.title} className="size-40 sm:size-48 shrink-0 rounded-lg overflow-hidden bg-secondary" iconClassName="size-14" /><div><p className="text-sm uppercase tracking-wider text-emerald-200 font-semibold">LibriVox audiobook</p><h1 className="text-4xl font-bold tracking-tight mt-2">{data.title}</h1><p className="text-muted-foreground mt-2">{data.author}</p><p className="text-sm text-muted-foreground mt-2">{data.language || 'Language unspecified'} · {data.sectionCount} chapters{data.duration ? ` · ${formatDuration(data.duration)}` : ''}</p></div></div>
    <div className="flex flex-wrap items-center gap-4"><Button className="rounded-full" disabled={!data.chapters.length} onClick={() => { if (isCurrent && player.isPlaying) player.togglePlay(); else player.playQueue(data.chapters, isCurrent ? data.chapters.findIndex(chapter => chapter.id === player.current?.id) : 0); }}>{isCurrent && player.isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}{isCurrent && player.isPlaying ? 'Pause' : 'Play audiobook'}</Button><p className="text-sm text-muted-foreground">Chapters play in sequence. Favorites and listening progress aren’t saved yet.</p></div>
    <section className="space-y-3"><h2 className="text-2xl font-bold">Chapters</h2><TrackList tracks={data.chapters} emptyMessage="LibriVox hasn’t provided playable audio links for this book yet." />{data.unavailableChapterTitles.length > 0 && <details className="rounded-lg border border-border/60 p-4 text-sm"><summary className="cursor-pointer text-muted-foreground">{data.unavailableChapterTitles.length} catalog chapter(s) have no audio file available</summary><ul className="mt-3 list-inside list-disc space-y-1 text-muted-foreground">{data.unavailableChapterTitles.map((title, index) => <li key={`${index}-${title}`}>{title}</li>)}</ul></details>}</section>
  </div>;
}

export default function AudiobooksPage() {
  useSeoMeta({ title: 'Audiobooks — Ostrify', description: 'Listen to free public-domain audiobooks from LibriVox.' });
  const { id } = useParams<{ id: string }>();
  return id ? <BookDetail id={id} /> : <Catalog />;
}
