import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ChevronLeft, ChevronRight, Music, Search, Radio } from 'lucide-react';
import { SaveAlbumButton } from '@/components/music/SaveAlbumButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackList } from '@/components/music/TrackList';
import { HorizontalCarousel } from '@/components/music/HorizontalCarousel';
import { FollowButton } from '@/components/music/FollowButton';
import { useRadio } from '@/hooks/useRadio';
import { useWavlakeCatalog, useWavlakeCatalogReleases, useWavlakeRelease, useWavlakeSearch, useWavlakeRankedReleases, type CatalogItem, type WavlakeRelease } from '@/hooks/useWavlake';
import type { Track } from '@/lib/music';

function CatalogLinks({ items }: { items: CatalogItem[] }) {
  if (!items.length) return null;
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items.map(item => (
    <Link key={`${item.type}:${item.id}`} to={`/wavlake/${item.type}/${item.id}`} className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
      <div className="aspect-square rounded-md bg-muted overflow-hidden mb-3 flex items-center justify-center">
        {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <Music className="size-10 text-muted-foreground" />}
      </div>
      <div className="font-semibold truncate">{item.title}</div>
      <div className="text-sm text-muted-foreground truncate">{item.type === 'album' && item.artist ? item.artist : item.type === 'artist' ? 'Artist' : 'Album'}</div>
    </Link>
  ))}</div>;
}

function ReleaseLinks({ items }: { items: WavlakeRelease[] }) {
  if (!items.length) return null;
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items.map(item => (
    <Link key={`${item.type}:${item.id}`} to={`/wavlake/${item.type}/${item.id}`} className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
      <div className="aspect-square rounded-md bg-muted overflow-hidden mb-3 flex items-center justify-center">
        {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <Music className="size-10 text-muted-foreground" />}
      </div>
      <div className="font-semibold truncate">{item.title}</div>
      <div className="text-sm text-muted-foreground truncate">{item.type === 'album' && item.artist ? item.artist : 'Artist'}</div>
    </Link>
  ))}</div>;
}

function CatalogTracks({ artistId, onTracksChange }: { artistId?: string; onTracksChange?: (tracks: Track[]) => void }) {
  const catalog = useWavlakeCatalog(artistId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const updatePage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next);
  };
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    return (catalog.data?.pages.flatMap(p => p.tracks) ?? []).filter(t => !seen.has(t.id) && !!seen.add(t.id));
  }, [catalog.data]);
  const pageCount = Math.max(1, Math.ceil(tracks.length / 20));
  const visiblePage = Math.min(page, pageCount);
  useEffect(() => { onTracksChange?.(tracks); }, [onTracksChange, tracks]);
  const loadWavlakeTracks = async (requiredTrackCount: number) => {
    if (catalog.isFetchingNextPage) return false;
    let loadedTracks = tracks.length;
    let hasMore: boolean = catalog.hasNextPage;
    while (loadedTracks < requiredTrackCount && hasMore) {
      const result = await catalog.fetchNextPage();
      loadedTracks = [...new Set((result.data?.pages.flatMap(batch => batch.tracks) ?? []).map(track => track.id))].length;
      hasMore = Boolean(result.hasNextPage);
    }
    return loadedTracks >= requiredTrackCount;
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-2xl font-bold">{artistId ? 'Songs' : 'Latest tracks'}</h2><span className="text-sm text-muted-foreground">{catalog.data?.pages[0]?.total != null ? `${catalog.data.pages[0].total.toLocaleString()} tracks in this catalog` : 'From Wavlake'}</span></div>
    {catalog.isError && <p role="alert" className="text-sm text-destructive">Could not load Wavlake tracks. {catalog.error.message} <button className="underline" onClick={() => catalog.refetch()}>Try again</button></p>}
    <TrackList tracks={tracks} isLoading={catalog.isLoading} emptyMessage="No playable tracks found in this catalog." hasMore={catalog.hasNextPage} isLoadingMore={catalog.isFetchingNextPage} onLoadMore={loadWavlakeTracks} page={visiblePage} onPageChange={nextPageNumber => updatePage(Math.max(1, Math.min(pageCount + (catalog.hasNextPage ? 1 : 0), nextPageNumber)))} />

  </section>;
}

