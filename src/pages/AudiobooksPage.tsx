import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Headphones, Play, Pause, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrackList } from '@/components/music/TrackList';
import { AudiobookActions } from '@/components/music/AudiobookActions';
import { AudiobookCover } from '@/components/music/AudiobookCover';
import { usePlayer } from '@/hooks/usePlayer';
import { useLibriVoxBook, useLibriVoxCatalog, type LibriVoxBook } from '@/hooks/useLibriVox';
import { useGutenbergAudiobook, useGutenbergAudiobookCatalog, type GutenbergAudiobook } from '@/hooks/useGutenbergAudiobooks';
import { useAudiobookLibrary, type SavedAudiobook } from '@/hooks/useAudiobookLibrary';
import { formatDuration } from '@/lib/music';
import { RESULTS_PER_PAGE } from '@/lib/pagination';
import { sanitizeUrl } from '@/lib/sanitize';

function audiobookPath(book: Pick<SavedAudiobook, 'id' | 'source' | 'catalogId'>): string {
  const source = book.source ?? 'librivox';
  const id = book.catalogId ?? book.id.replace(/^(librivox|gutenberg):/, '');
  return source === 'gutenberg' ? `/audiobooks/gutenberg/${encodeURIComponent(id)}` : `/audiobooks/${encodeURIComponent(id)}`;
}

