import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ExternalLink, Music2, Play, Radio, RefreshCw, Search, Video } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WavlakeDiscovery } from '@/pages/WavlakePage';
import { NostrCollections } from '@/components/music/NostrCollections';
import { PublicMusicPlaylists } from '@/components/music/PublicMusicPlaylists';
import { Button } from '@/components/ui/button';
import { TrackList } from '@/components/music/TrackList';
import { Skeleton } from '@/components/ui/skeleton';
import { useMusicDiscovery } from '@/hooks/useMusicDiscovery';
import { mergeTunestrPages, useTunestrStreams, type TunestrStream } from '@/hooks/useTunestrStreams';
import { useAppContext } from '@/hooks/useAppContext';
import { useTunestrPlayer, type OdyseeVideo } from '@/components/music/TunestrPlayer';
import { Input } from '@/components/ui/input';
import { LikeButton } from '@/components/music/LikeButton';
import { RESULTS_PER_PAGE } from '@/lib/pagination';
import { sanitizeUrl } from '@/lib/sanitize';

function cloudflareThumbnail(url: string): string | undefined {
  try {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return undefined;
    const parsed = new URL(safeUrl);
    if (parsed.port || !/^customer-[a-z0-9]{1,48}\.cloudflarestream\.com$/.test(parsed.hostname)) return undefined;
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

type OdyseeClaim = {
  name?: unknown;
  claim_id?: unknown;
  value?: { title?: unknown; thumbnail?: { url?: unknown }; video?: { duration?: unknown } };
  signing_channel?: { name?: unknown; value?: { title?: unknown } };
};

function parseOdyseeVideo(claim: OdyseeClaim): OdyseeVideo | null {
  if (typeof claim.name !== 'string' || !claim.name || claim.name.length > 255 || claim.name === '.' || claim.name === '..' || /[\u0000-\u001f/\\]/.test(claim.name) || typeof claim.claim_id !== 'string' || !/^[a-f0-9]{40}$/i.test(claim.claim_id)) return null;
  const title = typeof claim.value?.title === 'string' ? claim.value.title.trim() : '';
  const creator = typeof claim.signing_channel?.value?.title === 'string' ? claim.signing_channel.value.title : typeof claim.signing_channel?.name === 'string' ? claim.signing_channel.name : 'Odysee creator';
  const image = typeof claim.value?.thumbnail?.url === 'string' ? sanitizeUrl(claim.value.thumbnail.url) : undefined;
  const duration = claim.value?.video?.duration;
  return { format: 'odysee', id: `odysee:${claim.claim_id}`, name: claim.name, claimId: claim.claim_id, title: title || claim.name, creator, image, duration: typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : undefined };
}

async function fetchOdyseeMusic(page: number, signal: AbortSignal) {
  const categoryUrl = 'https://odysee.com/$/api/content/v2/get?format=roku';
  let categoryResponse: Response;
  try {
    categoryResponse = await fetch(categoryUrl, { signal, credentials: 'omit' });
    if (!categoryResponse.ok) throw new Error('Category unavailable');
  } catch (error) {
    if (signal.aborted) throw error;
    categoryResponse = await fetch(`https://proxy.shakespeare.diy/?url=${encodeURIComponent(categoryUrl)}`, { signal, credentials: 'omit' });
  }
  if (!categoryResponse.ok) throw new Error('Odysee music category is unavailable.');
  const categoryData = await categoryResponse.json() as { data?: { en?: { categories?: { name?: string; channelIds?: unknown }[] } } };
  const ids = categoryData.data?.en?.categories?.find(category => category.name === 'music')?.channelIds;
  if (!Array.isArray(ids)) throw new Error('Odysee music category was not found.');
  const channelIds = ids.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{40}$/i.test(id)).slice(0, 2047);
  if (!channelIds.length) throw new Error('Odysee music channels are unavailable.');
  const apiUrl = 'https://api.na-backend.odysee.com/api/v1/proxy?m=claim_search';
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'claim_search', params: { claim_type: ['stream'], stream_types: ['video'], has_source: true, channel_ids: channelIds, page, page_size: 24, order_by: ['release_time'], limit_claims_per_channel: 1, fee_amount: '<=0', release_time: `<${Math.floor(Date.now() / 1000)}` } });
  let response: Response;
  try {
    response = await fetch(apiUrl, { method: 'POST', signal, credentials: 'omit', headers: { 'content-type': 'text/plain' }, body });
    if (!response.ok) throw new Error('Odysee videos are unavailable.');
  } catch (error) {
    if (signal.aborted) throw error;
    response = await fetch(`https://proxy.shakespeare.diy/?url=${encodeURIComponent(apiUrl)}`, { method: 'POST', signal, credentials: 'omit', headers: { 'content-type': 'text/plain' }, body });
  }
  if (!response.ok) throw new Error('Odysee videos are unavailable.');
  const data = await response.json() as { error?: unknown; result?: { items?: OdyseeClaim[]; total_pages?: number } };
  if (data.error || !Array.isArray(data.result?.items)) throw new Error('Odysee videos could not be loaded.');
  return { videos: data.result.items.flatMap(claim => { if (!claim || typeof claim !== 'object') return []; const video = parseOdyseeVideo(claim); return video ? [video] : []; }), hasMore: typeof data.result.total_pages === 'number' ? page < data.result.total_pages : data.result.items.length === 24 };
}

