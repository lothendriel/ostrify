import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Claim a previously shared browser value for at most one signed-in account. */
export function accountStorageKey(storage: Storage, legacyKey: string, owner: string): string {
  const key = `${legacyKey}:account:${owner}`;
  if (owner === 'anonymous') return key;
  try {
    const marker = `${legacyKey}:account-owner`;
    const claimedBy = storage.getItem(marker);
    if (!claimedBy) {
      // Some old app settings already identify their owner; don't assign them
      // to a different account on the first launch after upgrading.
      const legacy = storage.getItem(legacyKey);
      let legacyOwner: string | undefined;
      if (legacyKey === 'nostr:app-config' && legacy) {
        try {
          const parsed: unknown = JSON.parse(legacy);
          if (parsed && typeof parsed === 'object' && 'userRelayPubkey' in parsed && typeof parsed.userRelayPubkey === 'string') legacyOwner = parsed.userRelayPubkey || undefined;
        } catch { /* Invalid legacy settings will be ignored by the config validator. */ }
      }
      const claimant = legacyOwner ?? owner;
      const claimantKey = `${legacyKey}:account:${claimant}`;
      if (legacy && storage.getItem(claimantKey) === null) storage.setItem(claimantKey, legacy);
      storage.setItem(marker, claimant);
    }
  } catch {
    // The caller handles unavailable storage.
  }
  return key;
}
