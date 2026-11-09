import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { BookOpen, Headphones, Play, Pause, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrackList } from '@/components/music/TrackList';
import { AudiobookActions } from '@/components/music/AudiobookActions';
import { usePlayer } from '@/hooks/usePlayer';
import { useLibriVoxBook, useLibriVoxCatalog, type LibriVoxBook } from '@/hooks/useLibriVox';
import { useGutenbergAudiobook, useGutenbergAudiobookCatalog, type GutenbergAudiobook } from '@/hooks/useGutenbergAudiobooks';
import { useAudiobookLibrary, type SavedAudiobook } from '@/hooks/useAudiobookLibrary';
import { formatDuration } from '@/lib/music';
import { sanitizeUrl } from '@/lib/sanitize';

function audiobookPath(book: Pick<SavedAudiobook, 'id' | 'source' | 'catalogId'>): string {
  const source = book.source ?? 'librivox';
  const id = book.catalogId ?? book.id.replace(/^(librivox|gutenberg):/, '');
  return source === 'gutenberg' ? `/audiobooks/gutenberg/${encodeURIComponent(id)}` : `/audiobooks/${encodeURIComponent(id)}`;
}

function BookCover({ covers, title, className, iconClassName }: { covers: string[]; title: string; className: string; iconClassName: string }) {
  const [failedIndex, setFailedIndex] = useState(0);
  const cover = covers[failedIndex];
  return <div className={className}>
    {cover ? <img src={cover} alt={`${title} cover`} loading="lazy" onError={() => setFailedIndex(index => index + 1)} className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground"><BookOpen className={iconClassName} aria-hidden /><span className="text-xs">Cover art unavailable</span></div>}
  </div>;
}

function BookCard({ book, sourceLabel }: { book: LibriVoxBook | GutenbergAudiobook; sourceLabel: string }) {
  return <article className="min-w-0 rounded-xl bg-secondary/40 p-3 transition-colors hover:bg-secondary">
    <Link to={audiobookPath(book)} className="group block focus-visible:outline-2 focus-visible:outline-primary">
      <BookCover covers={book.covers} title={book.title} className="mb-3 aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-teal-800 to-emerald-950" iconClassName="size-12 text-white/75" />
      <p className="truncate font-semibold group-hover:underline">{book.title}</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">{book.author}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sourceLabel}</p>
    </Link>
    <div className="mt-2 flex justify-end"><AudiobookActions book={book} compact /></div>
  </article>;
}

function BookGrid({ books, sourceLabel }: { books: (LibriVoxBook | GutenbergAudiobook)[]; sourceLabel: string }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{books.map(book => <BookCard key={book.id} book={book} sourceLabel={sourceLabel} />)}</div>;
}

function BookSkeletonGrid() {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label="Loading audiobooks">{Array.from({ length: 10 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>)}</div>;
}

function LibriVoxCatalog() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'title' | 'author'>('title');
  useEffect(() => { const timer = setTimeout(() => setQuery(term.trim()), 400); return () => clearTimeout(timer); }, [term]);
  const catalog = useLibriVoxCatalog(query, searchBy);
  const books = useMemo(() => {
    const uniqueBooks = new Map<string, LibriVoxBook>();
    for (const book of catalog.data?.pages.flatMap(page => page.books) ?? []) {
      if (!uniqueBooks.has(book.catalogId)) uniqueBooks.set(book.catalogId, book);
    }
    return [...uniqueBooks.values()];
  }, [catalog.data?.pages]);
  const visibleBooks = books;
  const loadedPages = catalog.data?.pages.length ?? 0;
  const shouldScanMore = visibleBooks.length < 20 && loadedPages < 20;

  useEffect(() => {
    if (shouldScanMore && catalog.hasNextPage && !catalog.isFetchingNextPage && !catalog.isFetchNextPageError) void catalog.fetchNextPage();
  }, [shouldScanMore, catalog.hasNextPage, catalog.isFetchingNextPage, catalog.isFetchNextPageError, catalog.fetchNextPage]);

  return <div className="space-y-5">
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input value={term} onChange={event => setTerm(event.target.value)} aria-label="Search LibriVox audiobooks" placeholder="Search LibriVox" className="h-11 pl-10" /></div><label htmlFor="librivox-search-type" className="sr-only">Search LibriVox by</label><select id="librivox-search-type" value={searchBy} onChange={event => setSearchBy(event.target.value as 'title' | 'author')} className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"><option value="title">Title</option><option value="author">Author</option></select></div>
      <p className="text-sm text-muted-foreground">Volunteer-read audiobooks from LibriVox. Only books with playable chapters and cover art are shown.</p>
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-bold">{query ? `LibriVox results for “${query}”` : 'Explore LibriVox audiobooks'}</h2>
      {catalog.isLoading || query !== term.trim() ? <BookSkeletonGrid /> : catalog.isError && !books.length ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Unable to load LibriVox audiobooks. <button className="text-primary underline" onClick={() => void catalog.refetch()}>Try again</button></div> : !visibleBooks.length && shouldScanMore && catalog.isFetchingNextPage ? <div role="status" className="rounded-lg border border-dashed p-6 text-muted-foreground">Looking through LibriVox results for books with playable chapters and cover art…</div> : !visibleBooks.length && shouldScanMore && catalog.isFetchNextPageError ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Couldn’t search further for playable books. <button className="text-primary underline" onClick={() => void catalog.fetchNextPage()}>Try again</button></div> : !visibleBooks.length ? <div className="rounded-lg border border-dashed p-6 text-muted-foreground">{query ? 'No matching LibriVox books with playable chapters and cover art were found.' : 'No audiobooks with playable chapters and cover art were found.'}</div> : <><BookGrid books={visibleBooks} sourceLabel="LibriVox" />{catalog.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load more LibriVox books. Please try again.</p>}{catalog.hasNextPage && <Button type="button" variant="outline" disabled={catalog.isFetchingNextPage} onClick={() => void catalog.fetchNextPage()}>{catalog.isFetchingNextPage ? 'Loading…' : 'Load more LibriVox audiobooks'}</Button>}</>}
    </section>
  </div>;
}

function GutenbergCatalog() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'title' | 'author'>('title');
  useEffect(() => { const timer = setTimeout(() => setQuery(term.trim()), 400); return () => clearTimeout(timer); }, [term]);
  const catalog = useGutenbergAudiobookCatalog(query, searchBy);
  const books = useMemo(() => catalog.data?.pages.flatMap(page => page.books) ?? [], [catalog.data?.pages]);
  const total = catalog.data?.pages[0]?.total;

  return <div className="space-y-5">
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input value={term} onChange={event => setTerm(event.target.value)} aria-label="Search Gutenberg audiobooks" placeholder="Search Gutenberg audiobooks" className="h-11 pl-10" /></div><label htmlFor="gutenberg-search-type" className="sr-only">Search Gutenberg by</label><select id="gutenberg-search-type" value={searchBy} onChange={event => setSearchBy(event.target.value as 'title' | 'author')} className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"><option value="title">Title</option><option value="author">Author</option></select></div>
      <p className="text-sm text-muted-foreground">AI-narrated Project Gutenberg books from the Open Audiobook Collection, hosted by Internet Archive. Rights and listening availability may vary by country; check each source item.</p>
    </section>
    <section className="space-y-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-2xl font-bold">{query ? `Gutenberg results for “${query}”` : 'Explore Gutenberg Open Audiobooks'}</h2>{typeof total === 'number' && <span className="text-sm text-muted-foreground">{total.toLocaleString()} catalog items</span>}</div>
      {catalog.isLoading || query !== term.trim() ? <BookSkeletonGrid /> : catalog.isError && !books.length ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Unable to load the Gutenberg Open Audiobook catalog from Internet Archive. <button className="text-primary underline" onClick={() => void catalog.refetch()}>Try again</button></div> : !books.length ? <div className="rounded-lg border border-dashed p-6 text-muted-foreground">{query ? 'No matching Gutenberg audiobooks were found.' : 'No Gutenberg audiobooks were found.'}</div> : <><BookGrid books={books} sourceLabel="Gutenberg Open Audiobook" />{catalog.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load more Gutenberg audiobooks. Please try again.</p>}{catalog.hasNextPage && <Button type="button" variant="outline" disabled={catalog.isFetchingNextPage} onClick={() => void catalog.fetchNextPage()}>{catalog.isFetchingNextPage ? 'Loading…' : 'Load more Gutenberg audiobooks'}</Button>}</>}
    </section>
  </div>;
}

