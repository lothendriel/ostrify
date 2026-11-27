import { useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const eventName = 'ostrify-listening-sharing';
const keyFor = (pubkey: string) => `ostrify:listening-sharing:${pubkey}`;
export const CLEAR_LISTENING_STATUS_EVENT = 'ostrify:clear-listening-status';
export const LISTENING_STATUS_CLEAR_RESULT_EVENT = 'ostrify:listening-status-clear-result';
export type ListeningStatusClearState = 'pending' | 'published' | 'failed' | 'superseded';
export interface ListeningStatusClearResult {
  state: ListeningStatusClearState;
  message?: string;
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
    return !!key && localStorage.getItem(key) !== 'false';
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
      window.dispatchEvent(new CustomEvent(LISTENING_STATUS_CLEAR_RESULT_EVENT, { detail: { state: 'pending' satisfies ListeningStatusClearState } }));
      window.dispatchEvent(new Event(CLEAR_LISTENING_STATUS_EVENT));
    } else {
      try { localStorage.setItem(key, 'true'); } catch { throw new Error('Could not save listening activity privacy in this browser.'); }
    }
    window.dispatchEvent(new Event(eventName));
  }

  return { enabled, setEnabled };
}
