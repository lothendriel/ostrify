import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Disc3, ExternalLink, Mic, Music2, UserRound } from 'lucide-react';
import { useTracks } from '@/hooks/useTracks';
import { usePodcastEpisodes, usePodcastIndexEpisodeSearch, usePodcastIndexSearch, type PodcastShow } from '@/hooks/usePodcasts';
import { useWavlakeSearch, type CatalogItem } from '@/hooks/useWavlake';
import { useLibriVoxCatalog, type LibriVoxBook } from '@/hooks/useLibriVox';
import { useGutenbergAudiobookCatalog, type GutenbergAudiobook } from '@/hooks/useGutenbergAudiobooks';
import { useOstrifyDirectory, type DirectoryPerson } from '@/hooks/useOstrifyDirectory';
import { audiobookPath, getAudiobookLibrarySnapshot, subscribeAudiobookLibrary, type SavedAudiobook } from '@/hooks/useAudiobookLibrary';
import { CATEGORIES, categoryColor } from '@/lib/categories';
import { TrackList } from '@/components/music/TrackList';
import { Skeleton } from '@/components/ui/skeleton';
import type { Track } from '@/lib/music';
import { nip19 } from 'nostr-tools';

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SectionLoading() {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div>;
}

function ResultCard({ title, subtitle, image, href, icon: Icon }: {
  title: string;
  subtitle: string;
  image?: string;
  href: string;
  icon: typeof Music2;
}) {
  return <Link to={href} className="flex min-w-0 items-center gap-3 rounded-xl bg-secondary/40 p-3 transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">{image ? <img src={image} alt="" loading="lazy" className="size-full object-cover" /> : <Icon className="size-5 text-muted-foreground" />}</div>
    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{title}</span><span className="block truncate text-sm text-muted-foreground">{subtitle}</span></span>
    <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>;
}

function CatalogResult({ item }: { item: CatalogItem }) {
  if (item.type === 'track') return null;
  const href = `/wavlake/${item.type}/${encodeURIComponent(item.id)}`;
  return <ResultCard title={item.title} subtitle={item.type === 'artist' ? 'Wavlake artist' : item.artist ? `${item.artist} · ${item.type}` : `Wavlake ${item.type}`} image={item.image} href={href} icon={item.type === 'artist' ? Disc3 : Music2} />;
}

function BookResult({ book }: { book: LibriVoxBook | GutenbergAudiobook }) {
  return <ResultCard title={book.title} subtitle={`${book.author} · ${book.source === 'gutenberg' ? 'Gutenberg Open Audiobook Collection' : 'LibriVox'}`} image={book.covers[0]} href={audiobookPath(book)} icon={BookOpen} />;
}

function PersonResult({ person }: { person: DirectoryPerson }) {
  let href: string;
  try { href = `/${nip19.npubEncode(person.pubkey)}`; } catch { return null; }
  return <ResultCard title={person.name} subtitle="Opted-in Ostrify directory profile" image={person.picture} href={href} icon={UserRound} />;
}

function PodcastShowResult({ show }: { show: PodcastShow }) {
  return <ResultCard title={show.title} subtitle={show.publisher ? `${show.publisher} · Podcast show` : `${show.source} podcast show`} image={show.image} href="/podcasts?source=directory" icon={Mic} />;
}

