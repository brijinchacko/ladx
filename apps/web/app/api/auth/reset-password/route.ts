// POST /api/auth/reset-password — consumes a password-reset token,
// updates the user's password_hash, creates a fresh session.

import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { consumeToken } from "@/lib/auth/tokens";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  uid: z.string().uuid(),
  token: z.string().min(20).max(256),
  password: z.string().min(8).max(256),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const { uid, token, password } = parsed.data;

  const consumed = await consumeToken({
    userId: uid,
    kind: "password_reset",
    plaintext: token,
  });
  if (!consumed) {
    return Response.json({ error: "invalid or expired reset link" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await db().update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, uid));

  const session = await createSession(uid);
  await setSessionCookie(session.id);

  return Response.json({ ok: true });
}
