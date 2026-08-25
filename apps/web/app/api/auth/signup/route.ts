// POST /api/auth/signup, creates a new user, sets a session cookie.
// Returns { id, email, displayName }.

import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { writeAudit } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/client";
import { welcomeEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { email, password, displayName } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    const [user] = await db()
      .insert(users)
      .values({ email: email.toLowerCase(), passwordHash, displayName })
      .returning({ id: users.id, email: users.email, displayName: users.displayName });

    if (!user) throw new Error("user insert returned no row");

    const session = await createSession(user.id);
    await setSessionCookie(session.id);

    await writeAudit({
      userId: user.id,
      actor: user.email,
      event: "account_created",
      subjectId: user.id,
    });

    // Fire-and-forget welcome email, failures don't block signup.
    const tpl = welcomeEmail({ displayName: user.displayName, appUrl: env.appUrl });
    sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text }).catch(
      (err) => console.error("[signup] welcome email failed:", err),
    );

    return Response.json(user);
  } catch (err) {
    // Drizzle/postgres surfaces unique violations with code "23505".
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return Response.json({ error: "email already registered" }, { status: 409 });
    }
    console.error("[signup] failed:", err);
    return Response.json({ error: "signup failed" }, { status: 500 });
  }
}
