// Resend client wrapper. Lazy-instantiated so the app boots without a
// RESEND_API_KEY (sends no-op-log instead). Production should ALWAYS set
// the key — the no-op path exists for dev convenience and CI builds.

import { Resend } from "resend";
import { env } from "../env";

let cached: Resend | null = null;

function client(): Resend | null {
  if (cached) return cached;
  if (!env.resendApiKey) return null;
  cached = new Resend(env.resendApiKey);
  return cached;
}

export interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(
  opts: SendEmailOpts,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = client();
  if (!c) {
    console.warn("[email] RESEND_API_KEY not set — would have sent:", opts.subject, "to", opts.to);
    return { ok: true, id: "dev-no-op" };
  }

  const res = await c.emails.send({
    from: env.fromEmail,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
  });

  if (res.error) {
    console.error("[email] resend error:", res.error);
    return { ok: false, error: res.error.message };
  }

  console.log(`[email] sent "${opts.subject}" to ${opts.to} (id=${res.data?.id})`);
  return { ok: true, id: res.data?.id };
}
