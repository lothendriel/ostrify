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
      const allowedRoutes = new Set(["search/byterm", "podcasts/byfeedid", "episodes/byfeedid", "recent/episodes"]);
      if (!allowedRoutes.has(route)) return jsonResponse({ error: "Unknown Podcast Index endpoint" }, 404);
      if (route === "search/byterm") {
        const term = url.searchParams.get("q")?.trim();
        if (!term || term.length < 2 || term.length > 120) return jsonResponse({ error: "Search term must be between 2 and 120 characters" }, 400);
      }
      if (route === "podcasts/byfeedid" || route === "episodes/byfeedid") {
        const id = url.searchParams.get("id");
        if (!id || !/^[0-9]{1,12}$/.test(id)) return jsonResponse({ error: "Valid feed ID required" }, 400);
      }
      if (route === "recent/episodes") {
        const max = Number(url.searchParams.get("max") ?? "20");
        if (!Number.isInteger(max) || max < 1 || max > 50) return jsonResponse({ error: "Episode limit must be between 1 and 50" }, 400);
      }
      try {
        const upstream = new URL(`${PODCAST_INDEX_API}/${route}`);
        if (route === "search/byterm") upstream.searchParams.set("q", url.searchParams.get("q")!.trim());
        else if (route === "podcasts/byfeedid" || route === "episodes/byfeedid") upstream.searchParams.set("id", url.searchParams.get("id")!);
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
      if (typeof id !== "string" || !/^podcast:item:guid:\S{1,512}$/.test(id)) {
        return jsonResponse({ error: "A valid podcast item GUID is required" }, 400);
      }
      if (parent !== undefined && (typeof parent !== "string" || !/^podcast:guid:\S{1,512}$/.test(parent))) {
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
