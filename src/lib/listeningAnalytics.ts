import type { Track } from "@/lib/music";
import { accountStorageKey } from "@/lib/utils";

const STORAGE_KEY = "ostrify-listening-analytics-v1";
const VIDEO_STORAGE_KEY = "ostrify-video-analytics-v1";
const RETENTION_DAYS = 180;
const MAX_RECORDS = 5000;

export interface ListeningRecord {
  date: string;
  trackId: string;
  title: string;
  artist: string;
  kind: Track["kind"];
  seconds: number;
  plays: number;
}

export interface VideoAnalyticsItem {
  id: string;
  title: string;
  kind: 'live' | 'recording';
}

export interface VideoRecord extends VideoAnalyticsItem {
  date: string;
  seconds: number;
  sessions: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isListeningRecord(value: unknown): value is ListeningRecord {
  if (!isRecord(value)) return false;
  return typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
    && typeof value.trackId === "string" && typeof value.title === "string" && typeof value.artist === "string"
    && ["music", "podcast", "audiobook"].includes(String(value.kind))
    && typeof value.seconds === "number" && Number.isFinite(value.seconds) && value.seconds >= 0
    && typeof value.plays === "number" && Number.isFinite(value.plays) && value.plays >= 0;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readRecords(owner: string): ListeningRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(accountStorageKey(localStorage, STORAGE_KEY, owner)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return parsed.filter(isListeningRecord).filter(record => record.date >= cutoffKey).slice(-MAX_RECORDS);
  } catch {
    return [];
  }
}

function updateRecord(track: Track, update: (record: ListeningRecord) => void, owner: string): void {
  try {
    const records = readRecords(owner);
    const date = todayKey();
    let record = records.find(item => item.date === date && item.trackId === track.id);
    if (!record) {
      record = {
        date,
        trackId: track.id,
        title: track.title,
        artist: track.artist || track.album || (track.kind === "audiobook" ? "Audiobook" : track.kind === "podcast" ? "Podcast" : "Unknown artist"),
        kind: track.kind,
        seconds: 0,
        plays: 0,
      };
      records.push(record);
    }
    record.title = track.title;
    record.artist = track.artist || record.artist;
    update(record);
    localStorage.setItem(accountStorageKey(localStorage, STORAGE_KEY, owner), JSON.stringify(records.slice(-MAX_RECORDS)));
    window.dispatchEvent(new Event("ostrify-analytics-update"));
  } catch {
    // Listening continues normally when browser storage is unavailable.
  }
}

/** Store only local, coarse daily listening aggregates; never publish or transmit them. */
export function recordListeningStart(track: Track, owner = 'anonymous'): void {
  updateRecord(track, record => { record.plays += 1; }, owner);
}

export function recordListeningSeconds(track: Track, seconds: number, owner = 'anonymous'): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  updateRecord(track, record => { record.seconds += Math.min(seconds, 10); }, owner);
}

export function readListeningRecords(owner = 'anonymous'): ListeningRecord[] {
  return readRecords(owner);
}

function isVideoRecord(value: unknown): value is VideoRecord {
  if (!isRecord(value)) return false;
  return typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
    && typeof value.id === 'string' && typeof value.title === 'string'
    && (value.kind === 'live' || value.kind === 'recording')
    && typeof value.seconds === 'number' && Number.isFinite(value.seconds) && value.seconds >= 0
    && typeof value.sessions === 'number' && Number.isFinite(value.sessions) && value.sessions >= 0;
}

export function readVideoRecords(owner = 'anonymous'): VideoRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(accountStorageKey(localStorage, VIDEO_STORAGE_KEY, owner)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return parsed.filter(isVideoRecord).filter(record => record.date >= cutoffKey).slice(-MAX_RECORDS);
  } catch {
    return [];
  }
}

function updateVideoRecord(video: VideoAnalyticsItem, owner: string, seconds: number, sessions: number): void {
  try {
    const records = readVideoRecords(owner);
    const date = todayKey();
    let record = records.find(item => item.date === date && item.id === video.id && item.kind === video.kind);
    if (!record) {
      record = { ...video, date, seconds: 0, sessions: 0 };
      records.push(record);
    }
    record.title = video.title;
    record.seconds += seconds;
    record.sessions += sessions;
    localStorage.setItem(accountStorageKey(localStorage, VIDEO_STORAGE_KEY, owner), JSON.stringify(records.slice(-MAX_RECORDS)));
    window.dispatchEvent(new Event('ostrify-analytics-update'));
  } catch {
    // Playback continues if storage is unavailable.
  }
}

/** Track confirmed native playback only; embedded players do not expose playback state. */
export function recordVideoStart(video: VideoAnalyticsItem, owner = 'anonymous'): void {
  updateVideoRecord(video, owner, 0, 1);
}

export function recordVideoSeconds(video: VideoAnalyticsItem, seconds: number, owner = 'anonymous'): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  updateVideoRecord(video, owner, Math.min(seconds, 10), 0);
}

export function clearVideoRecords(owner = 'anonymous'): void {
  try {
    localStorage.removeItem(accountStorageKey(localStorage, VIDEO_STORAGE_KEY, owner));
    window.dispatchEvent(new Event('ostrify-analytics-update'));
  } catch {
    // The dashboard remains usable when browser storage is unavailable.
  }
}

export function clearListeningRecords(owner = 'anonymous'): void {
  try {
    localStorage.removeItem(accountStorageKey(localStorage, STORAGE_KEY, owner));
    window.dispatchEvent(new Event("ostrify-analytics-update"));
  } catch {
    // The dashboard remains usable when browser storage is unavailable.
  }
}
