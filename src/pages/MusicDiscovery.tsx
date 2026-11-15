import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Music2, Radio, RefreshCw, Video } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WavlakeDiscovery } from '@/pages/WavlakePage';
import { NostrCollections } from '@/components/music/NostrCollections';
import { PublicMusicPlaylists } from '@/components/music/PublicMusicPlaylists';
import { Button } from '@/components/ui/button';
import { TrackList } from '@/components/music/TrackList';
import { Skeleton } from '@/components/ui/skeleton';
import { useMusicDiscovery } from '@/hooks/useMusicDiscovery';
import { useTunestrStreams, type TunestrStream } from '@/hooks/useTunestrStreams';
import { useAppContext } from '@/hooks/useAppContext';
import { useTunestrPlayer } from '@/components/music/TunestrPlayer';

function cloudflareThumbnail(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('.cloudflarestream.com')) return undefined;
    const match = parsed.pathname.match(/^\/([a-f0-9]{32})\/(?:manifest\/video\.m3u8|iframe|watch|thumbnails\/thumbnail\.jpg)$/i);
    const videoId = match?.[1] ?? parsed.pathname.match(/^\/([a-f0-9]{32})\//i)?.[1];
    if (!videoId) return undefined;
    const thumbnail = new URL(`https://${parsed.hostname}/${videoId}/thumbnails/thumbnail.jpg`);
    thumbnail.searchParams.set('time', '1s');
    thumbnail.searchParams.set('height', '540');
    return thumbnail.toString();
  } catch {
    return undefined;
  }
}

