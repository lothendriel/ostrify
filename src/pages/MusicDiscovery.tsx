import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Music2, Radio, RefreshCw } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { Track } from '@/lib/music';
import { TrackArtwork } from '@/components/music/TrackArtwork';
import { useAuthor } from '@/hooks/useAuthor';
import { sanitizeUrl, genUserName } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { TrackList } from '@/components/music/TrackList';
import { useMusicDiscovery } from '@/hooks/useMusicDiscovery';
import { useAppContext } from '@/hooks/useAppContext';

function PublisherCard({ pubkey }: { pubkey: string }) {
  const { data } = useAuthor(pubkey);
  const metadata = data?.metadata;
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const image = sanitizeUrl(metadata?.picture);
  return <Link to={`/${nip19.npubEncode(pubkey)}`} className="group rounded-lg bg-secondary/50 p-3 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary">
    <div className="aspect-square w-full rounded-full overflow-hidden bg-muted flex items-center justify-center mb-3">
      {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover" /> : <Music2 className="size-10 text-muted-foreground" />}
    </div>
    <p className="font-semibold truncate">{name}</p><p className="text-sm text-muted-foreground">Publisher</p>
  </Link>;
}

function NostrCollections({ tracks }: { tracks: Track[] }) {
  const { publishers, albums } = useMemo(() => {
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
      publishers: [...publisherCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      albums: [...releases.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    };
  }, [tracks]);
  if (!publishers.length && !albums.length) return null;
  return <div className="space-y-8">
    {publishers.length > 0 && <section className="space-y-3"><div><h2 className="text-2xl font-bold">Artists & publishers to explore</h2><p className="text-sm text-muted-foreground">Publishers with the most tracks in the results loaded here—not a popularity chart. A publisher may not be the artist.</p></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{publishers.map(([pubkey]) => <PublisherCard key={pubkey} pubkey={pubkey} />)}</div></section>}
    {albums.length > 0 && <section className="space-y-3"><div><h2 className="text-2xl font-bold">Albums to explore</h2><p className="text-sm text-muted-foreground">Grouped by album title and publisher from loaded tracks; not a popularity chart. Open a publisher to see its releases.</p></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{albums.map(({ track, count }) => <Link key={`${track.pubkey}:${track.artist ?? ''}:${track.album}`} to={`/${nip19.npubEncode(track.pubkey)}#album-${encodeURIComponent(track.album ?? '')}`} className="rounded-lg bg-secondary/50 p-3 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary"><TrackArtwork track={track} className="w-full aspect-square mb-3" /><p className="font-semibold truncate">{track.album}</p><p className="text-sm text-muted-foreground truncate">{track.artist || 'Publisher'} · {count} {count === 1 ? 'track' : 'tracks'} here</p></Link>)}</div></section>}
  </div>;
}

export default function MusicDiscovery() {
  useSeoMeta({ title: 'Nostr Music — Ostrify', description: 'Discover music published on Nostr relays.' });
  const feed = useMusicDiscovery();
  const [visibleCount, setVisibleCount] = useState(40);
  const [hideClips, setHideClips] = useState(true);
  const { config } = useAppContext();
  const relayCount = config.relayMetadata.relays.filter(r => r.read).length;
  const tracks = useMemo(() => {
    const ids = new Set<string>();
    const urls = new Set<string>();
    return (feed.data?.pages.flatMap(page => page.tracks) ?? []).filter(track => {
      if (ids.has(track.id) || urls.has(track.url)) return false;
      ids.add(track.id); urls.add(track.url); return true;
    });
  }, [feed.data]);
  const filteredTracks = hideClips ? tracks.filter(track => track.duration === undefined || track.duration >= 30) : tracks;
  const visibleTracks = filteredTracks.slice(0, visibleCount);
  const latest = feed.data?.pages.at(-1);
  const failed = latest?.failed ?? [];

  return <div className="p-4 sm:p-6 space-y-6">
    <div className="rounded-xl bg-gradient-to-br from-emerald-900/70 via-teal-950 to-card p-6 sm:p-8">
      <div className="flex items-center gap-2 text-emerald-200 text-sm font-semibold uppercase tracking-wider"><Music2 className="size-4" /> Open music network</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Nostr music</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">Discover audio shared on your read relays. Load older batches to explore beyond the latest releases.</p>
      <div className="flex flex-wrap gap-3 mt-5"><Link to="/settings" className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80"><Radio className="size-4" /> {relayCount} read {relayCount === 1 ? 'relay' : 'relays'} · Settings</Link><Link to="/wavlake" className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary">Explore Wavlake catalog</Link></div>
    </div>
    {feed.isLoading && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Loading artist discoveries">{Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />)}</div>}
    {!feed.isLoading && <NostrCollections tracks={filteredTracks} />}
    <div className="flex flex-wrap gap-2 items-baseline justify-between"><h2 className="text-2xl font-bold">Discover tracks</h2><p className="text-sm text-muted-foreground">{filteredTracks.length} tracks available · {tracks.length} loaded</p></div>
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={hideClips} onChange={event => { setHideClips(event.target.checked); setVisibleCount(40); }} className="accent-green-500 size-4" /> Hide clips shorter than 30 seconds (when duration is known)</label>
    {!relayCount && <div className="rounded-lg border border-dashed p-6 text-muted-foreground">No read relays enabled. <Link className="text-primary underline" to="/settings">Choose read relays in Settings.</Link></div>}
    {feed.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Some relays could not be queried. <Button variant="link" onClick={() => feed.refetch()}><RefreshCw className="size-4" /> Retry</Button></div>}
    {failed.length > 0 && <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">{failed.length} {failed.length === 1 ? 'relay did' : 'relays did'} not respond in the latest batch. Results from responding relays are shown. <Link to="/settings" className="text-primary underline">Check relay settings</Link>.</div>}
    {relayCount > 0 && <TrackList tracks={visibleTracks} isLoading={feed.isLoading} emptyMessage="No playable tracks were found in this batch. Try loading older music or checking your read relays." />}
    {(visibleCount < filteredTracks.length || feed.hasNextPage) && <div className="space-y-2"><div className="flex flex-wrap gap-3">
      {visibleCount < filteredTracks.length && <Button onClick={() => setVisibleCount(count => count + 40)}>Show more tracks</Button>}
      {feed.hasNextPage && <Button variant="outline" onClick={() => { void feed.fetchNextPage(); }} disabled={feed.isFetchingNextPage}>{feed.isFetchingNextPage ? 'Loading older music…' : 'Fetch older music'}</Button>}
    </div><p className="text-xs text-muted-foreground">Results depend on relay availability and the formats each relay stores. Older batches appear after currently loaded tracks.</p></div>}
  </div>;
}
