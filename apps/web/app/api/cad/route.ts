// GET  /api/cad?projectId=…  list drawings
// POST /api/cad              create one

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { cadDrawings } from "@/lib/db/schema";
import { getProject } from "@/lib/platform/queries";
import { emptyDrawing } from "@ladx/cad";
import { and, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  projectId: z.string().uuid().nullish(),
  /** Optional starting geometry, e.g. from an imported DXF. */
  data: z.unknown().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const projectId = req.nextUrl.searchParams.get("projectId");

  const rows = await db()
    .select({
      id: cadDrawings.id,
      name: cadDrawings.name,
      projectId: cadDrawings.projectId,
      updatedAt: cadDrawings.updatedAt,
    })
    .from(cadDrawings)
    .where(
      projectId
        ? and(eq(cadDrawings.userId, auth.user.id), eq(cadDrawings.projectId, projectId))
        : eq(cadDrawings.userId, auth.user.id),
    )
    .orderBy(desc(cadDrawings.updatedAt));

  return NextResponse.json({ drawings: rows });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  if (parsed.data.projectId) {
    const owned = await getProject(auth.user.id, parsed.data.projectId);
    if (!owned) return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const [row] = await db()
    .insert(cadDrawings)
    .values({
      userId: auth.user.id,
      projectId: parsed.data.projectId ?? null,
      name: parsed.data.name,
      data: parsed.data.data ?? emptyDrawing(),
    })
    .returning({ id: cadDrawings.id });

  if (!row) return NextResponse.json({ error: "could not save" }, { status: 500 });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
