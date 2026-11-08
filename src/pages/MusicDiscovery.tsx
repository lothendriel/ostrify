import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Music2, Radio, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WavlakeDiscovery } from '@/pages/WavlakePage';
import { NostrCollections } from '@/components/music/NostrCollections';
import { Button } from '@/components/ui/button';
import { TrackList } from '@/components/music/TrackList';
import { useMusicDiscovery } from '@/hooks/useMusicDiscovery';
import { useTunestrStreams } from '@/hooks/useTunestrStreams';
import { useAppContext } from '@/hooks/useAppContext';
import { usePlayer } from '@/hooks/usePlayer';

export default function MusicDiscovery() {
  useSeoMeta({ title: 'Music — Ostrify', description: 'Discover Nostr and Wavlake music in one place.' });
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('source') === 'wavlake' ? 'wavlake' : 'nostr';
  const feed = useMusicDiscovery();
  const tunestr = useTunestrStreams();
  const [visibleCount, setVisibleCount] = useState(40);
  const [hideClips, setHideClips] = useState(true);
  const { config } = useAppContext();
  const player = usePlayer();
  const relayCount = config.relayMetadata.relays.filter(r => r.read).length;
  const tracks = useMemo(() => {
    const ids = new Set<string>();
    const urls = new Set<string>();
    return [...(feed.data?.pages.flatMap(page => page.tracks) ?? []), ...(tunestr.data?.pages.flatMap(page => page.streams.map(stream => stream.track)) ?? [])].filter(track => {
      if (ids.has(track.id) || urls.has(track.url)) return false;
      ids.add(track.id); urls.add(track.url); return true;
    });
  }, [feed.data, tunestr.data]);
  const filteredTracks = hideClips ? tracks.filter(track => track.duration === undefined || track.duration >= 30) : tracks;
  const visibleTracks = filteredTracks.slice(0, visibleCount);
  const latest = feed.data?.pages.at(-1);
  const failed = latest?.failed ?? [];
  const tunedStreams = tunestr.data?.pages.flatMap(page => page.streams) ?? [];
  const supportedRelayCount = config.relayMetadata.relays.filter(relay => relay.read).length;

  return <div className="p-4 sm:p-6 space-y-6">
    <header className="rounded-xl bg-gradient-to-br from-emerald-900/70 via-teal-950 to-card p-6 sm:p-8">
      <div className="flex items-center gap-2 text-emerald-200 text-sm font-semibold uppercase tracking-wider"><Music2 className="size-4" /> Music for every listener</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Music</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">Explore Nostr and TuneStr live music, or browse Wavlake’s independent music catalog.</p>
    </header>
    <Tabs value={activeTab} onValueChange={value => setSearchParams(value === 'nostr' ? {} : { source: value }, { replace: true })} className="space-y-6">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="nostr">Nostr & TuneStr</TabsTrigger>
        <TabsTrigger value="wavlake">Wavlake catalog</TabsTrigger>
      </TabsList>
      <TabsContent value="nostr" className="mt-0">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3"><Link to="/settings" className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80"><Radio className="size-4" /> {relayCount} read {relayCount === 1 ? 'relay' : 'relays'} · Settings</Link></div>
          {feed.isLoading && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Loading artist discoveries">{Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />)}</div>}
          {!feed.isLoading && !tunestr.isLoading && <NostrCollections tracks={filteredTracks} />}
          <div className="flex flex-wrap gap-2 items-baseline justify-between"><h2 className="text-2xl font-bold">Discover tracks</h2><p className="text-sm text-muted-foreground">{filteredTracks.length} tracks available · {tracks.length} relay tracks + {tunestr.data?.pages.flatMap(page => page.streams).length ?? 0} TuneStr streams</p></div>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={hideClips} onChange={event => { setHideClips(event.target.checked); setVisibleCount(40); }} className="accent-green-500 size-4" /> Hide clips shorter than 30 seconds (when duration is known)</label>
          {!relayCount && <div className="rounded-lg border border-dashed p-6 text-muted-foreground">No read relays enabled. <Link className="text-primary underline" to="/settings">Choose read relays in Settings.</Link></div>}
          {feed.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Some relays could not be queried. <Button variant="link" onClick={() => feed.refetch()}><RefreshCw className="size-4" /> Retry</Button></div>}
          {!supportedRelayCount && <p className="text-sm text-muted-foreground">Add Lightning Relay or nostr.land in Settings to discover TuneStr live shows.</p>}
          {tunestr.isError && <div role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">TuneStr live shows could not be loaded from the configured relays. <button className="underline" onClick={() => void tunestr.refetch()}>Retry</button></div>}
          {tunestr.data?.pages.flatMap(page => page.failed).length ? <p className="text-xs text-muted-foreground">Some relays did not return TuneStr streams. Results from responding relays are shown.</p> : null}
          {tunedStreams.length > 0 && <section className="space-y-3"><h2 className="text-2xl font-bold">TuneStr live & recent shows</h2><p className="text-sm text-muted-foreground">TuneStr NIP-53 shows and recordings shared on Nostr.</p><div className="grid gap-3 sm:grid-cols-2">{tunedStreams.slice(0, 12).map(stream => <article key={stream.id} className="overflow-hidden rounded-xl border border-border/70 bg-secondary/30">
            {stream.image && <img src={stream.image} alt="" loading="lazy" className="aspect-video w-full object-cover" />}
            <div className="p-4"><div className="flex items-center justify-between gap-2"><h3 className="truncate font-semibold">{stream.title}</h3><span className="shrink-0 rounded-full bg-primary/15 px-2 py-1 text-xs text-primary">{stream.isLive ? 'LIVE' : 'Recording'}</span></div>{stream.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{stream.summary}</p>}<Button type="button" variant="secondary" className="mt-3" onClick={() => player.playTrack(stream.track)}><Music2 className="size-4" /> Play in Ostrify</Button><a href={stream.url} target="_blank" rel="noreferrer" className="ml-3 text-sm font-medium text-primary hover:underline">Open stream</a></div>
          </article>)}</div></section>}
          {failed.length > 0 && <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">{failed.length} {failed.length === 1 ? 'relay did' : 'relays did'} not respond in the latest batch. Results from responding relays are shown. <Link to="/settings" className="text-primary underline">Check relay settings</Link>.</div>}
          {relayCount > 0 && <TrackList tracks={visibleTracks} isLoading={feed.isLoading} emptyMessage="No playable tracks were found in this batch. Try loading older music or checking your read relays." />}
          {(visibleCount < filteredTracks.length || feed.hasNextPage || tunestr.hasNextPage) && <div className="space-y-2"><div className="flex flex-wrap gap-3">
            {visibleCount < filteredTracks.length && <Button onClick={() => setVisibleCount(count => count + 40)}>Show more tracks</Button>}
            {feed.hasNextPage && <Button variant="outline" onClick={() => { void feed.fetchNextPage(); }} disabled={feed.isFetchingNextPage}>{feed.isFetchingNextPage ? 'Loading older music…' : 'Fetch older music'}</Button>}
            {tunestr.hasNextPage && <Button variant="outline" onClick={() => { void tunestr.fetchNextPage(); }} disabled={tunestr.isFetchingNextPage}>{tunestr.isFetchingNextPage ? 'Loading TuneStr…' : 'Load older TuneStr streams'}</Button>}
          </div><p className="text-xs text-muted-foreground">Results depend on relay availability and the formats each relay stores. Older batches appear after currently loaded tracks.</p></div>}
        </div>
      </TabsContent>
      <TabsContent value="wavlake" className="mt-0"><WavlakeDiscovery /></TabsContent>
    </Tabs>
  </div>;
}
