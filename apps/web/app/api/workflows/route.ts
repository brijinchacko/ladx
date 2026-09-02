// GET  /api/workflows?projectId=   the workflows shipped, and the runs for a project
// POST /api/workflows              start a run: { projectId, workflow, request }
//
// Starting a run drives it as far as it can go without a person, so the
// response already has the survey and the plan in it, or the gate it stopped
// at. A person's answer comes in through /api/workflows/[id].

import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { workflowRuns } from "@/lib/db/schema";
import { listWorkflows } from "@/lib/parsers/spawn";
import { getProject } from "@/lib/platform/queries";
import { accessIds } from "@/lib/teams/access";
import { driveRun } from "@/lib/workflows/drive";
import { and, desc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const startSchema = z.object({
  projectId: z.string().uuid(),
  workflow: z.string().min(1).max(80),
  request: z.string().trim().min(1).max(4000),
});

export async function GET(req: NextRequest) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const projectId = req.nextUrl.searchParams.get("projectId");

  let workflows: Awaited<ReturnType<typeof listWorkflows>> = [];
  let engineError: string | null = null;
  try {
    workflows = await listWorkflows();
  } catch (err) {
    engineError = err instanceof Error ? err.message : "the workflow engine is not available";
  }

  const where = projectId
    ? and(
        inArray(workflowRuns.userId, await accessIds(auth.user.id)),
        eq(workflowRuns.projectId, projectId),
      )
    : inArray(workflowRuns.userId, await accessIds(auth.user.id));
  const runs = await db()
    .select({
      id: workflowRuns.id,
      projectId: workflowRuns.projectId,
      workflow: workflowRuns.workflow,
      request: workflowRuns.request,
      status: workflowRuns.status,
      createdAt: workflowRuns.createdAt,
      updatedAt: workflowRuns.updatedAt,
    })
    .from(workflowRuns)
    .where(where)
    .orderBy(desc(workflowRuns.updatedAt))
    .limit(50);

  return NextResponse.json({ workflows, runs, engineError });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const project = await getProject(auth.user.id, parsed.data.projectId);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const [row] = await db()
    .insert(workflowRuns)
    .values({
      userId: auth.user.id,
      projectId: project.id,
      workflow: parsed.data.workflow,
      request: parsed.data.request,
      answers: [],
      modelAnswers: [],
    })
    .returning({ id: workflowRuns.id });
  if (!row) return NextResponse.json({ error: "could not start the run" }, { status: 500 });

  auditInBackground({
    userId: auth.user.id,
    actor: auth.user.email,
    event: "workflow_started",
    subjectId: row.id,
    payload: { workflow: parsed.data.workflow, projectId: project.id },
  });

  try {
    const run = await driveRun(auth.user.id, row.id);
    return NextResponse.json({ id: row.id, run }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "the run could not start";
    return NextResponse.json({ id: row.id, error: message }, { status: 201 });
  }
}
