import { useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Music } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { usePublicMusicPlaylists } from '@/hooks/usePublicMusicPlaylists';
import { sanitizeUrl, genUserName } from '@/lib/sanitize';
import type { PublicMusicPlaylist } from '@/lib/publicMusicPlaylists';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function PublicPlaylistCard({ playlist }: { playlist: PublicMusicPlaylist }) {
  const { data } = useAuthor(playlist.pubkey);
  const name = data?.metadata?.display_name || data?.metadata?.name || genUserName(playlist.pubkey);
  const image = sanitizeUrl(playlist.image);
  const path = `/ostrify-playlist/${nip19.npubEncode(playlist.pubkey)}?d=${encodeURIComponent(playlist.id)}`;
  return <Link to={path} className="group overflow-hidden rounded-xl border border-border/70 bg-secondary/30 transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
    <div className="relative aspect-square bg-muted">
      {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" /> : <div className="flex size-full items-center justify-center bg-gradient-to-br from-emerald-900 to-teal-950"><Music className="size-12 text-white/70" /></div>}
    </div>
    <div className="p-3"><p className="truncate font-semibold" title={playlist.title}>{playlist.title}</p><p className="mt-1 truncate text-sm text-muted-foreground">{name}</p><p className="mt-1 text-xs text-muted-foreground">{playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'track' : 'tracks'} · Ostrify</p></div>
  </Link>;
}

export function PublicMusicPlaylists({ enabled = true, paginatedPage = false }: { enabled?: boolean; paginatedPage?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { config } = useAppContext();
  const hasReadRelays = config.relayMetadata.relays.some(relay => relay.read);
  const playlists = usePublicMusicPlaylists(enabled);
  const discovered = playlists.data?.playlists ?? [];
  const pageCount = Math.max(1, Math.ceil(discovered.length / 15));
  const requestedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), pageCount) : 1;
  const featured = paginatedPage ? discovered.slice((page - 1) * 15, page * 15) : discovered.slice(0, 12);
  useSeoMeta(paginatedPage ? { title: 'Public playlists on Ostrify — Music' } : {});
  useEffect(() => {
    if (paginatedPage && playlists.data && searchParams.get('page') && String(page) !== searchParams.get('page')) {
      const next = new URLSearchParams(searchParams);
      if (page === 1) next.delete('page');
      else next.set('page', String(page));
      setSearchParams(next, { replace: true });
    }
  }, [page, paginatedPage, playlists.data, searchParams, setSearchParams]);
  if (!enabled) return null;
  if (!hasReadRelays) return paginatedPage ? <div className="p-4 sm:p-6 space-y-6"><Link to="/music" className="text-sm text-muted-foreground hover:underline">← Nostr music</Link><h1 className="text-3xl font-bold">Public playlists on Ostrify</h1><div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Enable read relays in Settings to discover public playlists.</div></div> : <section className="space-y-3"><div><h2 className="text-2xl font-bold">Public playlists on Ostrify</h2><p className="text-sm text-muted-foreground">Ostrify playlists shared by listeners across Nostr.</p></div><div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Enable read relays in Settings to discover public playlists.</div></section>;
  if (playlists.isLoading) return paginatedPage ? <div className="p-4 sm:p-6 space-y-6"><Link to="/music" className="text-sm text-muted-foreground hover:underline">← Nostr music</Link><h1 className="text-3xl font-bold">Public playlists on Ostrify</h1><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-xl" />)}</div></div> : <section className="space-y-3" aria-label="Loading public playlists"><div><h2 className="text-2xl font-bold">Public playlists on Ostrify</h2><p className="text-sm text-muted-foreground">Ostrify playlists shared by listeners across Nostr.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-xl" />)}</div></section>;
  if (!discovered.length) return paginatedPage ? <div className="p-4 sm:p-6 space-y-6"><Link to="/music" className="text-sm text-muted-foreground hover:underline">← Nostr music</Link><header><p className="text-sm font-semibold text-primary uppercase tracking-wider">Nostr music</p><h1 className="mt-2 text-3xl font-bold">Public playlists on Ostrify</h1></header><div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{playlists.isError ? 'Couldn’t search your read relays for Ostrify playlists. Check relay settings and try again.' : 'No Ostrify playlists were found on your read relays yet.'}</div><Button type="button" variant="outline" onClick={() => void playlists.refetch()}>Try again</Button></div> : <section className="space-y-3"><div><h2 className="text-2xl font-bold">Public playlists on Ostrify</h2><p className="text-sm text-muted-foreground">Ostrify playlists shared by listeners across Nostr.</p></div><div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{playlists.isError ? 'Couldn’t search your read relays for Ostrify playlists. Check relay settings and try again.' : 'No Ostrify playlists were found on your read relays yet.'}</div><Button type="button" variant="outline" onClick={() => void playlists.refetch()}>Try again</Button></section>;
  const discovery = playlists.data;
  if (paginatedPage) return <div className="p-4 sm:p-6 space-y-6"><Link to="/music" className="text-sm text-muted-foreground hover:text-foreground hover:underline">← Nostr music</Link><header><p className="text-sm font-semibold text-primary uppercase tracking-wider">Nostr music</p><h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Public playlists on Ostrify</h1><p className="mt-2 text-muted-foreground">Playlists shared by Ostrify listeners. Your own library stays separate.</p></header><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{featured.map(playlist => <PublicPlaylistCard key={`${playlist.pubkey}:${playlist.id}`} playlist={playlist} />)}</div>{!!discovery?.failedRelayCount && <p role="status" className="text-sm text-muted-foreground">{discovery.failedRelayCount} relay(s) did not respond; showing playlists from the relays that did.</p>}{discovered.length > 15 && <nav aria-label="Playlist pagination" className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={() => setSearchParams(page === 2 ? {} : { page: String(page - 1) })} disabled={page <= 1}><ChevronLeft className="size-4" /> Previous</Button><p aria-live="polite" className="text-sm text-muted-foreground">Page {page} of {pageCount} <span className="hidden sm:inline">· {discovered.length} playlists</span></p><Button type="button" variant="outline" onClick={() => setSearchParams({ page: String(page + 1) })} disabled={page >= pageCount}>Next <ChevronRight className="size-4" /></Button></nav>}</div>;
  return <section className="space-y-3"><div><h2 className="text-2xl font-bold">Public playlists on Ostrify</h2><p className="text-sm text-muted-foreground">Playlists shared by Ostrify listeners. Your own library stays separate.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{featured.map(playlist => <PublicPlaylistCard key={`${playlist.pubkey}:${playlist.id}`} playlist={playlist} />)}</div>{!!discovery?.failedRelayCount && <p role="status" className="text-sm text-muted-foreground">{discovery.failedRelayCount} relay(s) did not respond; showing playlists from the relays that did.</p>}{discovered.length > 12 && <Button asChild type="button" variant="outline"><Link to="/music/playlists">See all {discovered.length} playlists</Link></Button>}</section>;
}
