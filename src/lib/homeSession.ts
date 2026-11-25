import type { Track } from '@/lib/music';

export function homeSessionQueryKey(sessionScope: string | undefined, queryKey: readonly unknown[]): readonly unknown[] {
  return sessionScope ? ['home-session', sessionScope, ...queryKey] : queryKey;
}

const shelfSnapshots = new Map<string, unknown>();
const SHELF_PREFIX = 'ostrify:home-session-shelf:v1:';

/** A tab-local snapshot survives navigation and reloads, with an in-memory fallback. */
export function readHomeSessionSnapshot<T>(key: string, validate: (value: unknown) => value is T): T | null {
  const cached = shelfSnapshots.get(key);
  if (validate(cached)) return cached;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SHELF_PREFIX + key) ?? 'null');
    if (!validate(value)) return null;
    shelfSnapshots.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export function writeHomeSessionSnapshot<T>(key: string, value: T): void {
  shelfSnapshots.set(key, value);
  try {
    sessionStorage.setItem(SHELF_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable or full; keep the in-memory selection.
  }
}

export function isSessionMusicTrack(value: unknown): value is Track {
  if (!value || typeof value !== 'object') return false;
  const track = value as Record<string, unknown>;
  return track.kind === 'music' && typeof track.id === 'string' && typeof track.url === 'string'
    && typeof track.title === 'string' && typeof track.pubkey === 'string'
    && typeof track.createdAt === 'number' && Array.isArray(track.topics)
    && track.topics.every(topic => typeof topic === 'string');
}
