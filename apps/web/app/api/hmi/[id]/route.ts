// GET    /api/hmi/:id   the application
// PUT    /api/hmi/:id   save it
// DELETE /api/hmi/:id

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { hmiProjects } from "@/lib/db/schema";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * The document's internals belong to lib/hmi, so this route caps the size
 * rather than tracking a shape it does not own, the same call the ladder save
 * route makes. The consumers defend themselves; see lib/hmi/doc.ts.
 */
const saveSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  doc: z.unknown(),
});

const MAX_BYTES = 4_000_000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const [row] = await db()
    .select()
    .from(hmiProjects)
    .where(and(eq(hmiProjects.id, id), inArray(hmiProjects.userId, await accessIds(auth.user.id))))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ application: row });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  if (JSON.stringify(parsed.data.doc ?? null).length > MAX_BYTES) {
    return NextResponse.json({ error: "application too large" }, { status: 413 });
  }

  const updated = await db()
    .update(hmiProjects)
    .set({
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      doc: parsed.data.doc,
      updatedAt: new Date(),
    })
    .where(and(eq(hmiProjects.id, id), inArray(hmiProjects.userId, await accessIds(auth.user.id))))
    .returning({ id: hmiProjects.id });

  if (updated.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  await db()
    .delete(hmiProjects)
    .where(and(eq(hmiProjects.id, id), inArray(hmiProjects.userId, await accessIds(auth.user.id))));
  return NextResponse.json({ ok: true });
}
