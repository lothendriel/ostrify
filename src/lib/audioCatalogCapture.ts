import type { NostrEvent, NPool } from '@nostrify/nostrify';
import { eventToTrack } from '@/lib/music';

export const AUDIO_CATALOG_CAPTURE_KEY_PREFIX = 'ostrify:audio-catalog-capture:v1:';
export const AUDIO_CATALOG_CAPTURE_STATUS_EVENT = 'ostrify-audio-catalog-capture-status';
export const AUDIO_CATALOG_CAPTURE_ENABLED_EVENT = 'ostrify-audio-catalog-capture-enabled';

export interface AudioCatalogCaptureStatus {
  captured: number;
  failed: number;
  lastMessage: string;
}

export interface AudioCatalogCaptureStatusDetail {
  pubkey: string;
  status: AudioCatalogCaptureStatus;
}

export const AUDIO_CATALOG_CAPTURE_ALLOWED_PUBKEYS = new Set([
  '0155373ac79b7ffb0f586c3e68396f9e82d46f7afe7016d46ed9ca46ba3e1bed',
  '266872954d8054eef7af09b06bc0b950f73da500553e192aa700532a4d94119a',
]);

export function isAllowedAudioCatalogCaptureUser(pubkey: string | undefined): boolean {
  return !!pubkey && AUDIO_CATALOG_CAPTURE_ALLOWED_PUBKEYS.has(pubkey.toLowerCase());
}

export const EMPTY_AUDIO_CATALOG_CAPTURE_STATUS: AudioCatalogCaptureStatus = {
  captured: 0,
  failed: 0,
  lastMessage: 'No audio events captured this session yet.',
};

const capturedOrInFlight = new Map<string, Set<string>>();
const MAX_CAPTURE_ATTEMPTS_PER_SESSION = 100;
const MAX_CAPTURE_ATTEMPTS_PER_BATCH = 20;

export function audioCatalogCaptureEnabledKey(pubkey: string): string {
  return `${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${pubkey}`;
}

export function isAudioCatalogCaptureEnabled(pubkey: string): boolean {
  try {
    return window.localStorage.getItem(audioCatalogCaptureEnabledKey(pubkey)) === 'true';
  } catch {
    return false;
  }
}

export function readAudioCatalogCaptureStatus(pubkey: string): AudioCatalogCaptureStatus {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(`${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${pubkey}:status`) ?? 'null');
    if (!raw || typeof raw !== 'object') return EMPTY_AUDIO_CATALOG_CAPTURE_STATUS;
    const record = raw as Record<string, unknown>;
    return {
      captured: typeof record.captured === 'number' && Number.isFinite(record.captured) ? record.captured : 0,
      failed: typeof record.failed === 'number' && Number.isFinite(record.failed) ? record.failed : 0,
      lastMessage: typeof record.lastMessage === 'string' ? record.lastMessage : EMPTY_AUDIO_CATALOG_CAPTURE_STATUS.lastMessage,
    };
  } catch {
    return EMPTY_AUDIO_CATALOG_CAPTURE_STATUS;
  }
}

function writeAudioCatalogCaptureStatus(pubkey: string, status: AudioCatalogCaptureStatus): void {
  try {
    window.sessionStorage.setItem(`${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${pubkey}:status`, JSON.stringify(status));
  } catch {
    // Status is informational; capture itself should continue if storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent<AudioCatalogCaptureStatusDetail>(AUDIO_CATALOG_CAPTURE_STATUS_EVENT, { detail: { pubkey, status } }));
}

/** Copy verified, playable Nostr audio events discovered in app queries to enabled write relays. */
export function captureDiscoveredAudioEvents(
  nostr: NPool,
  events: NostrEvent[],
  pubkey: string | undefined,
  writeRelays: string[],
): void {
  if (!isAllowedAudioCatalogCaptureUser(pubkey) || !writeRelays.length) return;
  const accountPubkey = pubkey?.toLowerCase();
  if (!accountPubkey) return;
  if (!isAudioCatalogCaptureEnabled(accountPubkey)) return;
  const eligible = events.filter(event => {
    if (event.kind === 10154) return event.tags.some(([name, value]) => name === 'title' && !!value?.trim());
    const track = eventToTrack(event);
    return !!track && track.visibility !== 'hidden';
  });
  if (!eligible.length) return;

  let attempted = capturedOrInFlight.get(accountPubkey);
  if (!attempted) {
    attempted = new Set<string>();
    try {
      const previousIds: unknown = JSON.parse(window.sessionStorage.getItem(`${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${accountPubkey}:event-ids`) ?? '[]');
      if (Array.isArray(previousIds)) {
        for (const id of previousIds) if (typeof id === 'string') attempted.add(id);
      }
    } catch {
      // A fresh in-memory session set is enough if browser storage is unavailable.
    }
    capturedOrInFlight.set(accountPubkey, attempted);
  }

  const currentStatus = readAudioCatalogCaptureStatus(accountPubkey);
  const usedSessionAttempts = Math.max(attempted.size, currentStatus.captured + currentStatus.failed);
  const remainingSessionAttempts = Math.max(0, MAX_CAPTURE_ATTEMPTS_PER_SESSION - usedSessionAttempts);
  const freshEvents = eligible
    .filter(event => !attempted?.has(event.id))
    .slice(0, Math.min(MAX_CAPTURE_ATTEMPTS_PER_BATCH, remainingSessionAttempts));
  for (const event of freshEvents) attempted.add(event.id);
  try {
    window.sessionStorage.setItem(`${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${accountPubkey}:event-ids`, JSON.stringify([...attempted]));
  } catch {
    // Capture still works without persisted de-duplication.
  }
  if (!freshEvents.length) return;

  const run = async () => {
    const results = await Promise.all(freshEvents.map(async event => {
      if (!isAudioCatalogCaptureEnabled(accountPubkey)) return { eventId: event.id, acceptedBy: [] as string[], skipped: true };
      const targetResults = await Promise.allSettled(writeRelays.map(url =>
        nostr.relay(url).event(event, { signal: AbortSignal.timeout(8000) }),
      ));
      const acceptedBy = targetResults.flatMap((result, index) => result.status === 'fulfilled' ? [writeRelays[index]] : []);
      return { eventId: event.id, acceptedBy, skipped: false };
    }));
    for (const result of results) {
      if (result.skipped) {
        attempted?.delete(result.eventId);
        continue;
      }
      const current = readAudioCatalogCaptureStatus(accountPubkey);
      if (result.acceptedBy.length) {
        writeAudioCatalogCaptureStatus(accountPubkey, {
          ...current,
          captured: current.captured + 1,
          lastMessage: `Captured event ${result.eventId.slice(0, 12)} to ${result.acceptedBy.join(', ')}.`,
        });
      } else {
        writeAudioCatalogCaptureStatus(accountPubkey, {
          ...current,
          failed: current.failed + 1,
          lastMessage: `Could not capture event ${result.eventId.slice(0, 12)}. Check relay write access and storage.`,
        });
      }
    }
  };

  void run().catch(() => {
    const previous = readAudioCatalogCaptureStatus(accountPubkey);
    writeAudioCatalogCaptureStatus(accountPubkey, {
      ...previous,
      failed: previous.failed + freshEvents.length,
      lastMessage: 'Audio events could not be copied. Check relay write access and storage.',
    });
  });
}
