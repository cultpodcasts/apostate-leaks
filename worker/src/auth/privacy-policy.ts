/** Public privacy policy path (no sign-in required). */
export const PRIVACY_POLICY_PATH = "/privacy";

export function privacyPolicyUrl(baseUrl: string): string {
  return new URL(PRIVACY_POLICY_PATH, baseUrl).toString();
}

export function privacyPolicyAnchorHtml(baseUrl: string): string {
  const href = escapeHtml(privacyPolicyUrl(baseUrl));
  return `<a href="${href}">Privacy policy</a>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
