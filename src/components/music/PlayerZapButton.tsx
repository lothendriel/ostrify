import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Zap } from "lucide-react";
import { nip19 } from "nostr-tools";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { useToast } from "@/hooks/useToast";
import { assertInvoiceAmount, invoiceCommitsTo } from "@/lib/bolt11";
import { lnurlToUrl, resolveLnurlPay, type LnurlPayParams, type LnurlSource } from "@/lib/lnurlPay";
import type { Track } from "@/lib/music";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const HEX_KEY = /^[0-9a-f]{64}$/i;
const AMOUNTS = [21, 100, 500, 1000];

type Recipient = { pubkey: string; name: string; role: "Artist" | "Publisher"; source: LnurlSource; params: LnurlPayParams };

/** Resolve each advertised pointer independently, so an invalid lud06 doesn't mask a working lud16. */
function usePaymentMethod(pubkey: string | undefined) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const query = useQuery({
    queryKey: ["player-payment-method", pubkey, metadata?.lud16, metadata?.lud06],
    enabled: !!pubkey && !!(metadata?.lud16 || metadata?.lud06),
    queryFn: async ({ signal }) => {
      for (const source of [{ lud16: metadata?.lud16 }, { lud06: metadata?.lud06 }]) {
        if (!source.lud16 && !source.lud06) continue;
        try {
          const params = await resolveLnurlPay(source, AbortSignal.any([signal, AbortSignal.timeout(8000)]));
          if (params.maxSendable >= Math.max(1000, Math.ceil(params.minSendable / 1000) * 1000) && params.metadata) return { source, params };
        } catch {
          if (signal.aborted) throw signal.reason;
        }
      }
      return null;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return { author, query };
}

export function PlayerZapButton({ track, className, iconClassName }: { track: Track | null; className?: string; iconClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("100");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [lockedRecipient, setLockedRecipient] = useState<Recipient | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogSession = useRef(0);
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { toast } = useToast();

  const artistKey = track?.kind === "music" && track.artistPubkey && HEX_KEY.test(track.artistPubkey) ? track.artistPubkey.toLowerCase() : undefined;
  const publisherKey = track?.kind === "music" && track.pubkey && HEX_KEY.test(track.pubkey) ? track.pubkey.toLowerCase() : undefined;
  const artist = usePaymentMethod(artistKey);
  const publisher = usePaymentMethod(publisherKey && publisherKey !== artistKey ? publisherKey : undefined);
  // Wait for an explicit artist's lookup to finish before choosing the publisher.
  const artistPending = !!artistKey && (artist.author.isLoading || (artist.query.isFetching && !artist.query.data));
  const chosen = artist.query.data ? { key: artistKey!, role: "Artist" as const, ...artist } : !artistPending && publisher.query.data ? { key: publisherKey!, role: track?.source === "wavlake" ? "Artist" as const : "Publisher" as const, ...publisher } : undefined;
  const method = chosen?.query.data;
  const metadata = chosen?.author.data?.metadata;
  const availableRecipient: Recipient | undefined = chosen && method ? {
    pubkey: chosen.key,
    name: metadata?.display_name || metadata?.name || nip19.npubEncode(chosen.key),
    role: chosen.role,
    ...method,
  } : undefined;
  const recipient = lockedRecipient ?? availableRecipient;

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) { dialogSession.current++; setInvoice(null); setCopied(false); setLockedRecipient(null); }
  };

  const createInvoice = async () => {
    if (!recipient) return;
    const sats = Number(amount);
    if (!Number.isSafeInteger(sats) || sats <= 0 || sats > Number.MAX_SAFE_INTEGER / 1000) {
      toast({ title: "Enter a valid amount", description: "Choose a positive whole number of sats.", variant: "destructive" });
      return;
    }
    const session = dialogSession.current;
    setIsCreating(true);
    try {
      // Refresh the recipient's payment endpoint before requesting an invoice.
      const params = await resolveLnurlPay(recipient.source, AbortSignal.timeout(10000));
      const amountMsat = sats * 1000;
      if (amountMsat < params.minSendable || amountMsat > params.maxSendable) {
        throw new Error(`This payment method accepts ${Math.ceil(params.minSendable / 1000)}–${Math.floor(params.maxSendable / 1000)} sats.`);
      }
      const callback = new URL(params.callback);
      callback.searchParams.set("amount", String(amountMsat));
      let commitment = params.metadata;
      if (params.allowsNostr && params.nostrPubkey && HEX_KEY.test(params.nostrPubkey) && user) {
        const lnurlUrl = lnurlToUrl(recipient.source);
        const { bech32 } = await import("@scure/base");
        const lnurl = lnurlUrl ? bech32.encode("lnurl", bech32.toWords(new TextEncoder().encode(lnurlUrl)), false) : undefined;
        const tags = [
          ["relays", ...config.relayMetadata.relays.filter((relay) => relay.read || relay.write).map((relay) => relay.url)],
          ["amount", String(amountMsat)],
          ["p", recipient.pubkey],
          ...(lnurl ? [["lnurl", lnurl]] : []),
        ];
        const request = await user.signer.signEvent({ kind: 9734, content: "", created_at: Math.floor(Date.now() / 1000), tags });
        commitment = JSON.stringify(request);
        callback.searchParams.set("nostr", commitment);
        if (lnurl) callback.searchParams.set("lnurl", lnurl);
      }
      const response = await fetch(callback.toString(), { signal: AbortSignal.timeout(15000) });
      const body: { pr?: unknown; reason?: unknown } = await response.json();
      if (!response.ok || typeof body.pr !== "string") throw new Error(typeof body.reason === "string" ? body.reason : `Lightning service returned HTTP ${response.status}.`);
      const decoded = assertInvoiceAmount(body.pr, amountMsat);
      if (!commitment || !invoiceCommitsTo(decoded, [commitment])) throw new Error("The Lightning service returned an invoice for a different payment. No payment was made.");
      if (session === dialogSession.current) setInvoice(body.pr);
    } catch (error) {
      toast({ title: "Could not create payment invoice", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const copyInvoice = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      toast({ title: "Invoice copied", description: "Paste it into your Lightning wallet to pay." });
    } catch {
      toast({ title: "Could not copy invoice", description: "Select and copy the invoice text instead.", variant: "destructive" });
    }
  };

  if (!recipient || !track) return null;
  return <>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className={cn("size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground", className)} aria-label={`Zap ${recipient.name}`} onClick={() => { setLockedRecipient(recipient); setOpen(true); }}><Zap className={cn("size-4", iconClassName)} /></Button></TooltipTrigger><TooltipContent>Zap {recipient.role.toLowerCase()}</TooltipContent></Tooltip>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="size-5 text-primary" /> Support {recipient.role.toLowerCase()}</DialogTitle>
          <DialogDescription>Paying {recipient.role.toLowerCase()}: <strong className="break-words text-foreground">{recipient.name}</strong><br />For “{track.title}”</DialogDescription>
        </DialogHeader>
        {invoice ? <div className="space-y-4">
          <p className="text-center text-lg font-semibold">{amount} sats</p>
          <div className="mx-auto w-fit rounded-lg bg-white p-3"><QRCodeCanvas value={`lightning:${invoice}`} size={220} className="block size-52 max-w-full" /></div>
          <div className="space-y-2"><Label htmlFor="player-zap-invoice">Lightning invoice</Label><div className="flex gap-2"><Input id="player-zap-invoice" value={invoice} readOnly className="min-w-0 font-mono text-xs" onClick={(event) => event.currentTarget.select()} /><Button type="button" variant="outline" size="icon" onClick={() => void copyInvoice()} aria-label="Copy Lightning invoice">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button></div></div>
          <Button type="button" className="w-full" onClick={() => { window.location.href = `lightning:${invoice}`; }}><ExternalLink className="size-4" /> Open Lightning wallet</Button>
          <p className="text-center text-xs text-muted-foreground">Scan or copy the invoice to pay. Payment is completed in your wallet.</p>
        </div> : <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">{AMOUNTS.map((sats) => <Button key={sats} type="button" variant={amount === String(sats) ? "default" : "outline"} onClick={() => setAmount(String(sats))}>{sats}</Button>)}</div>
          <div className="space-y-2"><Label htmlFor="player-zap-amount">Amount in sats</Label><Input id="player-zap-amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" /></div>
          <Button type="button" className="w-full" onClick={() => void createInvoice()} disabled={isCreating}><Zap className="size-4" /> {isCreating ? "Creating invoice…" : `Continue with ${amount || "0"} sats`}</Button>
          <p className="text-center text-xs text-muted-foreground">{user && recipient.params.allowsNostr && recipient.params.nostrPubkey && HEX_KEY.test(recipient.params.nostrPubkey) ? "A signed Nostr zap request will be sent to the recipient’s provider." : "This will be a Lightning payment, completed in your wallet."}</p>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