function RankedReleaseCard({ item }: { item: CatalogItem }) {
  return <Link to={`/wavlake/${item.type}/${item.id}`} className="group min-w-0 rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
    <div className="mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-muted">
      {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" className="size-full object-cover transition group-hover:scale-[1.02]" /> : <Music className="size-10 text-muted-foreground" />}
    </div>
    <div className="truncate font-semibold">{item.title}</div>
    <div className="truncate text-sm text-muted-foreground">{item.type === 'album' && item.artist ? item.artist : 'Artist'}</div>
  </Link>;
}

function FeaturedRankings() {
  const rankings = useWavlakeRankedReleases();
  if (rankings.isLoading) return <section className="space-y-3"><h2 className="text-2xl font-bold">From Wavlake’s top tracks</h2><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div></section>;
  if (rankings.isError) return <p className="text-sm text-muted-foreground">Wavlake rankings are unavailable right now. <button className="underline" onClick={() => void rankings.refetch()}>Try again</button></p>;
  if (!rankings.data?.artists.length && !rankings.data?.albums.length) return <p className="text-sm text-muted-foreground">No ranked artists or albums are available right now.</p>;
  return <div className="space-y-8">
    {rankings.data.artists.length > 0 && <section className="space-y-3"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">Artists in top tracks</h2><p className="text-sm text-muted-foreground">Featured in Wavlake tracks ranked by sats earned over the last 30 days; not an artist chart.</p></div>{rankings.data.artists.length > 8 && <Link to="/wavlake/top-artists" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">See all <ChevronRight className="size-4" /></Link>}</div><HorizontalCarousel label="Artists in top tracks">{rankings.data.artists.slice(0, 8).map(item => <div key={`${item.type}:${item.id}`} className="min-w-0 snap-start"><RankedReleaseCard item={item} /></div>)}</HorizontalCarousel></section>}
    {rankings.data.albums.length > 0 && <section className="space-y-3"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">Albums in top tracks</h2><p className="text-sm text-muted-foreground">Albums represented in Wavlake’s top tracks over the last 30 days; not an album chart.</p></div>{rankings.data.albums.length > 8 && <Link to="/wavlake/top-albums" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">See all <ChevronRight className="size-4" /></Link>}</div><HorizontalCarousel label="Albums in top tracks">{rankings.data.albums.slice(0, 8).map(item => <div key={`${item.type}:${item.id}`} className="min-w-0 snap-start"><RankedReleaseCard item={item} /></div>)}</HorizontalCarousel></section>}
  </div>;
}

export function RankedReleasesPage({ type }: { type: 'artist' | 'album' }) {
  const catalog = useWavlakeCatalogReleases(type);
  const [searchParams, setSearchParams] = useSearchParams();
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (catalog.data?.pages.flatMap(page => page.releases) ?? []).filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [catalog.data]);
  const pageCount = Math.max(1, Math.ceil(items.length / 15));
  const parsedPage = Number(searchParams.get('page') ?? '1');
  const requestedPage = Number.isInteger(parsedPage) ? Math.max(parsedPage, 1) : 1;
  const page = catalog.hasNextPage ? requestedPage : Math.min(requestedPage, pageCount);
  const visibleItems = items.slice((page - 1) * 15, page * 15);
  const title = type === 'artist' ? 'Browse Wavlake artists' : 'Browse Wavlake albums';
  const kindLabel = type === 'artist' ? 'artists' : 'albums';

  useEffect(() => {
    if (catalog.data && searchParams.get('page') && String(page) !== searchParams.get('page')) {
      const next = new URLSearchParams(searchParams);
      if (page === 1) next.delete('page');
      else next.set('page', String(page));
      setSearchParams(next, { replace: true });
    }
  }, [catalog.data, page, searchParams, setSearchParams]);

  useEffect(() => {
    if (!catalog.isLoading && !catalog.isFetchingNextPage && catalog.hasNextPage && items.length < 15) {
      void catalog.fetchNextPage();
    }
  }, [catalog.data, catalog.hasNextPage, catalog.isFetchingNextPage, catalog.isLoading, catalog.fetchNextPage, items.length]);

  useSeoMeta({ title: `${title} — Wavlake catalog — Ostrify` });

  const goToNextPage = async () => {
    if (catalog.isFetchingNextPage) return;
    let allItems = items;
    while (allItems.length < (page + 1) * 15 && catalog.hasNextPage) {
      const result = await catalog.fetchNextPage();
      const releases = result.data?.pages.flatMap(pageData => pageData.releases) ?? [];
      allItems = [...new Map(releases.map(item => [item.id, item])).values()];
      if (!result.hasNextPage) break;
    }
    if (allItems.length > page * 15) setSearchParams({ page: String(page + 1) });
  };

  return <div className="p-4 sm:p-6 space-y-6">

    <header><p className="text-sm font-semibold text-primary uppercase tracking-wider">Wavlake catalog</p><h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-muted-foreground">Browse {kindLabel} found across Wavlake’s track catalog, with the most recently released tracks first. This is a catalog browse, not a top-tracks ranking.</p></header>
    {catalog.isLoading && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}</div>}
    {catalog.isError && <p role="alert" className="text-sm text-destructive">Wavlake catalog is unavailable right now. <button className="underline" onClick={() => void catalog.refetch()}>Try again</button></p>}
    {!catalog.isLoading && !catalog.isError && items.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No {kindLabel} were found in the Wavlake catalog.</div>}
    {visibleItems.length > 0 && <><ReleaseLinks items={visibleItems} />
      {catalog.isFetchingNextPage && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-label={`Loading more ${kindLabel}`}>{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}</div>}
      <nav aria-label="Catalog pagination" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => setSearchParams(page === 2 ? {} : { page: String(page - 1) })} disabled={page <= 1}><ChevronLeft className="size-4" /> Previous</Button>
        <p aria-live="polite" className="text-sm text-muted-foreground">Page {page} <span className="hidden sm:inline">· {items.length} {kindLabel} loaded</span></p>
        <Button type="button" variant="outline" onClick={() => void goToNextPage()} disabled={page >= pageCount && (!catalog.hasNextPage || catalog.isFetchingNextPage)}>{catalog.isFetchingNextPage ? 'Loading…' : 'Next'} <ChevronRight className="size-4" /></Button>
      </nav>
    </>}
  </div>;
}

