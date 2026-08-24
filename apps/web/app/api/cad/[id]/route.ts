// PUT    /api/cad/[id]  save geometry
// DELETE /api/cad/[id]

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { cadDrawings } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  data: z.unknown().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.data !== undefined) patch.data = parsed.data.data;

  const updated = await db()
    .update(cadDrawings)
    .set(patch)
    .where(and(eq(cadDrawings.id, id), eq(cadDrawings.userId, auth.user.id)))
    .returning({ id: cadDrawings.id });

  if (updated.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const deleted = await db()
    .delete(cadDrawings)
    .where(and(eq(cadDrawings.id, id), eq(cadDrawings.userId, auth.user.id)))
    .returning({ id: cadDrawings.id });

  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
