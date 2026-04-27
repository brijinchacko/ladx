// Server-only auth helpers used by API routes and server components.
// `getCurrentUser` returns the user or null; `requireUser` returns the
// user or throws a 401-shaped error. Cookies are read from
// `next/headers` so this can run in Route Handlers and Server Components.

import { redirect } from "next/navigation";
import type { User } from "../db/schema";
import { readSessionAndUser, readSessionCookie } from "./session";

export async function getCurrentUser(): Promise<User | null> {
  const sessionId = await readSessionCookie();
  if (!sessionId) return null;
  const result = await readSessionAndUser(sessionId);
  return result?.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }
  return user;
}

/** API-route variant: returns the user or a 401 Response. */
export async function getApiUser(): Promise<{ user: User } | { error: Response }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: new Response("Unauthorized", { status: 401 }) };
  }
  return { user };
}