export function WavlakeDiscovery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery.trim());
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 400); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    const urlQuery = searchParams.get('q') ?? '';
    if (urlQuery !== query) setQuery(urlQuery);
  }, [query, searchParams]);
  const updateQuery = (value: string) => {
    setQuery(value);
    const next = new URLSearchParams(searchParams);
    next.set('source', 'wavlake');
    if (value.trim()) next.set('q', value);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };
  const search = useWavlakeSearch(debounced);
  const results = search.data ?? [];
  const tracks = results.map(item => item.track).filter((track): track is NonNullable<typeof track> => !!track);
  const links = results.filter(item => item.type !== 'track');
  return <div className="p-4 sm:p-6 space-y-6">
    <div><p className="text-sm font-semibold text-primary uppercase tracking-wider">Explore music</p><h1 className="text-4xl font-bold tracking-tight mt-2">Wavlake catalog</h1><p className="text-muted-foreground mt-2">Browse independent music directly from Wavlake, alongside your Nostr discoveries.</p></div>
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" /><Input className="pl-11 h-12 rounded-full bg-secondary" aria-label="Search Wavlake" placeholder="Search artists, albums, and tracks" value={query} onChange={e => updateQuery(e.target.value)} /></div>
    <p className="text-sm text-muted-foreground">Like tracks and follow artists in Ostrify. Your library is stored publicly on Nostr.</p>
    {query.trim().length >= 2 ? <section className="space-y-4"><h2 className="text-2xl font-bold">Search results</h2>
      {search.isFetching || debounced !== query.trim() ? <Skeleton className="h-24 w-full" /> : search.isError ? <p role="alert" className="text-destructive">Wavlake search is unavailable. <button className="underline" onClick={() => search.refetch()}>Try again</button></p> : <><CatalogLinks items={links} /><TrackList tracks={tracks} emptyMessage={links.length ? 'No playable tracks in these results.' : 'No matching Wavlake results.'} /></>}
    </section> : <><FeaturedRankings /><CatalogTracks /></>}
  </div>;
}

function Release({ type, itemId }: { type: 'artist' | 'album'; itemId?: string }) {
  const release = useWavlakeRelease(type, itemId);
  const radio = useRadio();
  const [catalogTracks, setCatalogTracks] = useState<Track[]>([]);
  const updateCatalogTracks = useCallback((tracks: Track[]) => setCatalogTracks(tracks), []);
  if (release.isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!release.data) return <div className="p-6" role="alert">Unable to load this Wavlake {type}. </div>;
  const { title, artist, image, albums, tracks } = release.data;
  return <div className="p-4 sm:p-6 space-y-8">
    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6"><div className="size-40 sm:size-48 rounded-lg bg-secondary overflow-hidden shrink-0 flex items-center justify-center">{image ? <img src={image} alt="" fetchPriority="high" decoding="async" className="size-full object-cover" /> : <Music className="size-16 text-muted-foreground" />}</div><div><p className="text-sm uppercase text-primary font-semibold">Wavlake {type}</p><h1 className="text-4xl sm:text-5xl font-bold mt-2">{title}</h1>{artist && <p className="text-muted-foreground mt-2">{artist}</p>}</div></div>
    {type === 'album' && itemId && <div className="space-y-2"><SaveAlbumButton album={{ id: itemId, title }} artist={artist} image={image} className="rounded-full" /><p className="text-sm text-muted-foreground">Saved Albums sync across your devices. Private albums are hidden from your Ostrify profile, but bookmark data remains public on Nostr.</p></div>}
    {type === 'artist' && itemId && <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><FollowButton pubkey={`wavlake:${itemId}`} /><Button type="button" variant="outline" className="rounded-full gap-2" disabled={!tracks.length && !catalogTracks.length} onClick={() => radio.startArtistRadio(`wavlake:${itemId}`, catalogTracks.length ? catalogTracks : tracks)}><Radio className="size-4" /> Start artist radio</Button></div><p className="text-sm text-muted-foreground">Follows are saved publicly to your Ostrify library, not to Wavlake.</p></div>}
    {albums.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-bold">Albums</h2><CatalogLinks items={albums} /></section>}
    {type === 'album' ? <section className="space-y-4"><h2 className="text-2xl font-bold">Tracks</h2><TrackList tracks={tracks} /></section> : <CatalogTracks artistId={itemId} onTracksChange={updateCatalogTracks} />}
  </div>;
}

export default function WavlakePage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  useSeoMeta({ title: 'Wavlake catalog — Ostrify' });
  if (type === 'artist' || type === 'album') return <Release type={type} itemId={id} />;
  return <WavlakeDiscovery />;
}
