// GET  /api/test-runs?projectId=   the runs for a project, newest first
// POST /api/test-runs              start one, from a plan
//
// A run is the plan copied at the moment somebody started, plus what they
// found. The copy is the point: the program can change after the test and the
// record has to say what was tested.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { testRuns } from "@/lib/db/schema";
import { getProject } from "@/lib/platform/queries";
import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const stepSchema = z.object({
  kind: z.string(),
  action: z.string(),
  expect: z.string(),
  from: z.string(),
});

const planSchema = z.object({
  groups: z.array(z.object({ subject: z.string(), steps: z.array(stepSchema) })),
  not_covered: z.array(z.string()).optional(),
});

const createSchema = z.object({
  projectId: z.string().uuid().nullable(),
  kind: z.enum(["fat", "sat"]).default("fat"),
  title: z.string().trim().min(1).max(200),
  plan: planSchema,
});

export async function GET(req: NextRequest) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const projectId = req.nextUrl.searchParams.get("projectId");

  const where = projectId
    ? and(eq(testRuns.userId, auth.user.id), eq(testRuns.projectId, projectId))
    : eq(testRuns.userId, auth.user.id);

  const rows = await db()
    .select({
      id: testRuns.id,
      projectId: testRuns.projectId,
      kind: testRuns.kind,
      title: testRuns.title,
      results: testRuns.results,
      plan: testRuns.plan,
      startedAt: testRuns.startedAt,
      completedAt: testRuns.completedAt,
      signedBy: testRuns.signedBy,
      signedAt: testRuns.signedAt,
      documentId: testRuns.documentId,
    })
    .from(testRuns)
    .where(where)
    .orderBy(desc(testRuns.startedAt));

  // The list wants counts, not the whole plan and every note.
  const runs = rows.map((r) => {
    const plan = r.plan as z.infer<typeof planSchema>;
    const results = r.results as Record<string, { result?: string }>;
    const total = plan.groups.reduce((n, g) => n + g.steps.length, 0);
    const done = Object.values(results).filter((x) => x.result).length;
    const failed = Object.values(results).filter((x) => x.result === "fail").length;
    return {
      id: r.id,
      projectId: r.projectId,
      kind: r.kind,
      title: r.title,
      total,
      done,
      failed,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      signedBy: r.signedBy,
      signedAt: r.signedAt,
      documentId: r.documentId,
    };
  });

  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  if (parsed.data.projectId) {
    const owned = await getProject(auth.user.id, parsed.data.projectId);
    if (!owned) return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const [row] = await db()
    .insert(testRuns)
    .values({
      userId: auth.user.id,
      projectId: parsed.data.projectId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      plan: parsed.data.plan,
      results: {},
    })
    .returning({ id: testRuns.id });
  if (!row) return NextResponse.json({ error: "could not start the run" }, { status: 500 });

  return NextResponse.json({ id: row.id }, { status: 201 });
}
