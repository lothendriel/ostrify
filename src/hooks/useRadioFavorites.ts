import { useSyncExternalStore } from 'react';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitize';

export type RadioStation = { id: string; name: string; url?: string; image?: string; location: string; tags: string; hls: boolean };
const FAVORITES_KEY = 'ostrify:local-radio-favorites';
const CHANGE_EVENT = 'ostrify:radio-favorites-changed';

function readFavorites(raw: string | null): RadioStation[] {
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
  } catch {
    return [];
  }
}

function getSnapshot(): string {
  try { return localStorage.getItem(FAVORITES_KEY) ?? ''; } catch { return ''; }
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY || event.key === null) callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useRadioFavorites() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => '');
  const favorites = readFavorites(raw);
  const { toast } = useToast();
  const toggleFavorite = (station: RadioStation) => {
    const current = readFavorites(getSnapshot());
    const next = current.some(item => item.id === station.id)
      ? current.filter(item => item.id !== station.id)
      : [station, ...current];
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      toast({ title: 'Could not save favorites', description: 'Browser storage is unavailable. Please check your browser settings.', variant: 'destructive' });
    }
  };
  return { favorites, toggleFavorite };
}
