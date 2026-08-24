// PATCH  /api/projects/:id/tasks/:taskId
// DELETE /api/projects/:id/tasks/:taskId

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projectTasks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const PHASES = [
  "summary",
  "requirements",
  "design",
  "development",
  "factory_test",
  "commissioning",
  "handover",
  "support",
  "closed",
] as const;

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  detail: z.string().max(2000).nullish(),
  phase: z.enum(PHASES).optional(),
  status: z.enum(["todo", "doing", "blocked", "done"]).optional(),
  owner: z.string().max(120).nullish(),
  dueOn: z.string().datetime().nullish(),
  position: z.number().int().min(0).max(1_000_000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id, taskId } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.detail !== undefined) patch.detail = parsed.data.detail ?? null;
  if (parsed.data.phase !== undefined) patch.phase = parsed.data.phase;
  if (parsed.data.owner !== undefined) patch.owner = parsed.data.owner ?? null;
  if (parsed.data.position !== undefined) patch.position = parsed.data.position;
  if (parsed.data.dueOn !== undefined) {
    patch.dueOn = parsed.data.dueOn ? new Date(parsed.data.dueOn) : null;
  }
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status;
    // When it was finished, recorded once. Re-opening clears it, so a task
    // that goes back and forth does not keep a completion date that is a lie.
    patch.completedAt = parsed.data.status === "done" ? new Date() : null;
  }

  const updated = await db()
    .update(projectTasks)
    .set(patch)
    .where(
      and(
        eq(projectTasks.id, taskId),
        eq(projectTasks.projectId, id),
        eq(projectTasks.userId, auth.user.id),
      ),
    )
    .returning();

  if (updated.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task: updated[0] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id, taskId } = await params;

  const deleted = await db()
    .delete(projectTasks)
    .where(
      and(
        eq(projectTasks.id, taskId),
        eq(projectTasks.projectId, id),
        eq(projectTasks.userId, auth.user.id),
      ),
    )
    .returning({ id: projectTasks.id });

  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
