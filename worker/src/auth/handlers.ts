import { serveAsset } from "../assets.js";
import type { JWTPayload } from "jose";
import {
  authorizeUrl,
  exchangeCode,
  hasRequiredRole,
  logoutUrl,
  verifyLoginTokens,
} from "./auth0.js";
import { buildForbiddenHtml, type ForbiddenDebug } from "./debug-page.js";
import {
  accessRequestEmailEnabled,
  sendAccessRequestEmail,
  type EmailSenderBinding,
} from "./send-access-request.js";
import { authConfigured, isAuthDebug, isAuthDisabled, type AuthEnv } from "./env.js";
import { loginPageResponse } from "./login-page.js";
import { privacyPolicyUrl } from "./privacy-policy.js";
import { withNoStore } from "./response.js";
import { homeAssetUrl, isHomeAssetPath, safeReturnTo } from "./return-to.js";
import {
  clearSessionCookie,
  clearStateCookie,
  createSessionCookie,
  createStateCookie,
  readSession,
  readStateCookie,
} from "./session.js";

export interface HandlerEnv extends AuthEnv {
  ASSETS: Fetcher;
  EMAIL?: EmailSenderBinding;
}

export function authMisconfiguredResponse(): Response {
  return new Response(
    "Authentication is enabled but required secrets are missing. Configure Auth0 in Cloudflare Worker secrets (see worker/AUTH0.md).",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export async function handleLogin(request: Request, env: HandlerEnv): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo") || "/");

  if (!isAuthDisabled(env) && authConfigured(env)) {
    const session = await readSession(request, env);
    if (session && hasRequiredRole(session.roles, env.REQUIRED_ROLE)) {
      return serveAuthenticatedReturn(request, env, returnTo);
    }
  }

  if (url.searchParams.get("go") !== "1") {
    return withNoStore(loginPageResponse(env, returnTo));
  }

  const oauthState = crypto.randomUUID();
  const stateCookie = await createStateCookie(env, returnTo, oauthState);
  const headers = oauthStartHeaders(authorizeUrl(env, oauthState));
  headers.append("Set-Cookie", stateCookie);
  return new Response(null, { status: 302, headers });
}

export async function handleCallback(request: Request, env: HandlerEnv): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (error) {
    return htmlResponse(env, 400, "Sign-in failed", escapeHtml(error));
  }

  if (!code || !stateParam) {
    return htmlResponse(env, 400, "Sign-in failed", "Missing authorization code or state.");
  }

  const stored = await readStateCookie(request, env);
  if (!stored || stored.nonce !== stateParam) {
    return htmlResponse(env, 400, "Sign-in failed", "Invalid or expired sign-in state. Try again.");
  }

  try {
    const { idToken, accessToken } = await exchangeCode(env, code);
    const tokens = await verifyLoginTokens(env, idToken, accessToken);

    if (!hasRequiredRole(tokens.roles, env.REQUIRED_ROLE)) {
      const pendingCookie = await createSessionCookie(env, {
        sub: tokens.sub,
        roles: [],
        email: pickTokenEmail(tokens.idClaims),
      });
      const headers = new Headers();
      headers.append("Set-Cookie", pendingCookie);
      headers.append("Set-Cookie", clearStateCookie());
      return forbiddenPage(env, headers, {
        source: "callback",
        sub: tokens.sub,
        email: pickTokenEmail(tokens.idClaims),
        tokens,
      });
    }

    const grantedRole = env.REQUIRED_ROLE?.trim() || "map-viewer";
    const sessionCookie = await createSessionCookie(env, {
      sub: tokens.sub,
      roles: [grantedRole],
    });

    const returnTo = safeReturnTo(stored.returnTo);
    const mapResponse = await serveAuthenticatedReturn(request, env, returnTo);
    const headers = new Headers(mapResponse.headers);
    headers.append("Set-Cookie", sessionCookie);
    headers.append("Set-Cookie", clearStateCookie());
    return new Response(mapResponse.body, { status: mapResponse.status, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return htmlResponse(env, 500, "Sign-in failed", escapeHtml(message));
  }
}

export function handleLogout(env: AuthEnv): Response {
  const destination = isAuthDisabled(env) ? env.AUTH0_BASE_URL || "/" : logoutUrl(env);
  const headers = oauthStartHeaders(destination);
  headers.append("Set-Cookie", clearSessionCookie());
  headers.append("Set-Cookie", clearStateCookie());
  return withNoStore(new Response(null, { status: 302, headers }));
}

export async function requireAuth(
  request: Request,
  env: HandlerEnv,
): Promise<Response | { session: { sub: string; roles: string[] } }> {
  if (isAuthDisabled(env)) {
    return { session: { sub: "dev", roles: [env.REQUIRED_ROLE || "map-viewer"] } };
  }

  if (!authConfigured(env)) {
    return authMisconfiguredResponse();
  }

  const session = await readSession(request, env);
  if (!session) {
    const returnTo = safeReturnTo(new URL(request.url).pathname + new URL(request.url).search);
    if (wantsHtml(request)) {
      return withNoStore(loginPageResponse(env, returnTo));
    }
    return unauthorizedResponse();
  }

  if (!hasRequiredRole(session.roles, env.REQUIRED_ROLE)) {
    return forbiddenPage(env, undefined, {
      source: "session",
      sub: session.sub,
      email: session.email,
      sessionRoles: session.roles,
    });
  }

  return { session };
}

export async function handleRequestAccess(request: Request, env: HandlerEnv): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  if (isAuthDisabled(env)) {
    return jsonResponse(404, { ok: false, error: "Not found" });
  }

  if (!authConfigured(env) || !accessRequestEmailEnabled(env)) {
    return jsonResponse(503, { ok: false, error: "Access requests are not available." });
  }

  const session = await readSession(request, env);
  if (!session?.sub) {
    return jsonResponse(401, { ok: false, error: "Sign in first." });
  }

  if (hasRequiredRole(session.roles, env.REQUIRED_ROLE)) {
    return jsonResponse(400, { ok: false, error: "You already have access." });
  }

  const result = await sendAccessRequestEmail(env, {
    sub: session.sub,
    email: session.email,
  });

  if (!result.ok) {
    return jsonResponse(502, { ok: false, error: result.error });
  }

  return jsonResponse(200, { ok: true });
}

export async function handleAuthSession(request: Request, env: AuthEnv): Promise<Response> {
  if (isAuthDisabled(env)) {
    return sessionJson(true);
  }

  if (!authConfigured(env)) {
    return sessionJson(false);
  }

  const session = await readSession(request, env);
  const signedIn = Boolean(session && hasRequiredRole(session.roles, env.REQUIRED_ROLE));
  return sessionJson(signedIn);
}

function sessionJson(signedIn: boolean): Response {
  return withNoStore(
    new Response(JSON.stringify({ signedIn }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}

export async function handleAuthStatus(request: Request, env: AuthEnv): Promise<Response> {
  if (!isAuthDebug(env)) {
    return new Response("Not found", { status: 404 });
  }

  const session = await readSession(request, env);
  const body = {
    authConfigured: authConfigured(env),
    hasCookieHeader: Boolean(request.headers.get("Cookie")),
    sessionCookiePresent: Boolean(
      request.headers.get("Cookie")?.includes("al_session="),
    ),
    session: session
      ? { sub: session.sub, roles: session.roles, exp: session.exp }
      : null,
    requiredRole: env.REQUIRED_ROLE,
    roleClaim: env.AUTH0_ROLE_CLAIM,
  };

  return withNoStore(
    new Response(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}

function wantsHtml(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (/\.(js|css|json|geojson|png|svg|ico|woff2?)$/i.test(path)) return false;
  return path === "/" || path.endsWith(".html");
}

function unauthorizedResponse(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function forbiddenPage(
  env: AuthEnv,
  extraHeaders?: Headers,
  debug?: ForbiddenDebug,
): Response {
  const html = buildForbiddenHtml(env, debug);
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  if (extraHeaders) {
    for (const [k, v] of extraHeaders) headers.append(k, v);
  }
  return withNoStore(new Response(html, { status: 403, headers }));
}

function htmlResponse(env: AuthEnv, status: number, title: string, body: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${title}</title></head>
<body style="font-family:system-ui;background:#0f1419;color:#e7ecf3;padding:2rem">
<h1>${title}</h1><p>${body}</p><p><a href="/auth/login" style="color:#90cdf4">Try again</a> · <a href="${escapeHtml(privacyPolicyUrl(env.AUTH0_BASE_URL))}" style="color:#90cdf4">Privacy policy</a></p>
</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** Only used when user clicks Sign in (?go=1) — OAuth requires one redirect to Auth0. */
function oauthStartHeaders(location: string): Headers {
  const headers = new Headers({ Location: location });
  headers.set("Cache-Control", "private, no-store, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Vary", "Cookie");
  return headers;
}

async function serveAuthenticatedReturn(
  request: Request,
  env: HandlerEnv,
  returnTo: string,
): Promise<Response> {
  const path = safeReturnTo(returnTo);
  if (isHomeAssetPath(path)) {
    return withNoStore(await serveAsset(request, env.ASSETS, homeAssetUrl(env), env));
  }

  const assetUrl = new URL(path, env.AUTH0_BASE_URL);
  const asset = await serveAsset(request, env.ASSETS, assetUrl, env);
  if (asset.status !== 404) {
    return withNoStore(asset);
  }

  return withNoStore(loginPageResponse(env, "/"));
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return withNoStore(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
}

function pickTokenEmail(claims: JWTPayload | undefined): string | undefined {
  const email = claims?.email;
  return typeof email === "string" ? email : undefined;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