function TunestrStreamCard({ stream, onSelect }: { stream: TunestrStream; onSelect: (stream: TunestrStream) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = stream.image ? cloudflareThumbnail(stream.image) ?? stream.image : undefined;
  const thumbnail = imageUrl || cloudflareThumbnail(stream.thumbnailSourceUrl ?? stream.url);
  return <button type="button" className="group overflow-hidden rounded-xl border border-border/70 bg-secondary/30 text-left transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onSelect(stream)}>
    <div className="relative aspect-video bg-black/80">{thumbnail && !imageFailed ? <img src={thumbnail} alt="" loading="lazy" onError={() => setImageFailed(true)} className="size-full object-cover transition group-hover:scale-[1.02]" /> : <div className="flex size-full items-center justify-center text-white/70"><Video className="size-10" /></div>}<span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs font-bold text-white">{stream.isLive ? 'LIVE' : 'Recording'}{stream.format === 'n94' ? ' · N94' : ''}</span></div>
    <div className="p-4"><h3 className="truncate font-semibold">{stream.title}</h3>{stream.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{stream.summary}</p>}<span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary"><Video className="size-4" /> Watch in Ostrify</span></div>
  </button>;
}

export default function MusicDiscovery() {
  useSeoMeta({ title: 'Music — Ostrify', description: 'Discover Nostr, TuneStr, and Wavlake music in one place.' });
  const [searchParams, setSearchParams] = useSearchParams();
  const { openStream } = useTunestrPlayer();
  const [visibleRecordingCount, setVisibleRecordingCount] = useState(24);
  const source = searchParams.get('source');
  const activeTab = source === 'wavlake' || source === 'tunestr' ? source : 'nostr';
  const feed = useMusicDiscovery();
  const tunestr = useTunestrStreams();
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
  const trackPageCount = Math.max(1, Math.ceil(filteredTracks.length / 20));
  const [trackPage, setTrackPage] = useState(1);
  const currentTrackPage = Math.min(trackPage, trackPageCount);
  const latest = feed.data?.pages.at(-1);
  const failed = latest?.failed ?? [];
  const tunedStreams = useMemo(() => {
    const unique = new Map<string, TunestrStream>();
    for (const stream of tunestr.data?.pages.flatMap(page => page.streams) ?? []) {
      const existing = unique.get(stream.id);
      if (!existing || existing.createdAt < stream.createdAt) unique.set(stream.id, stream);
    }
    return [...unique.values()].sort((left, right) => right.createdAt - left.createdAt);
  }, [tunestr.data]);
  const liveStreams = tunedStreams.filter(stream => stream.isLive);
  const recordings = tunedStreams.filter(stream => !stream.isLive);
  const visibleRecordings = recordings.slice(0, visibleRecordingCount);
  const supportedRelayCount = config.relayMetadata.relays.filter(relay => relay.read).length;
  const loadMusicTracks = async (requiredTrackCount: number) => {
    if (feed.isFetchingNextPage) return false;
    let loadedTracks = filteredTracks.length;
    let hasMore = feed.hasNextPage;
    while (loadedTracks < requiredTrackCount && hasMore) {
      const result = await feed.fetchNextPage();
      const loaded = result.data?.pages.flatMap(batch => batch.tracks) ?? [];
      const ids = new Set<string>();
      const urls = new Set<string>();
      const unique = loaded.filter(track => {
        if (ids.has(track.id) || urls.has(track.url)) return false;
        ids.add(track.id);
        urls.add(track.url);
        return true;
      });
      loadedTracks = hideClips ? unique.filter(track => track.duration === undefined || track.duration >= 30).length : unique.length;
      hasMore = Boolean(result.hasNextPage);
    }
    return loadedTracks >= requiredTrackCount;
  };

  return <div className="p-4 sm:p-6 space-y-6">
    <header className="rounded-xl bg-gradient-to-br from-emerald-900/70 via-teal-950 to-card p-6 sm:p-8">
      <div className="flex items-center gap-2 text-emerald-200 text-sm font-semibold uppercase tracking-wider"><Music2 className="size-4" /> Music for every listener</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Music</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">Explore Nostr and TuneStr live music, or browse Wavlake’s independent music catalog.</p>
    </header>
    <Tabs value={activeTab} onValueChange={value => setSearchParams(value === 'nostr' ? {} : { source: value }, { replace: true })} className="space-y-6">
      <TabsList className="grid w-full max-w-xl grid-cols-3">
        <TabsTrigger value="nostr">Nostr music</TabsTrigger>
        <TabsTrigger value="wavlake">Wavlake catalog</TabsTrigger>
        <TabsTrigger value="tunestr">TuneStr</TabsTrigger>
      </TabsList>
      <TabsContent value="nostr" className="mt-0">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3"><Link to="/settings" className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80"><Radio className="size-4" /> {relayCount} read {relayCount === 1 ? 'relay' : 'relays'} · Settings</Link></div>
          {feed.isLoading && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Loading artist discoveries">{Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />)}</div>}
          {!feed.isLoading && !tunestr.isLoading && <NostrCollections tracks={filteredTracks} showAllPublishersOption />}
          <PublicMusicPlaylists enabled={activeTab === 'nostr'} />
          <div className="flex flex-wrap gap-2 items-baseline justify-between"><h2 className="text-2xl font-bold">Discover tracks</h2><p className="text-sm text-muted-foreground">{filteredTracks.length} tracks available · discovered from your read relays</p></div>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={hideClips} onChange={event => { setHideClips(event.target.checked); setTrackPage(1); }} className="accent-green-500 size-4" /> Hide clips shorter than 30 seconds (when duration is known)</label>
          {!relayCount && <div className="rounded-lg border border-dashed p-6 text-muted-foreground">No read relays enabled. <Link className="text-primary underline" to="/settings">Choose read relays in Settings.</Link></div>}
          {feed.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Some relays could not be queried. <Button variant="link" onClick={() => feed.refetch()}><RefreshCw className="size-4" /> Retry</Button></div>}

          {failed.length > 0 && <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">{failed.length} {failed.length === 1 ? 'relay did' : 'relays did'} not respond in the latest batch. Results from responding relays are shown. <Link to="/settings" className="text-primary underline">Check relay settings</Link>.</div>}
          {relayCount > 0 && <TrackList tracks={filteredTracks} isLoading={feed.isLoading} emptyMessage="No playable tracks were found in this batch. Try loading older music or checking your read relays." hasMore={feed.hasNextPage} isLoadingMore={feed.isFetchingNextPage} onLoadMore={loadMusicTracks} page={currentTrackPage} onPageChange={nextPage => setTrackPage(Math.max(1, Math.min(trackPageCount + (feed.hasNextPage ? 1 : 0), nextPage)))} />}
          {(filteredTracks.length > 0 || feed.hasNextPage) && <p className="text-xs text-muted-foreground">Results depend on relay availability and the formats each relay stores. Older batches appear after currently loaded tracks.</p>}
        </div>
      </TabsContent>
      <TabsContent value="tunestr" className="mt-0">
        <div className="space-y-8">
          <div><p className="text-sm text-muted-foreground">NIP-53 streams and recordings published on Nostr. A Cloudflare HLS manifest is video, so it must play in a video player; the raw .m3u8 URL is not a normal web page.</p></div>
          {!supportedRelayCount && <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Add read relays in Settings to discover TuneStr shows.</div>}
          {tunestr.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">TuneStr shows couldn’t be loaded. <button className="underline" onClick={() => void tunestr.refetch()}>Try again</button></div>}
          {tunestr.data?.pages.flatMap(page => page.failed).length ? <p className="text-sm text-muted-foreground">Some relays didn’t respond. Results from the relays that did respond are shown.</p> : null}

          <section aria-labelledby="tunestr-live-heading" className="space-y-4">
            <div><h2 id="tunestr-live-heading" className="text-2xl font-bold">Live streams</h2><p className="text-sm text-muted-foreground">Currently live TuneStr shows.</p></div>
            {tunestr.isLoading && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="aspect-video rounded-xl" />)}</div>}
            {!tunestr.isLoading && !liveStreams.length && !tunestr.isError && <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No live TuneStr streams were found.</div>}
            {liveStreams.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{liveStreams.map(stream => <TunestrStreamCard key={stream.id} stream={stream} onSelect={openStream} />)}</div>}
          </section>

          <section aria-labelledby="tunestr-recordings-heading" className="space-y-4">
            <div><h2 id="tunestr-recordings-heading" className="text-2xl font-bold">Recordings</h2><p className="text-sm text-muted-foreground">Recent recordings appear first. Load older recordings to browse further back.</p></div>
            {tunestr.isLoading && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <Skeleton key={`recording-${index}`} className="aspect-video rounded-xl" />)}</div>}
            {!tunestr.isLoading && !recordings.length && !tunestr.isError && <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No TuneStr recordings were found in the recent results.</div>}
            {recordings.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{visibleRecordings.map(stream => <TunestrStreamCard key={stream.id} stream={stream} onSelect={openStream} />)}</div>}
            {visibleRecordingCount < recordings.length && <Button variant="outline" onClick={() => setVisibleRecordingCount(count => count + 24)}>Show more recordings</Button>}
            {tunestr.hasNextPage && <Button variant="outline" onClick={() => { setVisibleRecordingCount(count => count + 24); void tunestr.fetchNextPage(); }} disabled={tunestr.isFetchingNextPage}>{tunestr.isFetchingNextPage ? 'Loading older recordings…' : 'Load older recordings'}</Button>}
          </section>
        </div>
      </TabsContent>
      <TabsContent value="wavlake" className="mt-0"><WavlakeDiscovery /></TabsContent>
    </Tabs>
  </div>;
}