function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = searchParams.get('source') === 'gutenberg' ? 'gutenberg' : 'librivox';
  const setTab = (value: string) => setSearchParams(value === 'gutenberg' ? { source: 'gutenberg' } : {}, { replace: true });

  return <div className="space-y-8 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-teal-900 via-emerald-950 to-card p-6 sm:p-8"><p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-200"><Headphones className="size-4" /> Free audiobooks</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Audiobooks</h1><p className="mt-3 max-w-2xl text-muted-foreground">Browse volunteer-read LibriVox books or AI-narrated selections from the Project Gutenberg Open Audiobook Collection.</p></header>
    <Tabs value={selectedTab} onValueChange={setTab} className="space-y-5">
      <TabsList className="grid w-full max-w-lg grid-cols-2"><TabsTrigger value="librivox">LibriVox</TabsTrigger><TabsTrigger value="gutenberg">Gutenberg Open Audiobooks</TabsTrigger></TabsList>
      <TabsContent value="librivox" className="mt-0"><LibriVoxCatalog /></TabsContent>
      <TabsContent value="gutenberg" className="mt-0"><GutenbergCatalog /></TabsContent>
    </Tabs>
  </div>;
}

function BookDetail({ id, source }: { id: string; source: 'librivox' | 'gutenberg' }) {
  const libriVoxBook = useLibriVoxBook(source === 'librivox' ? id : undefined);
  const gutenbergBook = useGutenbergAudiobook(source === 'gutenberg' ? id : undefined);
  const player = usePlayer();
  const isLoading = source === 'librivox' ? libriVoxBook.isLoading : gutenbergBook.isLoading;
  const isError = source === 'librivox' ? libriVoxBook.isError : gutenbergBook.isError;
  const error = source === 'librivox' ? libriVoxBook.error : gutenbergBook.error;
  const data = source === 'librivox' ? libriVoxBook.data : gutenbergBook.data;

  useSeoMeta({ title: data ? `${data.title} — Audiobooks — Ostrify` : 'Audiobook — Ostrify' });

  if (source === 'librivox' && !/^[a-z0-9][a-z0-9_-]{0,159}$/i.test(id)) return <div className="p-6">Audiobook not found. <Link to="/audiobooks" className="text-primary underline">Browse audiobooks</Link></div>;
  if (source === 'gutenberg' && !/^[a-z0-9][a-z0-9_-]{0,159}$/i.test(id)) return <div className="p-6">Audiobook not found. <Link to="/audiobooks?source=gutenberg" className="text-primary underline">Browse Gutenberg audiobooks</Link></div>;
  if (isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (isError) return <div role="alert" className="p-6">Couldn’t load this audiobook: {error?.message ?? 'Unknown error'}. <button className="text-primary underline" onClick={() => void (source === 'librivox' ? libriVoxBook.refetch() : gutenbergBook.refetch())}>Try again</button></div>;
  if (!data) return <div className="p-6">Audiobook not found. <Link to={source === 'gutenberg' ? '/audiobooks?source=gutenberg' : '/audiobooks'} className="text-primary underline">Browse audiobooks</Link></div>;

  const isCurrent = data.chapters.some(chapter => chapter.id === player.current?.id);
  const savedBook: SavedAudiobook = {
    id: source === 'gutenberg' ? `gutenberg:${id}` : `librivox:${id}`,
    source,
    catalogId: id,
    title: data.title,
    author: data.author,
    covers: data.covers,
    language: data.language,
    duration: data.duration,
    sectionCount: data.sectionCount,
  };
  const rightsUrl = source === 'gutenberg' ? sanitizeUrl(gutenbergBook.data?.rights) : undefined;
  const sourceUrl = source === 'gutenberg' ? sanitizeUrl(gutenbergBook.data?.sourceUrl) : undefined;
  const providerLabel = source === 'gutenberg' ? 'Project Gutenberg Open Audiobook Collection · Internet Archive' : 'LibriVox audiobook';

  return <div className="space-y-6 p-4 sm:p-6"><Link to={source === 'gutenberg' ? '/audiobooks?source=gutenberg' : '/audiobooks'} className="text-sm text-muted-foreground hover:underline">← {source === 'gutenberg' ? 'Gutenberg audiobooks' : 'Audiobooks'}</Link>
    <div className="flex flex-col gap-6 rounded-xl bg-gradient-to-br from-teal-900/70 via-emerald-950 to-card p-6 sm:flex-row sm:items-end"><BookCover key={data.id} covers={data.covers} title={data.title} className="size-40 shrink-0 overflow-hidden rounded-lg bg-secondary sm:size-48" iconClassName="size-14" /><div><p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">{providerLabel}</p><h1 className="mt-2 text-4xl font-bold tracking-tight">{data.title}</h1><p className="mt-2 text-muted-foreground">{data.author}</p><p className="mt-2 text-sm text-muted-foreground">{data.language || 'Language unspecified'} · {data.sectionCount} {data.sectionCount === 1 ? 'recording' : 'recordings'}{data.duration ? ` · ${formatDuration(data.duration)}` : ''}</p></div></div>
    <div className="flex flex-wrap items-center gap-4"><Button className="rounded-full" disabled={!data.chapters.length} onClick={() => { if (isCurrent && player.isPlaying) player.togglePlay(); else player.playQueue(data.chapters, isCurrent ? data.chapters.findIndex(chapter => chapter.id === player.current?.id) : 0); }}>{isCurrent && player.isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}{isCurrent && player.isPlaying ? 'Pause' : 'Play audiobook'}</Button><AudiobookActions book={savedBook} /><p className="text-sm text-muted-foreground">{source === 'gutenberg' && data.chapters.length === 1 ? 'One continuous recording. Audio hosted by Internet Archive.' : 'Recordings play in sequence.'}</p></div>
    {source === 'gutenberg' && <div className="space-y-1 text-sm text-muted-foreground"><p>Audio is served by Internet Archive. Rights and listening availability may vary by country.</p><div className="flex flex-wrap gap-x-4">{sourceUrl && <a className="text-primary underline" href={sourceUrl} target="_blank" rel="noreferrer">Project Gutenberg source</a>}<a className="text-primary underline" href={`https://archive.org/details/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Internet Archive item</a>{rightsUrl && <a className="text-primary underline" href={rightsUrl} target="_blank" rel="noreferrer">Rights information</a>}</div></div>}
    <section className="space-y-3"><h2 className="text-2xl font-bold">{data.chapters.length > 1 ? 'Recordings' : 'Chapter'}</h2><TrackList tracks={data.chapters} emptyMessage="No playable recordings are available for this audiobook." /></section>
  </div>;
}

export default function AudiobooksPage() {
  const { id, source } = useParams<{ id: string; source: string }>();
  const location = useLocation();
  const audiobookId = id ?? (location.pathname.startsWith('/audiobooks/gutenberg/') ? location.pathname.split('/').at(-1) : undefined);
  if (audiobookId) return <BookDetail id={audiobookId} source={source === 'gutenberg' || location.pathname.startsWith('/audiobooks/gutenberg/') ? 'gutenberg' : 'librivox'} />;
  return <Catalog />;
}
