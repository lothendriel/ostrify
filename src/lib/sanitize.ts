/** Return a credential-free HTTPS URL for untrusted event and catalog data. */
export function sanitizeUrl(url: string | undefined | null): string | undefined {
  if (typeof url !== "string" || !url.trim()) return undefined;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Allow only Cloudflare's hosted Stream player for a 32-hex video ID. Rebuild
 * the embed URL so event-supplied query parameters cannot configure the player.
 * Keep this policy aligned with index.html's frame-src.
 */
export function cloudflareStreamEmbed(url: string | undefined | null): string | undefined {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return undefined;
  const parsed = new URL(safeUrl);
  if (parsed.port || !/^customer-[a-z0-9]{1,48}\.cloudflarestream\.com$/.test(parsed.hostname)) return undefined;
  const match = parsed.pathname.match(/^\/([a-f0-9]{32})\/(?:iframe|watch|manifest\/video\.m3u8)\/?$/i);
  return match ? `https://${parsed.hostname}/${match[1].toLowerCase()}/iframe` : undefined;
}

export type StreamPlaybackSource =
  | { type: 'hls' | 'video' | 'embed'; url: string }
  | { type: 'unsupported' };

/** Classify HTTPS media by URL path, never by query string or a loose hostname match. */
export function classifyStreamPlayback(url: string | undefined | null): StreamPlaybackSource {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return { type: 'unsupported' };
  const parsed = new URL(safeUrl);
  if (/\.m3u8$/i.test(parsed.pathname)) return { type: 'hls', url: safeUrl };
  if (/\.(mp4|m4v|webm|ogv)$/i.test(parsed.pathname)) return { type: 'video', url: safeUrl };
  const embed = cloudflareStreamEmbed(safeUrl);
  return embed ? { type: 'embed', url: embed } : { type: 'unsupported' };
}

/** Generate a short, friendly fallback name from a pubkey. */
export function genUserName(pubkey: string): string {
  return `User ${pubkey.slice(0, 8)}`;
}
