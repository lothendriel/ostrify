interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
  PODCAST_INDEX_API_KEY?: string;
  PODCAST_INDEX_API_SECRET?: string;
}

const PODCAST_INDEX_API = "https://api.podcastindex.org/api/1.0";
const FOUNTAIN_API = "https://api.fountain.fm/v1";
const FOUNTAIN_LOOKUP_URL = `${FOUNTAIN_API}/search/lookup`;
const CONTENT_ID_RE = /^episode:id:\S{20}$/;
const CONTENT_PATH_PREFIX = "/api/fountain/content/";
const MAX_BODY_LENGTH = 2048;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
