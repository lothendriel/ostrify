import { useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitize';

export type RadioStation = { id: string; name: string; url?: string; image?: string; location: string; tags: string; hls: boolean };
const FAVORITES_KEY = 'ostrify:local-radio-favorites';
const OWNER_KEY = 'ostrify:radio-favorites-legacy-owner';
const CHANGE_EVENT = 'ostrify:radio-favorites-changed';
const keyFor = (pubkey?: string) => pubkey ? `${FAVORITES_KEY}:${pubkey}` : FAVORITES_KEY;

export function parseRadioFavorites(raw: string | null): RadioStation[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string, unknown>;
      if (typeof value.id !== 'string' || !/^[\da-f-]{36}$/i.test(value.id) || seen.has(value.id) || typeof value.name !== 'string' || !value.name.trim()) return [];
      seen.add(value.id);
      const text = (field: unknown) => typeof field === 'string' ? field.trim().slice(0, 300) : '';
      const url = sanitizeUrl(text(value.url));
      return [{ id: value.id, name: text(value.name), url, image: sanitizeUrl(text(value.image)), location: text(value.location), tags: text(value.tags), hls: value.hls === true || /\.m3u8(?:\?|$)/i.test(url ?? '') }];
    });
  } catch { return []; }
}

/** Claim existing browser-only favorites for the first account only. */
export function initializeRadioFavorites(pubkey: string): void {
  if (localStorage.getItem(keyFor(pubkey)) !== null) return;
  const owner = localStorage.getItem(OWNER_KEY);
  const legacy = !owner || owner === pubkey ? localStorage.getItem(FAVORITES_KEY) : null;
  localStorage.setItem(keyFor(pubkey), JSON.stringify(parseRadioFavorites(legacy)));
  if (!owner) {
    localStorage.setItem(OWNER_KEY, pubkey);
    // Move rather than copy legacy favorites so a later account cannot claim them.
    localStorage.removeItem(FAVORITES_KEY);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function radioFavoritesSnapshot(pubkey?: string): string {
  try {
    const saved = localStorage.getItem(keyFor(pubkey));
    if (saved !== null) return saved;
    if (pubkey && (!localStorage.getItem(OWNER_KEY) || localStorage.getItem(OWNER_KEY) === pubkey)) return localStorage.getItem(FAVORITES_KEY) ?? '[]';
    return '[]';
  } catch { return '[]'; }
}

export function replaceRadioFavorites(pubkey: string | undefined, favorites: RadioStation[]): void {
  if (pubkey) initializeRadioFavorites(pubkey);
  localStorage.setItem(keyFor(pubkey), JSON.stringify(favorites));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(FAVORITES_KEY)) callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(CHANGE_EVENT, callback); };
}

export function useRadioFavorites() {
  const { user } = useCurrentUser();
  const pubkey = user?.pubkey;
  const raw = useSyncExternalStore(subscribe, () => radioFavoritesSnapshot(pubkey), () => '[]');
  const favorites = parseRadioFavorites(raw);
  const { toast } = useToast();
  const toggleFavorite = (station: RadioStation) => {
    try {
      const current = parseRadioFavorites(radioFavoritesSnapshot(pubkey));
      const next = current.some(item => item.id === station.id) ? current.filter(item => item.id !== station.id) : [station, ...current];
      replaceRadioFavorites(pubkey, next);
    } catch {
      toast({ title: 'Could not save favorites', description: 'Browser storage is unavailable. Please check your browser settings.', variant: 'destructive' });
    }
  };
  return { favorites, toggleFavorite, raw };
}
