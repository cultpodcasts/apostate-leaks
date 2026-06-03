export interface AuthEnv {
  AUTH0_DOMAIN: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  AUTH0_CALLBACK_URL: string;
  AUTH0_BASE_URL: string;
  REQUIRED_ROLE: string;
  AUTH0_ROLE_CLAIM?: string;
  /** Set to "true" to skip Auth0 (local dev only). */
  AUTH0_DISABLED?: string;
  /** Set to "true" to show JWT/role diagnostics on access denied (turn off in production). */
  AUTH0_DEBUG?: string;
  /** Secret: inbox that receives access-request emails */
  ACCESS_REQUEST_EMAIL?: string;
  /** Secret: sender on a domain onboarded in Cloudflare Email Service */
  ACCESS_REQUEST_FROM?: string;
  /** Public var: optional HTTPS form URL if not using the email button */
  ACCESS_REQUEST_URL?: string;
}

export function isAuthDebug(env: AuthEnv): boolean {
  return env.AUTH0_DEBUG === "true" || env.AUTH0_DEBUG === "1";
}

export function isAuthDisabled(env: AuthEnv): boolean {
  return env.AUTH0_DISABLED === "true" || env.AUTH0_DISABLED === "1";
}

export function authConfigured(env: AuthEnv): boolean {
  return Boolean(
    env.AUTH0_DOMAIN &&
      env.AUTH0_CLIENT_ID &&
      env.AUTH0_CLIENT_SECRET &&
      env.SESSION_SECRET &&
      env.AUTH0_CALLBACK_URL &&
      env.AUTH0_BASE_URL &&
      env.REQUIRED_ROLE,
  );
}

export function roleClaimKey(env: AuthEnv): string {
  return env.AUTH0_ROLE_CLAIM?.trim() || "https://api.cultpodcasts.com/roles";
}
