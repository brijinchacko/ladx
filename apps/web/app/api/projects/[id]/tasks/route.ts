// GET  /api/projects/:id/tasks   the plan for one project
// POST /api/projects/:id/tasks   add a task, or seed the plan from the lifecycle

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projectTasks } from "@/lib/db/schema";
import { draftSchedule, toISODate } from "@/lib/platform/gantt";
import { ACTIVE_PHASES, deliverablesFor } from "@/lib/platform/lifecycle";
import { getProject } from "@/lib/platform/queries";
import { and, asc, eq } from "drizzle-orm";
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

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  detail: z.string().max(2000).nullish(),
  phase: z.enum(PHASES).default("requirements"),
  owner: z.string().max(120).nullish(),
  startsOn: z.union([z.string().datetime(), z.string().date()]).nullish(),
  dueOn: z.union([z.string().datetime(), z.string().date()]).nullish(),
  templateSlug: z.string().max(120).nullish(),
});

/** Build the whole plan from the lifecycle, for a project with none. */
const seedSchema = z.object({
  seed: z.literal(true),
  /** When the work begins. Defaults to today; rolled forward off a weekend. */
  startOn: z.union([z.string().datetime(), z.string().date()]).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const project = await getProject(auth.user.id, id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const rows = await db()
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.userId, auth.user.id), eq(projectTasks.projectId, id)))
    .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt));

  return NextResponse.json({ tasks: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const project = await getProject(auth.user.id, id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const body = await req.json().catch(() => null);

  // Seeding writes one task per deliverable the lifecycle already defines, so a
  // plan starts as the work the project is actually committed to rather than as
  // an empty list somebody has to invent from memory.
  if (seedSchema.safeParse(body).success) {
    const existing = await db()
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(and(eq(projectTasks.userId, auth.user.id), eq(projectTasks.projectId, id)))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "this project already has a plan" }, { status: 409 });
    }

    let position = 0;
    const rows = ACTIVE_PHASES.flatMap((phase) =>
      deliverablesFor(phase.id).map((d) => ({
        userId: auth.user.id,
        projectId: id,
        title: `${d.abbr}: ${d.title}`,
        detail: d.summary,
        phase: phase.id,
        templateSlug: d.slug,
        position: position++,
        startsOn: null as string | null,
        dueOn: null as string | null,
      })),
    );

    // Put the plan on the calendar rather than handing back a dated-nothing
    // list. A Gantt of seventeen undated rows is a chart of nothing, and
    // asking somebody to type thirty-four dates before they can see a shape is
    // how a planner goes unused. Phases run in sequence on working days; every
    // date is draggable the moment it lands.
    const seedStart = seedSchema.safeParse(body).success
      ? ((body as { startOn?: string }).startOn ?? new Date())
      : new Date();
    const draft = draftSchedule(
      rows,
      ACTIVE_PHASES.map((p) => p.id),
      seedStart,
    );
    for (const [row, dates] of draft) {
      row.startsOn = toISODate(dates.startsOn);
      row.dueOn = toISODate(dates.dueOn);
    }
    if (rows.length === 0) return NextResponse.json({ tasks: [] });
    const inserted = await db().insert(projectTasks).values(rows).returning();
    return NextResponse.json({ tasks: inserted }, { status: 201 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const [row] = await db()
    .insert(projectTasks)
    .values({
      userId: auth.user.id,
      projectId: id,
      title: parsed.data.title,
      detail: parsed.data.detail ?? null,
      phase: parsed.data.phase,
      owner: parsed.data.owner ?? null,
      startsOn: parsed.data.startsOn ? toISODate(parsed.data.startsOn) : null,
      dueOn: parsed.data.dueOn ? toISODate(parsed.data.dueOn) : null,
      templateSlug: parsed.data.templateSlug ?? null,
      // New work goes to the end of its phase.
      position: 10_000,
    })
    .returning();

  return NextResponse.json({ task: row }, { status: 201 });
}
