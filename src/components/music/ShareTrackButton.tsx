import { useState, type FormEvent } from 'react';
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

function compactAudioDetailUrl(track: Track): URL | undefined {
  const coordinateKind = /^(?:tunestr:)?(\d+):[0-9a-f]{64}:/i.exec(track.id)?.[1];
  const eventKind = track.event?.kind
    ?? track.eventKind
    ?? (track.id.startsWith('tunestr:n94:') ? 1053 : track.id.startsWith('tunestr:') && /^[0-9a-f]{64}:/i.test(track.id.slice('tunestr:'.length)) ? 30311 : coordinateKind ? Number(coordinateKind) : /^[0-9a-f]{64}$/i.test(track.id) ? track.kind === 'podcast' ? 54 : 1 : undefined);
  const isEventId = /^[0-9a-f]{64}$/i.test(track.id);
  const isAddressableReference = /^(?:30311|31337|36787|32123|30440):[0-9a-f]{64}:\S{1,256}$/i.test(track.id)
    || /^tunestr:[0-9a-f]{64}:\S{1,256}$/i.test(track.id);
  const isResolvableId = /^wavlake:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(track.id)
    || /^fountain:episode:id:[A-Za-z0-9]{20}$/.test(track.id)
    || /^fountain-rss:(?:fountain:(?:show:id:)?)?[^:\s]{1,512}:\S{1,512}$/.test(track.id)
    || /^podcast-index:episode:id:\d{1,12}$/.test(track.id)
    || /^podcast-index:https:\/\/[^:]+(?::\d+)?\/.*:\d{1,12}:.+$/s.test(track.id)
    || /^(?:gutenberg|librivox):[a-z0-9][a-z0-9_-]{0,159}(?::.{1,512})?$/i.test(track.id)
    || /^tunestr:n94:[0-9a-f]{64}$/i.test(track.id)
    || /^tunestr:[0-9a-f]{64}$/i.test(track.id)
    || /^(?:1|54|1063|1053):[0-9a-f]{64}$/i.test(track.id)
    || isAddressableReference
    || isEventId;
  if (!isResolvableId || track.id.length > 2048) return undefined;
  if ((isEventId || /^tunestr:n94:/i.test(track.id)) && !eventKind) return undefined;
  if (isAddressableReference && !eventKind) return undefined;
  const compactUrl = new URL('/audio', PUBLIC_APP_ORIGIN);
  compactUrl.searchParams.set('track', track.id);
  if (eventKind) compactUrl.searchParams.set('eventKind', String(eventKind));
  return compactUrl;
}

function audioDetailUrl(track: Track): URL | undefined {
  const compactUrl = compactAudioDetailUrl(track);
  if (compactUrl) return compactUrl;
  const audioUrl = sanitizeUrl(track.url);
  if (audioUrl && audioUrl.length > 2048) return undefined;
  const eventKind = track.event?.kind ?? track.eventKind ?? (track.id.startsWith('tunestr:n94:') ? 1053 : /^[0-9a-f]{64}$/i.test(track.id) ? track.kind === 'podcast' ? 54 : 1 : undefined);
  const detailUrl = new URL(audioDetailPath({ ...track, eventKind }), PUBLIC_APP_ORIGIN);
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
    const minimalUrl = new URL('/audio', PUBLIC_APP_ORIGIN);
    minimalUrl.searchParams.set('track', track.id.slice(0, 2048));
    minimalUrl.searchParams.set('title', track.title.slice(0, 500));
    minimalUrl.searchParams.set('kind', track.kind);
    if (eventKind) minimalUrl.searchParams.set('eventKind', String(eventKind));
    if (track.source) minimalUrl.searchParams.set('source', track.source);
    return minimalUrl.href.length <= 7000 ? minimalUrl : undefined;
  }
  return undefined;
}

function defaultMessage(track: Track): string {
  const message = `I'm listening to ${track.title.slice(0, 500)} on Ostrify. Check it out!`;
  const detailUrl = audioDetailUrl(track)?.toString();
  return detailUrl ? `${message}\n\n${detailUrl}` : message;
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

  const openShareDialog = () => {
    if (!track) return;
    setSharedTrack(track);
    setMessage(defaultMessage(track));
    setOpen(true);
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
      onClick={openShareDialog}
      disabled={!track}
      aria-label="Share to Nostr"
      title="Share to Nostr"
      className="rounded-full size-8 text-muted-foreground hover:text-foreground"
    >
      <Share2 className="size-4" />
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!isPending) setOpen(value); }}>
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
          {!user && <p role="status" className="text-sm text-muted-foreground">Sign in with Nostr to publish this post.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={!user || !message.trim() || isPending}>
              {isPending ? <><LoaderCircle className="size-4 animate-spin" /> Sharing…</> : <><Share2 className="size-4" /> Share to Nostr</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
