import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { users, workspaceInvites, workspaceMembers, workspaces } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

export interface TeamView {
  workspace: { id: string; name: string; ownerId: string } | null;
  role: "owner" | "member" | null;
  members: {
    userId: string;
    email: string;
    displayName: string | null;
    role: string;
    joinedAt: Date;
  }[];
  invites: { id: string; email: string; createdAt: Date; expiresAt: Date; token: string | null }[];
}

/** The one workspace a user is in, with its people. One, because that is the model. */
export async function teamFor(userId: string): Promise<TeamView> {
  const [membership] = await db()
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaceMembers.joinedAt))
    .limit(1);
  if (!membership) return { workspace: null, role: null, members: [], invites: [] };

  const w = membership.workspace;
  const [members, invites] = await Promise.all([
    db()
      .select({
        userId: workspaceMembers.userId,
        email: users.email,
        displayName: users.displayName,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, w.id))
      .orderBy(workspaceMembers.joinedAt),
    db()
      .select({
        id: workspaceInvites.id,
        email: workspaceInvites.email,
        createdAt: workspaceInvites.createdAt,
        expiresAt: workspaceInvites.expiresAt,
        token: workspaceInvites.token,
      })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, w.id), isNull(workspaceInvites.acceptedAt)))
      .orderBy(desc(workspaceInvites.createdAt)),
  ]);

  return {
    workspace: { id: w.id, name: w.name, ownerId: w.ownerId },
    role: membership.role === "owner" ? "owner" : "member",
    members,
    invites,
  };
}

export async function createWorkspace(userId: string, name: string): Promise<{ id: string }> {
  const [row] = await db()
    .insert(workspaces)
    .values({ name, ownerId: userId })
    .returning({ id: workspaces.id });
  if (!row) throw new Error("workspace insert returned no row");
  await db().insert(workspaceMembers).values({ workspaceId: row.id, userId, role: "owner" });
  return row;
}

/** Fourteen days: long enough for a colleague on leave, short enough to forget. */
const INVITE_DAYS = 14;

export async function invite(
  workspaceId: string,
  invitedBy: string,
  email: string,
): Promise<{ id: string; token: string }> {
  const token = randomBytes(24).toString("base64url");
  const [row] = await db()
    .insert(workspaceInvites)
    .values({
      workspaceId,
      email: email.trim().toLowerCase(),
      token,
      invitedBy,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    })
    .returning({ id: workspaceInvites.id });
  if (!row) throw new Error("invite insert returned no row");
  return { id: row.id, token };
}

/**
 * Take up an invitation.
 *
 * The link is the credential, but the account has to match the address it
 * was sent to: a forwarded link must not put a stranger in the workspace.
 */
export async function acceptInvite(
  userId: string,
  userEmail: string,
  token: string,
): Promise<{ ok: true; workspaceId: string } | { ok: false; why: string }> {
  const [inv] = await db()
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);
  if (!inv) return { ok: false, why: "This invitation is not valid, or it has been revoked." };
  if (inv.expiresAt < new Date())
    return { ok: false, why: "This invitation has expired. Ask for a new one." };
  if (inv.email !== userEmail.trim().toLowerCase()) {
    return {
      ok: false,
      why: `This invitation was sent to ${inv.email}. Sign in with that address to accept it.`,
    };
  }

  await db()
    .insert(workspaceMembers)
    .values({ workspaceId: inv.workspaceId, userId, role: "member" })
    .onConflictDoNothing();
  await db()
    .update(workspaceInvites)
    .set({ acceptedAt: new Date(), token: null })
    .where(eq(workspaceInvites.id, inv.id));
  return { ok: true, workspaceId: inv.workspaceId };
}
