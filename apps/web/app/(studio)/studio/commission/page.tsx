import { CommissionClient } from "@/components/studio/commission-client";
import { ProjectContext } from "@/components/studio/project-context";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { partitionRunnable } from "@/lib/ladder/runnable";
import { listProjects } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

/**
 * Commissioning: what gets checked before a machine is handed over.
 *
 * The work at the end of a job is mostly reading the program back and writing
 * down what it does: the sequence, the test steps, the tag lists, the pack.
 * All of it is already in the program, and all of it is normally retyped by
 * somebody who has moved on to the next job, which is why handover documents
 * are late and wrong.
 *
 * Nothing here has been carried out. These are steps for a person, and the
 * pack says so on its own manifest rather than letting its own size imply
 * otherwise.
 */
export default async function CommissionPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project: wanted } = await searchParams;
  const [programs, projects] = await Promise.all([listPrograms(user.id), listProjects(user.id)]);
  const { runnable } = partitionRunnable(programs);

  // The project carried in from wherever this was opened, if it was opened
  // from a project at all. A program is one per project, so the project picks
  // the program; nothing here has to guess.
  const inProject = wanted ? (projects.find((p) => p.id === wanted) ?? null) : null;
  const openOn = inProject
    ? (runnable.find((p) => p.projectId === inProject.id)?.id ?? null)
    : null;

  return (
    <>
      <WorkspaceHeader
        title="Commissioning"
        subtitle="The sequence, the acceptance tests, the tag comparison and the handover pack, all read out of the program. Nothing here has been carried out; these are steps for a person."
      />
      <ProjectContext projectId={inProject?.id ?? null} projectName={inProject?.name ?? null} />
      <CommissionClient
        programs={runnable.map((p) => ({
          id: p.id,
          name: p.name,
          program: p.program,
          projectId: p.projectId,
        }))}
        openOn={openOn}
      />
    </>
  );
}