const SearchPage = () => {
  useSeoMeta({ title: 'Search — Ostrify' });
  const [searchParams] = useSearchParams();
  const rawQuery = searchParams.get('q') ?? '';
  const query = rawQuery.trim();
  const debouncedQuery = useDebouncedValue(query, 300);
  const queryClient = useQueryClient();
  const tracksQuery = useTracks({ limit: 200 });
  const podcastsQuery = usePodcastEpisodes(80);
  const savedAudiobooks = useSyncExternalStore(subscribeAudiobookLibrary, () => getAudiobookLibrarySnapshot().books, (): Record<string, SavedAudiobook> => ({}));
  const wavlakeQuery = useWavlakeSearch(debouncedQuery);
  const podcastIndexQuery = usePodcastIndexSearch(debouncedQuery);
  const podcastEpisodesQuery = usePodcastIndexEpisodeSearch(debouncedQuery);
  const searchEnabled = debouncedQuery.length >= 2;
  const librivoxTitleQuery = useLibriVoxCatalog(debouncedQuery, 'title', searchEnabled);
  const librivoxAuthorQuery = useLibriVoxCatalog(debouncedQuery, 'author', searchEnabled);
  const gutenbergTitleQuery = useGutenbergAudiobookCatalog(debouncedQuery, 'title', searchEnabled);
  const gutenbergAuthorQuery = useGutenbergAudiobookCatalog(debouncedQuery, 'author', searchEnabled);
  const directoryQuery = useOstrifyDirectory(searchEnabled);

  const q = debouncedQuery.toLocaleLowerCase();
  const nostrAudio = useMemo(() => {
    if (q.length < 2) return [] as Track[];
    const all = [...(tracksQuery.data ?? []), ...(podcastsQuery.data ?? [])];
    const seen = new Set<string>();
    return all.filter(track => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return q.split(/\s+/).every(term => `${track.title} ${track.artist ?? ''} ${track.album ?? ''} ${track.topics.join(' ')}`.toLocaleLowerCase().includes(term));
    });
  }, [q, tracksQuery.data, podcastsQuery.data]);

  const wavlakeItems = wavlakeQuery.data ?? [];
  const wavlakeTracks = wavlakeItems.flatMap(item => item.type === 'track' && item.track ? [item.track] : []);
  const allWavlakeTracks = new Map<string, Track>();
  for (const track of wavlakeTracks) allWavlakeTracks.set(track.id, track);
  for (const track of nostrAudio) if (track.source === 'wavlake' && q.split(/\s+/).every(term => `${track.title} ${track.artist ?? ''} ${track.album ?? ''}`.toLocaleLowerCase().includes(term))) allWavlakeTracks.set(track.id, track);
  const wavlakeTrackResults = [...allWavlakeTracks.values()];
  const podcastEpisodeResults = (podcastEpisodesQuery.data ?? []).filter(track => q.split(/\s+/).every(term => `${track.title} ${track.artist ?? ''}`.toLocaleLowerCase().includes(term))).slice(0, 12);
  const catalogLinks = wavlakeItems.filter(item => item.type !== 'track');
  const displayedCatalogLinks = catalogLinks.slice(0, 12);
  const audiobookBooks = useMemo(() => {
    const librivox = [...(librivoxTitleQuery.data?.pages.flatMap(page => page.books) ?? []), ...(librivoxAuthorQuery.data?.pages.flatMap(page => page.books) ?? [])];
    const gutenberg = [...(gutenbergTitleQuery.data?.pages.flatMap(page => page.books) ?? []), ...(gutenbergAuthorQuery.data?.pages.flatMap(page => page.books) ?? [])];
    const unique = new Map<string, LibriVoxBook | GutenbergAudiobook>();
    for (const book of [...Object.values(savedAudiobooks), ...librivox, ...gutenberg]) if (!unique.has(book.id)) unique.set(book.id, book as LibriVoxBook | GutenbergAudiobook);
    return [...unique.values()].filter(book => q.split(/\s+/).every(term => `${book.title} ${book.author}`.toLocaleLowerCase().includes(term))).slice(0, 12);
  }, [q, librivoxTitleQuery.data, librivoxAuthorQuery.data, gutenbergTitleQuery.data, gutenbergAuthorQuery.data, savedAudiobooks]);

  const displayedBooks = audiobookBooks.slice(0, 12);
  const podcastShows = (podcastIndexQuery.data ?? []).filter(show => q.split(/\s+/).every(term => `${show.title} ${show.publisher ?? ''} ${show.description ?? ''}`.toLocaleLowerCase().includes(term))).slice(0, 12);
  const people = useMemo(() => {
    const all = directoryQuery.data ?? [];
    return all.filter(person => q.split(/\s+/).every(term => person.name.toLocaleLowerCase().includes(term))).slice(0, 8);
  }, [q, directoryQuery.data]);
  const matchingAuthors = useMemo(() => {
    if (q.length < 2) return [] as DirectoryPerson[];
    const profiles = queryClient.getQueryCache().getAll().flatMap(entry => {
      if (entry.queryKey[0] !== 'nostr' || entry.queryKey[1] !== 'author' || typeof entry.queryKey[2] !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.queryKey[2])) return [];
      const metadata = entry.state.data;
      if (!metadata || typeof metadata !== 'object' || !('metadata' in metadata) || !metadata.metadata || typeof metadata.metadata !== 'object') return [];
      const profile = metadata.metadata as { display_name?: unknown; name?: unknown; picture?: unknown };
      const name = typeof profile.display_name === 'string' && profile.display_name.trim() ? profile.display_name.trim() : typeof profile.name === 'string' ? profile.name.trim() : '';
      return name && q.split(/\s+/).every(term => name.toLocaleLowerCase().includes(term)) ? [{ pubkey: entry.queryKey[2] as string, name, picture: typeof profile.picture === 'string' ? profile.picture : undefined }] : [];
    });
    const unique = new Map<string, DirectoryPerson>();
    for (const person of [...people, ...profiles]) unique.set(person.pubkey, person);
    return [...unique.values()].slice(0, 8);
  }, [q, people, queryClient]);

  const anyLoading = debouncedQuery !== query || (query.length >= 2 && (
    (tracksQuery.isLoading && !tracksQuery.data) || (podcastsQuery.isLoading && !podcastsQuery.data) ||
    wavlakeQuery.isLoading || podcastIndexQuery.isLoading || podcastEpisodesQuery.isLoading || librivoxTitleQuery.isLoading || librivoxAuthorQuery.isLoading ||
    gutenbergTitleQuery.isLoading || gutenbergAuthorQuery.isLoading || (directoryQuery.isLoading && directoryQuery.hasReadRelays)
  ));
  const noResults = !nostrAudio.length && !wavlakeTrackResults.length && !catalogLinks.length && !audiobookBooks.length && !podcastShows.length && !podcastEpisodeResults.length && !matchingAuthors.length;

  return <div className="space-y-8 p-4 sm:p-6">
    {query.length < 2 ? <section className="space-y-3">
      <h2 className="text-xl font-bold">Browse all</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Link to="/audiobooks" className="relative flex h-28 items-end overflow-hidden rounded-lg p-4 text-lg font-bold text-white shadow-md transition-transform hover:scale-[1.02]" style={{ background: categoryColor('audiobooks') }}>Audiobooks</Link>
        <Link to="/podcasts" className="relative flex h-28 items-end overflow-hidden rounded-lg p-4 text-lg font-bold text-white shadow-md transition-transform hover:scale-[1.02]" style={{ background: categoryColor('podcasts') }}>Podcasts</Link>
        {CATEGORIES.map(category => <Link key={category.id} to={`/category/${category.id}`} className="relative flex h-28 items-end overflow-hidden rounded-lg p-4 text-lg font-bold text-white shadow-md transition-transform hover:scale-[1.02]" style={{ background: categoryColor(category.id) }}>{category.label}</Link>)}
      </div>
    </section> : <>
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Search Ostrify</p>
        <h1 className="text-2xl font-bold">Results for “{query}”</h1>
        <p className="text-sm text-muted-foreground">Searching Nostr audio, Wavlake, podcast directories, audiobook collections, and opted-in Ostrify profiles. Availability depends on each source.</p>
      </header>

      {anyLoading && <div className="space-y-3" aria-label="Searching catalogs"><Skeleton className="h-5 w-40" /><SectionLoading /><SectionLoading /><SectionLoading /></div>}
      {!anyLoading && noResults && <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No matches were found in the sources available for this search. Try another keyword or check the source availability.</div>}

      {!!nostrAudio.length && <section className="space-y-3"><h2 className="text-xl font-bold">Nostr songs & podcast episodes <span className="text-sm font-normal text-muted-foreground">{nostrAudio.length}</span></h2><TrackList tracks={nostrAudio} emptyMessage="No Nostr audio matches." /></section>}
      {!!wavlakeTrackResults.length && <section className="space-y-3"><h2 className="text-xl font-bold">Wavlake tracks <span className="text-sm font-normal text-muted-foreground">{wavlakeTrackResults.length}</span></h2><TrackList tracks={wavlakeTrackResults} emptyMessage="No Wavlake tracks found." /></section>}
      {!!catalogLinks.length && <section className="space-y-3"><h2 className="text-xl font-bold">Wavlake artists & albums</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{displayedCatalogLinks.map(item => <CatalogResult key={`${item.type}:${item.id}`} item={item} />)}</div>{catalogLinks.length > displayedCatalogLinks.length && <p className="text-sm text-muted-foreground">Showing {displayedCatalogLinks.length} of {catalogLinks.length} catalog matches.</p>}</section>}
      {!!audiobookBooks.length && <section className="space-y-3"><h2 className="text-xl font-bold">Audiobooks <span className="text-sm font-normal text-muted-foreground">{audiobookBooks.length}</span></h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{displayedBooks.map(book => <BookResult key={book.id} book={book} />)}</div>{audiobookBooks.length > displayedBooks.length && <p className="text-sm text-muted-foreground">Showing {displayedBooks.length} of {audiobookBooks.length} currently loaded matches.</p>}</section>}
      {!!podcastEpisodeResults.length && <section className="space-y-3"><h2 className="text-xl font-bold">Podcast Index episodes <span className="text-sm font-normal text-muted-foreground">{podcastEpisodeResults.length}</span></h2><TrackList tracks={podcastEpisodeResults} emptyMessage="No matching podcast episodes found." /></section>}
      {!!podcastShows.length && <section className="space-y-3"><h2 className="text-xl font-bold">Podcast shows <span className="text-sm font-normal text-muted-foreground">{podcastShows.length}</span></h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{podcastShows.map(show => <PodcastShowResult key={show.id} show={show} />)}</div></section>}
      {!!matchingAuthors.length && <section className="space-y-3"><h2 className="text-xl font-bold">People & publishers <span className="text-sm font-normal text-muted-foreground">{matchingAuthors.length}</span></h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{matchingAuthors.map(person => <PersonResult key={person.pubkey} person={person} />)}</div></section>}
      {!!people.length && !directoryQuery.hasReadRelays && <p className="text-sm text-muted-foreground">People search needs a read relay. Known publisher profiles from audio matches are still included when available.</p>}

      <div className="grid gap-3 border-t border-border/60 pt-5 sm:grid-cols-2">
        <SourceError label="Nostr audio" error={tracksQuery.error ?? podcastsQuery.error ?? null} isError={tracksQuery.isError || podcastsQuery.isError} />
        <SourceError label="Wavlake" error={wavlakeQuery.error} isError={wavlakeQuery.isError} />
        <SourceError label="Podcast Index shows" error={podcastIndexQuery.error} isError={podcastIndexQuery.isError} />
        <SourceError label="Podcast Index episodes" error={podcastEpisodesQuery.error} isError={podcastEpisodesQuery.isError} />
        <SourceError label="LibriVox" error={librivoxTitleQuery.error ?? librivoxAuthorQuery.error} isError={librivoxTitleQuery.isError || librivoxAuthorQuery.isError} />
        <SourceError label="Gutenberg audiobooks" error={gutenbergTitleQuery.error ?? gutenbergAuthorQuery.error} isError={gutenbergTitleQuery.isError || gutenbergAuthorQuery.isError} />
        <SourceError label="Ostrify directory" error={directoryQuery.error} isError={directoryQuery.isError} />
      </div>
    </>}
  </div>;
};

function SourceError({ label, error, isError }: { label: string; error: Error | null; isError: boolean }) {
  if (!isError) return null;
  return <p role="status" className="text-sm text-muted-foreground">{label} search is currently unavailable{error ? `: ${error.message}` : '.'}</p>;
}

export default SearchPage;
