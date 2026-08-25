import { requireUser } from "@/lib/auth/server";
import { SCRATCH, listPrograms } from "@/lib/db/ladder";
import { listProjects } from "@/lib/platform/queries";
import { type LadxProgram, programRoutines } from "@ladx/studio";
import LadderClient from "./ladder-client";

export const dynamic = "force-dynamic";

/**
 * Ladder.
 *
 * No WorkspaceHeader: the editor brings its own menu bar and stacking a second
 * header above it wastes vertical space on the one tool that needs it most. The
 * home screen inside carries its own heading instead.
 */
/** Rungs across every routine, tolerant of both the flat and routine shapes. */
function rungsIn(program: LadxProgram | null | undefined): number {
  if (!program) return 0;
  try {
    return programRoutines(program).reduce((n, r) => n + (r.rungs?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

export default async function LadderPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project: wanted } = await searchParams;
  const [projects, stored] = await Promise.all([listProjects(user.id), listPrograms(user.id)]);

  const nameOf = new Map(projects.map((p) => [p.id, p.name]));

  // Checked against the user's own projects rather than trusted: the id comes
  // from a query string, and opening the editor onto somebody else's project id
  // would at best show an empty program under a name that is not theirs.
  // "scratch" is the exception and is a real destination: it is the unattached
  // program, and the HMI editor links back to it for an application filed
  // against no project.
  const initialProjectId = wanted === SCRATCH || (wanted && nameOf.has(wanted)) ? wanted : null;

  return (
    <LadderClient
      initialProjectId={initialProjectId}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      programs={stored.map((s) => ({
        projectId: s.projectId,
        projectName: s.projectId ? (nameOf.get(s.projectId) ?? null) : null,
        name: s.name,
        // Counted through programRoutines, never off the flat `rungs` field.
        // A program saved with routines has an empty flat list, so reading it
        // directly reported every multi-routine program as "0 rungs".
        rungs: rungsIn(s.program as LadxProgram),
        updatedAt: s.updatedAt.toISOString(),
      }))}
    />
  );
}
