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

function defaultMessage(track: Track): string {
  return `I'm listening to ${track.title} on Ostrify. Check it out!`;
}

function trackTags(track: Track): string[][] {
  if (track.event) {
    const tags: string[][] = [
      ['e', track.event.id],
      ['p', track.event.pubkey],
    ];
    const identifier = track.event.tags.find(([name]) => name === 'd')?.[1];
    if (track.event.kind >= 30000 && track.event.kind < 40000 && identifier) {
      tags.push(['a', `${track.event.kind}:${track.event.pubkey}:${identifier}`]);
    }
    return tags;
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share to Nostr</DialogTitle>
          <DialogDescription>
            Edit your post before sharing{sharedTrack ? ` “${sharedTrack.title}”` : ''} with your followers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={share} className="space-y-4">
          <Textarea
            autoFocus
            value={message}
            onChange={event => setMessage(event.target.value)}
            aria-label="Post message"
            placeholder="Write a message about what you’re listening to…"
            maxLength={5000}
            rows={5}
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
