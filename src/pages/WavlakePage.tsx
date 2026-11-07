import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Music, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackList } from '@/components/music/TrackList';
import { useWavlakeCatalog, useWavlakeRelease, useWavlakeSearch, type CatalogItem } from '@/hooks/useWavlake';

function CatalogLinks({ items }: { items: CatalogItem[] }) {
  if (!items.length) return null;
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{items.map(item => (
    <Link key={`${item.type}:${item.id}`} to={`/wavlake/${item.type}/${item.id}`} className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
      <div className="aspect-square rounded-md bg-muted overflow-hidden mb-3 flex items-center justify-center">
        {item.image ? <img src={item.image} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Music className="size-10 text-muted-foreground" />}
      </div>
      <div className="font-semibold truncate">{item.title}</div>
      <div className="text-sm text-muted-foreground capitalize">{item.type}</div>
    </Link>
  ))}</div>;
}

function CatalogTracks({ artistId }: { artistId?: string }) {
  const catalog = useWavlakeCatalog(artistId);
  const tracks = useMemo(() => {
    const seen = new Set<string>();
    return (catalog.data?.pages.flatMap(p => p.tracks) ?? []).filter(t => !seen.has(t.id) && !!seen.add(t.id));
  }, [catalog.data]);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-2xl font-bold">{artistId ? 'Songs' : 'Latest tracks'}</h2><span className="text-sm text-muted-foreground">{catalog.data?.pages[0]?.total != null ? `${catalog.data.pages[0].total.toLocaleString()} tracks in this catalog` : 'From Wavlake'}</span></div>
    {catalog.isError && <p role="alert" className="text-sm text-destructive">Could not load Wavlake tracks. {catalog.error.message} <button className="underline" onClick={() => catalog.refetch()}>Try again</button></p>}
    <TrackList tracks={tracks} isLoading={catalog.isLoading} emptyMessage="No playable tracks found in this catalog." />
    {catalog.hasNextPage && <Button variant="outline" onClick={() => catalog.fetchNextPage()} disabled={catalog.isFetchingNextPage}>{catalog.isFetchingNextPage ? 'Loading…' : 'Load more tracks'}</Button>}
  </section>;
}

function Discovery() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 400); return () => clearTimeout(timer); }, [query]);
  const search = useWavlakeSearch(debounced);
  const results = search.data ?? [];
  const tracks = results.map(item => item.track).filter((track): track is NonNullable<typeof track> => !!track);
  const links = results.filter(item => item.type !== 'track');
  return <div className="p-4 sm:p-6 space-y-6">
    <div><p className="text-sm font-semibold text-primary uppercase tracking-wider">Explore music</p><h1 className="text-4xl font-bold tracking-tight mt-2">Wavlake catalog</h1><p className="text-muted-foreground mt-2">Browse independent music directly from Wavlake, alongside your Nostr discoveries.</p></div>
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" /><Input className="pl-11 h-12 rounded-full bg-secondary" aria-label="Search Wavlake" placeholder="Search artists, albums, and tracks" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <p className="text-sm text-muted-foreground">Wavlake catalog tracks can be played here. Nostr likes and playlists are currently available for Nostr tracks only.</p>
    {query.trim().length >= 2 ? <section className="space-y-4"><h2 className="text-2xl font-bold">Search results</h2>
      {search.isFetching || debounced !== query.trim() ? <Skeleton className="h-24 w-full" /> : search.isError ? <p role="alert" className="text-destructive">Wavlake search is unavailable. <button className="underline" onClick={() => search.refetch()}>Try again</button></p> : <><CatalogLinks items={links} /><TrackList tracks={tracks} emptyMessage={links.length ? 'No playable tracks in these results.' : 'No matching Wavlake results.'} /></>}
    </section> : <CatalogTracks />}
  </div>;
}

function Release({ type, itemId }: { type: 'artist' | 'album'; itemId?: string }) {
  const release = useWavlakeRelease(type, itemId);
  if (release.isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!release.data) return <div className="p-6" role="alert">Unable to load this Wavlake {type}. <Link to="/wavlake" className="underline">Back to catalog</Link></div>;
  const { title, artist, image, albums, tracks } = release.data;
  return <div className="p-4 sm:p-6 space-y-8"><Link to="/wavlake" className="text-sm text-muted-foreground hover:underline">← Wavlake catalog</Link>
    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6"><div className="size-40 sm:size-48 rounded-lg bg-secondary overflow-hidden shrink-0 flex items-center justify-center">{image ? <img src={image} alt="" className="size-full object-cover" /> : <Music className="size-16 text-muted-foreground" />}</div><div><p className="text-sm uppercase text-primary font-semibold">Wavlake {type}</p><h1 className="text-4xl sm:text-5xl font-bold mt-2">{title}</h1>{artist && <p className="text-muted-foreground mt-2">{artist}</p>}</div></div>
    {albums.length > 0 && <section className="space-y-4"><h2 className="text-2xl font-bold">Albums</h2><CatalogLinks items={albums} /></section>}
    {type === 'album' ? <section className="space-y-4"><h2 className="text-2xl font-bold">Tracks</h2><TrackList tracks={tracks} /></section> : <CatalogTracks artistId={itemId} />}
  </div>;
}

export default function WavlakePage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  useSeoMeta({ title: 'Wavlake catalog — Ostrify' });
  if (type === 'artist' || type === 'album') return <Release type={type} itemId={id} />;
  return <Discovery />;
}
