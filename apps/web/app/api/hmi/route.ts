// GET  /api/hmi           every HMI application this user owns
// POST /api/hmi           create one, for a project or unattached

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { hmiProjects } from "@/lib/db/schema";
import { getProject } from "@/lib/platform/queries";
import { accessIds } from "@/lib/teams/access";
import { sanitiseSize } from "@ladx/hmi";
import { emptyDoc } from "@ladx/hmi";
import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200).default("Untitled HMI"),
  projectId: z.string().uuid().nullish(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export async function GET() {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const rows = await db()
    .select({
      id: hmiProjects.id,
      name: hmiProjects.name,
      projectId: hmiProjects.projectId,
      updatedAt: hmiProjects.updatedAt,
    })
    .from(hmiProjects)
    .where(inArray(hmiProjects.userId, await accessIds(auth.user.id)))
    .orderBy(desc(hmiProjects.updatedAt));
  return NextResponse.json({ applications: rows });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  // A project id is checked rather than trusted: it arrives from a form.
  let projectId = parsed.data.projectId ?? null;
  if (projectId && !(await getProject(auth.user.id, projectId))) projectId = null;

  const size = sanitiseSize({ width: parsed.data.width, height: parsed.data.height });
  const [row] = await db()
    .insert(hmiProjects)
    .values({
      userId: auth.user.id,
      projectId,
      name: parsed.data.name,
      doc: emptyDoc(parsed.data.name, size),
    })
    .returning({ id: hmiProjects.id });

  return NextResponse.json({ id: row?.id }, { status: 201 });
}
