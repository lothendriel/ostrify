import { useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitize';
import type { Track } from '@/lib/music';
import { audioDetailPath } from '@/lib/audioDetail';

const PUBLIC_APP_ORIGIN = 'https://ostrify.studio314.us';

function audioDetailUrl(track: Track): URL | undefined {
  const audioUrl = sanitizeUrl(track.url);
  if (audioUrl && audioUrl.length > 2048) return undefined;
  const eventKind = track.event?.kind ?? track.eventKind ?? (track.id.startsWith('tunestr:n94:') ? 1053 : /^[0-9a-f]{64}$/i.test(track.id) ? track.kind === 'podcast' ? 54 : 1 : undefined);
  const detailUrl = new URL(audioDetailPath({ ...track, eventKind }), PUBLIC_APP_ORIGIN);
  const publicLinkOrigin = PUBLIC_APP_ORIGIN;
  if (audioUrl) detailUrl.searchParams.set('url', audioUrl);
  detailUrl.searchParams.set('title', track.title.slice(0, 500));
  detailUrl.searchParams.set('kind', track.kind);
  if (track.artist) detailUrl.searchParams.set('artist', track.artist.slice(0, 300));
  if (track.image && sanitizeUrl(track.image)) detailUrl.searchParams.set('image', sanitizeUrl(track.image)!);
  if (track.duration && Number.isFinite(track.duration) && track.duration > 0) detailUrl.searchParams.set('duration', String(track.duration));
  if (track.source) detailUrl.searchParams.set('source', track.source);
  if (track.album) detailUrl.searchParams.set('album', track.album.slice(0, 300));
  if (track.artistId) detailUrl.searchParams.set('artistId', track.artistId.slice(0, 100));
  if (track.artistPubkey && /^[0-9a-f]{64}$/i.test(track.artistPubkey)) detailUrl.searchParams.set('artistPubkey', track.artistPubkey);
  if (track.showId && track.showId.length <= 256) detailUrl.searchParams.set('showId', track.showId);
  if (/^[0-9a-f]{64}$/i.test(track.pubkey)) detailUrl.searchParams.set('pubkey', track.pubkey);
  if (track.topics.length) detailUrl.searchParams.set('topics', track.topics.slice(0, 12).map(topic => topic.slice(0, 50)).join(','));
  if (track.createdAt > 0) detailUrl.searchParams.set('createdAt', String(track.createdAt));
  const optionalParameters = ['url', 'image', 'topics', 'artistPubkey', 'pubkey', 'artistId', 'showId', 'album', 'artist'] as const;
  for (const parameter of optionalParameters) {
    if (detailUrl.href.length <= 7000) break;
    detailUrl.searchParams.delete(parameter);
  }
  if (detailUrl.href.length <= 7000) return detailUrl;
  for (const parameter of optionalParameters) detailUrl.searchParams.delete(parameter);
  if (detailUrl.href.length <= 7000) return detailUrl;
  const stableItemId = track.id.startsWith('wavlake:') || track.id.startsWith('fountain:') || track.id.startsWith('podcast-index:') || track.id.startsWith('gutenberg:') || track.id.startsWith('librivox:') || track.id.startsWith('tunestr:') || /^\d+:[0-9a-f]{64}:.+$/i.test(track.id);
  if (stableItemId) {
    const minimalUrl = new URL('/audio', publicLinkOrigin);
    minimalUrl.searchParams.set('track', track.id.slice(0, 2048));
    minimalUrl.searchParams.set('title', track.title.slice(0, 500));
    minimalUrl.searchParams.set('kind', track.kind);
    if (eventKind) minimalUrl.searchParams.set('eventKind', String(eventKind));
    if (track.source) minimalUrl.searchParams.set('source', track.source);
    return minimalUrl.href.length <= 7000 ? minimalUrl : undefined;
  }
  return undefined;
}

function defaultMessage(track: Track, shortUrl?: string): string {
  const message = `I'm listening to ${track.title.slice(0, 500)} on Ostrify. Check it out!`;
  const detailUrl = shortUrl ?? audioDetailUrl(track)?.toString();
  return detailUrl ? `${message}\n\n${detailUrl}` : message;
}

async function createShortAudioLink(track: Track): Promise<string | undefined> {
  const detailUrl = audioDetailUrl(track);
  if (!detailUrl) return undefined;
  const configuredWorkerUrl = (import.meta.env.VITE_AUDIO_SHARE_WORKER_URL ?? 'https://ostrify.lothendriel.workers.dev').replace(/\/$/, '');
  let workerUrl: URL;
  try {
    workerUrl = new URL('/api/audio-shares', configuredWorkerUrl);
  } catch {
    return undefined;
  }
  const appOrigin = new URL(detailUrl.origin).origin;
  if (workerUrl.protocol !== 'https:' && workerUrl.hostname !== 'localhost') return undefined;
  if (workerUrl.origin === appOrigin) return undefined;
  let response: Response;
  try {
    response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${appOrigin}${detailUrl.pathname}${detailUrl.search}` }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return undefined;
  }
  if (!payload || typeof payload !== 'object' || !('url' in payload) || typeof payload.url !== 'string') return undefined;
  try {
    const shortUrl = new URL(payload.url, workerUrl);
    if (shortUrl.origin !== workerUrl.origin || !/^\/s\/[A-Za-z0-9_-]{12}$/.test(shortUrl.pathname)) return undefined;
    return shortUrl.toString();
  } catch {
    return undefined;
  }
}

function trackTags(track: Track): string[][] {
  if (track.event) {
    const identifier = track.event.tags.find(([name]) => name === 'd')?.[1];
    if (track.event.kind >= 30000 && track.event.kind < 40000 && identifier) {
      return [['q', `${track.event.kind}:${track.event.pubkey}:${identifier}`, '', track.event.pubkey]];
    }
    return [['q', track.event.id, '', track.event.pubkey]];
  }

  const url = sanitizeUrl(track.url);
  return url ? [['r', url]] : [];
}

export function ShareTrackButton({ track }: { track: Track | undefined }) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sharedTrack, setSharedTrack] = useState<Track>();
  const [isShortening, setIsShortening] = useState(false);
  const requestIdRef = useRef<string | undefined>(undefined);

  const openShareDialog = async () => {
    if (!track) return;
    const trackToShare = track;
    const initialMessage = defaultMessage(trackToShare);
    const requestId = `${Date.now()}-${Math.random()}`;
    requestIdRef.current = requestId;
    setSharedTrack(trackToShare);
    setMessage(initialMessage);
    setOpen(true);
    setIsShortening(true);
    try {
      const shortUrl = await createShortAudioLink(trackToShare);
      if (requestIdRef.current !== requestId) return;
      if (shortUrl) {
        const shortenedMessage = defaultMessage(trackToShare, shortUrl);
        setMessage(currentMessage => currentMessage === initialMessage ? shortenedMessage : currentMessage);
      }
    } catch {
      // Keep the longer direct detail URL if the short-link Worker is unavailable.
    } finally {
      if (requestIdRef.current === requestId) setIsShortening(false);
    }
  };

  const share = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sharedTrack || !message.trim() || !user) return;

    try {
      await publish({ kind: 1, content: message.trim(), tags: trackTags(sharedTrack) });
      setOpen(false);
      toast({ title: 'Shared to Nostr', description: `Your post about “${sharedTrack.title}” was published.` });
    } catch (error) {
      toast({
        title: 'Could not share to Nostr',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return <>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => { void openShareDialog(); }}
      disabled={!track}
      aria-label="Share to Nostr"
      title="Share to Nostr"
      className="rounded-full size-8 text-muted-foreground hover:text-foreground"
    >
      <Share2 className="size-4" />
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!isPending) { if (!value) { requestIdRef.current = undefined; setIsShortening(false); } setOpen(value); } }}>
      <DialogContent className="min-w-0 overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Share to Nostr</DialogTitle>
          <DialogDescription>
            Edit your post before sharing{sharedTrack ? ` “${sharedTrack.title}”` : ''} with your followers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={share} className="min-w-0 space-y-4">
          <Textarea
            autoFocus
            value={message}
            onChange={event => setMessage(event.target.value)}
            aria-label="Post message"
            placeholder="Write a message about what you’re listening to…"
            maxLength={5000}
            rows={5}
            wrap="soft"
            className="block h-36 max-h-48 min-w-0 max-w-full resize-y overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
            disabled={isPending}
          />
          {isShortening && <p role="status" className="text-sm text-muted-foreground">Creating a short share link…</p>}
          {!user && <p role="status" className="text-sm text-muted-foreground">Sign in with Nostr to publish this post.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { requestIdRef.current = undefined; setIsShortening(false); setOpen(false); }} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={!user || !message.trim() || isPending || isShortening}>
              {isPending ? <><LoaderCircle className="size-4 animate-spin" /> Sharing…</> : <><Share2 className="size-4" /> Share to Nostr</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
