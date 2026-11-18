interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  ASSETS: AssetFetcher;
  AUDIO_SHARE_LINKS: KvNamespace;
  AUDIO_SHARE_APP_ORIGINS?: string;
  PODCAST_INDEX_API_KEY?: string;
  PODCAST_INDEX_API_SECRET?: string;
}

const PODCAST_INDEX_API = "https://api.podcastindex.org/api/1.0";
const FOUNTAIN_API = "https://api.fountain.fm/v1";
const FOUNTAIN_LOOKUP_URL = `${FOUNTAIN_API}/search/lookup`;
const CONTENT_ID_RE = /^episode:id:\S{20}$/;
const CONTENT_PATH_PREFIX = "/api/fountain/content/";
const MAX_BODY_LENGTH = 2048;
const AUDIO_SHARE_PATH = "/api/audio-shares";
const AUDIO_SHARE_PREFIX = "/s/";
const AUDIO_SHARE_PUBLIC_ORIGIN = "https://ostrify.lothendriel.workers.dev";
const AUDIO_DETAIL_BASE_PATH = "/audio";
// Accept legacy 12-character links while issuing 128-bit codes for new links.
const AUDIO_SHARE_CODE_RE = /^(?:[A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{22})$/;
const AUDIO_SHARE_MAX_PATH_LENGTH = 7000;
const AUDIO_SHARE_TARGET_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;
const AUDIO_SHARE_RATE_LIMIT = 20;
const AUDIO_SHARE_RATE_WINDOW_SECONDS = 60 * 60;
const AUDIO_SHARE_RATE_TTL_SECONDS = 60 * 60 * 2;
const FOUNTAIN_RSS_PATHS = new Map<string, RegExp>([
  ["feeds.fountain.fm", /^\/[A-Za-z0-9]{20}$/],
  ["serve.podhome.fm", /^\/rss\/[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/],
  ["feed.bowlafterbowl.com", /^\/feed\.xml$/],
  ["www.doerfelverse.com", /^\/feeds\/intothedoerfelverse\.xml$/],
  ["heartmoney.podigee.io", /^\/feed\/mp3$/],
  ["feeds.megaphone.fm", /^\/WWO3519750118$/],
  ["feed.podbean.com", /^\/bohdislater5\/feed\.xml$/],
  ["media.rss.com", /^\/commute-and-compute\/feed\.xml$/],
]);
const FOUNTAIN_FEED_GUID_RE = /^[^\s]{1,512}$/;
const MAX_RSS_BYTES = 5_000_000;
const MAX_RSS_REDIRECTS = 2;
const RSS_FETCH_TIMEOUT_MS = 8_000;
const RSS_TOTAL_TIMEOUT_MS = 25_000;
const DNS_LOOKUP_TIMEOUT_MS = 4_000;
const CLOUDFLARE_DOH_URL = "https://cloudflare-dns.com/dns-query";

function isAllowedFountainRssUrl(url: URL): boolean {
  const allowedPath = FOUNTAIN_RSS_PATHS.get(url.hostname);
  return url.protocol === "https:"
    && allowedPath !== undefined
    && !url.username
    && !url.password
    && !url.port
    && allowedPath.test(url.pathname)
    && !url.search
    && !url.hash;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) return false;
  const [a, b, c] = parts.map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 && c === 0 || b === 0 && c === 2 || b === 88 && c === 99 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100))
    || (a === 203 && b === 0 && c === 113);
}

function isSafePublicRssUrl(url: URL): boolean {
  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]") ? rawHostname.slice(1, -1) : rawHostname;
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
  if (!hostname || hostname.length > 253) return false;
  if (hostname.includes(":") || isPrivateIpv4(hostname) || /^\d+(?:\.\d+){0,3}$/.test(hostname)) return false;
  if (hostname === "localhost" || /\.(?:localhost|local|internal|home|lan|test|invalid|example|onion|arpa|nip\.io|sslip\.io|xip\.io|localtest\.me|vcap\.me|lvh\.me|traefik\.me)$/.test(hostname)) return false;
  return hostname.split(".").every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function parseIpv6Address(input: string): bigint | undefined {
  let address = input.toLowerCase().replace(/^\[|\]$/g, "");
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    const ipv4 = address.slice(lastColon + 1);
    const octets = ipv4.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet, index) => !/^\d{1,3}$/.test(ipv4.split(".")[index]) || octet > 255)) return undefined;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  const words = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (words.length !== 8 || words.some(word => !/^[a-f0-9]{1,4}$/.test(word))) return undefined;
  return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function isIpv6InRange(address: bigint, network: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return (address >> shift) === (network >> shift);
}

