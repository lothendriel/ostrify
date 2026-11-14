import { useState, type FormEvent } from 'react';
import { LoaderCircle, MessageCircle, ShieldAlert } from 'lucide-react';
import { finalizeEvent, generateSecretKey, getEventHash, nip44, verifyEvent } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/sanitize';
import { useToast } from '@/hooks/useToast';

class Nip44EncryptionError extends Error {}

interface Rumor {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

interface Nip04Signer {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
}

interface Nip04EventSigner {
  nip04: Nip04Signer;
  signEvent(event: { kind: number; created_at: number; content: string; tags: string[][] }): Promise<NostrEvent>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nip04Signer(signer: unknown): Nip04EventSigner | undefined {
  if (!isRecord(signer) || !isRecord(signer.nip04) || typeof signer.nip04.encrypt !== 'function' || typeof signer.signEvent !== 'function') return undefined;
  return signer as unknown as Nip04EventSigner;
}

function safeRelay(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const relay = new URL(value);
    return relay.protocol === 'wss:' && !relay.username && !relay.password ? relay.href : undefined;
  } catch {
    return undefined;
  }
}

async function relaysFrom(nostr: ReturnType<typeof useNostr>['nostr'], pubkey: string, kind: 10002 | 10050): Promise<string[]> {
  const events = await nostr.query([{ kinds: [kind], authors: [pubkey], limit: 10 }], { signal: AbortSignal.timeout(8000) });
  const newest = events.filter(event => event.kind === kind && event.pubkey === pubkey).sort((a, b) => b.created_at - a.created_at)[0];
  const urls = (newest?.tags ?? []).flatMap(tag => {
    if (kind === 10050 && tag[0] === 'relay') {
      const relay = safeRelay(tag[1]);
      return relay ? [relay] : [];
    }
    if (kind === 10002 && tag[0] === 'r' && tag[2] !== 'write') {
      const relay = safeRelay(tag[1]);
      return relay ? [relay] : [];
    }
    return [];
  });
  return [...new Set(urls)].slice(0, 5);
}

function randomTime(): number {
  return Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800);
}

async function makeGiftWrap(
  user: NonNullable<ReturnType<typeof useCurrentUser>['user']>,
  rumor: Rumor,
  recipient: string,
): Promise<NostrEvent> {
  if (!user.signer.nip44) throw new Error('Your signer does not support NIP-44 encryption.');
  let encryptedRumor: string;
  try {
    encryptedRumor = await user.signer.nip44.encrypt(recipient, JSON.stringify(rumor));
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Nip44EncryptionError(`Your signer could not encrypt with NIP-44.${detail}`);
  }
  let seal: NostrEvent;
  try {
    seal = await user.signer.signEvent({ kind: 13, content: encryptedRumor, created_at: randomTime(), tags: [] });
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`Your signer could not sign a NIP-17 seal.${detail}`);
  }
  if (seal.kind !== 13 || seal.pubkey !== user.pubkey || seal.tags.length !== 0 || !verifyEvent(seal)) {
    throw new Error('Your signer returned an invalid NIP-17 message seal.');
  }
  const wrapperKey = generateSecretKey();
  try {
    const wrappedSeal = nip44.v2.encrypt(JSON.stringify(seal), nip44.v2.utils.getConversationKey(wrapperKey, recipient));
    return finalizeEvent({ kind: 1059, created_at: randomTime(), tags: [['p', recipient]], content: wrappedSeal }, wrapperKey);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Nip44EncryptionError(`Could not create a NIP-17 gift wrap.${detail}`);
  }
}

async function publishToOneRelay(
  nostr: ReturnType<typeof useNostr>['nostr'],
  relays: string[],
  event: NostrEvent,
): Promise<void> {
  await Promise.any(relays.map(url => nostr.relay(url).event(event, { signal: AbortSignal.timeout(8000) })));
}

