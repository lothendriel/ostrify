import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { Activity, CheckCircle2, Database, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { countAudioCatalogEvents } from '@/lib/audioCatalogStats';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';
import {
  AUDIO_CATALOG_CAPTURE_ENABLED_EVENT,
  AUDIO_CATALOG_CAPTURE_LIMIT_EVENT,
  AUDIO_CATALOG_CAPTURE_STATUS_EVENT,
  isAllowedAudioCatalogCaptureUser,
  EMPTY_AUDIO_CATALOG_CAPTURE_STATUS,
  audioCatalogCaptureEnabledKey,
  DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT,
  isAudioCatalogCaptureEnabled,
  readAudioCatalogCaptureStatus,
  readAudioCatalogCaptureLimit,
  writeAudioCatalogCaptureLimit,
  type AudioCatalogCaptureStatus,
  type AudioCatalogCaptureStatusDetail,
} from '@/lib/audioCatalogCapture';

const CAPTURE_LIMIT_OPTIONS = [100, 250, 500, 1_000, 5_000, 10_000, 50_000];
const CAPTURE_BATCH_SIZE = 20;

function formatEventBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function CaptureStatCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string | number; detail: string }) {
  return <article className="min-w-0 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
    <p className="mt-3 break-words text-lg font-bold tracking-tight sm:text-xl">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </article>;
}

