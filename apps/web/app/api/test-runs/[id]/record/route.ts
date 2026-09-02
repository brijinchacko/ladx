// POST /api/test-runs/[id]/record
//
// The run, written up as a document of the project: a table per group with
// the result and the note against each step, the signature at the end. It
// lands in Documents like everything else, with the letterhead, the states,
// the share link and the PDF, which is what an auditor asks for. Written once;
// asking again returns the document that already exists.

import { getApiUser } from "@/lib/auth/server";
import { type Plan, type Result, recordMarkdown } from "@/lib/commission/record";
import { db } from "@/lib/db/client";
import { documents, testRuns } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const [run] = await db()
    .select()
    .from(testRuns)
    .where(and(eq(testRuns.id, id), eq(testRuns.userId, auth.user.id)))
    .limit(1);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (run.documentId) return NextResponse.json({ id: run.documentId, existing: true });

  const content = recordMarkdown({
    title: run.title,
    kind: run.kind,
    plan: run.plan as Plan,
    results: (run.results ?? {}) as Record<string, Result>,
    notes: run.notes,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    signedBy: run.signedBy,
    signedRole: run.signedRole,
    signedAt: run.signedAt,
  });

  const [doc] = await db()
    .insert(documents)
    .values({
      userId: auth.user.id,
      projectId: run.projectId,
      kind: "generated",
      templateSlug: null,
      title: `${run.kind === "sat" ? "SAT" : "FAT"} record: ${run.title}`,
      content,
      byteSize: content.length,
      status: run.signedAt ? "approved" : "draft",
      statusChangedAt: new Date(),
    })
    .returning({ id: documents.id });
  if (!doc) return NextResponse.json({ error: "could not write the record" }, { status: 500 });

  await db().update(testRuns).set({ documentId: doc.id }).where(eq(testRuns.id, id));
  return NextResponse.json({ id: doc.id }, { status: 201 });
}
