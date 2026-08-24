import ConvertWorkbench, { type ConvertSource } from "@/components/studio/convert-workbench";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { getCompany, listProjects } from "@/lib/platform/queries";
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
export default async function StudioConvertPage() {
  const user = await requireUser();
  const [programs, projects, company] = await Promise.all([
    listPrograms(user.id),
    listProjects(user.id),
    getCompany(user.id),
  ]);

  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const sources: ConvertSource[] = programs.map((p) => ({
    projectId: p.projectId,
    projectName: p.projectId ? (nameOf.get(p.projectId) ?? null) : null,
    name: p.name,
    program: p.program as LadxProgram,
  }));

  return (
    <>
      <WorkspaceHeader
        title="Convert"
        subtitle="Ladder into Structured Text, SCL, neutral text or PLCopen XML. Runs in your browser; nothing is uploaded."
      />
      <ConvertWorkbench
        sources={sources}
        companyName={company?.name ?? null}
        author={user.displayName ?? user.email.split("@")[0] ?? ""}
      />
    </>
  );
}
