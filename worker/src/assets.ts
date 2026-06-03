import type { AuthEnv } from "./env.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

function extname(pathname: string): string {
  const i = pathname.lastIndexOf(".");
  return i >= 0 ? pathname.slice(i).toLowerCase() : "";
}

function securityHeaders(auth0Domain?: string): HeadersInit {
  const connectSrc = ["'self'", "https://tile.openstreetmap.org"];
  if (auth0Domain) {
    connectSrc.push(`https://${auth0Domain}`);
  }

  return {
    "X-Content-Type-Options": "nosniff",
    // OSM tile servers require a Referer (see osm.wiki/Blocked). Origin is sent, not full URLs.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "interest-cohort=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com 'unsafe-inline'",
      "style-src 'self' https://unpkg.com 'unsafe-inline'",
      "img-src 'self' data: blob: https://tile.openstreetmap.org",
      `connect-src ${connectSrc.join(" ")}`,
      "font-src 'self' https://unpkg.com",
      "worker-src blob:",
    ].join("; "),
  };
}

/** Follow asset 307s internally (e.g. /index.html → /) — never forward them to the browser. */
async function fetchAsset(
  assets: Fetcher,
  request: Request,
  origin: string,
  pathname: string,
  visited = new Set<string>(),
): Promise<Response> {
  const path = pathname === "" ? "/" : pathname;
  if (visited.has(path)) {
    return new Response("Not found", { status: 404 });
  }
  visited.add(path);

  const asset = await assets.fetch(new Request(new URL(path, origin), request));

  if (asset.status >= 300 && asset.status < 400) {
    const location = asset.headers.get("Location");
    if (location) {
      const next = new URL(location, origin).pathname || "/";
      return fetchAsset(assets, request, origin, next, visited);
    }
  }

  return asset;
}

export async function serveAsset(
  request: Request,
  assets: Fetcher,
  url: URL,
  env?: AuthEnv,
): Promise<Response> {
  const pathname = url.pathname === "" ? "/" : url.pathname;
  const asset = await fetchAsset(assets, request, url.origin, pathname);

  if (asset.status === 404) {
    return new Response("Not found", { status: 404 });
  }

  if (asset.status >= 300 && asset.status < 400) {
    return new Response("Asset routing error", { status: 502 });
  }

  const headers = new Headers(asset.headers);
  headers.delete("Location");
  const ext = extname(pathname === "/" ? "/index.html" : pathname);
  if (MIME[ext]) headers.set("Content-Type", MIME[ext]);

  const auth0Domain =
    env && env.AUTH0_DISABLED !== "true" && env.AUTH0_DISABLED !== "1"
      ? env.AUTH0_DOMAIN
      : undefined;

  for (const [k, v] of Object.entries(securityHeaders(auth0Domain))) {
    headers.set(k, v);
  }
  headers.set("Cache-Control", "private, no-store");

  return new Response(asset.body, { status: asset.status, headers });
}
