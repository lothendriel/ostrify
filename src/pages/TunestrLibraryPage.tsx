import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Heart, Video } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { LikeButton } from '@/components/music/LikeButton';
import { Skeleton } from '@/components/ui/skeleton';
import { useTunestrPlayer } from '@/components/music/TunestrPlayer';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePlaylist } from '@/hooks/usePlaylists';
import { TUNESTR_FAVORITES_IDENTIFIER } from '@/lib/musicPlaylists';
import { parseN94Stream, parseTunestrStreamEvent } from '@/hooks/useTunestrStreams';
import { useTracksByIds } from '@/hooks/useTracksByIds';
import { sanitizeUrl } from '@/lib/sanitize';

export default function TunestrLibraryPage() {
  useSeoMeta({ title: 'TuneStr Recordings — Ostrify' });
  const { user } = useCurrentUser();
  const playlist = usePlaylist(TUNESTR_FAVORITES_IDENTIFIER);
  const tracksQuery = useTracksByIds(playlist.data?.trackIds, !!user);
  const { openStream } = useTunestrPlayer();
  const streams = useMemo(() => (tracksQuery.data?.tracks ?? []).flatMap(track => {
    if (!track.event) return [];
    const stream = track.event.kind === 1053 ? parseN94Stream(track.event) : parseTunestrStreamEvent(track.event);
    return stream ? [stream] : [];
  }), [tracksQuery.data]);

  if (!user) return <div className="flex flex-col items-center gap-4 px-6 py-24 text-center"><Heart className="size-12 text-primary" /><h1 className="text-2xl font-bold">Your TuneStr recordings</h1><p className="max-w-sm text-muted-foreground">Log in with Nostr to save recordings to your library across devices.</p><LoginArea className="max-w-60" /></div>;

  return <div className="space-y-6 p-4 sm:p-6">
    <header className="rounded-xl bg-gradient-to-br from-violet-900/70 via-slate-950 to-card p-6 sm:p-8"><p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-violet-200"><Heart className="size-4" /> Your library</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">TuneStr Recordings</h1><p className="mt-2 max-w-2xl text-muted-foreground">Recordings you’ve saved from TuneStr, synced with your Nostr library.</p></header>
    {tracksQuery.isLoading && <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-video rounded-xl" />)}</div>}
    {tracksQuery.isError && <p role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">Couldn’t load your saved TuneStr recordings. Check your read relays and try again. <button type="button" className="underline" onClick={() => void tracksQuery.refetch()}>Retry</button></p>}
    {!tracksQuery.isLoading && !tracksQuery.isError && streams.length === 0 && <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No saved TuneStr recordings yet. Use the heart on a TuneStr recording to save it here.</div>}
    {streams.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{streams.map(stream => {
      const image = sanitizeUrl(stream.image);
      return <article key={stream.id} className="overflow-hidden rounded-xl border border-border/70 bg-secondary/30">
        <button type="button" className="group relative block aspect-video w-full bg-black/80 text-white focus-visible:outline-2 focus-visible:outline-primary" onClick={() => openStream(stream)} aria-label={`Watch recording: ${stream.title}`}>
          {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.02]" /> : <span className="flex size-full items-center justify-center"><Video className="size-10" /></span>}
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs font-bold">Recording</span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-sm font-semibold"><Video className="size-4" /> Watch in Ostrify</span>
        </button>
        <div className="flex items-start justify-between gap-2 p-4"><div className="min-w-0"><h2 className="truncate font-semibold">{stream.title}</h2>{stream.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{stream.summary}</p>}</div><LikeButton trackId={stream.track.id} collection="tunestr" /></div>
      </article>;
    })}</div>}
    {!!tracksQuery.data?.unavailable && <p role="status" className="text-sm text-muted-foreground">{tracksQuery.data.unavailable} saved recording(s) are unavailable from the current relays.</p>}
  </div>;
}
