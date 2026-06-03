import { accessDeniedStyles, buildAccessRequestSection } from "./access-request.js";
import type { AuthEnv } from "./env.js";
import { isAuthDebug } from "./env.js";
import { privacyPolicyAnchorHtml } from "./privacy-policy.js";
import type { LoginTokenDebug } from "./tokens.js";

export interface ForbiddenDebug {
  source: "callback" | "session";
  sub?: string;
  email?: string;
  sessionRoles?: string[];
  tokens?: LoginTokenDebug;
}

export function buildForbiddenHtml(env: AuthEnv, debug?: ForbiddenDebug): string {
  const logout = new URL("/auth/logout", env.AUTH0_BASE_URL).toString();
  const debugBlock = isAuthDebug(env) ? renderDebug(env, debug) : "";

  const identity = {
    sub: debug?.sub ?? debug?.tokens?.sub,
    email: pickEmail(debug),
  };

  const requestBlock = buildAccessRequestSection(env, identity);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Access denied</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f1419;color:#e7ecf3;margin:0;padding:2rem;line-height:1.5}
  main{max-width:42rem;margin:2rem auto;background:#1a2332;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:1.5rem}
  h1{margin:0 0 .75rem;font-size:1.25rem}
  h2{margin:1.5rem 0 .5rem;font-size:1rem;color:#90cdf4}
  a{color:#90cdf4}
  code,pre{font-family:ui-monospace,monospace;font-size:.8rem}
  code{background:rgba(0,0,0,.3);padding:.1rem .35rem;border-radius:4px}
  pre{background:rgba(0,0,0,.35);padding:.75rem;border-radius:6px;overflow:auto;max-height:16rem;white-space:pre-wrap;word-break:break-all}
  textarea{width:100%;min-height:6rem;background:rgba(0,0,0,.35);color:#e7ecf3;border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:.5rem;font-family:ui-monospace,monospace;font-size:.7rem}
  .warn{color:#fbd38d;font-size:.9rem}
  ul{margin:.25rem 0;padding-left:1.25rem}
  .access-footer{font-size:.9rem;margin-top:1.25rem}
  ${accessDeniedStyles()}
</style>
</head>
<body>
<main>
  <h1>Access denied</h1>
  <p>You do not have access to this site.</p>
  ${requestBlock}
  <p class="access-footer">${privacyPolicyAnchorHtml(env.AUTH0_BASE_URL)} · <a href="${escapeHtml(logout)}">Sign out</a></p>
  ${debugBlock}
</main>
</body>
</html>`;
}

function pickEmail(debug?: ForbiddenDebug): string | undefined {
  if (debug?.email) return debug.email;
  const claims = debug?.tokens?.idClaims ?? debug?.tokens?.accessClaims;
  const email = claims?.email;
  return typeof email === "string" ? email : undefined;
}

function renderDebug(env: AuthEnv, debug?: ForbiddenDebug): string {
  const claim = escapeHtml(env.AUTH0_ROLE_CLAIM || "https://api.cultpodcasts.com/roles");
  const required = escapeHtml(env.REQUIRED_ROLE);

  let body = `
  <h2>Auth debug (non-production)</h2>
  <p class="warn">Set <code>AUTH0_DEBUG=false</code> before going to production. Do not share this page publicly.</p>
  <p><strong>Required role:</strong> <code>${required}</code><br/>
  <strong>Role claim key:</strong> <code>${claim}</code><br/>
  <strong>Check source:</strong> ${escapeHtml(debug?.source ?? "unknown")}</p>`;

  if (debug?.sessionRoles) {
    body += `<p><strong>Roles in session cookie:</strong> ${listOrEmpty(debug.sessionRoles)}</p>`;
  }
  if (debug?.sub) {
    body += `<p><strong>Subject (sub):</strong> <code>${escapeHtml(debug.sub)}</code></p>`;
  }

  const t = debug?.tokens;
  if (t) {
    body += `
  <p><strong>Roles merged from tokens:</strong> ${listOrEmpty(t.roles)}</p>
  <p><strong>Roles by claim (ID token):</strong></p>
  <pre>${escapeHtml(JSON.stringify(t.idByClaim, null, 2))}</pre>
  <p><strong>Roles by claim (access token):</strong></p>
  <pre>${escapeHtml(JSON.stringify(t.accessByClaim, null, 2))}</pre>
  <p><strong>ID token claims (decoded):</strong></p>
  <pre>${escapeHtml(JSON.stringify(t.idClaims, null, 2))}</pre>
  <p><strong>Access token claims (decoded):</strong></p>
  <pre>${escapeHtml(JSON.stringify(t.accessClaims ?? {}, null, 2))}</pre>
  <p><strong>Raw ID token (JWT):</strong></p>
  <textarea readonly>${escapeHtml(t.idToken)}</textarea>
  <p><strong>Raw access token (JWT):</strong></p>
  <textarea readonly>${escapeHtml(t.accessToken)}</textarea>
  <p class="warn">If <code>roles</code> is empty above, add a Post-Login Action that sets
  <code>api.idToken.setCustomClaim('${claim}', event.authorization.roles)</code>
  and enable RBAC + &quot;Add Permissions in the Access Token&quot; for the API if you use permissions.</p>`;
  } else if (debug?.source === "session") {
    body += `<p class="warn">Session lacked the role at page load. Sign out and sign in again to refresh token debug on this page.</p>`;
  }

  return body;
}

function listOrEmpty(arr: string[]): string {
  if (!arr.length) return "<em>(none)</em>";
  return `<ul>${arr.map((r) => `<li><code>${escapeHtml(r)}</code></li>`).join("")}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
