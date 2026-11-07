import { useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const eventName = 'ostrify-listening-sharing';
const keyFor = (pubkey: string) => `ostrify:listening-sharing:${pubkey}`;
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener('storage', listener); };
}
export function useListeningSharing() {
  const { user } = useCurrentUser();
  const key = user ? keyFor(user.pubkey) : '';
  const enabled = useSyncExternalStore(subscribe, () => !!key && localStorage.getItem(key) === 'true', () => false);
  const setEnabled = (value: boolean) => {
    if (!key) return;
    localStorage.setItem(key, String(value));
    window.dispatchEvent(new Event(eventName));
  };
  return { enabled, setEnabled };
}
