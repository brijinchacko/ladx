// Email templates. Inline HTML for now, easy to swap to react-email
// later if/when we want richer composition. Brand tokens (ink, teal)
// are inlined here because most clients ignore <style>.

const INK = "#0F1A24";
const TEAL = "#3FBFB5";
const INK_50 = "#F4F6F8";
const INK_500 = "#475866";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shell(body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${INK_50};font-family:Inter,system-ui,-apple-system,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E4E8EC;">
      <tr><td style="padding:32px 32px 16px;">
        <p style="margin:0;font-weight:600;font-size:18px;color:${INK};letter-spacing:-0.01em;">
          <span style="display:inline-block;width:24px;height:24px;background:${TEAL};border-radius:6px;color:#fff;text-align:center;line-height:24px;font-weight:700;margin-right:8px;vertical-align:middle;">L</span>
          ladX.ai
        </p>
      </td></tr>
      <tr><td style="padding:8px 32px 32px;color:${INK};font-size:15px;line-height:1.5;">
        ${body}
      </td></tr>
      <tr><td style="padding:24px 32px;background:${INK_50};color:${INK_500};font-size:12px;border-top:1px solid #E4E8EC;">
        ladX.ai · Wartens Ltd · You're receiving this because you have an account at ladx.ai.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function ctaButton(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:${TEAL};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;">${escapeHtml(label)}</a>
  </p>`;
}

// ===== welcome =====

export interface WelcomeOpts {
  displayName: string | null;
  appUrl: string;
}

export function welcomeEmail(opts: WelcomeOpts) {
  const greeting = opts.displayName ? `Hi ${escapeHtml(opts.displayName)},` : "Hi,";
  return {
    subject: "Welcome to ladX.ai",
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Welcome to ladX.ai</h2>
      <p>${greeting}</p>
      <p>You're in. Upload an L5X (Rockwell) or PLCopen TC6 .xml project, and chat with it grounded in real routine and tag names.</p>
      ${ctaButton(`${opts.appUrl}/projects`, "Upload your first project")}
      <p style="color:${INK_500};">Reply to this email if anything's broken, humans on this side.</p>
    `),
    text: `Welcome to ladX.ai. Upload your first project at ${opts.appUrl}/projects`,
  };
}

// ===== password reset =====

export interface PasswordResetOpts {
  resetUrl: string;
  ttlMinutes: number;
}

export function passwordResetEmail(opts: PasswordResetOpts) {
  return {
    subject: "Reset your ladX.ai password",
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Reset your password</h2>
      <p>Click the button below to set a new password. The link is valid for ${opts.ttlMinutes} minutes and can only be used once.</p>
      ${ctaButton(opts.resetUrl, "Reset password")}
      <p style="color:${INK_500};font-size:13px;">If you didn't request this, ignore this email, your password is unchanged.</p>
      <p style="color:${INK_500};font-size:13px;word-break:break-all;">Or paste this link: ${escapeHtml(opts.resetUrl)}</p>
    `),
    text: `Reset your ladX.ai password (valid ${opts.ttlMinutes} min): ${opts.resetUrl}`,
  };
}

// ===== magic link =====

export interface MagicLinkOpts {
  signInUrl: string;
  ttlMinutes: number;
}

export function magicLinkEmail(opts: MagicLinkOpts) {
  return {
    subject: "Your ladX.ai sign-in link",
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">Sign in to ladX.ai</h2>
      <p>Click the button below to sign in. The link is valid for ${opts.ttlMinutes} minutes and can only be used once.</p>
      ${ctaButton(opts.signInUrl, "Sign in")}
      <p style="color:${INK_500};font-size:13px;">If you didn't request this, ignore this email.</p>
      <p style="color:${INK_500};font-size:13px;word-break:break-all;">Or paste this link: ${escapeHtml(opts.signInUrl)}</p>
    `),
    text: `Sign in to ladX.ai (valid ${opts.ttlMinutes} min): ${opts.signInUrl}`,
  };
}

// ===== chat transcript =====

export interface TranscriptOpts {
  projectName: string | null;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  appUrl: string;
}

export function transcriptEmail(opts: TranscriptOpts) {
  const subject = opts.projectName
    ? `ladX chat transcript, ${opts.projectName}`
    : "Your ladX chat transcript";

  const body = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const who = m.role === "user" ? "You" : "ladX";
      const tone = m.role === "user" ? INK : TEAL;
      return `<div style="margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:12px;color:${INK_500};text-transform:uppercase;letter-spacing:0.05em;">
          <span style="color:${tone};">${who}</span>
        </p>
        <pre style="margin:0;padding:12px;background:${INK_50};border:1px solid #E4E8EC;border-radius:6px;white-space:pre-wrap;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:${INK};">${escapeHtml(m.content)}</pre>
      </div>`;
    })
    .join("");

  return {
    subject,
    html: shell(`
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(subject)}</h2>
      ${body}
      <p style="margin-top:24px;color:${INK_500};">
        <a href="${opts.appUrl}" style="color:${TEAL};">Continue this conversation in ladX</a>
      </p>
    `),
    text: opts.messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "You" : "ladX"}:\n${m.content}\n`)
      .join("\n"),
  };
}
