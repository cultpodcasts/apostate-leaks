import { withNoStore } from "./auth/response.js";

const MAP_DATA_PATHS = new Set(["/data/cells.geojson", "/data/meta.json"]);

const MIME: Record<string, string> = {
  ".geojson": "application/geo+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export function isMapDataPath(pathname: string): boolean {
  return MAP_DATA_PATHS.has(pathname);
}

/** R2 object keys match asset paths without leading slash. */
function r2Key(pathname: string): string {
  return pathname.replace(/^\//, "");
}

export async function serveMapData(
  request: Request,
  r2: R2Bucket | undefined,
  assets: Fetcher,
  pathname: string,
): Promise<Response> {
  const key = r2Key(pathname);
  const ext = pathname.slice(pathname.lastIndexOf("."));

  if (r2) {
    const object = await r2.get(key);
    if (object) {
      const headers = new Headers();
      if (MIME[ext]) headers.set("Content-Type", MIME[ext]);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return withNoStore(new Response(object.body, { status: 200, headers }));
    }
  }

  // Local dev: gitignored files under public/data/ via ASSETS binding
  const asset = await assets.fetch(new Request(new URL(pathname, request.url), request));
  if (asset.status === 404) {
    return withNoStore(new Response("Map data not published", { status: 404 }));
  }

  const headers = new Headers(asset.headers);
  if (MIME[ext]) headers.set("Content-Type", MIME[ext]);
  headers.set("Cache-Control", "private, no-store");
  return withNoStore(new Response(asset.body, { status: asset.status, headers }));
}
