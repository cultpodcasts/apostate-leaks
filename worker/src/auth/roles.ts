import { decodeJwt, type JWTPayload } from "jose";
import { roleClaimKey, type AuthEnv } from "./env.js";

const EXTRA_ROLE_CLAIMS = [
  "https://api.cultpodcasts.com/roles",
  "https://apostateleaks.cultpodcasts.com/roles",
  "roles",
];

export interface RoleExtraction {
  roles: string[];
  byClaim: Record<string, string[]>;
}

export function extractRoles(env: AuthEnv, payload: JWTPayload): RoleExtraction {
  const byClaim: Record<string, string[]> = {};
  const keys = [roleClaimKey(env), ...EXTRA_ROLE_CLAIMS];

  for (const key of keys) {
    const values = readClaim(payload, key);
    if (values.length) byClaim[key] = values;
  }

  const permissions = readClaim(payload, "permissions");
  if (permissions.length) byClaim.permissions = permissions;

  const roles = authRolesFromByClaim(byClaim);
  return { roles, byClaim };
}

/** Role names from role claims only (not Auth0 API permissions). */
export function authRolesFromByClaim(byClaim: Record<string, string[]>): string[] {
  return [
    ...new Set(
      Object.entries(byClaim)
        .filter(([key]) => key !== "permissions")
        .flatMap(([, values]) => values),
    ),
  ];
}

function readClaim(payload: JWTPayload, key: string): string[] {
  const raw = payload[key];
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((r): r is string => typeof r === "string");
  }
  if (typeof raw === "string") return [raw];
  return [];
}

/** Decode without signature check (debug display only). */
export function decodeTokenUnsafe(token: string): JWTPayload | null {
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}

export function mergeRoleExtractions(...parts: RoleExtraction[]): RoleExtraction {
  const byClaim: Record<string, string[]> = {};
  for (const part of parts) {
    for (const [k, v] of Object.entries(part.byClaim)) {
      byClaim[k] = [...new Set([...(byClaim[k] ?? []), ...v])];
    }
  }
  const roles = authRolesFromByClaim(byClaim);
  return { roles, byClaim };
}
