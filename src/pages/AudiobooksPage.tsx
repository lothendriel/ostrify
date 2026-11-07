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

function BookCard({ book }: { book: LibriVoxBook }) {
  return <Link to={`/audiobooks/${book.id}`} className="group rounded-xl bg-secondary/40 p-3 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary">
    <div className="aspect-square overflow-hidden rounded-lg bg-gradient-to-br from-teal-800 to-emerald-950 flex items-center justify-center mb-3">
      {book.cover ? <img src={book.cover} alt="" loading="lazy" className="size-full object-cover" /> : <BookOpen className="size-12 text-white/75" />}
    </div>
    <p className="font-semibold truncate group-hover:underline">{book.title}</p><p className="text-sm text-muted-foreground truncate mt-1">{book.author}</p>
  </Link>;
}

function Catalog() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [searchBy, setSearchBy] = useState<'title' | 'author'>('title');
  useEffect(() => { const timer = setTimeout(() => setQuery(term.trim()), 400); return () => clearTimeout(timer); }, [term]);
  const catalog = useLibriVoxCatalog(query, searchBy);
  const books = catalog.data?.pages.flat() ?? [];
  return <div className="p-4 sm:p-6 space-y-8">
    <header className="rounded-xl bg-gradient-to-br from-teal-900 via-emerald-950 to-card p-6 sm:p-8"><p className="flex items-center gap-2 text-sm uppercase tracking-wider font-semibold text-emerald-200"><Headphones className="size-4" /> Free public-domain audiobooks</p><h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Audiobooks</h1><p className="mt-3 text-muted-foreground max-w-2xl">Discover stories read by volunteers from LibriVox. Choose a book to listen chapter by chapter.</p></header>
    <section className="space-y-4"><div className="flex flex-wrap gap-2 items-center"><div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" /><Input value={term} onChange={event => setTerm(event.target.value)} aria-label="Search audiobooks" placeholder="Search LibriVox" className="pl-10 h-11" /></div><label htmlFor="book-search-type" className="sr-only">Search by</label><select id="book-search-type" value={searchBy} onChange={event => setSearchBy(event.target.value as 'title' | 'author')} className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"><option value="title">Title</option><option value="author">Author</option></select></div>
      <p className="text-sm text-muted-foreground">Search from the beginning of a title or author’s name. LibriVox audio and cover art are hosted by third parties.</p>
    </section>
    <section className="space-y-4"><h2 className="text-2xl font-bold">{query ? `Results for “${query}”` : 'Explore audiobooks'}</h2>
      {catalog.isLoading || query !== term.trim() ? <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{Array.from({ length: 10 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="aspect-square rounded-lg" /><Skeleton className="h-4 w-3/4" /></div>)}</div> : catalog.isError && !books.length ? <div role="alert" className="rounded-lg border border-dashed p-6 text-sm">Unable to load LibriVox audiobooks. <button className="text-primary underline" onClick={() => void catalog.refetch()}>Try again</button></div> : !books.length ? <div className="rounded-lg border border-dashed p-6 text-muted-foreground">No audiobooks found. Try a different title or author.</div> : <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">{books.map((book, index) => <BookCard key={`${book.id}-${index}`} book={book} />)}</div>{catalog.isFetchNextPageError && <p role="alert" className="text-sm text-destructive">Couldn’t load more books. Please try again.</p>}{catalog.hasNextPage && <Button variant="outline" disabled={catalog.isFetchingNextPage} onClick={() => void catalog.fetchNextPage()}>{catalog.isFetchingNextPage ? 'Loading…' : 'Load more audiobooks'}</Button>}</>}
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
    <div className="rounded-xl bg-gradient-to-br from-teal-900/70 via-emerald-950 to-card p-6 flex flex-col sm:flex-row gap-6 sm:items-end"><div className="size-40 sm:size-48 shrink-0 rounded-lg overflow-hidden bg-secondary flex items-center justify-center">{data.cover ? <img src={data.cover} alt="" className="size-full object-cover" /> : <BookOpen className="size-14 text-muted-foreground" />}</div><div><p className="text-sm uppercase tracking-wider text-emerald-200 font-semibold">LibriVox audiobook</p><h1 className="text-4xl font-bold tracking-tight mt-2">{data.title}</h1><p className="text-muted-foreground mt-2">{data.author}</p><p className="text-sm text-muted-foreground mt-2">{data.language || 'Language unspecified'} · {data.sectionCount} chapters{data.duration ? ` · ${formatDuration(data.duration)}` : ''}</p></div></div>
    <div className="flex flex-wrap items-center gap-4"><Button className="rounded-full" disabled={!data.chapters.length} onClick={() => { if (isCurrent && player.isPlaying) player.togglePlay(); else player.playQueue(data.chapters, isCurrent ? data.chapters.findIndex(chapter => chapter.id === player.current?.id) : 0); }}>{isCurrent && player.isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}{isCurrent && player.isPlaying ? 'Pause' : 'Play audiobook'}</Button><p className="text-sm text-muted-foreground">Chapters play in sequence. Favorites and listening progress aren’t saved yet.</p></div>
    <section className="space-y-3"><h2 className="text-2xl font-bold">Chapters</h2><TrackList tracks={data.chapters} emptyMessage="No playable HTTPS chapters were found for this audiobook." /></section>
  </div>;
}

export default function AudiobooksPage() {
  useSeoMeta({ title: 'Audiobooks — Ostrify', description: 'Listen to free public-domain audiobooks from LibriVox.' });
  const { id } = useParams<{ id: string }>();
  return id ? <BookDetail id={id} /> : <Catalog />;
}
