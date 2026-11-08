interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetFetcher;
}

const FOUNTAIN_LOOKUP_URL = "https://api.fountain.fm/v1/search/lookup";
const MAX_BODY_LENGTH = 2048;

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

    if (url.pathname.startsWith("/api/fountain/content/")) {
      if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
      let contentId: string;
      try {
        contentId = decodeURIComponent(url.pathname.slice("/api/fountain/content/".length));
      } catch {
        return jsonResponse({ error: "Invalid content ID" }, 400);
      }
      if (!/^episode:id:\S{20}$/.test(contentId)) return jsonResponse({ error: "Invalid episode ID" }, 400);
      try {
        const response = await fetch(`${FOUNTAIN_LOOKUP_URL.replace("/search/lookup", `/content/${encodeURIComponent(contentId)}`)}`, {
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
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
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
