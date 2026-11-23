import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useSeoMeta } from '@unhead/react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import { HorizontalCarousel } from '@/components/music/HorizontalCarousel';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackArtwork } from '@/components/music/TrackArtwork';
import { useAuthor } from '@/hooks/useAuthor';
import { useMusicDiscovery } from '@/hooks/useMusicDiscovery';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import type { Track } from '@/lib/music';
import { useCategoryTracks } from '@/hooks/useCategoryTracks';
import { useWavlakeGenreCatalog, type WavlakeRelease } from '@/hooks/useWavlake';
import { CATEGORIES, tracksInCategory } from '@/lib/categories';
import { RESULTS_PER_PAGE } from '@/lib/pagination';

function PublisherCard({ pubkey, podcast, compact = false }: { pubkey: string; podcast: boolean; compact?: boolean }) {
  const { data } = useAuthor(pubkey);
  const metadata = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const image = sanitizeUrl(metadata?.picture);
  return <Link to={`/artist/${nip19.npubEncode(pubkey)}`} className={`group rounded-lg bg-secondary/50 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary ${compact ? 'p-2' : 'p-3'}`}>
    <div className={`aspect-square ${compact ? 'w-11/12 mx-auto' : 'w-full'} rounded-full overflow-hidden bg-muted flex items-center justify-center ${compact ? 'mb-2' : 'mb-3'}`}>
      {image ? <img src={image} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <Music2 className={`${compact ? 'size-8' : 'size-10'} text-muted-foreground`} />}
    </div>
    <p className={`font-semibold truncate ${compact ? 'text-sm' : ''}`}>{name}</p><p className={`text-sm text-muted-foreground ${compact ? 'text-xs' : ''}`}>{podcast ? 'Show publisher' : 'Artist · Publisher'}</p>
  </Link>;
}

type PublisherMetadata = { name?: string; displayName?: string };

function parsePublisherMetadata(events: NostrEvent[]): Map<string, PublisherMetadata> {
  const metadataByPubkey = new Map<string, PublisherMetadata>();
  for (const event of events) {
    try {
      const metadata: unknown = JSON.parse(event.content);
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;
      const record = metadata as Record<string, unknown>;
      metadataByPubkey.set(event.pubkey, {
        name: typeof record.name === 'string' ? record.name.trim() : undefined,
        displayName: typeof record.display_name === 'string' ? record.display_name.trim() : undefined,
      });
    } catch {
      // Invalid profile metadata is treated as missing.
    }
  }
  return metadataByPubkey;
}

function isGeneratedPlaceholderName(name: string): boolean {
  return /^User [0-9a-f]{8}$/i.test(name);
}

