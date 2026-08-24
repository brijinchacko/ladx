import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { listProjects } from "@/lib/platform/queries";
import type { LadxProgram } from "@ladx/studio";
import LadderClient from "./ladder-client";

export const dynamic = "force-dynamic";

/**
 * Ladder.
 *
 * No WorkspaceHeader: the editor brings its own menu bar and stacking a second
 * header above it wastes vertical space on the one tool that needs it most. The
 * home screen inside carries its own heading instead.
 */
export default async function LadderPage() {
  const user = await requireUser();
  const [projects, stored] = await Promise.all([listProjects(user.id), listPrograms(user.id)]);

  const nameOf = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <LadderClient
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      programs={stored.map((s) => ({
        projectId: s.projectId,
        projectName: s.projectId ? (nameOf.get(s.projectId) ?? null) : null,
        name: s.name,
        rungs: (s.program as LadxProgram)?.rungs?.length ?? 0,
        updatedAt: s.updatedAt.toISOString(),
      }))}
    />
  );
}
