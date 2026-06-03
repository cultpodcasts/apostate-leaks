import { SignJWT, jwtVerify } from "jose";
import { b64UrlDecode, b64UrlEncode, sign, verify } from "./crypto.js";
import type { AuthEnv } from "./env.js";

const SESSION_COOKIE = "al_session";
const STATE_COOKIE = "al_oauth_state";
const SESSION_DAYS = 7;

export interface SessionPayload {
  sub: string;
  roles: string[];
  exp: number;
  email?: string;
}

export function sessionCookieName(): string {
  return SESSION_COOKIE;
}

export function stateCookieName(): string {
  return STATE_COOKIE;
}

function sessionSecret(env: AuthEnv): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET.trim());
}

function cookieAttrs(maxAgeSec: number): string {
  return `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export async function createSessionCookie(
  env: AuthEnv,
  payload: Omit<SessionPayload, "exp">,
): Promise<string> {
  const claims: { roles: string[]; email?: string } = { roles: payload.roles };
  if (payload.email) claims.email = payload.email;

  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret(env));

  return `${SESSION_COOKIE}=${jwt}; ${cookieAttrs(SESSION_DAYS * 86400)}`;
}

export async function readSession(
  request: Request,
  env: AuthEnv,
): Promise<SessionPayload | null> {
  for (const raw of getAllCookies(request, SESSION_COOKIE)) {
    const payload = await parseSessionValue(env, raw);
    if (payload) return payload;
  }
  return null;
}

async function parseSessionValue(env: AuthEnv, raw: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(raw, sessionSecret(env));
    const sub = payload.sub;
    const roles = payload.roles;
    const exp = payload.exp;
    if (!sub || !Array.isArray(roles) || typeof exp !== "number") return null;
    if (!roles.every((r) => typeof r === "string")) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { sub, roles, exp, email };
  } catch {
    return parseLegacySessionValue(env, raw);
  }
}

/** Previous HMAC cookie format (pre-JWT); ignore invalid values. */
async function parseLegacySessionValue(env: AuthEnv, raw: string): Promise<SessionPayload | null> {
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;

  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!(await verify(env.SESSION_SECRET.trim(), encoded, sig))) return null;

  try {
    const json = new TextDecoder().decode(b64UrlDecode(encoded));
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.sub || !Array.isArray(payload.roles) || !payload.exp) return null;
    if (!payload.roles.every((r) => typeof r === "string")) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${cookieAttrs(0)}`;
}

export interface OAuthState {
  nonce: string;
  returnTo: string;
}

export async function createStateCookie(
  env: AuthEnv,
  returnTo: string,
  nonce: string,
): Promise<string> {
  const state: OAuthState = { nonce, returnTo };
  const encoded = b64UrlEncode(new TextEncoder().encode(JSON.stringify(state)));
  const sig = await sign(env.SESSION_SECRET.trim(), encoded);
  const value = `${encoded}.${sig}`;
  return `${STATE_COOKIE}=${value}; ${cookieAttrs(600)}`;
}

export async function readStateCookie(request: Request, env: AuthEnv): Promise<OAuthState | null> {
  const raw = getCookie(request, STATE_COOKIE);
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;

  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!(await verify(env.SESSION_SECRET.trim(), encoded, sig))) return null;

  try {
    const json = new TextDecoder().decode(b64UrlDecode(encoded));
    return JSON.parse(json) as OAuthState;
  } catch {
    return null;
  }
}

export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; ${cookieAttrs(0)}`;
}

function getCookie(request: Request, name: string): string | null {
  const all = getAllCookies(request, name);
  return all[0] ?? null;
}

function getAllCookies(request: Request, name: string): string[] {
  const header = request.headers.get("Cookie");
  if (!header) return [];
  const values: string[] = [];
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) values.push(rest.join("="));
  }
  return values;
}