function BookCard({ book, sourceLabel }: { book: LibriVoxBook | GutenbergAudiobook; sourceLabel: string }) {
  const player = usePlayer();
  const isPlaying = player.isPlaying && player.current?.kind === 'audiobook' && player.current.id.startsWith(`${book.id}:`);
  return <article data-playing={isPlaying} className="ostrify-audio-card min-w-0 rounded-xl p-3">
    <Link to={audiobookPath(book)} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <div className="relative mb-3"><AudiobookCover book={book} className="aspect-square rounded-lg bg-gradient-to-br from-teal-800 to-emerald-950" /><span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold leading-none text-white">Audiobook</span>{isPlaying && <span className="absolute bottom-2 left-2 rounded-full bg-black/85 px-2 py-1 text-[10px] font-semibold leading-none text-white">Playing</span>}</div>
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

function AudiobookCatalogPagination({
  label,
  page,
  pageCount,
  total,
  isFetching,
  canGoNext,
  onPrevious,
  onNext,
  position,
}: {
  label: string;
  page: number;
  pageCount: number;
  total: number;
  isFetching: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  position: "top" | "bottom";
}) {
  return <nav aria-label={`${label} pagination ${position}`} className={`flex flex-wrap items-center justify-between gap-3 ${position === "top" ? "border-y py-3" : "border-t pt-4"}`}>
    <Button type="button" variant="outline" onClick={onPrevious} disabled={page <= 1 || isFetching}><ChevronLeft className="size-4" /> Previous</Button>
    <p aria-live="polite" className="text-sm text-muted-foreground">Page {page} of {pageCount} <span className="hidden sm:inline">· {total.toLocaleString()} results</span></p>
    <Button type="button" variant="outline" onClick={onNext} disabled={!canGoNext || isFetching}>{isFetching ? "Loading…" : "Next"} <ChevronRight className="size-4" /></Button>
  </nav>;
}

function LibriVoxCatalog() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'title' | 'author'>('title');
  const [page, setPage] = useState(1);
  useEffect(() => { const timer = setTimeout(() => setQuery(term.trim()), 400); return () => clearTimeout(timer); }, [term]);
  const catalog = useLibriVoxCatalog(query, searchBy);
  const total = catalog.data?.pages[0]?.total ?? 0;
  const allBooks = useMemo(() => {
    const uniqueBooks = new Map<string, LibriVoxBook>();
    for (const book of catalog.data?.pages.flatMap(batch => batch.books) ?? []) {
      if (!uniqueBooks.has(book.catalogId)) uniqueBooks.set(book.catalogId, book);
    }
    return [...uniqueBooks.values()];
  }, [catalog.data?.pages]);
  const pageCount = Math.max(1, Math.ceil((catalog.hasNextPage ? total : allBooks.length) / RESULTS_PER_PAGE));
  const books = useMemo(() => allBooks.slice((page - 1) * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE), [allBooks, page]);
  useEffect(() => { setPage(1); }, [query, searchBy]);

  const nextPage = async () => {
    const requiredCount = (page + 1) * RESULTS_PER_PAGE;
    if (allBooks.length >= requiredCount || !catalog.hasNextPage && allBooks.length > page * RESULTS_PER_PAGE) {
      setPage(current => current + 1);
      return;
    }
    if (!catalog.hasNextPage || catalog.isFetchingNextPage) return;
    let loadedBooks = allBooks;
    let hasMore: boolean = catalog.hasNextPage;
    while (loadedBooks.length < requiredCount && hasMore) {
      const result = await catalog.fetchNextPage();
      if (result.isFetchNextPageError) break;
      const batches = result.data?.pages.flatMap(batch => batch.books) ?? [];
      loadedBooks = [...new Map(batches.map(book => [book.catalogId, book])).values()];
      hasMore = Boolean(result.hasNextPage);
    }
    if (loadedBooks.length >= requiredCount || !hasMore && loadedBooks.length > page * RESULTS_PER_PAGE) setPage(current => current + 1);
  };
  const canGoNext = page < pageCount && (catalog.hasNextPage || allBooks.length > page * RESULTS_PER_PAGE);
  const pagination = (position: 'top' | 'bottom') => <AudiobookCatalogPagination label="LibriVox audiobooks" page={page} pageCount={pageCount} total={total} isFetching={catalog.isFetchingNextPage} canGoNext={canGoNext} onPrevious={() => setPage(current => Math.max(1, current - 1))} onNext={() => void nextPage()} position={position} />;
  const isSearchPending = query !== term.trim();

  return <div className="space-y-5">
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input value={term} onChange={event => { setTerm(event.target.value); setPage(1); }} aria-label="Search LibriVox audiobooks" placeholder="Search LibriVox" className="h-11 pl-10" /></div><label htmlFor="librivox-search-type" className="sr-only">Search LibriVox by</label><select id="librivox-search-type" value={searchBy} onChange={event => { setSearchBy(event.target.value as 'title' | 'author'); setPage(1); }} className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"><option value="title">Title</option><option value="author">Author</option></select></div>
      <p className="text-sm text-muted-foreground">Volunteer-read audiobooks from LibriVox. Books without source cover art use an Ostrify-designed cover.</p>
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-bold">{query ? `LibriVox results for “${query}”` : 'Explore LibriVox audiobooks'}</h2>
      {(catalog.isLoading && !catalog.data) || isSearchPending ? <BookSkeletonGrid /> : catalog.isError && !catalog.data ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Unable to load LibriVox audiobooks. <button className="text-primary underline" onClick={() => void catalog.refetch()}>Try again</button></div> : total === 0 ? <div className="rounded-lg border border-dashed p-6 text-muted-foreground">{query ? 'No matching LibriVox books were found.' : 'No LibriVox audiobooks were found.'}</div> : <>
        {pagination('top')}
        {books.length ? <BookGrid books={books} sourceLabel="LibriVox" /> : <p role="status" className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No playable audiobooks were found on this results page.</p>}
        {catalog.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load the next LibriVox page. <button type="button" className="underline" onClick={() => void nextPage()}>Try again</button></p>}
        {pagination('bottom')}
      </>}
    </section>
  </div>;
}

