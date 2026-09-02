// POST /api/projects/[id]/duplicate
//
// The second conveyor for the same client is the first conveyor with different
// tag numbers. This copies what carries over between two jobs for one client:
// who it is for, the scope, the design basis and the drawing set. It leaves
// behind what belongs to the one job: the program, the documents written for
// it, the uploaded file, the plan, and the phase it had reached.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { cadDrawings as drawings, projects } from "@/lib/db/schema";
import { createProject, getProject } from "@/lib/platform/queries";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const source = await getProject(auth.user.id, id);
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { id: newId } = await createProject(auth.user.id, {
    name: `${source.name} (copy)`,
    clientId: source.clientId,
    // A project number is the one thing that must not be copied: two jobs
    // with one number is how documents end up filed against the wrong one.
    code: null,
    description: source.description,
    site: source.site,
    deliverables: source.deliverables ?? null,
  });

  // The design basis goes with it. It is the client's process, not the job's.
  if (source.brief) {
    await db().update(projects).set({ brief: source.brief }).where(eq(projects.id, newId));
  }

  // The drawing set, sheet by sheet. Title blocks fill from the new project.
  const sheets = await db()
    .select()
    .from(drawings)
    .where(and(eq(drawings.userId, auth.user.id), eq(drawings.projectId, id)));
  let copied = 0;
  for (const sheet of sheets) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = sheet;
    await db()
      .insert(drawings)
      .values({ ...rest, projectId: newId });
    copied += 1;
  }

  return NextResponse.json({ id: newId, drawings: copied }, { status: 201 });
}
