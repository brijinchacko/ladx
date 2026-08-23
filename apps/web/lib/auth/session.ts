// Session management. The cookie holds the random session id; the row
// holds the user binding + expiry. Validation prunes expired rows on
// access. No JWTs, no per-request bcrypt, just a uuid lookup.

import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "../db/client";
import { type Session, type User, sessions, users } from "../db/schema";
import { SESSION_COOKIE } from "./cookie";

export { SESSION_COOKIE } from "./cookie";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(userId: string): Promise<Session> {
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const [row] = await db().insert(sessions).values({ userId, expiresAt }).returning();
  if (!row) throw new Error("session insert returned no row");
  return row;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Look up the session row + the joined user. Returns null if cookie is
 * missing, the row is gone, or the row has expired (and prunes it).
 */
export async function readSessionAndUser(
  sessionId: string,
): Promise<{ session: Session; user: User } | null> {
  const rows = await db()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.session.expiresAt.getTime() < Date.now()) {
    await invalidateSession(row.session.id);
    return null;
  }

  return row;
}

export async function pruneExpiredSessions(): Promise<void> {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_LIFETIME_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
