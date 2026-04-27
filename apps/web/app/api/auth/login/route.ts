// POST /api/auth/login — verifies email+password, sets a session cookie.

import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // Constant-time-ish auth response: we always run a bcrypt verify even on
  // a missing user, against a dummy hash, to avoid a timing channel that
  // leaks whether an email is registered.
  const rows = await db()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  const user = rows[0];
  const dummyHash = "$2b$12$abcdefghijklmnopqrstuv";
  const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);

  if (!user || !ok) {
    return Response.json({ error: "invalid email or password" }, { status: 401 });
  }

  const session = await createSession(user.id);
  await setSessionCookie(session.id);

  return Response.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  });
}
