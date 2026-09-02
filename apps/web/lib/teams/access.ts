import { db } from "@/lib/db/client";
import { workspaceMembers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { cache } from "react";

/**
 * Whose rows this user may see.
 *
 * Every row in the product is owned by the user who made it. A workspace
 * widens the reader, not the owner: the members of every workspace this user
 * belongs to, plus the user. Reads scope by this list with `inArray` where
 * they used to scope by one id with `eq`; writes still stamp the actor, and
 * the audit log still names them.
 *
 * Cached per request, because a page can ask a dozen times and the answer
 * cannot change under it.
 */
export const accessIds = cache(async (userId: string): Promise<string[]> => {
  const mine = await db()
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
  if (mine.length === 0) return [userId];

  const members = await db()
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      inArray(
        workspaceMembers.workspaceId,
        mine.map((m) => m.workspaceId),
      ),
    );
  const ids = new Set<string>([userId, ...members.map((m) => m.userId)]);
  return [...ids];
});
