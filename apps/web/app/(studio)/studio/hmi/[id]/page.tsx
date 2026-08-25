import HmiEditorClient from "@/components/studio/hmi-editor-client";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { SCRATCH, loadProgram } from "@/lib/db/ladder";
import { hmiProjects } from "@/lib/db/schema";
import { getProject } from "@/lib/platform/queries";
import { type HmiDoc, emptyDoc } from "@ladx/hmi";
import type { LadxProgram } from "@ladx/studio";
import { and, eq } from "drizzle-orm";
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
    .where(and(eq(hmiProjects.id, id), eq(hmiProjects.userId, user.id)))
    .limit(1);
  if (!row) notFound();

  const stored = await loadProgram(user.id, row.projectId);
  const program = (stored?.program as LadxProgram | undefined) ?? null;
  const projectName = row.projectId
    ? ((await getProject(user.id, row.projectId))?.name ?? null)
    : null;

  // A document from an older build, or one that failed a partial write, must
  // not take the editor down: fall back to an empty application rather than
  // rendering nothing.
  const doc = (row.doc as HmiDoc | null) ?? null;
  const safe: HmiDoc =
    doc && Array.isArray(doc.screens) && doc.screens.length > 0 ? doc : emptyDoc(row.name);

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
