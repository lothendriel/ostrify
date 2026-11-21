import type { NostrEvent, NPool } from '@nostrify/nostrify';
import { verifyEvent } from 'nostr-tools';
import { eventToTrack, parsePodcastEpisodeTrack } from '@/lib/music';
import { OSTRIFY_RELAY_URL } from '@/lib/appRelays';

export const AUDIO_CATALOG_CAPTURE_KEY_PREFIX = 'ostrify:audio-catalog-capture:v1:';
export const AUDIO_CATALOG_CAPTURE_STATUS_EVENT = 'ostrify-audio-catalog-capture-status';
export const AUDIO_CATALOG_CAPTURE_ENABLED_EVENT = 'ostrify-audio-catalog-capture-enabled';
export const AUDIO_CATALOG_CAPTURE_LIMIT_EVENT = 'ostrify-audio-catalog-capture-limit';
export const AUDIO_CATALOG_CAPTURE_LIMIT_KEY_PREFIX = `${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}limit:`;
export const DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT = 100;

export interface AudioCatalogCaptureStatus {
  attempted: number;
  captured: number;
  failed: number;
  lastMessage: string;
  lastFailure: string;
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
  attempted: 0,
  captured: 0,
  failed: 0,
  lastMessage: 'No playable audio events forwarded this session yet.',
  lastFailure: '',
};

const SESSION_KEY = 'session';
const SESSION_STATUS_KEY = `${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${SESSION_KEY}:status`;
const SESSION_EVENT_IDS_KEY = `${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${SESSION_KEY}:event-ids`;
const MAX_CAPTURE_ATTEMPTS_PER_BATCH = 20;
const capturedOrInFlight = new Set<string>();
const captureQueue = new Map<string, Promise<void>>();

export function audioCatalogCaptureEnabledKey(pubkey: string): string {
  return `${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}enabled:${pubkey.toLowerCase()}`;
}

/** Capture is enabled for ordinary visitors; allowlisted accounts may pause it locally. */
export function isAudioCatalogCaptureEnabled(pubkey: string | undefined): boolean {
  if (!isAllowedAudioCatalogCaptureUser(pubkey)) return true;
  try {
    const normalizedPubkey = pubkey?.toLowerCase() ?? '';
    const value = window.localStorage.getItem(audioCatalogCaptureEnabledKey(normalizedPubkey));
    const legacyValue = window.localStorage.getItem(`${AUDIO_CATALOG_CAPTURE_KEY_PREFIX}${normalizedPubkey}`);
    return value === 'false' || (value === null && legacyValue === 'false') ? false : true;
  } catch {
    return true;
  }
}

export function readAudioCatalogCaptureLimit(pubkey: string | undefined): number | null {
  if (!isAllowedAudioCatalogCaptureUser(pubkey)) return DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT;
  try {
    const raw = window.sessionStorage.getItem(`${AUDIO_CATALOG_CAPTURE_LIMIT_KEY_PREFIX}${SESSION_KEY}`);
    if (raw === 'unlimited') return null;
    if (!raw) return DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT;
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT;
    return Math.min(parsed, 1_000_000);
  } catch {
    return DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT;
  }
}

export function writeAudioCatalogCaptureLimit(pubkey: string, limit: number | null): void {
  if (!isAllowedAudioCatalogCaptureUser(pubkey)) return;
  const safeLimit = limit === null ? null : Number.isSafeInteger(limit) && limit >= 1 ? Math.min(limit, 1_000_000) : DEFAULT_AUDIO_CATALOG_CAPTURE_LIMIT;
  try {
    window.sessionStorage.setItem(`${AUDIO_CATALOG_CAPTURE_LIMIT_KEY_PREFIX}${SESSION_KEY}`, safeLimit === null ? 'unlimited' : String(safeLimit));
  } catch {
    // The default limit remains in effect if preferences cannot be stored.
  }
  window.dispatchEvent(new CustomEvent(AUDIO_CATALOG_CAPTURE_LIMIT_EVENT, { detail: pubkey.toLowerCase() }));
}

export function readAudioCatalogCaptureStatus(_pubkey?: string): AudioCatalogCaptureStatus {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(SESSION_STATUS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return EMPTY_AUDIO_CATALOG_CAPTURE_STATUS;
    const record = raw as Record<string, unknown>;
    return {
      attempted: typeof record.attempted === 'number' && Number.isFinite(record.attempted) ? record.attempted : 0,
      captured: typeof record.captured === 'number' && Number.isFinite(record.captured) ? record.captured : 0,
      failed: typeof record.failed === 'number' && Number.isFinite(record.failed) ? record.failed : 0,
      lastMessage: typeof record.lastMessage === 'string' ? record.lastMessage : EMPTY_AUDIO_CATALOG_CAPTURE_STATUS.lastMessage,
      lastFailure: typeof record.lastFailure === 'string' ? record.lastFailure : '',
    };
  } catch {
    return EMPTY_AUDIO_CATALOG_CAPTURE_STATUS;
  }
}