function OdyseeDiscovery() {
  const { openOdysee } = useTunestrPlayer();
  const query = useInfiniteQuery({
    queryKey: ['odysee-music'], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchOdyseeMusic(pageParam, signal),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length + 1 : undefined,
    staleTime: 5 * 60 * 1000,
  });
  const videos = Array.from(new Map((query.data?.pages.flatMap(page => page.videos) ?? []).map(video => [video.id, video])).values());
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wider text-primary">Discover on Odysee</p><h2 className="mt-2 text-2xl font-bold">Music videos</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Recent videos from Odysee’s Music category. Play in Ostrify using Odysee’s embedded player, or visit the original video.</p></div><a href="https://odysee.com/$/music" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">Explore on Odysee <ExternalLink className="size-4" /></a></div>
    {query.isLoading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading Odysee videos">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-video rounded-xl" />)}</div>}
    {query.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Odysee videos couldn’t be loaded. Please try again. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Retry</button></div>}
    {!query.isLoading && !query.isError && !videos.length && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No videos were found in Odysee’s Music category right now.</div>}
    {videos.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{videos.map(video => <article key={video.id} className="ostrify-audio-card overflow-hidden rounded-xl">
      <button type="button" onClick={() => openOdysee(video)} aria-label={`Watch in Ostrify: ${video.title}`} className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-primary"><div className="relative aspect-video overflow-hidden bg-black/80">{video.image ? <img src={video.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover transition group-hover:scale-[1.02]" /> : <div className="flex size-full items-center justify-center text-white/70"><Video className="size-10" /></div>}<span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/30"><span className="flex size-12 items-center justify-center rounded-full bg-black/70 text-white"><Play className="size-5 fill-current" /></span></span>{video.duration && <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-1 text-xs font-semibold text-white">{Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}</span>}</div></button>
      <div className="space-y-2 p-4"><h3 className="line-clamp-2 font-semibold">{video.title}</h3><p className="truncate text-sm text-muted-foreground">{video.creator} · Odysee</p><div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1"><button type="button" onClick={() => openOdysee(video)} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><Video className="size-4" /> Watch in Ostrify</button><a href={`https://odysee.com/${encodeURIComponent(video.name)}:${video.claimId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline">Open on Odysee <ExternalLink className="size-3" /></a></div></div>
    </article>)}</div>}
    {query.hasNextPage && <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading videos…' : 'Load more videos'}</Button>}
    <p className="text-xs text-muted-foreground">Videos are provided by Odysee. Some may be unavailable or restricted; use “Open on Odysee” if playback doesn’t work.</p>
  </div>;
}

