// GET  /api/ladder/[projectId]/history            the saves, newest first
// POST /api/ladder/[projectId]/history            { diff: { from, to } } or { restore: id }
//
// Every save of a program leaves a snapshot behind. This lists them, compares
// any two (or one against what is saved now), and puts one back. A restore is
// itself a save, so it leaves its own snapshot and nothing is ever lost by
// restoring the wrong one.

import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { SCRATCH, loadProgram, saveProgram } from "@/lib/db/ladder";
import { ladderSnapshots } from "@/lib/db/schema";
import { diffPrograms } from "@/lib/ladder/history";
import { getProject } from "@/lib/platform/queries";
import { accessIds } from "@/lib/teams/access";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.union([
  z.object({ diff: z.object({ from: z.string(), to: z.string() }) }),
  z.object({ restore: z.string().uuid() }),
]);

async function resolve(userId: string, raw: string): Promise<string | null | undefined> {
  if (raw === SCRATCH) return null;
  const project = await getProject(userId, raw);
  return project ? project.id : undefined;
}

async function where(userId: string, projectId: string | null) {
  return projectId === null
    ? and(
        inArray(ladderSnapshots.userId, await accessIds(userId)),
        isNull(ladderSnapshots.projectId),
      )
    : and(
        inArray(ladderSnapshots.userId, await accessIds(userId)),
        eq(ladderSnapshots.projectId, projectId),
      );
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { projectId: raw } = await params;
  const target = await resolve(auth.user.id, raw);
  if (target === undefined) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db()
    .select({
      id: ladderSnapshots.id,
      name: ladderSnapshots.name,
      author: ladderSnapshots.author,
      rungs: ladderSnapshots.rungs,
      savedAt: ladderSnapshots.savedAt,
    })
    .from(ladderSnapshots)
    .where(await where(auth.user.id, target))
    .orderBy(desc(ladderSnapshots.savedAt))
    .limit(100);

  return NextResponse.json({ snapshots: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { projectId: raw } = await params;
  const target = await resolve(auth.user.id, raw);
  if (target === undefined) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  // "current" is what is saved now; anything else is a snapshot id.
  const programOf = async (ref: string): Promise<unknown | null> => {
    if (ref === "current") {
      const now = await loadProgram(auth.user.id, target);
      return now?.program ?? null;
    }
    const [snap] = await db()
      .select({ program: ladderSnapshots.program })
      .from(ladderSnapshots)
      .where(and(await where(auth.user.id, target), eq(ladderSnapshots.id, ref)))
      .limit(1);
    return snap?.program ?? null;
  };

  if ("diff" in parsed.data) {
    const [from, to] = await Promise.all([
      programOf(parsed.data.diff.from),
      programOf(parsed.data.diff.to),
    ]);
    if (from === null || to === null) {
      return NextResponse.json({ error: "no such version" }, { status: 404 });
    }
    try {
      return NextResponse.json(await diffPrograms(from, to));
    } catch (err) {
      const message = err instanceof Error ? err.message : "the comparison did not run";
      return NextResponse.json({ error: message }, { status: 503 });
    }
  }

  const program = await programOf(parsed.data.restore);
  if (program === null) return NextResponse.json({ error: "no such version" }, { status: 404 });
  const [snap] = await db()
    .select({ name: ladderSnapshots.name, savedAt: ladderSnapshots.savedAt })
    .from(ladderSnapshots)
    .where(eq(ladderSnapshots.id, parsed.data.restore))
    .limit(1);
  const name = snap?.name ?? "Restored";
  await saveProgram(auth.user.id, target, name, program);
  auditInBackground({
    userId: auth.user.id,
    actor: auth.user.email,
    event: "ladder_restored",
    subjectId: target ?? SCRATCH,
    payload: { snapshot: parsed.data.restore, savedAt: snap?.savedAt?.toISOString() ?? null },
  });
  return NextResponse.json({ ok: true });
}
