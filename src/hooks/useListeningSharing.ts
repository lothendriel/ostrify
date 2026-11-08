import { useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const eventName = 'ostrify-listening-sharing';
const keyFor = (pubkey: string) => `ostrify:listening-sharing:${pubkey}`;
const CLEAR_EVENT = 'ostrify:clear-listening-status';
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith('ostrify:listening-sharing:') || event.key === null) listener();
  };
  window.addEventListener(eventName, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener('storage', onStorage);
  };
}

function readEnabled(key: string): boolean {
  try {
    return !!key && localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function useListeningSharing() {
  const { user } = useCurrentUser();
  const key = user ? keyFor(user.pubkey) : '';
  const enabled = useSyncExternalStore(subscribe, () => readEnabled(key), () => false);

  function setEnabled(value: boolean): void {
    if (!key) return;
    if (!value) {
      try { localStorage.setItem(key, 'false'); } catch { throw new Error('Could not save listening activity privacy in this browser.'); }
      window.dispatchEvent(new Event(CLEAR_EVENT));
    } else {
      try { localStorage.setItem(key, 'true'); } catch { throw new Error('Could not save listening activity privacy in this browser.'); }
    }
    window.dispatchEvent(new Event(eventName));
  }

  return { enabled, setEnabled };
}