function TunestrStreamCard({ stream, onSelect }: { stream: TunestrStream; onSelect: (stream: TunestrStream) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const safeImage = sanitizeUrl(stream.image);
  const imageUrl = safeImage ? cloudflareThumbnail(safeImage) ?? safeImage : undefined;
  const thumbnail = imageUrl || cloudflareThumbnail(stream.thumbnailSourceUrl ?? stream.url);
  return <article className="ostrify-audio-card overflow-hidden rounded-xl">
    <button type="button" className="group block w-full text-left focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onSelect(stream)} aria-label={`${stream.isLive ? 'Watch live stream' : 'Watch recording'}: ${stream.title}`}>
      <div className="relative aspect-video bg-black/80">{thumbnail && !imageFailed ? <img src={thumbnail} alt="" loading="lazy" onError={() => setImageFailed(true)} className="size-full object-cover transition group-hover:scale-[1.02]" /> : <div className="flex size-full items-center justify-center text-white/70"><Video className="size-10" /></div>}<span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs font-bold text-white">{stream.isLive ? 'LIVE' : 'Recording'}{stream.format === 'n94' ? ' · N94' : ''}</span></div>
    </button>
    <div className="flex items-start justify-between gap-2 p-4"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(stream)}><h3 className="truncate font-semibold">{stream.title}</h3>{stream.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{stream.summary}</p>}<span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary"><Video className="size-4" /> Watch in Ostrify</span></button>{!stream.isLive && <LikeButton trackId={stream.track.id} collection="tunestr" />}</div>
  </article>;
}

