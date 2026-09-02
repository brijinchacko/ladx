// GET    /api/test-runs/[id]    the run, plan and results
// PATCH  /api/test-runs/[id]    results as they are ticked, notes, the sign off
// DELETE /api/test-runs/[id]

import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { testRuns } from "@/lib/db/schema";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const resultSchema = z.object({
  result: z.enum(["pass", "fail", "na"]).optional(),
  note: z.string().max(2000).optional(),
  at: z.string().optional(),
});

const patchSchema = z.object({
  results: z.record(z.string(), resultSchema).optional(),
  notes: z.string().max(20_000).nullish(),
  title: z.string().trim().min(1).max(200).optional(),
  /** Signing closes the run. Both fields together, or neither. */
  signedBy: z.string().trim().min(1).max(200).optional(),
  signedRole: z.string().trim().max(200).optional(),
  /** Reopen, which clears the signature and says so in the audit log. */
  reopen: z.boolean().optional(),
});

async function owned(userId: string, id: string) {
  const [row] = await db()
    .select()
    .from(testRuns)
    .where(and(eq(testRuns.id, id), inArray(testRuns.userId, await accessIds(userId))))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const run = await owned(auth.user.id, id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const run = await owned(auth.user.id, id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const signed = Boolean(run.signedAt);

  if (parsed.data.reopen) {
    patch.signedBy = null;
    patch.signedRole = null;
    patch.signedAt = null;
    patch.completedAt = null;
  } else if (signed && (parsed.data.results || parsed.data.notes !== undefined)) {
    // A signed record does not change. Reopen it first, which is logged.
    return NextResponse.json(
      { error: "this run has been signed off; reopen it to change the results" },
      { status: 409 },
    );
  }

  if (parsed.data.results) {
    // Merge, one step at a time, so two people ticking different steps on
    // two phones do not overwrite each other's work.
    const current = (run.results ?? {}) as Record<string, unknown>;
    patch.results = { ...current, ...parsed.data.results };
  }
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;

  if (parsed.data.signedBy) {
    const now = new Date();
    patch.signedBy = parsed.data.signedBy;
    patch.signedRole = parsed.data.signedRole ?? null;
    patch.signedAt = now;
    patch.completedAt = now;
  }

  await db()
    .update(testRuns)
    .set(patch)
    .where(and(eq(testRuns.id, id), inArray(testRuns.userId, await accessIds(auth.user.id))));

  if (parsed.data.signedBy || parsed.data.reopen) {
    // Facts, not content: who signed and when is the record; the notes are not.
    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: parsed.data.reopen ? "test_run_reopened" : "test_run_signed",
      subjectId: id,
      payload: parsed.data.reopen
        ? { kind: run.kind }
        : { kind: run.kind, signedBy: parsed.data.signedBy, role: parsed.data.signedRole ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const deleted = await db()
    .delete(testRuns)
    .where(and(eq(testRuns.id, id), inArray(testRuns.userId, await accessIds(auth.user.id))))
    .returning({ id: testRuns.id });
  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