function isPrivateIpv6(hostname: string): boolean {
  const address = parseIpv6Address(hostname);
  if (address === undefined) return true;
  const globalUnicast = isIpv6InRange(address, 0x20000000000000000000000000000000n, 3);
  if (!globalUnicast) return true;
  const blockedRanges: Array<[bigint, number]> = [
    [0x20010000000000000000000000000000n, 23], // IETF protocol assignments
    [0x20010db8000000000000000000000000n, 32], // documentation
    [0x20020000000000000000000000000000n, 16], // 6to4
    [0x3fff0000000000000000000000000000n, 20], // documentation
  ];
  return blockedRanges.some(([network, prefix]) => isIpv6InRange(address, network, prefix));
}

function isPrivateOrReservedAddress(address: string): boolean {
  if (/^\d+(?:\.\d+){0,3}$/.test(address)) {
    const octets = address.split(".");
    const canonicalIpv4 = octets.length === 4 && octets.every(octet => /^(0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255);
    return !canonicalIpv4 || isPrivateIpv4(address);
  }
  if (address.includes(":")) return isPrivateIpv6(address);
  return true;
}

async function resolvePublicHostname(hostname: string): Promise<string> {
  const addresses = await Promise.all(["A", "AAAA"].map(async type => {
    const dnsUrl = new URL(CLOUDFLARE_DOH_URL);
    dnsUrl.searchParams.set("name", hostname);
    dnsUrl.searchParams.set("type", type);
    const response = await fetch(dnsUrl, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(DNS_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("DNS validation is unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("Answer" in data) || !Array.isArray(data.Answer)) return [] as string[];
    return data.Answer.flatMap((answer: unknown) => {
      if (!answer || typeof answer !== "object" || !("data" in answer) || typeof answer.data !== "string" || !("type" in answer)) return [];
      const expectedType = type === "A" ? 1 : 28;
      return answer.type === expectedType ? [answer.data] : [];
    });
  }));
  const resolved = addresses.flat();
  if (!resolved.length) throw new Error("RSS hostname did not resolve to a public address");
  if (resolved.some(isPrivateOrReservedAddress)) throw new Error("RSS hostname resolves to a private or reserved address");
  const ipv4 = resolved.find(address => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address));
  if (!ipv4) throw new Error("RSS hostname has no public IPv4 address available for safe fetching");
  return ipv4;
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("Fountain RSS feed is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("Fountain RSS feed is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function fetchRssFeed(initialUrl: URL, byGuidResolved: boolean): Promise<{ body: string; contentType: string }> {
  let feedUrl = initialUrl;
  const deadline = Date.now() + RSS_TOTAL_TIMEOUT_MS;
  for (let redirects = 0; ; redirects += 1) {
    if (!isSafePublicRssUrl(feedUrl) || (!byGuidResolved && !isAllowedFountainRssUrl(feedUrl))) throw new Error("Fountain RSS URL is not allowed");
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("Fountain RSS fetch timed out");
    if (byGuidResolved) await resolvePublicHostname(feedUrl.hostname);
    const response = await fetch(feedUrl, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(RSS_FETCH_TIMEOUT_MS, remainingMs)),
    });
    if (response.status >= 300 && response.status < 400) {
      if (redirects >= MAX_RSS_REDIRECTS) throw new Error("Fountain RSS exceeded the redirect limit");
      const location = response.headers.get("Location");
      if (!location) throw new Error("Fountain RSS redirect has no destination");
      const redirectUrl = new URL(location, feedUrl);
      if (!isSafePublicRssUrl(redirectUrl) || (!byGuidResolved && !isAllowedFountainRssUrl(redirectUrl))) throw new Error("Fountain RSS redirected to an unsafe URL");
      feedUrl = redirectUrl;
      continue;
    }
    if (!response.ok) throw new Error(`Fountain RSS returned ${response.status}`);
    return {
      body: await readBoundedText(response, MAX_RSS_BYTES),
      contentType: response.headers.get("Content-Type") ?? "application/rss+xml; charset=utf-8",
    };
  }
}

async function podcastIndexHeaders(env: Env): Promise<Headers> {
  const key = env.PODCAST_INDEX_API_KEY;
  const secret = env.PODCAST_INDEX_API_SECRET;
  if (!key || !secret) throw new Error("Podcast Index credentials are not configured");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${key}${secret}${timestamp}`));
  const authorization = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Headers({
    "User-Agent": "Ostrify/1.0 (https://ostrify.shakespeare.wtf)",
    "X-Auth-Date": timestamp,
    "X-Auth-Key": key,
    Authorization: authorization,
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": status === 200 ? "public, max-age=14400, stale-while-revalidate=3600" : "no-store",
    },
  });
}

function audioShareCorsHeaders(origin?: string): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function audioShareJson(body: unknown, status: number, origin?: string): Response {
  const headers = audioShareCorsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function createShareCode(): string {
  // 128 random bits make the non-atomic KV collision check safe in practice.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function canonicalHttpsOrigin(candidate: string): string | undefined {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function isAllowedAudioShareOrigin(origin: string, env: Env): boolean {
  const actualOrigin = canonicalHttpsOrigin(origin);
  if (!actualOrigin) return false;
  return actualOrigin === "https://ostrify.studio314.us" && (env.AUDIO_SHARE_APP_ORIGINS ?? "").split(",").some(candidate => canonicalHttpsOrigin(candidate.trim()) === actualOrigin);
}

function isSafeShareableHttpsUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (/\.(?:localhost|local|internal|home|lan|test|invalid|example|onion|arpa|nip\.io|sslip\.io|xip\.io|localtest\.me|vcap\.me|lvh\.me|traefik\.me)$/.test(hostname) || hostname === "localhost") return false;
  if (/^\d+(?:\.\d+){0,3}$/.test(hostname) || hostname.includes(":")) return !isPrivateOrReservedAddress(hostname);
  return hostname.length <= 253 && hostname.split(".").every(label => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function isSafeAudioSharePath(value: unknown, env: Env): value is string {
  if (typeof value !== "string" || value.length > AUDIO_SHARE_MAX_PATH_LENGTH) return false;
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    return false;
  }
  if (target.username || target.password || target.hash || !isAllowedAudioShareOrigin(target.origin, env) || target.pathname !== AUDIO_DETAIL_BASE_PATH) return false;
  const track = target.searchParams.get("track");
  const title = target.searchParams.get("title");
  const kind = target.searchParams.get("kind");
  if (!track || track.length > 2048 || !title || title.length > 500 || !["music", "podcast", "audiobook"].includes(kind ?? "")) return false;
  const expectedSource = track.startsWith("wavlake:") ? "wavlake" : track.startsWith("fountain:") ? "fountain" : track.startsWith("podcast-index:") ? "podcast-index" : track.startsWith("librivox:") ? "librivox" : track.startsWith("gutenberg:") ? "gutenberg" : undefined;
  const source = target.searchParams.get("source");
  if (expectedSource && source !== expectedSource) return false;
  if (source && !["wavlake", "fountain", "podcast-index", "librivox", "gutenberg", "tunestr"].includes(source)) return false;
  const isWavlakeId = /^wavlake:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(track);
  const isPodcastIndexId = /^podcast-index:episode:id:\d{1,12}$/.test(track);
  const isFountainId = /^fountain:episode:id:\S{20}$/.test(track);
  const isAudiobookId = /^(?:gutenberg|librivox):[a-z0-9][a-z0-9_-]{0,159}(?::.{1,512})?$/i.test(track);
  const isEventId = /^[0-9a-f]{64}$/i.test(track);
  const tuneStrN94Match = /^tunestr:n94:([0-9a-f]{64})$/i.exec(track);
  const tuneStrCoordinate = /^tunestr:([0-9a-f]{64}):(.+)$/i.exec(track);
  const nostrCoordinate = /^(\d+):([0-9a-f]{64}):(.+)$/.exec(track);
  const fountainRssId = /^fountain-rss:\S{1,512}:\S{1,512}$/.test(track);
  const podcastIndexFallbackId = /^podcast-index:(https:\/\/[^:]+(?::\d+)?\/.*):(\d{1,12}):(.+)$/s.test(track);
  const isTuneStrCoordinate = !!tuneStrCoordinate && /^[^\s]{1,256}$/.test(tuneStrCoordinate[2]);
  const isNostrCoordinate = !!nostrCoordinate && [30311, 31337, 36787, 32123, 30440].includes(Number(nostrCoordinate[1])) && /^[^\s]{1,256}$/.test(nostrCoordinate[3]);
  const eventKind = target.searchParams.get("eventKind");
  const allowedEventKinds = [1, 54, 1063, 1053, 31337, 36787, 32123, 30440, 30311];
  if (isEventId && (!eventKind || !allowedEventKinds.includes(Number(eventKind)))) return false;
  if (eventKind && !allowedEventKinds.includes(Number(eventKind))) return false;
  if (tuneStrN94Match && eventKind !== "1053") return false;
  if (isTuneStrCoordinate && eventKind !== "30311") return false;
  if (isNostrCoordinate && Number(eventKind) !== Number(nostrCoordinate?.[1])) return false;
  const isKnownTrackId = isWavlakeId || isPodcastIndexId || podcastIndexFallbackId || isFountainId || fountainRssId || isAudiobookId || isEventId || tuneStrN94Match || isTuneStrCoordinate || isNostrCoordinate;
  if (!isKnownTrackId) return false;
  if ((podcastIndexFallbackId || fountainRssId) && !target.searchParams.has("url")) return false;
  if (kind === "audiobook" && !/^(?:gutenberg|librivox):/i.test(track) && !target.searchParams.has("url")) return false;
  const mediaUrl = target.searchParams.get("url");
  if (mediaUrl) {
    let safeMediaUrl: URL;
    try { safeMediaUrl = new URL(mediaUrl); } catch { return false; }
    if (!isSafeShareableHttpsUrl(safeMediaUrl.toString())) return false;
  }
  const image = target.searchParams.get("image");
  if (image) {
    let safeImageUrl: URL;
    try { safeImageUrl = new URL(image); } catch { return false; }
    if (!isSafeShareableHttpsUrl(safeImageUrl.toString())) return false;
  }
  return true;
}

async function audioShareRateLimited(request: Request, env: Env): Promise<boolean> {
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  const key = `rate:write:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32)}`;
  const limit = AUDIO_SHARE_RATE_LIMIT;
  const windowSeconds = AUDIO_SHARE_RATE_WINDOW_SECONDS;
  const ttlSeconds = AUDIO_SHARE_RATE_TTL_SECONDS;
  const now = Math.floor(Date.now() / 1000);
  let stored: string | null;
  try {
    stored = await env.AUDIO_SHARE_LINKS.get(key);
  } catch {
    return false;
  }
  let state: { startedAt: number; count: number } | undefined;
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && "startedAt" in parsed && "count" in parsed && typeof parsed.startedAt === "number" && typeof parsed.count === "number") {
        state = { startedAt: parsed.startedAt, count: parsed.count };
      }
    } catch {
      state = undefined;
    }
  }
  if (!state || now - state.startedAt >= windowSeconds || now < state.startedAt) {
    try {
      await env.AUDIO_SHARE_LINKS.put(key, JSON.stringify({ startedAt: now, count: 1 }), { expirationTtl: ttlSeconds });
    } catch {
      return false;
    }
    return false;
  }
  if (state.count >= limit) return true;
  try {
    await env.AUDIO_SHARE_LINKS.put(key, JSON.stringify({ startedAt: state.startedAt, count: state.count + 1 }), { expirationTtl: ttlSeconds });
  } catch {
    return false;
  }
  return false;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");
    const corsOrigin = requestOrigin && isAllowedAudioShareOrigin(requestOrigin, env)
      ? new URL(requestOrigin).origin
      : undefined;

    if (url.pathname === AUDIO_SHARE_PATH) {
      if (request.method === "OPTIONS") {
        const headers = audioShareCorsHeaders(requestOrigin && isAllowedAudioShareOrigin(requestOrigin, env) ? new URL(requestOrigin).origin : undefined);
        return new Response(null, { status: 204, headers });
      }
      if (request.method === "GET" || request.method === "HEAD") return audioShareJson({ available: true }, 200, requestOrigin && isAllowedAudioShareOrigin(requestOrigin, env) ? new URL(requestOrigin).origin : undefined);
      if (request.method !== "POST") return audioShareJson({ error: "Method not allowed" }, 405, requestOrigin && isAllowedAudioShareOrigin(requestOrigin, env) ? new URL(requestOrigin).origin : undefined);
      if (requestOrigin && !isAllowedAudioShareOrigin(requestOrigin, env)) return audioShareJson({ error: "This app origin is not allowed to create short links" }, 403);
      const requestAppOrigin = requestOrigin ? new URL(requestOrigin).origin : url.origin;
      if (!isAllowedAudioShareOrigin(requestAppOrigin, env)) return audioShareJson({ error: "Request must come from the configured app origin" }, 403);
      const responseOrigin = corsOrigin ?? requestAppOrigin;
      if (!(request.headers.get("Content-Type") ?? "").toLowerCase().includes("application/json")) return audioShareJson({ error: "Expected application/json" }, 415, responseOrigin);
      const rawBody = await request.text();
      if (rawBody.length > AUDIO_SHARE_MAX_PATH_LENGTH + 128) return audioShareJson({ error: "Audio detail link is too large" }, 413, responseOrigin);
      let body: unknown;
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        return audioShareJson({ error: "Invalid JSON" }, 400, responseOrigin);
      }
      if (!body || typeof body !== "object" || Array.isArray(body) || !("path" in body) || !isSafeAudioSharePath(body.path, env)) {
        return audioShareJson({ error: "A valid allowlisted Ostrify audio detail URL is required" }, 400, responseOrigin);
      }
      let normalizedPath: URL;
      try {
        normalizedPath = new URL(body.path as string);
      } catch {
        return audioShareJson({ error: "Invalid audio detail URL" }, 400, responseOrigin);
      }
      try {
        if (await audioShareRateLimited(request, env)) {
          const response = audioShareJson({ error: "Too many share links created. Please try again later." }, 429, responseOrigin);
          response.headers.set("Retry-After", String(AUDIO_SHARE_RATE_WINDOW_SECONDS));
          return response;
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const code = createShareCode();
          const key = `link:${code}`;
          if (await env.AUDIO_SHARE_LINKS.get(key)) continue;
          await env.AUDIO_SHARE_LINKS.put(key, normalizedPath.toString(), { expirationTtl: AUDIO_SHARE_TARGET_TTL_SECONDS });
          return audioShareJson({ url: new URL(`${AUDIO_SHARE_PREFIX}${code}`, AUDIO_SHARE_PUBLIC_ORIGIN).toString() }, 201, responseOrigin);
        }
        return audioShareJson({ error: "Could not allocate a share link. Please try again." }, 503, responseOrigin);
      } catch {
        return audioShareJson({ error: "Short links are temporarily unavailable" }, 503, responseOrigin);
      }
    }

    if (url.pathname.startsWith(AUDIO_SHARE_PREFIX)) {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
      const code = url.pathname.slice(AUDIO_SHARE_PREFIX.length);
      if (!AUDIO_SHARE_CODE_RE.test(code)) return new Response("Share link not found", { status: 404 });
      try {
        const target = await env.AUDIO_SHARE_LINKS.get(`link:${code}`);
        if (!target || !isSafeAudioSharePath(target, env)) return new Response("Share link not found", { status: 404 });
        const targetUrl = new URL(target);
        return new Response(null, {
          status: 302,
          headers: {
            Location: targetUrl.toString(),
            "Cache-Control": "public, max-age=300",
            "Referrer-Policy": "no-referrer",
          },
        });
      } catch {
        return new Response("Share link is temporarily unavailable", { status: 503, headers: { "Retry-After": "60" } });
      }
    }

    if (url.pathname.startsWith("/api/podcast-index/")) {
      if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
      const route = url.pathname.slice("/api/podcast-index/".length);
      const allowedRoutes = new Set(["search/byterm", "podcasts/byfeedid", "podcasts/byfeedurl", "podcasts/byguid", "episodes/byfeedid", "episodes/byid", "recent/episodes"]);
      if (!allowedRoutes.has(route)) return jsonResponse({ error: "Unknown Podcast Index endpoint" }, 404);
      if (route === "search/byterm") {
        const term = url.searchParams.get("q")?.trim();
        if (!term || term.length < 2 || term.length > 120) return jsonResponse({ error: "Search term must be between 2 and 120 characters" }, 400);
      }
      if (route === "podcasts/byfeedid" || route === "episodes/byfeedid" || route === "episodes/byid") {
        const id = url.searchParams.get("id");
        if (!id || !/^[0-9]{1,12}$/.test(id)) return jsonResponse({ error: "Valid feed or episode ID required" }, 400);
      }
      if (route === "podcasts/byfeedurl" || route === "episodes/byfeedurl") {
        const feedUrl = url.searchParams.get("url");
        try {
          if (!feedUrl || new URL(feedUrl).protocol !== "https:") return jsonResponse({ error: "Valid HTTPS feed URL required" }, 400);
        } catch {
          return jsonResponse({ error: "Valid HTTPS feed URL required" }, 400);
        }
      }
      if (route === "podcasts/byguid") {
        const guid = url.searchParams.get("guid")?.trim();
        if (!guid || !/^[A-Za-z0-9-]{1,512}$/.test(guid)) return jsonResponse({ error: "Valid podcast GUID required" }, 400);
      }
      if (route === "recent/episodes") {
        const max = Number(url.searchParams.get("max") ?? "20");
        if (!Number.isInteger(max) || max < 1 || max > 50) return jsonResponse({ error: "Episode limit must be between 1 and 50" }, 400);
      }
      try {
        const upstream = new URL(`${PODCAST_INDEX_API}/${route}`);
        if (route === "search/byterm") upstream.searchParams.set("q", url.searchParams.get("q")!.trim());
        else if (route === "podcasts/byfeedid" || route === "episodes/byfeedid" || route === "episodes/byid") upstream.searchParams.set("id", url.searchParams.get("id")!);
        else if (route === "podcasts/byfeedurl" || route === "episodes/byfeedurl") upstream.searchParams.set("url", url.searchParams.get("url")!);
        else if (route === "podcasts/byguid") upstream.searchParams.set("guid", url.searchParams.get("guid")!.trim());
        else upstream.searchParams.set("max", url.searchParams.get("max") ?? "20");
        if (route === "episodes/byfeedid") upstream.searchParams.set("max", "50");
        const headers = await podcastIndexHeaders(env);
        const response = await fetch(upstream, { headers, signal: AbortSignal.timeout(12000) });
        if (!response.ok) return jsonResponse({ error: `Podcast Index returned ${response.status}` }, response.status >= 400 && response.status < 500 ? response.status : 502);
        return jsonResponse(await response.json() as unknown, 200);
      } catch (error) {
        const message = error instanceof Error && error.message.includes("credentials") ? error.message : "Podcast Index is temporarily unavailable";
        return jsonResponse({ error: message }, message.includes("credentials") ? 503 : 502);
      }
    }

    if (url.pathname.startsWith("/api/fountain/children/")) {
      if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
      let showId: string;
      try {
        showId = decodeURIComponent(url.pathname.slice("/api/fountain/children/".length));
      } catch {
        return jsonResponse({ error: "Invalid show ID" }, 400);
      }
      if (!/^show:id:\S{20}$/.test(showId)) return jsonResponse({ error: "Invalid show ID" }, 400);
      try {
        const response = await fetch(`${FOUNTAIN_API}/content/${encodeURIComponent(showId)}/children`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          return jsonResponse({ error: `Fountain returned ${response.status}` }, response.status >= 400 && response.status < 500 ? response.status : 502);
        }
        return jsonResponse(await response.json() as unknown, 200);
      } catch {
        return jsonResponse({ error: "Fountain is temporarily unavailable" }, 502);
      }
    }

    if (url.pathname.startsWith("/api/fountain/content/")) {
      if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
      let contentId: string;
      try {
        contentId = decodeURIComponent(url.pathname.slice(CONTENT_PATH_PREFIX.length));
      } catch {
        return jsonResponse({ error: "Invalid content ID" }, 400);
      }
      if (!CONTENT_ID_RE.test(contentId)) return jsonResponse({ error: "Invalid episode ID" }, 400);
      try {
        const response = await fetch(`${FOUNTAIN_API}/content/${encodeURIComponent(contentId)}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          return jsonResponse({ error: `Fountain returned ${response.status}` }, response.status >= 400 && response.status < 500 ? response.status : 502);
        }
        return jsonResponse(await response.json() as unknown, 200);
      } catch {
        return jsonResponse({ error: "Fountain is temporarily unavailable" }, 502);
      }
    }

    if (url.pathname === "/api/fountain/rss" || url.pathname === "/api/fountain/rss/by-guid") {
      if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
      let feedUrl: URL;
      if (url.pathname === "/api/fountain/rss/by-guid") {
        const guid = url.searchParams.get("guid")?.trim();
        if (!guid || !FOUNTAIN_FEED_GUID_RE.test(guid)) return jsonResponse({ error: "A valid Fountain podcast GUID is required" }, 400);
        try {
          const lookup = await fetch(FOUNTAIN_LOOKUP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: `podcast:guid:${guid}` }),
            signal: AbortSignal.timeout(10000),
          });
          if (!lookup.ok) return jsonResponse({ error: `Fountain lookup returned ${lookup.status}` }, 502);
          const data: unknown = await lookup.json();
          if (!data || typeof data !== "object" || Array.isArray(data)) return jsonResponse({ error: "Invalid Fountain lookup response" }, 502);
          const lookupBody = data as Record<string, unknown>;
          const hits = Array.isArray(lookupBody.hits) ? lookupBody.hits : [];
          const showHit = hits.find((hit): hit is Record<string, unknown> => {
            if (!hit || typeof hit !== "object" || Array.isArray(hit)) return false;
            const candidate = hit as Record<string, unknown>;
            return candidate._type === "SHOW" && typeof candidate._guid === "string" && candidate._guid.toLowerCase() === guid.toLowerCase();
          });
          if (!showHit || !showHit.info || typeof showHit.info !== "object" || Array.isArray(showHit.info)) return jsonResponse({ error: "Fountain could not resolve this podcast GUID" }, 404);
          const rss = (showHit.info as Record<string, unknown>).rss;
          if (typeof rss !== "string" || rss.length > 2048) return jsonResponse({ error: "Fountain show does not have a valid public RSS feed" }, 404);
          feedUrl = new URL(rss);
        } catch (error) {
          if (error instanceof Error && error.message.includes("Invalid URL")) return jsonResponse({ error: "Fountain returned an invalid RSS URL" }, 502);
          return jsonResponse({ error: "Fountain lookup is temporarily unavailable" }, 502);
        }
        if (!isSafePublicRssUrl(feedUrl)) return jsonResponse({ error: "Fountain RSS URL is not a safe public HTTPS URL" }, 502);
      } else {
        const rawFeedUrl = url.searchParams.get("url");
        try {
          if (!rawFeedUrl) return jsonResponse({ error: "An RSS feed URL is required" }, 400);
          feedUrl = new URL(rawFeedUrl);
        } catch {
          return jsonResponse({ error: "Invalid RSS feed URL" }, 400);
        }
        if (!isAllowedFountainRssUrl(feedUrl)) return jsonResponse({ error: "Only public Fountain RSS feeds are supported" }, 400);
      }

      try {
        const fetched = await fetchRssFeed(feedUrl, url.pathname === "/api/fountain/rss/by-guid");
        return new Response(fetched.body, {
          status: 200,
          headers: {
            "Content-Type": fetched.contentType,
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=600, stale-while-revalidate=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (error) {
        const message = error instanceof Error && error.message.includes("too large") ? error.message : "Fountain RSS is unavailable or redirected to an unsafe URL";
        return jsonResponse({ error: message }, message.includes("too large") ? 413 : 502);
      }
    }

    if (url.pathname === "/api/fountain/lookup") {
      if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

      const contentType = request.headers.get("Content-Type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return jsonResponse({ error: "Expected application/json" }, 415);
      }

      const rawBody = await request.text();
      if (rawBody.length > MAX_BODY_LENGTH) return jsonResponse({ error: "Request too large" }, 413);

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return jsonResponse({ error: "Invalid request" }, 400);
      }

      const body = payload as Record<string, unknown>;
      const id = body.id;
      const parent = body.parent;
      const isFeedGuid = typeof id === "string" && /^podcast:guid:\S{1,512}$/.test(id);
      const isItemGuid = typeof id === "string" && /^podcast:item:guid:\S{1,512}$/.test(id);
      if (!isFeedGuid && !isItemGuid) {
        return jsonResponse({ error: "A valid podcast feed or item GUID is required" }, 400);
      }
      if (parent !== undefined && (!isItemGuid || typeof parent !== "string" || !/^podcast:guid:\S{1,512}$/.test(parent))) {
        return jsonResponse({ error: "Invalid podcast feed GUID" }, 400);
      }

      try {
        const response = await fetch(FOUNTAIN_LOOKUP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...(parent ? { parent } : {}) }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          return jsonResponse(
            { error: `Fountain returned ${response.status}` },
            response.status >= 400 && response.status < 500 ? response.status : 502,
          );
        }
        return jsonResponse(await response.json() as unknown, 200);
      } catch {
        return jsonResponse({ error: "Fountain is temporarily unavailable" }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
