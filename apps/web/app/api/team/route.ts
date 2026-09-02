// GET    /api/team                       the workspace, its members and open invitations
// POST   /api/team   { name }            make one (only if the user is in none)
// PATCH  /api/team   { name }            rename (owner)
// POST   /api/team   { invite: email }   invite by email (owner); returns the link
// DELETE /api/team   { inviteId } | { memberId }   revoke an invitation, or remove a member (owner)

import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { workspaceInvites, workspaceMembers, workspaces } from "@/lib/db/schema";
import { createWorkspace, invite, teamFor } from "@/lib/teams/queries";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const postSchema = z.union([
  z.object({ name: z.string().trim().min(1).max(120) }),
  z.object({ invite: z.string().trim().email().max(200) }),
]);
const patchSchema = z.object({ name: z.string().trim().min(1).max(120) });
const deleteSchema = z.union([
  z.object({ inviteId: z.string().uuid() }),
  z.object({ memberId: z.string().uuid() }),
]);

export async function GET() {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const team = await teamFor(auth.user.id);
  return NextResponse.json({
    ...team,
    // The token is the credential; only the owner sees the link, and only
    // while it is open.
    invites:
      team.role === "owner" ? team.invites : team.invites.map((i) => ({ ...i, token: null })),
  });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const team = await teamFor(auth.user.id);
  const body = parsed.data;

  if ("name" in body) {
    if (team.workspace) {
      return NextResponse.json({ error: "you are already in a workspace" }, { status: 409 });
    }
    const { id } = await createWorkspace(auth.user.id, body.name);
    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "workspace_created",
      subjectId: id,
    });
    return NextResponse.json({ id }, { status: 201 });
  }

  if (!team.workspace || team.role !== "owner") {
    return NextResponse.json({ error: "only the owner can invite" }, { status: 403 });
  }
  if (team.members.some((m) => m.email.toLowerCase() === body.invite.toLowerCase())) {
    return NextResponse.json({ error: "already a member" }, { status: 409 });
  }
  const { id, token } = await invite(team.workspace.id, auth.user.id, body.invite);
  auditInBackground({
    userId: auth.user.id,
    actor: auth.user.email,
    event: "workspace_invited",
    subjectId: team.workspace.id,
    payload: { inviteId: id },
  });
  return NextResponse.json({ id, token }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const team = await teamFor(auth.user.id);
  if (!team.workspace || team.role !== "owner") {
    return NextResponse.json({ error: "only the owner can rename" }, { status: 403 });
  }
  await db()
    .update(workspaces)
    .set({ name: parsed.data.name })
    .where(eq(workspaces.id, team.workspace.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const team = await teamFor(auth.user.id);
  if (!team.workspace) return NextResponse.json({ error: "no workspace" }, { status: 404 });

  if ("inviteId" in parsed.data) {
    if (team.role !== "owner")
      return NextResponse.json({ error: "only the owner can revoke" }, { status: 403 });
    await db()
      .delete(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.id, parsed.data.inviteId),
          eq(workspaceInvites.workspaceId, team.workspace.id),
        ),
      );
    return NextResponse.json({ ok: true });
  }

  // A member may leave; the owner may remove anyone but themselves.
  const leaving = parsed.data.memberId === auth.user.id;
  if (!leaving && team.role !== "owner") {
    return NextResponse.json({ error: "only the owner can remove a member" }, { status: 403 });
  }
  if (parsed.data.memberId === team.workspace.ownerId) {
    return NextResponse.json({ error: "the owner cannot be removed" }, { status: 409 });
  }
  await db()
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, team.workspace.id),
        eq(workspaceMembers.userId, parsed.data.memberId),
      ),
    );
  auditInBackground({
    userId: auth.user.id,
    actor: auth.user.email,
    event: leaving ? "workspace_left" : "workspace_member_removed",
    subjectId: team.workspace.id,
    payload: { memberId: parsed.data.memberId },
  });
  return NextResponse.json({ ok: true });
}
