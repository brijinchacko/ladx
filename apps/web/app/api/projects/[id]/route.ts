// GET    /api/projects/:id, fetch a single project (must belong to user).
// PATCH  /api/projects/:id, edit the engagement fields and the design basis.
// DELETE /api/projects/:id, delete the row and the stored blob.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { mergeBrief } from "@/lib/platform/brief";
import { getStorage } from "@/lib/storage";
import { and, eq } from "drizzle-orm";

async function findOwnedProject(userId: string, id: string) {
  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  const project = await findOwnedProject(authResult.user.id, id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  const project = await findOwnedProject(authResult.user.id, id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  // A platform project may have no uploaded file, so only touch storage when
  // there is actually a key to remove.
  if (project.r2Key) {
    const storage = await getStorage();
    await storage.remove(project.r2Key).catch(() => {});
  }
  await db().delete(projects).where(eq(projects.id, id));

  return Response.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "invalid request" }, { status: 400 });

  const project = await findOwnedProject(authResult.user.id, id);
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  const { updateProject } = await import("@/lib/platform/queries");
  const ok = await updateProject(authResult.user.id, id, {
    ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
    ...(typeof body.code === "string" ? { code: body.code.trim() || null } : {}),
    ...(typeof body.description === "string" ? { description: body.description } : {}),
    ...(typeof body.site === "string" ? { site: body.site } : {}),
    ...("clientId" in body ? { clientId: (body.clientId as string | null) ?? null } : {}),
    ...(typeof body.phase === "string" ? { phase: body.phase as never } : {}),
    // Merged rather than replaced: the brief is answered a few fields at a time,
    // from the project page and from the document a field was needed for, and a
    // replacing write would silently blank everything the other form did not send.
    ...("brief" in body ? { brief: mergeBrief(project.brief, body.brief) } : {}),
    // Closing the setup wizard, however it was closed. Skipping is a decision
    // and is recorded as one, so the wizard does not reopen on every visit.
    ...(body.onboarded === true ? { onboardedAt: new Date() } : {}),
    ...(body.onboarded === false ? { onboardedAt: null } : {}),
  });
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
