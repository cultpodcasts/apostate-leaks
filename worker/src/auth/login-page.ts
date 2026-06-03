import type { AuthEnv } from "./env.js";
import { ogMetaHeadHtml } from "../og-meta.js";
import { privacyPolicyAnchorHtml } from "./privacy-policy.js";
import { safeReturnTo } from "./return-to.js";

export interface LoginPageState {
  signedIn: boolean;
  returnTo: string;
  signInUrl: string;
}

export function loginPageResponse(env: AuthEnv, returnTo: string): Response {
  const safe = safeReturnTo(returnTo);
  const signIn = new URL("/auth/login", env.AUTH0_BASE_URL);
  signIn.searchParams.set("go", "1");
  signIn.searchParams.set("returnTo", safe);

  const state: LoginPageState = {
    signedIn: false,
    returnTo: safe,
    signInUrl: signIn.toString(),
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sign in — Apostate Leaks</title>
  ${ogMetaHeadHtml(env.AUTH0_BASE_URL)}
  <style>
    body{font-family:system-ui,sans-serif;background:#0f1419;color:#e7ecf3;margin:0;padding:2rem;line-height:1.5}
    main{max-width:28rem;margin:4rem auto;background:#1a2332;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:1.5rem}
    h1{margin:0 0 .75rem;font-size:1.25rem}
    a.btn{display:inline-block;margin-top:1rem;padding:.6rem 1.2rem;background:#2b6cb0;color:#fff;text-decoration:none;border-radius:6px}
    a.btn:hover{background:#2c5282}
    .privacy-link{font-size:.9rem;margin-top:1.25rem}
    .privacy-link a{color:#90cdf4}
  </style>
</head>
<body>
<main>
  <h1>Sign in required</h1>
  <p>This site is restricted. Sign in to continue.</p>
  <p><a class="btn" href="${escapeHtml(state.signInUrl)}">Sign in</a></p>
  <p class="privacy-link">${privacyPolicyAnchorHtml(env.AUTH0_BASE_URL)}</p>
</main>
<script type="application/json" id="auth-state">${escapeHtml(JSON.stringify(state))}</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
