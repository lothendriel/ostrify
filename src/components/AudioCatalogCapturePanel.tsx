import { useEffect, useMemo, useState } from 'react';
import { nip19 } from 'nostr-tools';
import { Activity, CheckCircle2, Database, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
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

function CaptureStatCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string | number; detail: string }) {
  return <article className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /></div>
    <p className="mt-3 break-words text-lg font-bold tracking-tight sm:text-xl">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </article>;
}

export function AudioCatalogCapturePanel() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<AudioCatalogCaptureStatus>(EMPTY_AUDIO_CATALOG_CAPTURE_STATUS);
  const isAllowed = isAllowedAudioCatalogCaptureUser(user?.pubkey);
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
    <section aria-labelledby="audio-catalog-capture-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="space-y-1">
          <h3 id="audio-catalog-capture-heading" className="font-semibold">Audio catalog capture</h3>
          <p className="text-sm text-muted-foreground">While Ostrify is open, copy newly discovered playable Nostr track and podcast events to your write relays. Original events and media links stay public.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch id="audio-catalog-capture" checked={enabled} onCheckedChange={handleChange} />
          <Label htmlFor="audio-catalog-capture">{enabled ? 'On' : 'Off'}</Label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        <CaptureStatCard icon={CheckCircle2} label="Captured this session" value={status.captured} detail="Events accepted by at least one write relay" />
        <CaptureStatCard icon={Activity} label="Capture failures" value={status.failed} detail="Events rejected or not accepted" />
        <CaptureStatCard icon={Database} label="Last capture" value={status.lastMessage} detail="Most recent result; may include destination relay" />
        <CaptureStatCard icon={HardDrive} label="Write destinations" value={displayDestinations.length ? displayDestinations.join(', ') : 'None enabled'} detail="Relays currently configured for writes" />
        <CaptureStatCard icon={RefreshCw} label="Capture allowance" value="100 events / session" detail="Up to 20 new events per discovery batch; runs while Ostrify is open" />
        <CaptureStatCard icon={Database} label="Eligible Nostr kinds" value="1 · 54 · 1063 · 31337 · 32123 · 30440 · 36787 · 10154" detail="Playable tracks, episodes, and podcast show metadata; external catalog-only entries aren’t copied" />
        <CaptureStatCard icon={Activity} label="Testing access" value={`${npub.slice(0, 12)}…`} detail="This control is available only to the two designated accounts" />
        <CaptureStatCard icon={HardDrive} label="Privacy and relay rules" value="Public signed events" detail="The relay can reject copies because event writes must be signed by the original author. Audio files are not copied." />
      </div>
    </section>
  );
}
