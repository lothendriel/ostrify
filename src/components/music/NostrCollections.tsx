import { useEffect, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackArtwork } from '@/components/music/TrackArtwork';
import { useAuthor } from '@/hooks/useAuthor';
import { useMusicDiscovery } from '@/hooks/useMusicDiscovery';
import { genUserName, sanitizeUrl } from '@/lib/sanitize';
import type { Track } from '@/lib/music';

function PublisherCard({ pubkey, podcast }: { pubkey: string; podcast: boolean }) {
  const { data } = useAuthor(pubkey);
  const metadata = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const image = sanitizeUrl(metadata?.picture);
  return <Link to={`/artist/${nip19.npubEncode(pubkey)}`} className="group rounded-lg bg-secondary/50 p-3 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary">
    <div className="aspect-square w-full rounded-full overflow-hidden bg-muted flex items-center justify-center mb-3">
      {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover" /> : <Music2 className="size-10 text-muted-foreground" />}
    </div>
    <p className="font-semibold truncate">{name}</p><p className="text-sm text-muted-foreground">{podcast ? 'Show publisher' : 'Artist · Publisher'}</p>
  </Link>;
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

function AlbumCard({ track, count }: { track: Track; count: number }) {
  return <Link to={`/artist/${nip19.npubEncode(track.pubkey)}#album-${encodeURIComponent(track.album ?? '')}`} className="rounded-lg bg-secondary/50 p-3 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary"><TrackArtwork track={track} className="w-full aspect-square mb-3" /><p className="font-semibold truncate">{track.album}</p><p className="text-sm text-muted-foreground truncate">{track.artist || 'Publisher'} · {count} {count === 1 ? 'track' : 'tracks'} here</p></Link>;
}

/** Discover publishers and album titles within the supplied results, not a global popularity chart. */
export function NostrCollections({ tracks, podcast = false, showAllPublishersOption = false }: { tracks: Track[]; podcast?: boolean; showAllPublishersOption?: boolean }) {
  const { publishers, albums } = useMemo(() => collectionItems(tracks), [tracks]);
  if (!publishers.length && !albums.length) return null;
  return <div className="space-y-8">
    {publishers.length > 0 && <section className="space-y-3"><div><h2 className="text-2xl font-bold">{podcast ? 'Shows & publishers to explore' : 'Artists & publishers to explore'}</h2><p className="text-sm text-muted-foreground">Publishers with the most {podcast ? 'episodes' : 'tracks'} in the results loaded here—not a popularity chart. {podcast ? 'Open a publisher to see their show profile.' : 'Open a publisher to browse the music released by that account.'}</p></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{publishers.slice(0, 8).map(([pubkey]) => <PublisherCard key={pubkey} pubkey={pubkey} podcast={podcast} />)}</div>{showAllPublishersOption && publishers.length > 8 && <Button asChild type="button" variant="outline"><Link to="/music/publishers">See all publishers</Link></Button>}</section>}
    {albums.length > 0 && <section className="space-y-3"><div><h2 className="text-2xl font-bold">Albums to explore</h2><p className="text-sm text-muted-foreground">Grouped by album title and publisher from loaded tracks; not a popularity chart. Open a publisher to see its releases.</p></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{albums.slice(0, 8).map(({ track, count }) => <AlbumCard key={`${track.pubkey}:${track.artist ?? ''}:${track.album}`} track={track} count={count} />)}</div>{showAllPublishersOption && albums.length > 8 && <Button asChild type="button" variant="outline"><Link to="/music/albums">See all albums</Link></Button>}</section>}
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
  const items = type === 'publishers' ? collections.publishers : collections.albums;
  const [searchParams, setSearchParams] = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(items.length / 15));
  const requestedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), pageCount) : 1;
  const visiblePublishers = type === 'publishers' ? collections.publishers.slice((page - 1) * 15, page * 15) : [];
  const visibleAlbums = type === 'albums' ? collections.albums.slice((page - 1) * 15, page * 15) : [];
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
    if (nextCount > page * 15) setSearchParams({ page: String(page + 1) });
  };

  if (feed.isLoading) return <div className="p-4 sm:p-6 space-y-6"><Link to="/music" className="text-sm text-muted-foreground hover:underline">← Nostr music</Link><h1 className="text-3xl font-bold">{title}</h1><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}</div></div>;
  return <div className="p-4 sm:p-6 space-y-6">
    <Link to="/music" className="text-sm text-muted-foreground hover:text-foreground hover:underline">← Nostr music</Link>
    <header><p className="text-sm font-semibold text-primary uppercase tracking-wider">Nostr music</p><h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-muted-foreground">{type === 'publishers' ? 'Publishers with the most tracks in the music results currently loaded from your read relays—not a popularity chart.' : 'Albums grouped by title and publisher from music tracks currently loaded from your read relays—not a popularity chart.'}</p></header>
    {feed.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Some relays could not be queried. <button className="underline" onClick={() => void feed.refetch()}>Try again</button></div>}
    {!feed.isError && !hasVisibleItems && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No {type} to show in the music results loaded so far.</div>}
    {hasVisibleItems && <><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{type === 'publishers' ? visiblePublishers.map(([pubkey]) => <PublisherCard key={pubkey} pubkey={pubkey} podcast={false} />) : visibleAlbums.map(({ track, count }) => <AlbumCard key={`${track.pubkey}:${track.artist ?? ''}:${track.album}`} track={track} count={count} />)}</div>
      {feed.hasNextPage && page >= pageCount && <p className="text-center text-sm text-muted-foreground">Load older music to discover more {type}.</p>}
      <nav aria-label="Collection pagination" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={() => setSearchParams(page === 2 ? {} : { page: String(page - 1) })} disabled={page <= 1}><ChevronLeft className="size-4" /> Previous</Button><p aria-live="polite" className="text-sm text-muted-foreground">Page {page} of {pageCount} <span className="hidden sm:inline">· {items.length} {type}</span></p><Button type="button" variant="outline" onClick={() => void goToNextPage()} disabled={page >= pageCount && (!feed.hasNextPage || feed.isFetchingNextPage)}>{feed.isFetchingNextPage ? 'Loading…' : 'Next'} <ChevronRight className="size-4" /></Button></nav>
    </>}
  </div>;
}