function GutenbergCatalog() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'title' | 'author'>('title');
  const [page, setPage] = useState(1);
  useEffect(() => { const timer = setTimeout(() => setQuery(term.trim()), 400); return () => clearTimeout(timer); }, [term]);
  const catalog = useGutenbergAudiobookCatalog(query, searchBy);
  const total = catalog.data?.pages[0]?.total ?? 0;
  const allBooks = useMemo(() => {
    const uniqueBooks = new Map<string, GutenbergAudiobook>();
    for (const book of catalog.data?.pages.flatMap(batch => batch.books) ?? []) {
      if (!uniqueBooks.has(book.catalogId)) uniqueBooks.set(book.catalogId, book);
    }
    return [...uniqueBooks.values()];
  }, [catalog.data?.pages]);
  const pageCount = Math.max(1, Math.ceil((catalog.hasNextPage ? total : allBooks.length) / RESULTS_PER_PAGE));
  const books = useMemo(() => allBooks.slice((page - 1) * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE), [allBooks, page]);
  useEffect(() => { setPage(1); }, [query, searchBy]);

  const nextPage = async () => {
    const requiredCount = (page + 1) * RESULTS_PER_PAGE;
    if (allBooks.length >= requiredCount || !catalog.hasNextPage && allBooks.length > page * RESULTS_PER_PAGE) {
      setPage(current => current + 1);
      return;
    }
    if (!catalog.hasNextPage || catalog.isFetchingNextPage) return;
    let loadedBooks = allBooks;
    let hasMore: boolean = catalog.hasNextPage;
    while (loadedBooks.length < requiredCount && hasMore) {
      const result = await catalog.fetchNextPage();
      if (result.isFetchNextPageError) break;
      const batches = result.data?.pages.flatMap(batch => batch.books) ?? [];
      loadedBooks = [...new Map(batches.map(book => [book.catalogId, book])).values()];
      hasMore = Boolean(result.hasNextPage);
    }
    if (loadedBooks.length >= requiredCount || !hasMore && loadedBooks.length > page * RESULTS_PER_PAGE) setPage(current => current + 1);
  };
  const canGoNext = page < pageCount && (catalog.hasNextPage || allBooks.length > page * RESULTS_PER_PAGE);
  const pagination = (position: 'top' | 'bottom') => <AudiobookCatalogPagination label="Gutenberg audiobooks" page={page} pageCount={pageCount} total={total} isFetching={catalog.isFetchingNextPage} canGoNext={canGoNext} onPrevious={() => setPage(current => Math.max(1, current - 1))} onNext={() => void nextPage()} position={position} />;
  const isSearchPending = query !== term.trim();

  return <div className="space-y-5">
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input value={term} onChange={event => { setTerm(event.target.value); setPage(1); }} aria-label="Search Gutenberg audiobooks" placeholder="Search Gutenberg audiobooks" className="h-11 pl-10" /></div><label htmlFor="gutenberg-search-type" className="sr-only">Search Gutenberg by</label><select id="gutenberg-search-type" value={searchBy} onChange={event => { setSearchBy(event.target.value as 'title' | 'author'); setPage(1); }} className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"><option value="title">Title</option><option value="author">Author</option></select></div>
      <p className="text-sm text-muted-foreground">AI-narrated Project Gutenberg books from the Open Audiobook Collection, hosted by Internet Archive. Rights and listening availability may vary by country; check each source item.</p>
    </section>
    <section className="space-y-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-2xl font-bold">{query ? `Gutenberg results for “${query}”` : 'Explore Gutenberg Open Audiobooks'}</h2>{total > 0 && <span className="text-sm text-muted-foreground">{total.toLocaleString()} catalog items</span>}</div>
      {(catalog.isLoading && !catalog.data) || isSearchPending ? <BookSkeletonGrid /> : catalog.isError && !catalog.data ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Unable to load the Gutenberg Open Audiobook catalog from Internet Archive. <button className="text-primary underline" onClick={() => void catalog.refetch()}>Try again</button></div> : total === 0 ? <div className="rounded-lg border border-dashed p-6 text-muted-foreground">{query ? 'No matching Gutenberg audiobooks were found.' : 'No Gutenberg audiobooks were found.'}</div> : <>
        {pagination('top')}
        {books.length ? <BookGrid books={books} sourceLabel="Gutenberg Open Audiobook" /> : <p role="status" className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No audiobooks were found on this results page.</p>}
        {catalog.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load the next Gutenberg page. <button type="button" className="underline" onClick={() => void nextPage()}>Try again</button></p>}
        {pagination('bottom')}
      </>}
    </section>
  </div>;
}

