import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Music } from 'lucide-react';
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
  const path = `/music-playlist/${nip19.npubEncode(playlist.pubkey)}?d=${encodeURIComponent(playlist.id)}`;
  return <Link to={path} className="group overflow-hidden rounded-xl border border-border/70 bg-secondary/30 transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary">
    <div className="relative aspect-square bg-muted">
      {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" /> : <div className="flex size-full items-center justify-center bg-gradient-to-br from-emerald-900 to-teal-950"><Music className="size-12 text-white/70" /></div>}
    </div>
    <div className="p-3"><p className="truncate font-semibold" title={playlist.title}>{playlist.title}</p><p className="mt-1 truncate text-sm text-muted-foreground">{name}</p><p className="mt-1 text-xs text-muted-foreground">{playlist.references.length} {playlist.references.length === 1 ? 'track' : 'tracks'}</p></div>
  </Link>;
}

export function PublicMusicPlaylists({ enabled = true }: { enabled?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const { config } = useAppContext();
  const hasReadRelays = config.relayMetadata.relays.some(relay => relay.read);
  const playlists = usePublicMusicPlaylists(enabled);
  const discovered = playlists.data?.playlists ?? [];
  const featured = showAll ? discovered : discovered.slice(0, 12);
  if (!hasReadRelays) return <section className="space-y-3"><div><h2 className="text-2xl font-bold">Public playlists on Nostr</h2><p className="text-sm text-muted-foreground">Playlists shared by music publishers and listeners.</p></div><div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Enable read relays in Settings to discover public playlists.</div></section>;
  if (playlists.isLoading) return <section className="space-y-3" aria-label="Loading public playlists"><div><h2 className="text-2xl font-bold">Public playlists on Nostr</h2><p className="text-sm text-muted-foreground">Playlists shared by music publishers and listeners.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-[3/4] rounded-xl" />)}</div></section>;
  if (!discovered.length) return <section className="space-y-3"><div><h2 className="text-2xl font-bold">Public playlists on Nostr</h2><p className="text-sm text-muted-foreground">Playlists shared by music publishers and listeners.</p></div><div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{playlists.isError ? 'Couldn’t search your read relays for playlists. Check relay settings and try again.' : 'No public music playlists were found on your read relays yet. Playlist availability depends on relays carrying kind 34139 events.'}</div><Button type="button" variant="outline" onClick={() => void playlists.refetch()}>Try again</Button></section>;
  const discovery = playlists.data;
  return <section className="space-y-3"><div><h2 className="text-2xl font-bold">Public playlists on Nostr</h2><p className="text-sm text-muted-foreground">Community playlists discovered on your read relays. Your own library stays separate.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{featured.map(playlist => <PublicPlaylistCard key={`${playlist.pubkey}:${playlist.id}`} playlist={playlist} />)}</div>{!!discovery?.failedRelayCount && <p role="status" className="text-sm text-muted-foreground">{discovery.failedRelayCount} relay(s) did not respond; showing playlists from the relays that did.</p>}{discovered.length > 12 && <Button type="button" variant="outline" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer playlists' : `See all ${discovered.length} playlists`}</Button>}</section>;
}
