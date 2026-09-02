import { ProjectContext } from "@/components/studio/project-context";
import { WorkflowsClient } from "@/components/studio/workflows-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { listProjects } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

/**
 * Workflows: several specialists on one job, with the checks as the gates.
 *
 * A model step proposes; a check step decides; a person step waits. The
 * engine that runs them is the same one the desktop will run, and it never
 * calls a model itself: this page drives it, one step at a time, and keeps
 * everything said. Nothing a run produces claims a validation level above
 * what LADX may award.
 */
export default async function WorkflowsPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project: wanted } = await searchParams;
  const [projects, programs] = await Promise.all([listProjects(user.id), listPrograms(user.id)]);

  const withProgram = new Set(programs.map((p) => p.projectId).filter(Boolean) as string[]);
  const inProject = wanted ? (projects.find((p) => p.id === wanted) ?? null) : null;

  return (
    <>
      <WorkspaceHeader
        title="Workflows"
        subtitle="Several specialists on one job. A model proposes, a check decides, a person confirms."
      />
      <ProjectContext projectId={inProject?.id ?? null} projectName={inProject?.name ?? null} />
      <WorkflowsClient
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          hasProgram: withProgram.has(p.id),
        }))}
        initialProjectId={inProject?.id ?? null}
      />
    </>
  );
}
