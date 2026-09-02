import { ProjectContext } from "@/components/studio/project-context";
import { SchedulesClient } from "@/components/studio/schedules-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { partitionRunnable } from "@/lib/ladder/runnable";
import { listProjects } from "@/lib/platform/queries";

export const dynamic = "force-dynamic";

/**
 * Schedules: the I/O list and the alarm list, read out of a program.
 *
 * Both normally exist twice, once in the PLC and once in a spreadsheet, and
 * they drift from the day the spreadsheet is written. Reading them from the
 * program means they cannot drift, and it means they are right about the
 * version somebody is actually holding rather than the one they exported in
 * March.
 */
export default async function SchedulesPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project: wanted } = await searchParams;
  const [programs, projects] = await Promise.all([listPrograms(user.id), listProjects(user.id)]);
  // A stored program can be any shape, and a schedule built from one that
  // cannot be read would be a schedule built from nothing.
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
        title="Schedules"
        subtitle="The I/O list and the alarm list, read out of the program rather than kept beside it. Nothing here is typed twice, so nothing here can drift."
      />
      {/* The programs go across whole rather than being fetched again by id.
          The page already has them, and the route that serves one takes a
          project id rather than a program id, so re-fetching would have been
          both a round trip and the wrong key. */}
      <ProjectContext projectId={inProject?.id ?? null} projectName={inProject?.name ?? null} />
      <SchedulesClient
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
