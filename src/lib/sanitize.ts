/**
 * Sanitize a URL sourced from untrusted Nostr events.
 * Only https: (and data: images) are allowed. Returns undefined for anything else.
 */
export function sanitizeUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:") {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Generate a short, friendly fallback name from a pubkey. */
export function genUserName(pubkey: string): string {
  return `User ${pubkey.slice(0, 8)}`;
}
