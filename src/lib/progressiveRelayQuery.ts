export interface ProgressiveRelayResult<T> {
  relay: string;
  value: T;
}

export interface ProgressiveRelayBatch<T> {
  results: ProgressiveRelayResult<T>[];
  failedRelays: string[];
  pendingRelays: string[];
}

/**
 * Query relays concurrently, return after the first successful response plus a
 * grace window, and abort unfinished requests. Failures before the cutoff are
 * returned separately from relays that were still pending when the window ended.
 */
export async function queryRelaysWithGrace<T>(
  relays: readonly string[],
  query: (relay: string, signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  graceMs: number,
): Promise<ProgressiveRelayBatch<T>> {
  const controller = new AbortController();
  const relaySignal = AbortSignal.any([signal, controller.signal]);
  const results: ProgressiveRelayResult<T>[] = [];
  const failedRelays: string[] = [];
  const settledRelays = new Set<string>();

  const requests = relays.map(async relay => {
    try {
      const value = await query(relay, relaySignal);
      if (controller.signal.aborted || signal.aborted) return false;
      results.push({ relay, value });
      settledRelays.add(relay);
      return true;
    } catch {
      if (controller.signal.aborted || signal.aborted) return false;
      settledRelays.add(relay);
      failedRelays.push(relay);
      return false;
    }
  });

  const firstSuccess = Promise.any(requests.map(async request => {
    if (await request) return true;
    throw new Error('Relay query failed.');
  }));
  const allSettled = Promise.allSettled(requests).then(() => false);
  const responded = await Promise.race([firstSuccess, allSettled]).catch(() => false);

  if (signal.aborted) {
    controller.abort();
    throw signal.reason;
  }

  if (responded && requests.some((_request, index) => !settledRelays.has(relays[index]))) {
    let collectionTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(requests),
      new Promise<void>(resolve => { collectionTimer = setTimeout(resolve, graceMs); }),
    ]);
    if (collectionTimer !== undefined) clearTimeout(collectionTimer);
  }

  if (signal.aborted) {
    controller.abort();
    throw signal.reason;
  }

  const pendingRelays = relays.filter(relay => !settledRelays.has(relay));
  if (!responded && pendingRelays.length) await Promise.allSettled(requests);
  controller.abort();
  return { results, failedRelays, pendingRelays };
}
