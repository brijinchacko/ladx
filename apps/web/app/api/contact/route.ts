// POST /api/contact, the help form.
//
// Delivers by email if Resend is configured, and always writes the message to
// the server log. The log is the point: a contact form that silently drops
// messages when an API key expires is worse than no contact form, because
// nobody finds out until somebody complains twice.

import { sendEmail } from "@/lib/email/client";
import { env } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  topic: z.string().max(120).optional(),
  message: z.string().min(1).max(8000),
  // Not rendered, so a human never fills it. Anything that does is a bot.
  website: z.string().max(0).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  const line = `[contact] ${body.name} <${body.email}>, ${body.topic ?? "no topic"}`;
  console.info(line, JSON.stringify({ message: body.message.slice(0, 4000) }));

  if (env.resendApiKey) {
    try {
      await sendEmail({
        to: "hello@ladx.ai",
        subject: `LADX contact, ${body.topic ?? "message"}, ${body.name}`,
        // Reply goes to the person who wrote in, not to us.
        replyTo: body.email,
        text: `From: ${body.name} <${body.email}>\nTopic: ${body.topic ?? "-"}\n\n${body.message}`,
        // Escaped, because the message is arbitrary text from a stranger and
        // this lands in a mail client that will happily render markup.
        html: `<p><strong>${escapeHtml(body.name)}</strong> &lt;${escapeHtml(body.email)}&gt;<br>
<em>${escapeHtml(body.topic ?? "-")}</em></p>
<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace">${escapeHtml(body.message)}</pre>`,
      });
    } catch (err) {
      // Logged above, so the message is not lost. Telling the sender it failed
      // would make them send it again, which does not help either of us.
      console.error("[contact] email delivery failed:", err);
    }
  }

  return Response.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
