import HmiEditorClient from "@/components/studio/hmi-editor-client";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { SCRATCH, loadProgram } from "@/lib/db/ladder";
import { hmiProjects } from "@/lib/db/schema";
import { getProject } from "@/lib/platform/queries";
import { accessIds } from "@/lib/teams/access";
import { type HmiDoc, readDoc } from "@ladx/hmi";
import type { LadxProgram } from "@ladx/studio";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One HMI application.
 *
 * The PLC tags come from the project's ladder program rather than from the
 * document, which is the whole point: one tag table, and a screen that cannot
 * bind to a tag the controller does not have.
 *
 * An application filed against no project reads the scratch program, the same
 * unattached one the ladder editor opens when no project is chosen. Without
 * that, going to HMI from a scratch program landed on an editor with an empty
 * tag table and nothing to explain why.
 */
export default async function HmiEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db()
    .select()
    .from(hmiProjects)
    .where(and(eq(hmiProjects.id, id), inArray(hmiProjects.userId, await accessIds(user.id))))
    .limit(1);
  if (!row) notFound();

  const stored = await loadProgram(user.id, row.projectId);
  const program = (stored?.program as LadxProgram | undefined) ?? null;
  const projectName = row.projectId
    ? ((await getProject(user.id, row.projectId))?.name ?? null)
    : null;

  // A document from an older build, or one that failed a partial write, must
  // not take the editor down. readDoc repairs rather than validates: the check
  // here used to be that `screens` was a non-empty array, which a document
  // holding a screen with no size passes on its way to throwing inside the
  // first render, and the person sees a blank page with no way back.
  const safe: HmiDoc = readDoc(row.doc, row.name);

  return (
    <HmiEditorClient
      id={row.id}
      initialDoc={safe}
      initialName={row.name}
      program={program}
      projectName={projectName}
      ladderHref={`/studio/ladder?project=${encodeURIComponent(row.projectId ?? SCRATCH)}`}
    />
  );
}
