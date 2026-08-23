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

  const storage = await getStorage();
  await storage.remove(project.r2Key).catch(() => {});
  await db().delete(projects).where(eq(projects.id, id));

  return Response.json({ ok: true });
}