function writeAudioCatalogCaptureStatus(pubkey: string | undefined, status: AudioCatalogCaptureStatus): void {
  try {
    window.sessionStorage.setItem(SESSION_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Status is informational and should not affect relay forwarding.
  }
  const detail: AudioCatalogCaptureStatusDetail = { pubkey: pubkey?.toLowerCase() ?? '', status };
  window.dispatchEvent(new CustomEvent<AudioCatalogCaptureStatusDetail>(AUDIO_CATALOG_CAPTURE_STATUS_EVENT, { detail }));
}

function isEligiblePlayableEvent(event: NostrEvent): boolean {
  if (!/^[0-9a-f]{64}$/i.test(event.id) || !/^[0-9a-f]{64}$/i.test(event.pubkey) || !/^[0-9a-f]{128}$/i.test(event.sig)) return false;
  if (!verifyEvent(event)) return false;
  if (event.kind === 1053) return false;
  const track = event.kind === 54 ? parsePodcastEpisodeTrack(event) : eventToTrack(event);
  if (!track || track.visibility === 'hidden') return false;
  if (event.tags.some(([name, value]) => name === 'ostrify_visibility' && value === 'hidden')) return false;
  return true;
}

function readAttemptedEventIds(): Set<string> {
  try {
    const previousIds: unknown = JSON.parse(window.sessionStorage.getItem(SESSION_EVENT_IDS_KEY) ?? '[]');
    if (Array.isArray(previousIds)) {
      for (const id of previousIds) if (typeof id === 'string') capturedOrInFlight.add(id);
    }
  } catch {
    // In-memory deduplication still protects this page session.
  }
  return capturedOrInFlight;
}

function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 140) || 'Relay rejected the event or connection failed.';
}

function releasePendingEvents(events: NostrEvent[], attemptedIds: Set<string>): void {
  for (const event of events) attemptedIds.delete(event.id);
  try {
    window.sessionStorage.setItem(SESSION_EVENT_IDS_KEY, JSON.stringify([...attemptedIds]));
  } catch {
    // Keep the in-memory set in sync if session storage is unavailable.
  }
  const current = readAudioCatalogCaptureStatus();
  writeAudioCatalogCaptureStatus(undefined, { ...current, attempted: attemptedIds.size });
}

/** Forward unchanged, already-signed playable Nostr audio events to Ostrify's relay. */
export function captureDiscoveredAudioEvents(
  nostr: NPool,
  events: NostrEvent[],
  pubkey: string | undefined,
): void {
  if (!isAudioCatalogCaptureEnabled(pubkey)) return;
  const eligible = events.filter(isEligiblePlayableEvent);
  if (!eligible.length) return;

  const attemptedIds = readAttemptedEventIds();
  const status = readAudioCatalogCaptureStatus();
  const limit = readAudioCatalogCaptureLimit(pubkey);
  const remaining = limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - attemptedIds.size);
  const freshEvents = eligible
    .filter(event => !attemptedIds.has(event.id))
    .slice(0, Math.min(MAX_CAPTURE_ATTEMPTS_PER_BATCH, remaining));
  if (!freshEvents.length) return;

  const batchStartPosition = attemptedIds.size;
  const batchLimit = limit;
  const batchPubkey = pubkey?.toLowerCase() ?? 'anonymous';
  for (const event of freshEvents) attemptedIds.add(event.id);
  try {
    window.sessionStorage.setItem(SESSION_EVENT_IDS_KEY, JSON.stringify([...attemptedIds]));
  } catch {
    // Relay forwarding continues if browser storage is unavailable.
  }
  writeAudioCatalogCaptureStatus(pubkey, {
    ...status,
    attempted: attemptedIds.size,
    lastMessage: `Forwarding ${freshEvents.length} playable event${freshEvents.length === 1 ? '' : 's'} to the Ostrify relay.`,
  });

  const processBatch = async () => {
    const skipped: NostrEvent[] = [];
    for (const [index, event] of freshEvents.entries()) {
      if (!isAudioCatalogCaptureEnabled(pubkey)) {
        skipped.push(...freshEvents.slice(index));
        break;
      }
      const currentLimit = readAudioCatalogCaptureLimit(pubkey);
      const eventPosition = batchStartPosition + index + 1;
      const effectiveLimit = currentLimit === null ? batchLimit : batchLimit === null ? currentLimit : Math.min(batchLimit, currentLimit);
      if (effectiveLimit !== null && eventPosition > effectiveLimit) {
        skipped.push(...freshEvents.slice(index));
        break;
      }
      try {
        // NPool's event method forwards this exact signed event; do not modify, sign, or republish it elsewhere.
        await nostr.relay(OSTRIFY_RELAY_URL).event(event, { signal: AbortSignal.timeout(8_000) });
        const current = readAudioCatalogCaptureStatus();
        writeAudioCatalogCaptureStatus(pubkey, {
          ...current,
          attempted: attemptedIds.size,
          captured: current.captured + 1,
          lastMessage: `Relay accepted event ${event.id.slice(0, 12)}; retention is not guaranteed.`,
        });
      } catch (error) {
        const current = readAudioCatalogCaptureStatus();
        writeAudioCatalogCaptureStatus(pubkey, {
          ...current,
          attempted: attemptedIds.size,
          failed: current.failed + 1,
          lastFailure: `Relay rejected or could not receive ${event.id.slice(0, 12)}: ${describeFailure(error)}`,
          lastMessage: `Relay error for event ${event.id.slice(0, 12)}. Browsing continues.`,
        });
      }
    }
    if (skipped.length) releasePendingEvents(skipped, attemptedIds);
  };
  const previousQueue = captureQueue.get(batchPubkey) ?? Promise.resolve();
  const nextQueue = previousQueue.then(processBatch, processBatch).catch(error => {
    const current = readAudioCatalogCaptureStatus();
    writeAudioCatalogCaptureStatus(pubkey, {
      ...current,
      attempted: Math.max(0, current.attempted - freshEvents.length),
      failed: current.failed + freshEvents.length,
      lastFailure: `Ostrify relay capture queue failed: ${describeFailure(error)}`,
      lastMessage: 'Ostrify relay capture queue failed; browsing continues.',
    });
    releasePendingEvents(freshEvents, attemptedIds);
  });
  captureQueue.set(batchPubkey, nextQueue);
}
