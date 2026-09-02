import { askModelViaApi } from "@/components/studio/ask-model";
import { coreImportViaApi } from "@/components/studio/core-import";
import { OtherLanguages } from "@/components/studio/other-languages";
import { saveRecordViaApi } from "@/components/studio/save-record";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { partitionRunnable } from "@/lib/ladder/runnable";
import { getCompany, listProjects } from "@/lib/platform/queries";
import { type ConvertSource, ConvertWorkbench } from "@ladx/studio";
import type { LadxProgram } from "@ladx/studio";

export const dynamic = "force-dynamic";

/**
 * Convert, inside Studio.
 *
 * Not the public page in a frame. The public one takes a file because a visitor
 * has no account; this one reads the programs the account already holds, so
 * converting the routine you wrote this morning does not begin with exporting
 * it to disk.
 */
export default async function StudioConvertPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project: wanted } = await searchParams;
  const [programs, projects, company] = await Promise.all([
    listPrograms(user.id),
    listProjects(user.id),
    getCompany(user.id),
  ]);

  const nameOf = new Map(projects.map((p) => [p.id, p.name]));

  // One unreadable row used to throw inside this render and 500 the whole
  // tool, hiding every program the user could actually open. Set them aside
  // and say so instead.
  const { runnable, broken } = partitionRunnable(programs);
  const sources: ConvertSource[] = runnable.map((p) => ({
    projectId: p.projectId,
    projectName: p.projectId ? (nameOf.get(p.projectId) ?? null) : null,
    name: p.name,
    program: p.program as LadxProgram,
  }));

  return (
    <>
      <WorkspaceHeader
        title="Convert"
        subtitle="Ladder into Structured Text, SCL, neutral text or PLCopen XML."
      />
      <ConvertWorkbench
        ladderHref="/studio/ladder"
        onSaveRecord={saveRecordViaApi}
        askModel={askModelViaApi}
        unreadable={broken.map((b) => b.name)}
        initialProjectId={wanted && nameOf.has(wanted) ? wanted : null}
        sources={sources}
        companyName={company?.name ?? null}
        author={user.displayName ?? user.email.split("@")[0] ?? ""}
        coreImport={coreImportViaApi}
      />
      {/* The routines the ladder editor could not take from the uploaded file. */}
      {wanted && nameOf.has(wanted) && <OtherLanguages projectId={wanted} />}
    </>
  );
}
