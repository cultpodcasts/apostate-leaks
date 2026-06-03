import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { roleClaimKey, type AuthEnv } from "./env.js";
import { decodeTokenUnsafe, extractRoles, mergeRoleExtractions } from "./roles.js";

export interface LoginTokenDebug {
  sub: string;
  roles: string[];
  roleClaim: string;
  idToken: string;
  accessToken: string;
  idClaims: JWTPayload;
  accessClaims: JWTPayload | null;
  idByClaim: Record<string, string[]>;
  accessByClaim: Record<string, string[]>;
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function jwksFor(env: AuthEnv) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`));
  }
  return jwksCache;
}

async function verifyToken(
  env: AuthEnv,
  token: string,
  label: string,
): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, jwksFor(env), {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_CLIENT_ID,
    });
    return payload;
  } catch (err) {
    const decoded = decodeTokenUnsafe(token);
    if (decoded) return decoded;
    throw new Error(
      `${label} verification failed: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
}

export async function verifyLoginTokens(
  env: AuthEnv,
  idToken: string,
  accessToken: string,
): Promise<LoginTokenDebug> {
  const idClaims = await verifyToken(env, idToken, "ID token");
  let accessClaims: JWTPayload | null = null;
  try {
    accessClaims = await verifyToken(env, accessToken, "Access token");
  } catch {
    accessClaims = decodeTokenUnsafe(accessToken);
  }

  const idPart = extractRoles(env, idClaims);
  const accessPart = accessClaims ? extractRoles(env, accessClaims) : { roles: [], byClaim: {} };
  const merged = mergeRoleExtractions(idPart, accessPart);

  const sub = idClaims.sub ?? accessClaims?.sub ?? "unknown";

  return {
    sub,
    roles: merged.roles,
    roleClaim: roleClaimKey(env),
    idToken,
    accessToken,
    idClaims,
    accessClaims,
    idByClaim: idPart.byClaim,
    accessByClaim: accessPart.byClaim,
  };
}
