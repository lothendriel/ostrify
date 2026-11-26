import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSeoMeta } from '@unhead/react';
import { MapPin, Pause, Play, Radio, Search, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TrackArtwork } from '@/components/music/TrackArtwork';
import { usePlayer } from '@/hooks/usePlayer';
import type { Track } from '@/lib/music';
import { sanitizeUrl } from '@/lib/sanitize';

const SERVERS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
const PAGE_SIZE = 30;
type Filters = { name: string; country: string; state: string };
type Station = { id: string; name: string; url?: string; image?: string; location: string; tags: string; hls: boolean };

async function directoryRequest(path: string, signal: AbortSignal): Promise<unknown> {
  for (const server of SERVERS) {
    try {
      const response = await fetch(`${server}${path}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), referrerPolicy: 'no-referrer' });
      if (!response.ok) continue;
      return await response.json() as unknown;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  throw new Error('The station directory is unavailable. Please try again.');
}

function parseStations(value: unknown): Station[] {
  if (!Array.isArray(value)) throw new Error('The station directory returned an unexpected response.');
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const text = (key: string) => typeof record[key] === 'string' ? (record[key] as string).trim().slice(0, 300) : '';
    const id = text('stationuuid');
    const name = text('name');
    if (!/^[\da-f-]{36}$/i.test(id) || !name) return [];
    return [{ id, name, url: sanitizeUrl(text('url_resolved')), image: sanitizeUrl(text('favicon')), location: [text('state'), text('country')].filter(Boolean).join(' · '), tags: text('tags').split(',').filter(Boolean).slice(0, 3).join(' · '), hls: record.hls === 1 || /\.m3u8(?:\?|$)/i.test(text('url_resolved')) }];
  });
}

function stationTrack(station: Station): Track {
  return { id: `radio-browser:${station.id}`, source: 'radio-browser', url: station.url!, title: station.name, artist: station.location || 'Live radio', image: station.image, pubkey: '', kind: 'music', topics: [], createdAt: 0 };
}

export default function LocalRadioPage() {
  useSeoMeta({ title: 'Local Radio — Ostrify', description: 'Discover live radio stations around the world.' });
  const player = usePlayer();
  const [draft, setDraft] = useState<Filters>({ name: '', country: '', state: '' });
  const [filters, setFilters] = useState<Filters>(draft);
  const [page, setPage] = useState(0);
  const countries = useQuery({
    queryKey: ['radio-browser', 'countries'], staleTime: 24 * 60 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const data = await directoryRequest('/json/countries?order=name&hidebroken=true', signal);
      if (!Array.isArray(data)) throw new Error('Could not load countries.');
      return data.flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const value = item as Record<string, unknown>;
        return typeof value.name === 'string' && value.name.trim() && typeof value.iso_3166_1 === 'string' && /^[A-Z]{2}$/.test(value.iso_3166_1) ? [{ name: value.name, code: value.iso_3166_1 }] : [];
      }).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
  const stations = useQuery({
    queryKey: ['radio-browser', 'stations', filters, page], staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ hidebroken: 'true', is_https: 'true', order: 'clickcount', reverse: 'true', limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filters.name) params.set('name', filters.name);
      if (filters.country) params.set('countrycode', filters.country);
      if (filters.state) params.set('state', filters.state);
      return parseStations(await directoryRequest(`/json/stations/search?${params}`, signal));
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPage(0);
    setFilters({ name: draft.name.trim(), country: draft.country, state: draft.state.trim() });
  };
  const tune = (station: Station) => {
    if (!station.url || station.hls) return;
    if (player.current?.id === `radio-browser:${station.id}`) {
      player.togglePlay();
      return;
    }
    player.playStation(stationTrack(station));
    // Radio Browser asks clients to count a click when a listener tunes in.
    void directoryRequest(`/json/url/${station.id}`, AbortSignal.timeout(5000)).catch(() => {});
  };

  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
    <header className="relative overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-900/80 via-indigo-950/80 to-card p-6 sm:p-10">
      <div aria-hidden="true" className="absolute -right-8 -top-12 hidden size-64 rounded-full border-[32px] border-white/5 sm:block" />
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-200"><Radio className="size-4" /> Live from everywhere</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Local Radio</h1>
      <p className="mt-3 max-w-xl text-base leading-relaxed text-violet-100/80 sm:text-lg">Find familiar voices close to home, or tune in somewhere new. Explore live internet radio from around the world.</p>
    </header>

    <section aria-labelledby="find-radio" className="space-y-4">
      <div><h2 id="find-radio" className="text-2xl font-bold">Find your frequency</h2><p className="mt-1 text-sm text-muted-foreground">Search by station, country, or state and region. No location access needed.</p></div>
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border bg-card/60 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="space-y-1.5 text-sm font-medium"><span>Station name</span><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Name or call sign" maxLength={100} /></label>
        <label className="space-y-1.5 text-sm font-medium"><span>Country</span><select value={draft.country} onChange={e => setDraft({ ...draft, country: e.target.value })} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option className="bg-popover text-popover-foreground" value="">All countries</option>{(countries.data ?? []).map(country => <option className="bg-popover text-popover-foreground" key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label className="space-y-1.5 text-sm font-medium"><span>State or region</span><Input value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value })} placeholder="e.g. Texas" maxLength={100} /></label>
        <Button type="submit" className="self-end"><Search className="size-4" /> Search stations</Button>
      </form>
      {countries.isError && <p role="status" className="text-sm text-muted-foreground">Country filters are unavailable right now. You can still search by station or region. <button type="button" className="underline" onClick={() => void countries.refetch()}>Retry</button></p>}
    </section>

    <section aria-labelledby="stations-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Radio Browser directory</p><h2 id="stations-heading" className="mt-1 text-2xl font-bold">{filters.name || filters.country || filters.state ? 'Search results' : 'Popular stations'}</h2></div><span className="text-xs text-muted-foreground">Page {page + 1}</span></div>
      {stations.isLoading && <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>}
      {stations.isError && <div role="alert" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">The station directory could not be reached. <button className="underline" onClick={() => void stations.refetch()}>Try again</button></div>}
      {!stations.isLoading && !stations.isError && !stations.data?.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No stations found. Try a broader search or another region.</div>}
      {!!stations.data?.length && <div className="grid gap-3 sm:grid-cols-2">{stations.data.map(station => {
        const active = player.current?.id === `radio-browser:${station.id}`;
        const track = stationTrack(station);
        const unavailable = !station.url || station.hls;
        return <article key={station.id} className="flex min-w-0 items-center gap-4 rounded-xl border bg-card/60 p-4 transition-colors hover:bg-card">
          <TrackArtwork track={track} className="size-14 sm:size-16" />
          <div className="min-w-0 flex-1"><h3 className="truncate font-semibold" title={station.name}>{station.name}</h3><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" /><span className="truncate">{station.location || 'Location not listed'}</span></p><p className="mt-1 truncate text-xs text-muted-foreground">{unavailable ? station.hls ? 'HLS stream not supported yet' : 'Secure stream unavailable' : station.tags || 'Live radio'}</p>{active && player.playbackError && <p role="status" className="mt-1 text-xs text-destructive">{player.playbackError}</p>}</div>
          <Button size="icon" variant={active && player.isPlaying ? 'default' : 'secondary'} className="size-10 shrink-0 rounded-full" disabled={unavailable} onClick={() => tune(station)} aria-label={`${active && player.isPlaying ? 'Pause' : 'Play'} ${station.name}`} title={unavailable ? 'This stream is not supported' : `Tune in to ${station.name}`}>{active && player.isPlaying ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}</Button>
        </article>;
      })}</div>}
      <div className="flex items-center justify-between gap-4"><Button variant="outline" disabled={page === 0 || stations.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" disabled={(stations.data?.length ?? 0) < PAGE_SIZE || stations.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    </section>
    <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><Waves className="size-4 shrink-0" /> Stations are provided by <a className="underline" href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">Radio Browser</a>. Availability and locations are community-maintained; some broadcasts may be offline, region-restricted, or incompatible with your browser. Only secure streams are shown.</p>
  </div>;
}