export function MessageFriendButton({ pubkey }: { pubkey: string }) {
  const { user } = useCurrentUser();
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.display_name || author.data?.metadata?.name || genUserName(pubkey);
  const { nostr } = useNostr();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmNip04, setConfirmNip04] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const signerNip04 = nip04Signer(user?.signer);
  const supportsNip17 = !!user?.signer.nip44;

  const send = async (protocol: 'nip17' | 'nip04') => {
    const content = message.trim();
    if (!user || !content) return;
    setIsSending(true);
    try {
      if (protocol === 'nip17') {
        if (!user.signer.nip44) throw new Error('Your signer does not support NIP-44 encryption.');
        const recipientRelays = await relaysFrom(nostr, pubkey, 10050);
        if (!recipientRelays.length) throw new Error('This friend has no published NIP-17 inbox relays, so Ostrify cannot deliver the message.');
        const senderRelays = await relaysFrom(nostr, user.pubkey, 10050);
        if (!senderRelays.length) throw new Error('Publish a NIP-17 DM relay list for your account before sending messages.');
        const created_at = Math.floor(Date.now() / 1000);
        const unsigned = { kind: 14, pubkey: user.pubkey, created_at, content, tags: [['p', pubkey]] };
        const rumor: Rumor = { ...unsigned, id: getEventHash(unsigned) };
        const [recipientWrap, senderWrap] = await Promise.all([
          makeGiftWrap(user, rumor, pubkey),
          makeGiftWrap(user, rumor, user.pubkey),
        ]);
        await publishToOneRelay(nostr, recipientRelays, recipientWrap);
        try {
          await publishToOneRelay(nostr, senderRelays, senderWrap);
        } catch {
          toast({ title: 'Message sent', description: 'Your friend’s relay accepted the message, but your own DM relays did not save a copy.' });
          setMessage('');
          setOpen(false);
          return;
        }
      } else {
        if (!signerNip04) throw new Error('Your signer does not support NIP-04 encryption.');
        const recipientRelays = await relaysFrom(nostr, pubkey, 10002);
        if (!recipientRelays.length) throw new Error('This friend has no readable NIP-65 relays available for NIP-04 delivery.');
        const ciphertext = await signerNip04.nip04.encrypt(pubkey, content);
        const event = await signerNip04.signEvent({ kind: 4, created_at: Math.floor(Date.now() / 1000), content: ciphertext, tags: [['p', pubkey]] });
        if (event.kind !== 4 || event.pubkey !== user.pubkey || !verifyEvent(event)) throw new Error('Your signer returned an invalid NIP-04 message.');
        await publishToOneRelay(nostr, recipientRelays, event);
      }
      toast({ title: 'Message sent', description: `Your private message to ${name} was sent using ${protocol === 'nip17' ? 'NIP-17' : 'NIP-04'}.` });
      setMessage('');
      setOpen(false);
    } catch (error) {
      if (protocol === 'nip17' && error instanceof Nip44EncryptionError && signerNip04) {
        setConfirmNip04(true);
        toast({ title: 'NIP-17 encryption is unavailable', description: 'Your signer could not encrypt this message with NIP-44. You can choose whether to try the older NIP-04 format.' });
      } else {
        toast({
          title: 'Could not send message',
          description: error instanceof Error ? error.message : 'Check your signer and relay settings, then try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSending(false);
      if (protocol === 'nip04') setConfirmNip04(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (supportsNip17) void send('nip17');
    else if (signerNip04) setConfirmNip04(true);
  };

  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><MessageCircle className="size-4" /> Message</Button>
    <Dialog open={open} onOpenChange={value => { if (!isSending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {name}</DialogTitle>
          <DialogDescription>Send a private Nostr direct message. It will be readable in compatible Nostr messaging apps.</DialogDescription>
        </DialogHeader>
        {!supportsNip17 && <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><ShieldAlert className="size-4 shrink-0" /> NIP-17 is unavailable with this signer</p>
          <p className="mt-1 text-muted-foreground">{signerNip04 ? 'You can choose the older NIP-04 format instead. It exposes more metadata and is deprecated.' : 'This signer does not expose NIP-44 or NIP-04 encryption, so it cannot send a private message.'}</p>
        </div>}
        <form onSubmit={submit} className="space-y-4">
          <Textarea value={message} onChange={event => setMessage(event.target.value)} aria-label="Private message" placeholder={`Write a private message to ${name}…`} maxLength={5000} rows={6} disabled={isSending} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isSending}>Cancel</Button>
            {supportsNip17 ? <Button type="submit" disabled={!message.trim() || isSending}>{isSending ? <><LoaderCircle className="size-4 animate-spin" /> Sending…</> : 'Send privately'}</Button> : <Button type="submit" disabled={!signerNip04 || !message.trim() || isSending}>{isSending ? <><LoaderCircle className="size-4 animate-spin" /> Sending…</> : 'Continue with NIP-04'}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmNip04} onOpenChange={value => { if (!isSending) setConfirmNip04(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send with older NIP-04 encryption?</AlertDialogTitle>
          <AlertDialogDescription>NIP-04 is deprecated and exposes more metadata than NIP-17. The message content remains encrypted, but relay and participant details are less private. Continue only if you understand and accept this trade-off.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isSending} onClick={event => { event.preventDefault(); void send('nip04'); }}>Send with NIP-04</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
