import { useState, type FormEvent } from 'react';
import { LoaderCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';

const PUBLIC_APP_ORIGIN = 'https://ostrify.studio314.us';

export function SharePageButton({ title, pagePath, pageType, referenceTags = [] }: {
  title: string;
  pagePath: string;
  pageType: 'artist' | 'album' | 'podcast show';
  referenceTags?: string[][];
}) {
  const { user } = useCurrentUser();
  const { mutateAsync: publish, isPending } = useNostrPublish();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const safePath = pagePath.startsWith('/') && !pagePath.startsWith('//') ? pagePath : '/';
  const pageUrl = new URL(safePath, PUBLIC_APP_ORIGIN).toString();

  const openShareDialog = () => {
    setMessage(`Check out ${title} on Ostrify.\n\n${pageUrl}`);
    setOpen(true);
  };

  const share = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim() || !user) return;
    try {
      await publish({ kind: 1, content: message.trim(), tags: [['r', pageUrl], ...referenceTags] });
      setOpen(false);
      toast({ title: 'Shared to Nostr', description: `Your post about “${title}” was published.` });
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
      variant="outline"
      size="icon"
      onClick={openShareDialog}
      aria-label={`Share ${pageType} to Nostr`}
      title={`Share ${pageType} to Nostr`}
      className="size-10 rounded-full"
    >
      <Share2 className="size-4" />
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!isPending) setOpen(value); }}>
      <DialogContent className="min-w-0 overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Share {pageType}</DialogTitle>
          <DialogDescription>Edit your post before sharing “{title}” with your followers.</DialogDescription>
        </DialogHeader>
        <form onSubmit={share} className="min-w-0 space-y-4">
          <Textarea
            autoFocus
            value={message}
            onChange={event => setMessage(event.target.value)}
            aria-label="Post message"
            placeholder={`Write a message about this ${pageType}…`}
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
