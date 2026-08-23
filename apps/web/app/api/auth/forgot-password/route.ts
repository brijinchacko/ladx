// POST /api/auth/forgot-password, emails a password-reset link.
// Always returns 200 even on missing email (avoid user enumeration).

import { createToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/client";
import { passwordResetEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { z } from "zod";

const TTL_MINUTES = 60;

const schema = z.object({
  email: z.string().email().max(254),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Still 200 so the response shape is identical to "user not found".
    return Response.json({ ok: true });
  }
  const email = parsed.data.email.toLowerCase();

  const rows = await db()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = rows[0];
  if (user) {
    try {
      const issued = await createToken({
        userId: user.id,
        kind: "password_reset",
        ttlSeconds: TTL_MINUTES * 60,
      });
      const resetUrl = `${env.appUrl}/reset-password?token=${issued.plaintext}&uid=${user.id}`;
      const tpl = passwordResetEmail({ resetUrl, ttlMinutes: TTL_MINUTES });
      await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    } catch (err) {
      console.error("[forgot-password] failed:", err);
      // Swallow, caller still gets the canonical 200.
    }
  }

  return Response.json({ ok: true });
}
