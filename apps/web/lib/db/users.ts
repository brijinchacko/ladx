// Maps a Clerk user to a row in our `users` table. Called from API routes
// before any per-user write — we don't run a separate Clerk webhook for
// upsert because lazy upsert keeps the dev story simple. If user-row state
// matters more than id (e.g. for billing), revisit and add a webhook.

import { eq } from "drizzle-orm";
import { db } from "./client";
import { type User, users } from "./schema";

export interface ClerkUserShape {
  id: string;
  emailAddresses?: Array<{ emailAddress: string }>;
  firstName?: string | null;
  lastName?: string | null;
}

export async function upsertUserFromClerk(clerk: ClerkUserShape): Promise<User> {
  const email = clerk.emailAddresses?.[0]?.emailAddress;
  if (!email) {
    throw new Error("Clerk user has no email — cannot upsert");
  }

  const displayName = [clerk.firstName, clerk.lastName].filter(Boolean).join(" ") || null;

  const [row] = await db()
    .insert(users)
    .values({
      clerkId: clerk.id,
      email,
      displayName,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { email, displayName, updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error("user upsert returned no row");
  return row;
}

export async function findUserByClerkId(clerkId: string): Promise<User | null> {
  const rows = await db().select().from(users).where(eq(users.clerkId, clerkId)).limit(1);
  return rows[0] ?? null;
}
