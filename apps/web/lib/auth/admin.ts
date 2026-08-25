/**
 * The administrator check.
 *
 * One function, used by every admin page and route, because an access rule
 * written twice is a rule that will disagree with itself eventually. It reads
 * the role column rather than a list of addresses in the environment: granting
 * and revoking are then ordinary database facts that survive a deploy, appear
 * in a backup, and can be undone without shipping code.
 *
 * A signed-in reader who is not an administrator gets a 404 rather than a 403.
 * There is nothing to gain from telling somebody that a page exists and they
 * cannot see it, and a 404 is the honest answer to "is there an admin area
 * here" from anybody who has no business knowing.
 */

import { getApiUser, getCurrentUser } from "@/lib/auth/server";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

export function isAdmin(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === "admin";
}

/** For a server component. Redirects a signed-out reader, hides itself from everyone else. */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/studio/admin");
  if (!isAdmin(user)) notFound();
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

/** For a route handler. Same rule, expressed as a response. */
export async function requireAdminApi(): Promise<
  { user: AdminUser } | { error: NextResponse | Response }
> {
  const auth = await getApiUser();
  if ("error" in auth) return { error: auth.error };
  if (!isAdmin(auth.user)) {
    return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  }
  return {
    user: {
      id: auth.user.id,
      email: auth.user.email,
      displayName: auth.user.displayName,
      role: auth.user.role,
    },
  };
}
