// PATCH  /api/projects/:id/tasks/:taskId
// DELETE /api/projects/:id/tasks/:taskId

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projectTasks } from "@/lib/db/schema";
import { toISODate } from "@/lib/platform/gantt";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";
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
  // Accepts a plain date as well as a full timestamp: the Gantt schedules in
  // whole days and sends "2026-03-04", and requiring an instant there would
  // force the client to invent a time and a timezone for it.
  startsOn: z.union([z.string().datetime(), z.string().date()]).nullish(),
  dueOn: z.union([z.string().datetime(), z.string().date()]).nullish(),
  /** The task that must finish first, or null to clear it. */
  dependsOn: z.string().uuid().nullish(),
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
  // Stored as calendar dates, so they are never routed through a Date: doing
  // that reinterprets "2026-09-17" as UTC midnight and can move it a day.
  if (parsed.data.startsOn !== undefined) {
    patch.startsOn = parsed.data.startsOn ? toISODate(parsed.data.startsOn) : null;
  }
  if (parsed.data.dueOn !== undefined) {
    patch.dueOn = parsed.data.dueOn ? toISODate(parsed.data.dueOn) : null;
  }
  if (parsed.data.dependsOn !== undefined) {
    // A task waiting for itself can never start, and the chart would draw a
    // link from a bar to itself. Refuse it here rather than filtering it out
    // at every read.
    if (parsed.data.dependsOn === taskId) {
      return NextResponse.json({ error: "a task cannot wait for itself" }, { status: 400 });
    }
    patch.dependsOn = parsed.data.dependsOn ?? null;
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
        inArray(projectTasks.userId, await accessIds(auth.user.id)),
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
        inArray(projectTasks.userId, await accessIds(auth.user.id)),
      ),
    )
    .returning({ id: projectTasks.id });

  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
