// PATCH  /api/memories/:id, reword a rule.
// DELETE /api/memories/:id, remove one.
//
// An edit inserts a new row and points the old one at it rather than updating
// in place. That is what makes "why did it suggest that last month" answerable
// after the rule behind it has been reworded, and it costs one row.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const edit = z.object({
  content: z.string().trim().min(3).max(2000),
  reason: z.string().trim().max(2000).nullish(),
  kind: z.enum(["convention", "approved", "forbidden", "note"]).optional(),
});

async function owned(userId: string, id: string) {
  const rows = await db()
    .select()
    .from(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const previous = await owned(auth.user.id, id);
  if (!previous) return Response.json({ error: "not found" }, { status: 404 });
  if (previous.supersededBy) {
    return Response.json(
      { error: "that version has already been replaced; edit the current one" },
      { status: 409 },
    );
  }

  const parsed = edit.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });

  const [replacement] = await db()
    .insert(memories)
    .values({
      userId: auth.user.id,
      // Scope and project are inherited, never taken from the request. An edit
      // must not be able to widen a project rule into a company one.
      scope: previous.scope,
      projectId: previous.projectId,
      kind: parsed.data.kind ?? previous.kind,
      content: parsed.data.content,
      reason: parsed.data.reason ?? null,
      author: auth.user.displayName ?? auth.user.email,
      supersedes: previous.id,
    })
    .returning();

  if (!replacement) {
    // Nothing was inserted, so nothing must point at it: leaving the original
    // marked as superseded by a row that does not exist would hide a current
    // rule from retrieval permanently.
    return Response.json({ error: "the edit was not saved" }, { status: 500 });
  }

  await db()
    .update(memories)
    .set({ supersededBy: replacement.id })
    .where(eq(memories.id, previous.id));

  return Response.json({ memory: replacement });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const found = await owned(auth.user.id, id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });

  // A real delete rather than a flag. Somebody removing a rule they wrote is
  // entitled to have it gone, and a memory system that keeps what it was asked
  // to forget is the thing people are right to distrust.
  await db().delete(memories).where(eq(memories.id, id));
  return Response.json({ deleted: id });
}
