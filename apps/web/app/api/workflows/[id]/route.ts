// GET    /api/workflows/[id]                   the run
// POST   /api/workflows/[id]   { stepId, answer }   a person answers, and the run goes on
// POST   /api/workflows/[id]   { retry: true }      drive again after a failure
// DELETE /api/workflows/[id]

import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { workflowRuns } from "@/lib/db/schema";
import { accessIds } from "@/lib/teams/access";
import { driveRun } from "@/lib/workflows/drive";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.union([
  z.object({ stepId: z.string().min(1), answer: z.string().trim().min(1).max(4000) }),
  z.object({ retry: z.literal(true) }),
]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const [row] = await db()
    .select()
    .from(workflowRuns)
    .where(
      and(eq(workflowRuns.id, id), inArray(workflowRuns.userId, await accessIds(auth.user.id))),
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run: row });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const [row] = await db()
    .select({ answers: workflowRuns.answers, status: workflowRuns.status })
    .from(workflowRuns)
    .where(
      and(eq(workflowRuns.id, id), inArray(workflowRuns.userId, await accessIds(auth.user.id))),
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if ("stepId" in parsed.data) {
    if (row.status !== "waiting_person") {
      return NextResponse.json({ error: "this run is not waiting on a person" }, { status: 409 });
    }
    const answers = (row.answers ?? []) as [string, string][];
    answers.push([parsed.data.stepId, parsed.data.answer]);
    await db()
      .update(workflowRuns)
      .set({ answers, status: "running", updatedAt: new Date() })
      .where(eq(workflowRuns.id, id));
    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "workflow_answered",
      subjectId: id,
      payload: { stepId: parsed.data.stepId },
    });
  }

  try {
    const run = await driveRun(auth.user.id, id);
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "the run could not continue";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const deleted = await db()
    .delete(workflowRuns)
    .where(
      and(eq(workflowRuns.id, id), inArray(workflowRuns.userId, await accessIds(auth.user.id))),
    )
    .returning({ id: workflowRuns.id });
  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
