import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '@/components/music/BackLink';
import { ArrowLeft, ExternalLink, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TrackArtwork } from '@/components/music/TrackArtwork';
import { usePlayer } from '@/hooks/usePlayer';
import { sanitizeUrl } from '@/lib/sanitize';
import type { Track } from '@/lib/music';

function getTrack(params: URLSearchParams): Track | undefined {
  const url = sanitizeUrl(params.get('url'));
  const title = params.get('title')?.trim();
  const kind = params.get('kind');
  if (!url || !title || title.length > 500 || !['music', 'podcast', 'audiobook'].includes(kind ?? '')) return undefined;

  const rawDuration = Number(params.get('duration'));
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : undefined;
  const image = sanitizeUrl(params.get('image'));
  const artist = params.get('artist')?.slice(0, 500) || undefined;

  return {
    id: `shared:${url}`,
    url,
    title,
    artist,
    image,
    pubkey: '',
    duration,
    kind: kind as Track['kind'],
    topics: [],
    createdAt: 0,
  };
}

export default function ListenPage() {
  const [searchParams] = useSearchParams();
  const player = usePlayer();
  const track = useMemo(() => getTrack(searchParams), [searchParams]);

  if (!track) {
    return <div className="mx-auto max-w-xl space-y-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">This Ostrify listening link is incomplete</h1>
      <p className="text-muted-foreground">The track details or audio link could not be read.</p>
      <Button asChild variant="outline"><BackLink to="/">Back to Ostrify</BackLink></Button>
    </div>;
  }

  const isCurrent = player.current?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;

  return <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-8 sm:py-12">
    <BackLink to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Browse Ostrify
    </BackLink>
    <article className="grid gap-6 rounded-2xl border bg-card p-5 sm:grid-cols-[15rem_1fr] sm:items-center sm:p-8">
      <TrackArtwork track={track} className="aspect-square w-full rounded-xl" />
      <div className="min-w-0 space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Listen on Ostrify</p>
          <h1 className="mt-2 break-words text-3xl font-bold tracking-tight">{track.title}</h1>
          {track.artist && <p className="mt-2 text-lg text-muted-foreground">{track.artist}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => player.playTrack(track)}>
            <Play className="size-4 fill-current" /> {isPlaying ? 'Play again' : isCurrent ? 'Resume in player' : 'Play on Ostrify'}
          </Button>
          <Button asChild type="button" variant="outline">
            <a href={track.url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Open audio source
            </a>
          </Button>
        </div>
      </div>
    </article>
    <p className="text-center text-sm text-muted-foreground">Shared from Ostrify. Audio is hosted by the original publisher.</p>
  </main>;
}