export function AudioCatalogCapturePanel() {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<AudioCatalogCaptureStatus>(EMPTY_AUDIO_CATALOG_CAPTURE_STATUS);
  const [captureLimit, setCaptureLimit] = useState<number | null>(DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT);
  const [catalogScanRequested, setCatalogScanRequested] = useState(false);
  const isAllowed = isAllowedAudioCatalogCaptureUser(user?.pubkey);
  const catalog = useQuery({
    queryKey: ['audio-catalog-relay-count', OSTRIFY_RELAY_URL],
    queryFn: ({ signal }) => countAudioCatalogEvents(nostr, signal),
    enabled: catalogScanRequested && isAllowed,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!isAllowed || !user) return;
    const pubkey = user.pubkey.toLowerCase();
    const refresh = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail !== pubkey) return;
      setEnabled(isAudioCatalogCaptureEnabled(pubkey));
      setCaptureLimit(readAudioCatalogCaptureLimit(pubkey));
      setStatus(readAudioCatalogCaptureStatus(pubkey));
    };
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<AudioCatalogCaptureStatusDetail>).detail;
      if (detail.pubkey === '' || detail.pubkey === pubkey) setStatus(detail.status);
    };
    setStatus(readAudioCatalogCaptureStatus(pubkey));
    window.addEventListener(AUDIO_CATALOG_CAPTURE_ENABLED_EVENT, refresh);
    window.addEventListener(AUDIO_CATALOG_CAPTURE_LIMIT_EVENT, refresh);
    window.addEventListener(AUDIO_CATALOG_CAPTURE_STATUS_EVENT, handleStatus);
    refresh();
    return () => {
      window.removeEventListener(AUDIO_CATALOG_CAPTURE_ENABLED_EVENT, refresh);
      window.removeEventListener(AUDIO_CATALOG_CAPTURE_LIMIT_EVENT, refresh);
      window.removeEventListener(AUDIO_CATALOG_CAPTURE_STATUS_EVENT, handleStatus);
    };
  }, [isAllowed, user]);

  if (!isAllowed || !user) return null;

  const handleChange = (value: boolean) => {
    try {
      window.localStorage.setItem(audioCatalogCaptureEnabledKey(user.pubkey), String(value));
      setEnabled(value);
      window.dispatchEvent(new CustomEvent(AUDIO_CATALOG_CAPTURE_ENABLED_EVENT, { detail: user.pubkey.toLowerCase() }));
    } catch {
      setEnabled(false);
    }
  };

  const handleLimitChange = (value: string) => {
    const limit = value === 'unlimited' ? null : Number(value);
    writeAudioCatalogCaptureLimit(user.pubkey, limit);
    setCaptureLimit(limit);
  };

  const remaining = captureLimit === null ? null : Math.max(0, captureLimit - status.attempted);
  const limitDescription = captureLimit === null
    ? `Unlimited · ${CAPTURE_BATCH_SIZE} per discovery batch`
    : `${remaining?.toLocaleString()} of ${captureLimit.toLocaleString()} attempts remain this browser session · ${CAPTURE_BATCH_SIZE} per batch`;
  const catalogValue = !catalogScanRequested ? 'Not scanned' : catalog.isLoading ? 'Loading…' : catalog.isError ? 'Unavailable' : `${(catalog.data?.total ?? 0).toLocaleString()}${catalog.data?.complete ? '' : '+'}`;
  const catalogDetail = catalog.data
    ? `${catalog.data.complete ? 'Queryable audio events' : 'At least this many queryable audio events'} · ${formatEventBytes(catalog.data.estimatedBytes)} event data`
    : `Queryable audio events on ${OSTRIFY_RELAY_URL}`;

  return (
    <section aria-labelledby="audio-catalog-capture-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 id="audio-catalog-capture-heading" className="text-xl font-bold">Ostrify relay catalog</h3>
          <p className="text-sm text-muted-foreground">Current queryable audio events on the shared relay. When you browse, playable public Nostr audio events may be forwarded unchanged to this relay only. Events remain public and retain their original author; acceptance does not guarantee retention. External-catalog-only items and tracks explicitly hidden in Ostrify are not forwarded.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => { setCatalogScanRequested(true); void catalog.refetch(); }} disabled={catalog.isFetching}>
          <RefreshCw className={`mr-2 size-4 ${catalog.isFetching ? 'animate-spin' : ''}`} />{catalog.data ? 'Refresh count' : 'Count relay data'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
        <CaptureStatCard icon={Database} label="Queryable catalog events" value={catalogValue} detail={catalogDetail} />
        <CaptureStatCard icon={CheckCircle2} label="Relay accepted this session" value={status.captured.toLocaleString()} detail="Forwarded original signed events" />
        <CaptureStatCard icon={Activity} label="Relay failures this session" value={status.failed.toLocaleString()} detail="Rejections and connection failures; browsing continues" />
        <article className="min-w-0 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>Browser-session limit</span><HardDrive className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
          <Select value={captureLimit === null ? 'unlimited' : String(captureLimit)} onValueChange={handleLimitChange}>
            <SelectTrigger className="mt-3 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAPTURE_LIMIT_OPTIONS.map(limit => <SelectItem key={limit} value={String(limit)}>{limit.toLocaleString()} events</SelectItem>)}
              <SelectItem value="unlimited">Unlimited</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{limitDescription}</p>
        </article>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="space-y-1">
          <h4 className="font-semibold">Capture controls · allowlisted accounts only</h4>
          <p className="text-sm text-muted-foreground">Capture runs automatically during browsing for everyone. This switch pauses forwarding in this browser. {status.lastMessage}</p>
          {status.lastFailure && <p className="text-xs text-destructive" role="status">Latest failure: {status.lastFailure}</p>}
          <p className="text-xs text-muted-foreground">No event is re-signed and no new user-authored record is created. An event is accepted by this relay as-is, in its original publisher’s name; acceptance does not guarantee retention.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch id="audio-catalog-capture" checked={enabled} onCheckedChange={handleChange} />
          <Label htmlFor="audio-catalog-capture">{enabled ? 'On' : 'Off'}</Label>
        </div>
      </div>
      {!catalog.isError && catalog.data && !catalog.data.complete && <p className="text-xs text-muted-foreground">The catalog scan reached a safety cap of up to 10,000 events per kind; the displayed count and size are lower bounds.</p>}
    </section>
  );
}
