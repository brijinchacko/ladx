// POST /api/auth/magic-link/request — emails a one-click sign-in link.
// Always returns 200 (avoid user enumeration). The link points at
// /api/auth/magic-link/consume which validates and creates a session.

import { createToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/client";
import { magicLinkEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { z } from "zod";

const TTL_MINUTES = 15;

const schema = z.object({
  email: z.string().email().max(254),
  next: z.string().max(512).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: true });
  const email = parsed.data.email.toLowerCase();
  const next = parsed.data.next ?? "/projects";

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
        kind: "magic_link",
        ttlSeconds: TTL_MINUTES * 60,
      });
      const url = new URL(`${env.appUrl}/api/auth/magic-link/consume`);
      url.searchParams.set("token", issued.plaintext);
      url.searchParams.set("uid", user.id);
      url.searchParams.set("next", next);
      const tpl = magicLinkEmail({ signInUrl: url.toString(), ttlMinutes: TTL_MINUTES });
      await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    } catch (err) {
      console.error("[magic-link] failed:", err);
    }
  }

  return Response.json({ ok: true });
}