function shuffleCollectionItems<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  let state = seed || 1;
  for (let index = shuffled.length - 1; index > 0; index--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function collectionItems(tracks: Track[]) {
  const publisherCounts = new Map<string, number>();
  const releases = new Map<string, { track: Track; count: number }>();
  for (const track of tracks) {
    if (!/^[0-9a-f]{64}$/i.test(track.pubkey)) continue;
    publisherCounts.set(track.pubkey, (publisherCounts.get(track.pubkey) ?? 0) + 1);
    const album = track.album?.trim();
    if (!album) continue;
    const key = `${track.pubkey}:${(track.artist ?? '').trim().toLocaleLowerCase()}:${album.toLocaleLowerCase()}`;
    const existing = releases.get(key);
    if (existing) existing.count++;
    else releases.set(key, { track, count: 1 });
  }
  return {
    publishers: [...publisherCounts.entries()].sort((a, b) => b[1] - a[1]),
    albums: [...releases.values()].sort((a, b) => b.count - a.count),
  };
}

function AlbumCard({ track, count, compact = false }: { track: Track; count: number; compact?: boolean }) {
  return <Link to={`/artist/${nip19.npubEncode(track.pubkey)}/album?title=${encodeURIComponent(track.album ?? '')}`} className={`rounded-lg bg-secondary/50 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary ${compact ? 'p-2' : 'p-3'}`}><TrackArtwork track={track} className={`${compact ? 'w-11/12 mx-auto' : 'w-full'} aspect-square ${compact ? 'mb-2' : 'mb-3'}`} /><p className={`font-semibold truncate ${compact ? 'text-sm' : ''}`}>{track.album}</p><p className={`text-sm text-muted-foreground truncate ${compact ? 'text-xs' : ''}`}>{track.artist || 'Publisher'} · {count} {count === 1 ? 'track' : 'tracks'} here</p></Link>;
}

function WavlakeReleaseCard({ release, compact = false }: { release: WavlakeRelease; compact?: boolean }) {
  return <Link to={`/wavlake/${release.type}/${release.id}`} className={`group rounded-lg bg-secondary/50 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary ${compact ? 'p-2' : 'p-3'}`}>
    <div className={`aspect-square ${compact ? 'w-11/12 mx-auto' : 'w-full'} overflow-hidden bg-muted flex items-center justify-center ${compact ? 'mb-2' : 'mb-3'} ${release.type === 'artist' ? 'rounded-full' : 'rounded-md'}`}>
      {release.image ? <img src={release.image} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <Music2 className={`${compact ? 'size-8' : 'size-10'} text-muted-foreground`} />}
    </div>
    <p className={`font-semibold truncate ${compact ? 'text-sm' : ''}`}>{release.title}</p>
    <p className={`text-sm text-muted-foreground truncate ${compact ? 'text-xs' : ''}`}>{release.type === 'artist' ? 'Wavlake artist' : release.artist || 'Wavlake album'}</p>
  </Link>;
}

/** Discover publishers and album titles within the supplied results, not a global popularity chart. */
export function NostrCollections({ tracks, podcast = false, showAllPublishersOption = false, categoryId, wavlakeArtists = [], wavlakeAlbums = [], shuffleSeed }: { tracks: Track[]; podcast?: boolean; showAllPublishersOption?: boolean; categoryId?: string; wavlakeArtists?: WavlakeRelease[]; wavlakeAlbums?: WavlakeRelease[]; shuffleSeed?: number }) {
  const { publishers, albums } = useMemo(() => collectionItems(tracks), [tracks]);
  const orderedPublishers = useMemo(() => shuffleSeed === undefined ? publishers : shuffleCollectionItems(publishers, shuffleSeed), [publishers, shuffleSeed]);
  const orderedAlbums = useMemo(() => shuffleSeed === undefined ? albums : shuffleCollectionItems(albums, shuffleSeed ^ 0x9e3779b9), [albums, shuffleSeed]);
  const orderedWavlakeArtists = useMemo(() => shuffleSeed === undefined ? wavlakeArtists : shuffleCollectionItems(wavlakeArtists, shuffleSeed ^ 0x85ebca6b), [wavlakeArtists, shuffleSeed]);
  const orderedWavlakeAlbums = useMemo(() => shuffleSeed === undefined ? wavlakeAlbums : shuffleCollectionItems(wavlakeAlbums, shuffleSeed ^ 0xc2b2ae35), [wavlakeAlbums, shuffleSeed]);
  const nostrPublishersToShow = orderedPublishers.slice(0, orderedWavlakeArtists.length > 0 ? 4 : 8);
  const artistsToShow = orderedWavlakeArtists.slice(0, 8 - nostrPublishersToShow.length);
  const nostrAlbumsToShow = orderedAlbums.slice(0, orderedWavlakeAlbums.length > 0 ? 4 : 8);
  const albumsToShow = orderedWavlakeAlbums.slice(0, 8 - nostrAlbumsToShow.length);
  const publishersPage = categoryId ? `/category/${encodeURIComponent(categoryId)}/publishers` : '/music/publishers';
  const albumsPage = categoryId ? `/category/${encodeURIComponent(categoryId)}/albums` : '/music/albums';
  if (!publishers.length && !albums.length && !artistsToShow.length && !albumsToShow.length) return null;
  return <div className="space-y-8">
    {(publishers.length > 0 || artistsToShow.length > 0) && <section className="space-y-3"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{podcast ? 'Shows & publishers to explore' : 'Artists & publishers to explore'}</h2><p className="text-sm text-muted-foreground">{podcast ? 'Publishers with the most episodes in the results loaded here—not a popularity chart. Open a publisher to see their show profile.' : artistsToShow.length > 0 ? 'Publishers with the most Nostr tracks in the results loaded here—not a popularity chart. Also explore artists in the Wavlake catalog.' : 'Publishers with the most tracks in the results loaded here—not a popularity chart. Open a publisher to browse the music released by that account.'}</p></div>{(showAllPublishersOption || categoryId) && <Link to={publishersPage} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">See all <ChevronRight className="size-4" /></Link>}</div>{(showAllPublishersOption || categoryId) ? <HorizontalCarousel label="Artists and publishers to explore">{nostrPublishersToShow.map(([pubkey]) => <div key={`nostr:${pubkey}`} className="min-w-0 snap-start"><PublisherCard pubkey={pubkey} podcast={podcast} compact /></div>)}{artistsToShow.map((release) => <div key={`wavlake:${release.id}`} className="min-w-0 snap-start"><WavlakeReleaseCard release={release} compact /></div>)}</HorizontalCarousel> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{nostrPublishersToShow.map(([pubkey]) => <PublisherCard key={`nostr:${pubkey}`} pubkey={pubkey} podcast={podcast} />)}{artistsToShow.map(release => <WavlakeReleaseCard key={`wavlake:${release.id}`} release={release} />)}</div>}</section>}
    {(albums.length > 0 || albumsToShow.length > 0) && <section className="space-y-3"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">Albums to explore</h2><p className="text-sm text-muted-foreground">Grouped from tracks loaded here, including Wavlake catalog albums.</p></div>{(showAllPublishersOption || categoryId) && <Link to={albumsPage} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">See all <ChevronRight className="size-4" /></Link>}</div>{(showAllPublishersOption || categoryId) ? <HorizontalCarousel label="Albums to explore">{nostrAlbumsToShow.map(({ track, count }) => <div key={`${track.pubkey}:${track.artist ?? ''}:${track.album}`} className="min-w-0 snap-start"><AlbumCard track={track} count={count} compact /></div>)}{albumsToShow.map(release => <div key={`wavlake:${release.id}`} className="min-w-0 snap-start"><WavlakeReleaseCard release={release} compact /></div>)}</HorizontalCarousel> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{nostrAlbumsToShow.map(({ track, count }) => <AlbumCard key={`${track.pubkey}:${track.artist ?? ''}:${track.album}`} track={track} count={count} />)}{albumsToShow.map(release => <WavlakeReleaseCard key={`wavlake:${release.id}`} release={release} />)}</div>}</section>}
  </div>;
}

export function CategoryCollectionsPage({ type }: { type: 'publishers' | 'albums' }) {
  const { id: categoryId = '' } = useParams<{ id: string }>();
  const category = CATEGORIES.find(item => item.id === categoryId);
  const nostrQuery = useCategoryTracks(categoryId);
  const wavlakeQueries = useWavlakeGenreCatalog(category?.wavlakeGenres ?? []);
  const wavlakeTracks = wavlakeQueries.flatMap(query => query.data ?? []);
  const categoryNostrTracks = useMemo(() => tracksInCategory(nostrQuery.data ?? [], categoryId), [categoryId, nostrQuery.data]);
  const categoryWavlakeTracks = useMemo(() => {
    const genreAliases = category?.match ?? [];
    return wavlakeTracks.map(track => ({ ...track, topics: [...track.topics, ...genreAliases] }));
  }, [category, wavlakeTracks]);
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    return [...categoryNostrTracks, ...categoryWavlakeTracks].filter(track => {
      if (seen.has(track.url)) return false;
      seen.add(track.url);
      return true;
    });
  }, [categoryNostrTracks, categoryWavlakeTracks]);
  const collections = useMemo(() => collectionItems(tracks), [tracks]);
  const releases = useMemo(() => {
    const byId = new Map<string, WavlakeRelease>();
    for (const track of wavlakeTracks) {
      const id = type === 'publishers' ? track.artistId : track.albumId;
      const title = type === 'publishers' ? track.artist : track.album;
      if (!id || !title?.trim() || byId.has(id)) continue;
      byId.set(id, {
        id,
        type: type === 'publishers' ? 'artist' : 'album',
        title: title.trim(),
        artist: type === 'albums' ? track.artist : undefined,
        image: type === 'publishers' ? track.artistImage : track.image,
      });
    }
    return [...byId.values()];
  }, [type, wavlakeTracks]);
  const items = useMemo(() => type === 'publishers'
    ? [
      ...collections.publishers.map(([pubkey, count]) => ({ source: 'nostr' as const, pubkey, count })),
      ...releases.map(release => ({ source: 'wavlake' as const, release })),
    ]
    : [
      ...collections.albums.map(album => ({ source: 'nostr' as const, album })),
      ...releases.map(release => ({ source: 'wavlake' as const, release })),
    ], [collections, releases, type]);
  const [searchParams, setSearchParams] = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(items.length / RESULTS_PER_PAGE));
  const requestedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), pageCount) : 1;
  const isLoading = nostrQuery.isLoading || wavlakeQueries.some(query => query.isLoading);
  const isError = nostrQuery.isError || wavlakeQueries.some(query => query.isError);
  const title = type === 'publishers' ? 'Artists & publishers to explore' : 'Albums to explore';
  useSeoMeta({ title: `${title} — ${category?.label ?? 'Genre'} — Ostrify` });

  useEffect(() => {
    if (!searchParams.get('page') || String(page) === searchParams.get('page')) return;
    const next = new URLSearchParams(searchParams);
    if (page === 1) next.delete('page');
    else next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [page, searchParams, setSearchParams]);

  const visibleItems = items.slice((page - 1) * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE);
  const pagination = <nav aria-label={`${type} pagination`} className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
    <Button type="button" variant="outline" onClick={() => setSearchParams(page === 2 ? {} : { page: String(page - 1) })} disabled={page <= 1}><ChevronLeft className="size-4" /> Previous</Button>
    <p aria-live="polite" className="text-sm text-muted-foreground">Page {page} of {pageCount} <span className="hidden sm:inline">· {items.length} {type}</span></p>
    <Button type="button" variant="outline" onClick={() => setSearchParams({ page: String(page + 1) })} disabled={page >= pageCount}>Next <ChevronRight className="size-4" /></Button>
  </nav>;

  return <div className="p-4 sm:p-6 space-y-6">
    <header><p className="text-sm font-semibold text-primary uppercase tracking-wider">{category?.label ?? 'Genre'}</p><h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-muted-foreground">{type === 'publishers' ? 'Artists and publishers found in this genre’s Nostr and Wavlake tracks.' : 'Albums found in this genre’s Nostr and Wavlake tracks.'}</p></header>
    {isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Some genre results could not be loaded. Results that did load are shown.</div>}
    {isLoading && !items.length && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3" aria-label={`Loading ${type}`}>{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}</div>}
    {!isLoading && !items.length && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No {type} found for this genre in the available results.</div>}
    {items.length > 0 && <>
      {pagination}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {visibleItems.map((item, index) => item.source === 'wavlake'
          ? <WavlakeReleaseCard key={`wavlake:${item.release.id}`} release={item.release} />
          : type === 'publishers' && 'pubkey' in item
            ? <PublisherCard key={`nostr:${item.pubkey}`} pubkey={item.pubkey} podcast={false} />
            : 'album' in item
              ? <AlbumCard key={`${item.album.track.pubkey}:${item.album.track.artist ?? ''}:${item.album.track.album}:${index}`} track={item.album.track} count={item.album.count} />
              : null)}
      </div>
      {pagination}
    </>}
  </div>;
}

export function NostrCollectionsPage({ type }: { type: 'publishers' | 'albums' }) {
  const feed = useMusicDiscovery();
  const tracks = useMemo(() => {
    const ids = new Set<string>();
    const urls = new Set<string>();
    return (feed.data?.pages.flatMap(page => page.tracks) ?? []).filter(track => {
      if (ids.has(track.id) || urls.has(track.url)) return false;
      ids.add(track.id);
      urls.add(track.url);
      return true;
    }).filter(track => track.duration === undefined || track.duration >= 30);
  }, [feed.data]);
  const collections = useMemo(() => collectionItems(tracks), [tracks]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { nostr } = useNostr();
  const publisherKeys = type === 'publishers' ? collections.publishers.map(([pubkey]) => pubkey) : [];
  const profiles = useQuery({
    queryKey: ['music-publisher-profiles', publisherKeys],
    enabled: type === 'publishers' && publisherKeys.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [0], authors: publisherKeys, limit: publisherKeys.length }], { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
      return parsePublisherMetadata(events);
    },
  });
  const publishers = useMemo(() => {
    if (type !== 'publishers') return collections.publishers;
    return collections.publishers.filter(([pubkey]) => {
      const metadata = profiles.data?.get(pubkey);
      const name = metadata?.displayName || metadata?.name || genUserName(pubkey);
      return !isGeneratedPlaceholderName(name);
    });
  }, [collections.publishers, profiles.data, type]);
  const items = type === 'publishers' ? publishers : collections.albums;
  const pageCount = Math.max(1, Math.ceil(items.length / RESULTS_PER_PAGE));
  const requestedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), pageCount) : 1;
  const isCollectionLoading = (feed.isLoading && !feed.data) || (type === 'publishers' && publisherKeys.length > 0 && profiles.isLoading && !profiles.data);
  const visiblePublishers = type === 'publishers' ? publishers.slice((page - 1) * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE) : [];
  const visibleAlbums = type === 'albums' ? collections.albums.slice((page - 1) * RESULTS_PER_PAGE, page * RESULTS_PER_PAGE) : [];
  const hasVisibleItems = visiblePublishers.length > 0 || visibleAlbums.length > 0;
  const title = type === 'publishers' ? 'Artists & publishers to explore' : 'Albums to explore';
  useSeoMeta({ title: `${title} — Nostr music — Ostrify` });

  useEffect(() => {
    if (feed.data && searchParams.get('page') && String(page) !== searchParams.get('page')) {
      const next = new URLSearchParams(searchParams);
      if (page === 1) next.delete('page');
      else next.set('page', String(page));
      setSearchParams(next, { replace: true });
    }
  }, [feed.data, page, searchParams, setSearchParams]);

  const goToNextPage = async () => {
    if (page < pageCount) {
      setSearchParams({ page: String(page + 1) });
      return;
    }
    if (!feed.hasNextPage || feed.isFetchingNextPage) return;
    const result = await feed.fetchNextPage();
    const allTracks = result.data?.pages.flatMap(pageData => pageData.tracks) ?? [];
    const ids = new Set<string>();
    const urls = new Set<string>();
    const uniqueTracks = allTracks.filter(track => {
      if (ids.has(track.id) || urls.has(track.url)) return false;
      ids.add(track.id);
      urls.add(track.url);
      return true;
    }).filter(track => track.duration === undefined || track.duration >= 30);
    const nextCollections = collectionItems(uniqueTracks);
    const nextCount = type === 'publishers' ? nextCollections.publishers.length : nextCollections.albums.length;
    if (nextCount > page * RESULTS_PER_PAGE) setSearchParams({ page: String(page + 1) });
  };

  if (isCollectionLoading) return <div className="p-4 sm:p-6 space-y-6"><h1 className="text-3xl font-bold">{title}</h1><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}</div></div>;
  return <div className="p-4 sm:p-6 space-y-6">

    <header><p className="text-sm font-semibold text-primary uppercase tracking-wider">Nostr music</p><h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-muted-foreground">{type === 'publishers' ? 'Publishers with the most tracks in the music results currently loaded from your read relays—not a popularity chart.' : 'Albums grouped by title and publisher from music tracks currently loaded from your read relays—not a popularity chart.'}</p></header>
    {feed.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Some relays could not be queried. <button className="underline" onClick={() => void feed.refetch()}>Try again</button></div>}
    {!feed.isError && !hasVisibleItems && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No {type} to show in the music results loaded so far.</div>}
    {hasVisibleItems && <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{type === 'publishers' ? visiblePublishers.map(([pubkey]) => <PublisherCard key={pubkey} pubkey={pubkey} podcast={false} />) : visibleAlbums.map(({ track, count }) => <AlbumCard key={`${track.pubkey}:${track.artist ?? ''}:${track.album}`} track={track} count={count} />)}</div>
      {feed.hasNextPage && page >= pageCount && <p className="text-center text-sm text-muted-foreground">Load older music to discover more {type}.</p>}
      <nav aria-label="Collection pagination" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={() => setSearchParams(page === 2 ? {} : { page: String(page - 1) })} disabled={page <= 1}><ChevronLeft className="size-4" /> Previous</Button><p aria-live="polite" className="text-sm text-muted-foreground">Page {page} of {pageCount} <span className="hidden sm:inline">· {items.length} {type}</span></p><Button type="button" variant="outline" onClick={() => void goToNextPage()} disabled={page >= pageCount && (!feed.hasNextPage || feed.isFetchingNextPage)}>{feed.isFetchingNextPage ? 'Loading…' : 'Next'} <ChevronRight className="size-4" /></Button></nav>
    </>}
  </div>;
}
