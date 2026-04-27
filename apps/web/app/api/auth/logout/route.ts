// POST /api/auth/logout — invalidates the current session and clears the
// cookie. Always returns 200 even if no session — logout is idempotent.

import { clearSessionCookie, invalidateSession, readSessionCookie } from "@/lib/auth/session";

export async function POST() {
  const sessionId = await readSessionCookie();
  if (sessionId) {
    await invalidateSession(sessionId).catch(() => {});
  }
  await clearSessionCookie();
  return Response.json({ ok: true });
}
