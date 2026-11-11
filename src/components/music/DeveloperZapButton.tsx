import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Zap } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { useToast } from "@/hooks/useToast";
import { useIsMobile } from "@/hooks/useIsMobile";
import { assertInvoiceAmount, invoiceCommitsTo } from "@/lib/bolt11";
import { resolveLnurlPay } from "@/lib/lnurlPay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const DEVELOPER_LIGHTNING_ADDRESS = "cactusboil63@shockwallet.app";
const DEVELOPER_PUBKEY = "0155373ac79b7ffb0f586c3e68396f9e82d46f7afe7016d46ed9ca46ba3e1bed";
const SUGGESTED_AMOUNTS = [21, 100, 500, 1000];

interface LnurlInvoiceResponse {
  pr?: unknown;
  reason?: unknown;
}

export function DeveloperZapButton() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("100");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setInvoice(null);
      setCopied(false);
    }
  }, [open]);

  const createInvoice = async () => {
    const sats = Number(amount);
    if (!Number.isSafeInteger(sats) || sats <= 0 || sats > Number.MAX_SAFE_INTEGER / 1000) {
      toast({ title: "Enter a valid amount", description: "Choose a positive whole number of sats.", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const params = await resolveLnurlPay({ lud16: DEVELOPER_LIGHTNING_ADDRESS }, AbortSignal.timeout(10000));
      const amountMsat = sats * 1000;
      if (amountMsat < params.minSendable || amountMsat > params.maxSendable) {
        throw new Error(`This Lightning address accepts ${Math.ceil(params.minSendable / 1000)}–${Math.floor(params.maxSendable / 1000)} sats.`);
      }

      const callback = new URL(params.callback);
      callback.searchParams.set("amount", String(amountMsat));
      let commitmentCandidates = [params.metadata];

      if (params.allowsNostr && params.nostrPubkey && /^[0-9a-f]{64}$/i.test(params.nostrPubkey) && user) {
        const request = {
          kind: 9734,
          content: "Supporting Ostrify development",
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["relays", ...config.relayMetadata.relays.filter((relay) => relay.read || relay.write).map((relay) => relay.url)],
            ["amount", String(amountMsat)],
            ["p", DEVELOPER_PUBKEY],
          ],
        };
        const signedRequest = await user.signer.signEvent(request);
        const requestJson = JSON.stringify(signedRequest);
        callback.searchParams.set("nostr", requestJson);
        commitmentCandidates = [requestJson];
      }

      const response = await fetch(callback.toString(), { signal: AbortSignal.timeout(15000) });
      const responseBody: LnurlInvoiceResponse = await response.json();
      if (!response.ok || typeof responseBody.pr !== "string") {
        throw new Error(typeof responseBody.reason === "string" ? responseBody.reason : `Lightning service returned HTTP ${response.status}.`);
      }

      const decodedInvoice = assertInvoiceAmount(responseBody.pr, amountMsat);
      if (!invoiceCommitsTo(decodedInvoice, commitmentCandidates)) {
        throw new Error("The Lightning service returned an invoice for a different payment. No payment was made.");
      }
      setInvoice(responseBody.pr);
    } catch (error) {
      toast({
        title: "Could not create payment invoice",
        description: error instanceof Error ? error.message : "Please try again or use the Lightning address directly.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const copyInvoice = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      toast({ title: "Invoice copied", description: "Open your Lightning wallet and paste the invoice." });
    } catch {
      toast({ title: "Could not copy invoice", description: "Select and copy the invoice text instead.", variant: "destructive" });
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Zap the developer" onClick={() => setOpen(true)}>
            <Zap className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zap the developer</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="size-5 text-primary" /> Zap the developer</DialogTitle>
            <DialogDescription>Support Ostrify’s development with a Bitcoin Lightning payment.</DialogDescription>
          </DialogHeader>

          {invoice ? (
            <div className="space-y-4">
              <p className="text-center text-lg font-semibold">{amount} sats</p>
              <div className="mx-auto w-fit rounded-lg bg-white p-3"><QRCodeCanvas value={`lightning:${invoice}`} size={220} className="block size-52 max-w-full" /></div>
              <div className="space-y-2">
                <Label htmlFor="developer-invoice">Lightning invoice</Label>
                <div className="flex gap-2">
                  <Input id="developer-invoice" value={invoice} readOnly className="min-w-0 font-mono text-xs" onClick={(event) => event.currentTarget.select()} />
                  <Button type="button" variant="outline" size="icon" onClick={() => void copyInvoice()} aria-label="Copy Lightning invoice">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
                </div>
              </div>
              <Button type="button" className="w-full" onClick={() => { window.location.href = `lightning:${invoice}`; }}>
                <ExternalLink className="size-4" /> Open Lightning wallet
              </Button>
              <p className="text-center text-xs text-muted-foreground">Scan the QR code or copy the invoice to pay with any Lightning wallet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {SUGGESTED_AMOUNTS.map((sats) => (
                  <Button key={sats} type="button" variant={amount === String(sats) ? "default" : "outline"} onClick={() => setAmount(String(sats))}>
                    {sats}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="developer-zap-amount">Amount in sats</Label>
                <Input id="developer-zap-amount" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" />
              </div>
              <Button type="button" className="w-full" onClick={() => void createInvoice()} disabled={isCreating}>
                <Zap className="size-4" /> {isCreating ? "Creating invoice…" : `Continue with ${amount || "0"} sats`}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {user ? "If the recipient supports Nostr zaps, Ostrify will attach your signed zap request." : "No login required. Your wallet will handle the payment."}
              </p>
              <p className="text-center text-xs text-muted-foreground">{isMobile ? "Payments are completed in your Lightning wallet." : "Scan the invoice with your Lightning wallet to complete the payment."}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
