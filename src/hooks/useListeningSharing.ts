import { useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const eventName = 'ostrify-listening-sharing';
const keyFor = (pubkey: string) => `ostrify:listening-sharing:${pubkey}`;
let latestSetter: ((value: boolean) => void) | null = null;
export function setListeningSharingForCurrentUser(value: boolean): void {
  latestSetter?.(value);
}

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
    try {
      localStorage.setItem(key, String(value));
    } catch {
      throw new Error('Could not save listening activity privacy in this browser.');
    }
    window.dispatchEvent(new Event(eventName));
  }

  latestSetter = setEnabled;
  return { enabled, setEnabled };
}
