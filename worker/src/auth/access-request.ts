import type { AuthEnv } from "./env.js";
import { accessRequestEmailEnabled } from "./send-access-request.js";

export interface AccessRequestIdentity {
  sub?: string;
  email?: string;
}

export function buildAccessRequestSection(
  env: AuthEnv,
  identity: AccessRequestIdentity,
): string {
  if (accessRequestEmailEnabled(env)) {
    return buildSendButtonSection(identity);
  }

  const href = accessRequestHref(env, identity);
  if (!href) {
    return `<p>If you believe you should have access, contact the site administrator.</p>`;
  }

  return buildMailtoSection(identity, href);
}

function buildSendButtonSection(identity: AccessRequestIdentity): string {
  const idNote = identity.sub
    ? `<p class="access-id">Reference: <code>${escapeHtml(identity.sub)}</code>${identity.email ? ` · ${escapeHtml(identity.email)}` : ""}</p>`
    : "";

  return `${idNote}
  <p><button type="button" class="btn" id="request-access-btn">Request access</button></p>
  <p id="request-access-status" class="access-status" role="status" aria-live="polite"></p>
  <script>
  (function () {
    var btn = document.getElementById("request-access-btn");
    var status = document.getElementById("request-access-status");
    if (!btn || !status) return;
    btn.addEventListener("click", function () {
      btn.disabled = true;
      status.textContent = "Sending…";
      fetch("/auth/request-access", { method: "POST", credentials: "same-origin" })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok && res.d && res.d.ok) {
            status.textContent = "Request sent. We will be in touch if access is approved.";
            return;
          }
          status.textContent = (res.d && res.d.error) ? res.d.error : "Could not send request. Try again later.";
          btn.disabled = false;
        })
        .catch(function () {
          status.textContent = "Could not send request. Try again later.";
          btn.disabled = false;
        });
    });
  })();
  </script>`;
}

function buildMailtoSection(identity: AccessRequestIdentity, href: string): string {
  const idNote = identity.sub
    ? `<p class="access-id">Reference: <code>${escapeHtml(identity.sub)}</code>${identity.email ? ` · ${escapeHtml(identity.email)}` : ""}</p>`
    : "";

  return `${idNote}
  <p><a class="btn" href="${escapeHtml(href)}">Request access</a></p>
  <p class="access-hint">Include the reference above if you contact us another way.</p>`;
}

function accessRequestHref(env: AuthEnv, identity: AccessRequestIdentity): string | null {
  const custom = env.ACCESS_REQUEST_URL?.trim();
  if (custom) {
    return appendIdentityToUrl(custom, identity);
  }

  return null;
}

function appendIdentityToUrl(base: string, identity: AccessRequestIdentity): string {
  try {
    const url = new URL(base);
    if (identity.sub) url.searchParams.set("sub", identity.sub);
    if (identity.email) url.searchParams.set("email", identity.email);
    return url.toString();
  } catch {
    return base;
  }
}

export function accessDeniedStyles(): string {
  return `
  .btn,button.btn{display:inline-block;margin-top:.5rem;padding:.6rem 1.2rem;background:#2b6cb0;color:#fff;text-decoration:none;border-radius:6px;border:none;font:inherit;cursor:pointer}
  a.btn:hover,button.btn:hover:not(:disabled){background:#2c5282}
  button.btn:disabled{opacity:.6;cursor:not-allowed}
  .access-id,.access-hint,.access-status{font-size:.9rem;opacity:.9}
  .access-hint,.access-status{margin-top:1rem}
  .access-status.ok{color:#9ae6b4}
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
