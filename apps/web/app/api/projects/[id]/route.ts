// GET    /api/projects/:id, fetch a single project (must belong to user).
// DELETE /api/projects/:id, delete the row and the stored blob.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
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

  const { updateProject } = await import("@/lib/platform/queries");
  const ok = await updateProject(authResult.user.id, id, {
    ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
    ...(typeof body.code === "string" ? { code: body.code.trim() || null } : {}),
    ...(typeof body.description === "string" ? { description: body.description } : {}),
    ...(typeof body.site === "string" ? { site: body.site } : {}),
    ...("clientId" in body ? { clientId: (body.clientId as string | null) ?? null } : {}),
    ...(typeof body.phase === "string" ? { phase: body.phase as never } : {}),
  });
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
