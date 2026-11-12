import type { Track } from "@/lib/music";

const STORAGE_KEY = "ostrify-listening-analytics-v1";
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

function readRecords(): ListeningRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return parsed.filter(isListeningRecord).filter(record => record.date >= cutoffKey).slice(-MAX_RECORDS);
  } catch {
    return [];
  }
}

function updateRecord(track: Track, update: (record: ListeningRecord) => void): void {
  try {
    const records = readRecords();
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
    window.dispatchEvent(new Event("ostrify-analytics-update"));
  } catch {
    // Listening continues normally when browser storage is unavailable.
  }
}

/** Store only local, coarse daily listening aggregates; never publish or transmit them. */
export function recordListeningStart(track: Track): void {
  updateRecord(track, record => { record.plays += 1; });
}

export function recordListeningSeconds(track: Track, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  updateRecord(track, record => { record.seconds += Math.min(seconds, 10); });
}

export function readListeningRecords(): ListeningRecord[] {
  return readRecords();
}

export function clearListeningRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("ostrify-analytics-update"));
  } catch {
    // The dashboard remains usable when browser storage is unavailable.
  }
}
