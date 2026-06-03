import type { AuthEnv } from "./env.js";

/** Cloudflare Email Service Workers binding. */
export interface EmailSenderBinding {
  send(message: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId?: string }>;
}

export type AccessRequestEnv = AuthEnv & {
  EMAIL?: EmailSenderBinding;
};

export interface AccessRequestSender {
  sub: string;
  email?: string;
}

export function accessRequestEmailEnabled(env: AccessRequestEnv): boolean {
  return Boolean(
    env.EMAIL && env.ACCESS_REQUEST_EMAIL?.trim() && env.ACCESS_REQUEST_FROM?.trim(),
  );
}

export async function sendAccessRequestEmail(
  env: AccessRequestEnv,
  identity: AccessRequestSender,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = env.EMAIL;
  const to = env.ACCESS_REQUEST_EMAIL?.trim();
  const from = env.ACCESS_REQUEST_FROM?.trim();
  if (!email || !to || !from) {
    return { ok: false, error: "Access request email is not configured." };
  }

  const when = new Date().toISOString();
  const lines = [
    "Someone requested access to the Apostate Leaks map.",
    "",
    `User ID: ${identity.sub}`,
    identity.email ? `Email: ${identity.email}` : "Email: (not in token)",
    `Time (UTC): ${when}`,
    "",
    "Assign access in Auth0 when appropriate.",
  ];

  try {
    await email.send({
      from,
      to,
      subject: "Apostate Leaks — access request",
      text: lines.join("\n"),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return { ok: false, error: message };
  }
}
