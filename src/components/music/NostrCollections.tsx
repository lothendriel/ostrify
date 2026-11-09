import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Music2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { Track } from '@/lib/music';
import { TrackArtwork } from '@/components/music/TrackArtwork';
import { useAuthor } from '@/hooks/useAuthor';
import { sanitizeUrl, genUserName } from '@/lib/sanitize';

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

/** Discover publishers and album titles within the supplied results, not a global popularity chart. */
export function NostrCollections({ tracks, podcast = false }: { tracks: Track[]; podcast?: boolean }) {
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
    {publishers.length > 0 && <section className="space-y-3"><div><h2 className="text-2xl font-bold">{podcast ? 'Shows & publishers to explore' : 'Artists & publishers to explore'}</h2><p className="text-sm text-muted-foreground">Publishers with the most {podcast ? 'episodes' : 'tracks'} in the results loaded here—not a popularity chart. {podcast ? 'Open a publisher to see their show profile.' : 'Open a publisher to browse the music released by that account.'}</p></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{publishers.map(([pubkey]) => <PublisherCard key={pubkey} pubkey={pubkey} podcast={podcast} />)}</div></section>}
    {albums.length > 0 && <section className="space-y-3"><div><h2 className="text-2xl font-bold">Albums to explore</h2><p className="text-sm text-muted-foreground">Grouped by album title and publisher from loaded tracks; not a popularity chart. Open a publisher to see its releases.</p></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">{albums.map(({ track, count }) => <Link key={`${track.pubkey}:${track.artist ?? ''}:${track.album}`} to={`/artist/${nip19.npubEncode(track.pubkey)}#album-${encodeURIComponent(track.album ?? '')}`} className="rounded-lg bg-secondary/50 p-3 hover:bg-secondary transition-colors focus-visible:outline-2 focus-visible:outline-primary"><TrackArtwork track={track} className="w-full aspect-square mb-3" /><p className="font-semibold truncate">{track.album}</p><p className="text-sm text-muted-foreground truncate">{track.artist || 'Publisher'} · {count} {count === 1 ? 'track' : 'tracks'} here</p></Link>)}</div></section>}
  </div>;
}
