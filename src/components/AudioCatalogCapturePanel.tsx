import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { nip19 } from 'nostr-tools';
import { Database, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { countAudioCatalogEvents } from '@/lib/audioCatalogStats';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';
import {
  AUDIO_CATALOG_CAPTURE_ENABLED_EVENT,
  AUDIO_CATALOG_CAPTURE_STATUS_EVENT,
  isAllowedAudioCatalogCaptureUser,
  EMPTY_AUDIO_CATALOG_CAPTURE_STATUS,
  audioCatalogCaptureEnabledKey,
  isAudioCatalogCaptureEnabled,
  readAudioCatalogCaptureStatus,
  type AudioCatalogCaptureStatus,
  type AudioCatalogCaptureStatusDetail,
} from '@/lib/audioCatalogCapture';

export function AudioCatalogCapturePanel() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<AudioCatalogCaptureStatus>(EMPTY_AUDIO_CATALOG_CAPTURE_STATUS);
  const [countRequested, setCountRequested] = useState(false);
  const isAllowed = isAllowedAudioCatalogCaptureUser(user?.pubkey);
  const relayCount = useQuery({
    queryKey: ['audio-catalog-relay-count', OSTRIFY_RELAY_URL],
    queryFn: ({ signal }) => countAudioCatalogEvents(nostr, signal),
    enabled: isAllowed && countRequested,
    staleTime: 60_000,
    retry: false,
  });
  const writeRelays = useMemo(() => config.relayMetadata.relays.filter(relay => relay.write).map(relay => relay.url), [config.relayMetadata.relays]);
  const displayDestinations = writeRelays.map(url => {
    try {
      const parsed = new URL(url);
      return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
    } catch {
      return url;
    }
  });
  const npub = user ? nip19.npubEncode(user.pubkey) : '';
  const formatBytes = (bytes: number): string => {
    if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  };

  useEffect(() => {
    if (!isAllowed || !user) return;
    const pubkey = user.pubkey.toLowerCase();
    const refresh = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail !== pubkey) return;
      setEnabled(isAudioCatalogCaptureEnabled(pubkey));
      setStatus(readAudioCatalogCaptureStatus(pubkey));
    };
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<AudioCatalogCaptureStatusDetail>).detail;
      if (detail.pubkey === pubkey) setStatus(detail.status);
    };
    window.addEventListener(AUDIO_CATALOG_CAPTURE_ENABLED_EVENT, refresh);
    window.addEventListener(AUDIO_CATALOG_CAPTURE_STATUS_EVENT, handleStatus);
    refresh();
    return () => {
      window.removeEventListener(AUDIO_CATALOG_CAPTURE_ENABLED_EVENT, refresh);
      window.removeEventListener(AUDIO_CATALOG_CAPTURE_STATUS_EVENT, handleStatus);
    };
  }, [isAllowed, user]);

  if (!isAllowed || !user) return null;

  const handleChange = (value: boolean) => {
    try {
      window.localStorage.setItem(audioCatalogCaptureEnabledKey(user.pubkey.toLowerCase()), String(value));
      setEnabled(value);
      window.dispatchEvent(new CustomEvent(AUDIO_CATALOG_CAPTURE_ENABLED_EVENT, { detail: user.pubkey.toLowerCase() }));
    } catch {
      setEnabled(false);
    }
  };

  return (
    <div className="mt-5 rounded-lg border border-border/70 bg-secondary/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold">Audio catalog capture</p>
          <p className="text-sm text-muted-foreground">While Ostrify is open, copy newly discovered playable Nostr track and podcast events to your write relays. Original events and media links stay public.</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="audio-catalog-capture" checked={enabled} onCheckedChange={handleChange} />
          <Label htmlFor="audio-catalog-capture">{enabled ? 'On' : 'Off'}</Label>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground" aria-live="polite">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="flex items-center gap-2 text-muted-foreground"><Database className="size-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Relay events</span></div>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{relayCount.data ? `${relayCount.data.total.toLocaleString()}${relayCount.data.complete ? '' : '+'}` : relayCount.isFetching ? '…' : relayCount.isError ? '—' : '—'}</p>
            {!relayCount.data && <p className="mt-1 text-[11px]">{relayCount.isFetching ? 'Counting events' : relayCount.isError ? 'Count unavailable' : 'Not counted yet'}</p>}
            {relayCount.data && <p className="mt-1 text-[11px]">{relayCount.data.complete ? 'Full relay scan' : 'Lower-bound count'}</p>}
          </div>
          <div className="rounded-lg border border-border/70 bg-background/60 p-3">
            <div className="flex items-center gap-2 text-muted-foreground"><HardDrive className="size-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Estimated event data</span></div>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{relayCount.data ? `${formatBytes(relayCount.data.estimatedBytes)}${relayCount.data.complete ? '' : '+'}` : relayCount.isFetching ? '…' : relayCount.isError ? '—' : '—'}</p>
            {!relayCount.data && <p className="mt-1 text-[11px]">Awaiting relay scan</p>}
            {relayCount.data && <p className="mt-1 text-[11px]">Approx. event JSON only</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 px-2.5" onClick={() => { setCountRequested(true); void relayCount.refetch(); }} disabled={relayCount.isFetching} aria-label="Refresh Ostrify relay event count and estimated size">
            <RefreshCw className={`mr-1.5 size-3 ${relayCount.isFetching ? 'animate-spin' : ''}`} />
            {relayCount.data ? 'Refresh relay stats' : 'Count relay data'}
          </Button>
          {relayCount.data && !relayCount.data.complete && <p>The count and size are lower bounds; the kind 1 scan reached its safety cap.</p>}
          {relayCount.isError && <p role="alert">Could not scan {OSTRIFY_RELAY_URL}. Check the relay connection and try again.</p>}
        </div>
        {relayCount.data && <p>Size is estimated from returned event JSON, not the relay database, indexes, or backups.</p>}
        <p>Session: {status.captured} copied · {status.failed} failed</p>
        <p>{status.lastMessage}</p>
        <p>Destination: {displayDestinations.length ? displayDestinations.join(', ') : 'No write-enabled relays'}</p>
        <p>Available only for the two designated testing accounts; currently enabled for {npub.slice(0, 12)}…</p>
        <p>Copies up to 100 eligible Nostr audio events per browser session (20 per discovery batch). Kinds: 1, 54, 1063, 31337, 32123, 30440, 36787, and podcast show kind 10154. External catalog entries without a Nostr event aren’t copied.</p>
        <p>Catalog write events are signed with your account. The relay may reject copying because writes must come from the event’s original author.</p>
      </div>
    </div>
  );
}
