import { serveAsset } from "../assets.js";
import { hasRequiredRole } from "./auth0.js";
import { authConfigured, isAuthDisabled } from "./env.js";
import { loginPageResponse } from "./login-page.js";
import { withNoStore } from "./response.js";
import { homeAssetUrl } from "./return-to.js";
import { readSession } from "./session.js";
import type { HandlerEnv } from "./handlers.js";

/** Serve `/` as HTML only — map or sign-in page, never a 302. */
export async function handleHome(request: Request, env: HandlerEnv): Promise<Response> {
  if (isAuthDisabled(env)) {
    return withNoStore(await serveAsset(request, env.ASSETS, homeAssetUrl(env), env));
  }

  if (!authConfigured(env)) {
    return new Response(
      "Authentication is enabled but required secrets are missing.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const session = await readSession(request, env);
  if (session && hasRequiredRole(session.roles, env.REQUIRED_ROLE)) {
    const res = await serveAsset(request, env.ASSETS, homeAssetUrl(env), env);
    const headers = new Headers(res.headers);
    headers.set("X-Apostate-Auth", "map");
    return withNoStore(new Response(res.body, { status: res.status, headers }));
  }

  const login = loginPageResponse(env, "/");
  const headers = new Headers(login.headers);
  headers.set("X-Apostate-Auth", "login");
  return withNoStore(new Response(login.body, { status: login.status, headers }));
}
