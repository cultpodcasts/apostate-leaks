import type { AuthEnv } from "./env.js";
import { verifyLoginTokens } from "./tokens.js";

export { verifyLoginTokens };

export function authorizeUrl(env: AuthEnv, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.AUTH0_CLIENT_ID,
    redirect_uri: env.AUTH0_CALLBACK_URL,
    scope: "openid profile email",
    state,
  });
  return `https://${env.AUTH0_DOMAIN}/authorize?${params}`;
}

export function logoutUrl(env: AuthEnv): string {
  const params = new URLSearchParams({
    client_id: env.AUTH0_CLIENT_ID,
    returnTo: env.AUTH0_BASE_URL,
  });
  return `https://${env.AUTH0_DOMAIN}/v2/logout?${params}`;
}

export async function exchangeCode(
  env: AuthEnv,
  code: string,
): Promise<{ idToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.AUTH0_CLIENT_ID,
    client_secret: env.AUTH0_CLIENT_SECRET,
    code,
    redirect_uri: env.AUTH0_CALLBACK_URL,
  });

  const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth0 token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { id_token?: string; access_token?: string };
  if (!data.id_token || !data.access_token) {
    throw new Error("Auth0 token response missing id_token or access_token");
  }

  return { idToken: data.id_token, accessToken: data.access_token };
}

export function hasRequiredRole(roles: string[], required: string | undefined): boolean {
  const need = required?.trim();
  if (!need) return false;
  return roles.some((r) => r.trim() === need);
}