function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = searchParams.get('source') === 'gutenberg' ? 'gutenberg' : 'librivox';
  const setTab = (value: string) => setSearchParams(value === 'gutenberg' ? { source: 'gutenberg' } : {}, { replace: true });

  return <div className="space-y-8 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-teal-900 via-emerald-950 to-card p-6 sm:p-8"><p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-200"><Headphones className="size-4" /> Free audiobooks</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Audiobooks</h1><p className="mt-3 max-w-2xl text-muted-foreground">Browse volunteer-read LibriVox books or AI-narrated selections from the Project Gutenberg Open Audiobook Collection. Books without source cover art get an Ostrify-designed cover.</p></header>
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

  if (source === 'librivox' && !/^[a-z0-9][a-z0-9_-]{0,159}$/i.test(id)) return <div className="p-6">Audiobook not found. </div>;
  if (source === 'gutenberg' && !/^[a-z0-9][a-z0-9_-]{0,159}$/i.test(id)) return <div className="p-6">Audiobook not found. </div>;
  if (isLoading) return <div className="space-y-4 p-6"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (isError) return <div role="alert" className="p-6">Couldn’t load this audiobook: {error?.message ?? 'Unknown error'}. <button className="text-primary underline" onClick={() => void (source === 'librivox' ? libriVoxBook.refetch() : gutenbergBook.refetch())}>Try again</button></div>;
  if (!data) return <div className="p-6">Audiobook not found. </div>;

  const isCurrent = data.chapters.some(chapter => chapter.id === player.current?.id);
  const isPlayingBook = isCurrent && player.isPlaying;
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

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="flex flex-col gap-6 rounded-xl bg-gradient-to-br from-teal-900/70 via-emerald-950 to-card p-6 sm:flex-row sm:items-end"><AudiobookCover key={data.id} book={data} className="size-40 shrink-0 rounded-lg bg-secondary sm:size-48" /><div><p className="text-sm font-semibold uppercase tracking-wider text-emerald-200">{providerLabel}</p><h1 className="mt-2 text-4xl font-bold tracking-tight">{data.title}</h1><p className="mt-2 text-muted-foreground">{data.author}</p><p className="mt-2 text-sm text-muted-foreground">{data.language || 'Language unspecified'} · {data.sectionCount} {data.sectionCount === 1 ? 'recording' : 'recordings'}{data.duration ? ` · ${formatDuration(data.duration)}` : ''}</p></div></div>
    <div className="flex flex-wrap items-center gap-4"><Button className="rounded-full" disabled={!data.chapters.length} onClick={() => { if (isCurrent && player.isPlaying) player.togglePlay(); else player.playTrack(data.chapters[0]); }}>{isPlayingBook ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}{isPlayingBook ? 'Pause' : 'Play first recording'}</Button><AudiobookActions book={savedBook} /><p className="text-sm text-muted-foreground">{source === 'gutenberg' && data.chapters.length === 1 ? 'One continuous recording. Audio hosted by Internet Archive.' : 'Recordings play in sequence.'}</p></div>
    {source === 'gutenberg' && <div className="space-y-1 text-sm text-muted-foreground"><p>Audio is served by Internet Archive. Rights and listening availability may vary by country.</p><div className="flex flex-wrap gap-x-4">{sourceUrl && <a className="text-primary underline" href={sourceUrl} target="_blank" rel="noreferrer">Project Gutenberg source</a>}<a className="text-primary underline" href={`https://archive.org/details/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Internet Archive item</a>{rightsUrl && <a className="text-primary underline" href={rightsUrl} target="_blank" rel="noreferrer">Rights information</a>}</div></div>}
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">{data.chapters.length > 1 ? 'Recordings' : 'Chapter'}</h2><Button type="button" className="rounded-full" disabled={!data.chapters.length} onClick={() => { if (isCurrent && player.isPlaying) player.togglePlay(); else player.playQueue(data.chapters); }}>{isPlayingBook ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}{isPlayingBook ? 'Pause' : 'Play all recordings'}</Button></div><TrackList tracks={data.chapters} selectionLabel="chapters" emptyMessage="No playable recordings are available for this audiobook." /></section>
  </div>;
}

export default function AudiobooksPage() {
  const { id, source } = useParams<{ id: string; source: string }>();
  const location = useLocation();
  const audiobookId = id ?? (location.pathname.startsWith('/audiobooks/gutenberg/') ? location.pathname.split('/').at(-1) : undefined);
  if (audiobookId) return <BookDetail id={audiobookId} source={source === 'gutenberg' || location.pathname.startsWith('/audiobooks/gutenberg/') ? 'gutenberg' : 'librivox'} />;
  return <Catalog />;
}