export default function MusicDiscovery() {
  useSeoMeta({ title: 'Music — Ostrify', description: 'Discover Nostr, TuneStr, Wavlake, and Odysee music in one place.' });
  const [searchParams, setSearchParams] = useSearchParams();
  const { openStream } = useTunestrPlayer();
  const [visibleRecordingCount, setVisibleRecordingCount] = useState(24);
  const source = searchParams.get('source');
  const activeTab = source === 'wavlake' || source === 'tunestr' || source === 'odysee' ? source : 'nostr';
  const feed = useMusicDiscovery(activeTab === 'nostr');
  const tunestr = useTunestrStreams(activeTab === 'tunestr');
  const [hideClips, setHideClips] = useState(true);
  const [nostrSearch, setNostrSearch] = useState('');
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
  const matchingTracks = useMemo(() => {
    const terms = nostrSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const candidates = hideClips ? tracks.filter(track => track.duration === undefined || track.duration >= 30) : tracks;
    if (!terms.length) return candidates;
    return candidates.filter(track => {
      const searchable = `${track.title} ${track.artist ?? ''} ${track.album ?? ''} ${track.topics.join(' ')}`.toLocaleLowerCase();
      return terms.every(term => searchable.includes(term));
    });
  }, [hideClips, nostrSearch, tracks]);
  const trackPageCount = Math.max(1, Math.ceil(matchingTracks.length / RESULTS_PER_PAGE));
  const [trackPage, setTrackPage] = useState(1);
  const currentTrackPage = Math.min(trackPage, trackPageCount);
  const filteredTracks = matchingTracks;
  const latest = feed.data?.pages.at(-1);
  const failed = latest?.failed ?? [];
  const tunedStreams = useMemo(() => mergeTunestrPages(tunestr.data?.pages ?? []), [tunestr.data]);
  const liveStreams = tunedStreams.filter(stream => stream.isLive);
  const recordings = tunedStreams.filter(stream => !stream.isLive);
  const visibleRecordings = recordings.slice(0, visibleRecordingCount);
  const supportedRelayCount = config.relayMetadata.relays.filter(relay => relay.read).length;
  const loadMusicTracks = async (requiredTrackCount: number) => {
    if (feed.isFetchingNextPage) return false;
    let loadedTracks = matchingTracks.length;
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
      const candidates = hideClips ? unique.filter(track => track.duration === undefined || track.duration >= 30) : unique;
      const terms = nostrSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      loadedTracks = candidates.filter(track => {
        const searchable = `${track.title} ${track.artist ?? ''} ${track.album ?? ''} ${track.topics.join(' ')}`.toLocaleLowerCase();
        return terms.every(term => searchable.includes(term));
      }).length;
      hasMore = Boolean(result.hasNextPage);
    }
    return loadedTracks >= requiredTrackCount;
  };

  return <div className="p-4 sm:p-6 space-y-6">
    <header className="rounded-xl bg-gradient-to-br from-emerald-900/70 via-teal-950 to-card p-6 sm:p-8">
      <div className="flex items-center gap-2 text-emerald-200 text-sm font-semibold uppercase tracking-wider"><Music2 className="size-4" /> Music for every listener</div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-3">Music</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">Explore Nostr and TuneStr music, Wavlake’s independent catalog, and videos from Odysee.</p>
    </header>
    <Tabs value={activeTab} onValueChange={value => setSearchParams(value === 'nostr' ? {} : { source: value }, { replace: true })} className="space-y-6">
      <TabsList className="grid h-auto w-full max-w-2xl grid-cols-2 gap-1 sm:grid-cols-4">
        <TabsTrigger value="nostr">Nostr music</TabsTrigger>
        <TabsTrigger value="wavlake">Wavlake catalog</TabsTrigger>
        <TabsTrigger value="tunestr">TuneStr</TabsTrigger>
        <TabsTrigger value="odysee">Odysee</TabsTrigger>
      </TabsList>
      <TabsContent value="nostr" className="mt-0">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3"><Link to="/settings" className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold hover:bg-secondary/80"><Radio className="size-4" /> {relayCount} read {relayCount === 1 ? 'relay' : 'relays'} · Settings</Link></div>
          <div className="space-y-2"><div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input className="h-12 rounded-full bg-secondary pl-11" aria-label="Search Nostr music" placeholder="Search tracks, artists, albums, and tags" value={nostrSearch} onChange={event => { setNostrSearch(event.target.value); setTrackPage(1); }} /></div><p className="text-sm text-muted-foreground">Searches loaded relay tracks by title, artist, album, and tags. Use Next to search older batches.</p></div>
          {feed.isLoading && tracks.length === 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Loading artist discoveries">{Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />)}</div>}
          {!nostrSearch.trim() && tracks.length > 0 && <NostrCollections tracks={tracks} showAllPublishersOption />}
          {!nostrSearch.trim() && <PublicMusicPlaylists enabled={activeTab === 'nostr'} />}
          <div className="flex flex-wrap gap-2 items-baseline justify-between"><h2 className="text-2xl font-bold">Discover tracks</h2><p className="text-sm text-muted-foreground">{matchingTracks.length}{nostrSearch.trim() ? ` of ${tracks.length}` : ''} tracks available · discovered from your read relays</p></div>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={hideClips} onChange={event => { setHideClips(event.target.checked); setTrackPage(1); }} className="accent-green-500 size-4" /> Hide clips shorter than 30 seconds (when duration is known)</label>
          {!relayCount && <div className="rounded-lg border border-dashed p-6 text-muted-foreground">No read relays enabled. <Link className="text-primary underline" to="/settings">Choose read relays in Settings.</Link></div>}
          {feed.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Some relays could not be queried. <Button variant="link" onClick={() => feed.refetch()}><RefreshCw className="size-4" /> Retry</Button></div>}

          {failed.length > 0 && <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">{failed.length} {failed.length === 1 ? 'relay did' : 'relays did'} not respond in the latest batch. Results from responding relays are shown. <Link to="/settings" className="text-primary underline">Check relay settings</Link>.</div>}
          {relayCount > 0 && <TrackList tracks={filteredTracks} isLoading={feed.isLoading && tracks.length === 0} emptyMessage={nostrSearch.trim() ? 'No loaded tracks match that search. Try another title, artist, album, or tag.' : 'No playable tracks were found in this batch. Try loading older music or checking your read relays.'} hasMore={feed.hasNextPage} isLoadingMore={feed.isFetchingNextPage} onLoadMore={loadMusicTracks} page={currentTrackPage} onPageChange={nextPage => setTrackPage(Math.max(1, Math.min(trackPageCount + (feed.hasNextPage ? 1 : 0), nextPage)))} />}
          {(filteredTracks.length > 0 || feed.hasNextPage) && <p className="text-xs text-muted-foreground">Results depend on relay availability and the formats each relay stores. Older batches appear after currently loaded tracks.</p>}
        </div>
      </TabsContent>
      <TabsContent value="tunestr" className="mt-0">
        <div className="space-y-8">
          <div><p className="text-sm text-muted-foreground">NIP-53 streams and recordings published on Nostr. HLS streams and supported video files play in Ostrify when the publisher’s server and your browser allow it.</p></div>
          {!supportedRelayCount && <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Add read relays in Settings to discover TuneStr shows.</div>}
          {tunestr.isError && <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">TuneStr shows couldn’t be loaded. <button className="underline" onClick={() => void tunestr.refetch()}>Try again</button></div>}
          {tunestr.data?.pages.some(page => page.failed.length > 0 || page.unconfirmed) ? <p role="status" className="text-sm text-muted-foreground">Some relays or current stream revisions could not be checked. Results may be incomplete or out of date.</p> : null}

          <section aria-labelledby="tunestr-live-heading" className="space-y-4">
            <div><h2 id="tunestr-live-heading" className="text-2xl font-bold">Live streams</h2><p className="text-sm text-muted-foreground">Currently live TuneStr shows.</p></div>
            {tunestr.isLoading && liveStreams.length === 0 && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="aspect-video rounded-xl" />)}</div>}
            {!tunestr.isLoading && !liveStreams.length && !tunestr.isError && <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No live TuneStr streams were found.</div>}
            {liveStreams.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{liveStreams.map(stream => <TunestrStreamCard key={stream.id} stream={stream} onSelect={openStream} />)}</div>}
          </section>

          <section aria-labelledby="tunestr-recordings-heading" className="space-y-4">
            <div><h2 id="tunestr-recordings-heading" className="text-2xl font-bold">Recordings</h2><p className="text-sm text-muted-foreground">Recent recordings appear first. Load older recordings to browse further back.</p></div>
            {tunestr.isLoading && recordings.length === 0 && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <Skeleton key={`recording-${index}`} className="aspect-video rounded-xl" />)}</div>}
            {!tunestr.isLoading && !recordings.length && !tunestr.isError && <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">No TuneStr recordings were found in the recent results.</div>}
            {recordings.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{visibleRecordings.map(stream => <TunestrStreamCard key={stream.id} stream={stream} onSelect={openStream} />)}</div>}
            {visibleRecordingCount < recordings.length && <Button variant="outline" onClick={() => setVisibleRecordingCount(count => count + 24)}>Show more recordings</Button>}
            {tunestr.hasNextPage && <Button variant="outline" onClick={() => { setVisibleRecordingCount(count => count + 24); void tunestr.fetchNextPage(); }} disabled={tunestr.isFetchingNextPage}>{tunestr.isFetchingNextPage ? 'Loading older recordings…' : 'Load older recordings'}</Button>}
          </section>
        </div>
      </TabsContent>
      <TabsContent value="wavlake" className="mt-0"><WavlakeDiscovery /></TabsContent>
      <TabsContent value="odysee" className="mt-0"><OdyseeDiscovery /></TabsContent>
    </Tabs>
  </div>;
}
