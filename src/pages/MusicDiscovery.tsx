import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Music2, Radio, RefreshCw } from 'lucide-react';
import { NostrCollections } from '@/components/music/NostrCollections';
import { Button } from '@/components/ui/button';
import { TrackList } from '@/components/music/TrackList';
import { useMusicDiscovery } from '@/hooks/useMusicDiscovery';
import { useAppContext } from '@/hooks/useAppContext';

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
