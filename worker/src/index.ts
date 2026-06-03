import { serveAsset } from "./assets.js";
import type { AuthEnv } from "./auth/env.js";
import type { EmailSenderBinding } from "./auth/send-access-request.js";
import { handleHome } from "./auth/home.js";
import {
  handleAuthSession,
  handleAuthStatus,
  handleCallback,
  handleLogin,
  handleLogout,
  handleRequestAccess,
  requireAuth,
} from "./auth/handlers.js";
import { withNoStore } from "./auth/response.js";
import { isMapDataPath, serveMapData } from "./map-data.js";
import { isPublicPreviewPath } from "./og-meta.js";

export interface Env extends AuthEnv {
  ASSETS: Fetcher;
  /** Published map artifacts (not in public git — upload with scripts/upload-map-data.mjs) */
  MAP_DATA?: R2Bucket;
  /** Cloudflare Email Service binding (wrangler.toml [[send_email]]) */
  EMAIL?: EmailSenderBinding;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/auth/login") {
      return withNoStore(await handleLogin(request, env));
    }
    if (url.pathname === "/auth/callback") {
      return withNoStore(await handleCallback(request, env));
    }
    if (url.pathname === "/auth/logout") {
      return withNoStore(handleLogout(env));
    }
    if (url.pathname === "/auth/session") {
      return handleAuthSession(request, env);
    }
    if (url.pathname === "/auth/request-access") {
      return withNoStore(await handleRequestAccess(request, env));
    }
    if (url.pathname === "/auth/status") {
      return handleAuthStatus(request, env);
    }
    if (url.pathname === "/privacy" || url.pathname === "/privacy.html") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/privacy.html";
      return withNoStore(await serveAsset(request, env.ASSETS, assetUrl, env));
    }

    if (url.pathname === "/" || url.pathname === "") {
      return handleHome(request, env);
    }

    if (isPublicPreviewPath(url.pathname)) {
      return withNoStore(await serveAsset(request, env.ASSETS, url, env));
    }

    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) {
      return withNoStore(authResult);
    }

    if (isMapDataPath(url.pathname)) {
      return serveMapData(request, env.MAP_DATA, env.ASSETS, url.pathname);
    }

    return withNoStore(await serveAsset(request, env.ASSETS, url, env));
  },
};
