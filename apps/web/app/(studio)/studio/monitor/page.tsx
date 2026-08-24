import Monitor, { type ProgramSource } from "@/components/studio/monitor";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { partitionRunnable } from "@/lib/ladder/runnable";
import { getCompany, listProjects } from "@/lib/platform/queries";
import type { LadxProgram } from "@ladx/studio";

export const dynamic = "force-dynamic";

/**
 * Monitor.
 *
 * Every program this user has saved, ready to run. The list comes from the
 * ladder_programs table rather than from browser storage, which is what makes a
 * program written on one machine runnable on another and attachable to the job
 * it belongs to.
 */
export default async function MonitorPage({
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

  const sources: ProgramSource[] = runnable.map((p) => ({
    projectId: p.projectId,
    projectName: p.projectId ? (nameOf.get(p.projectId) ?? null) : null,
    name: p.name,
    program: p.program as LadxProgram,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <>
      <WorkspaceHeader
        title="Monitor"
        subtitle="Run the logic, force the inputs, and record what happened."
      />
      <Monitor
        unreadable={broken.map((b) => b.name)}
        initialProjectId={wanted && nameOf.has(wanted) ? wanted : null}
        sources={sources}
        companyName={company?.name ?? null}
        author={user.displayName ?? user.email.split("@")[0] ?? ""}
      />
    </>
  );
}
