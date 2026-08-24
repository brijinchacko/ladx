import { requireUser } from "@/lib/auth/server";
import { listProjects } from "@/lib/platform/queries";
import LadderClient from "./ladder-client";

export const dynamic = "force-dynamic";

/**
 * Ladder.
 *
 * Deliberately has no WorkspaceHeader: the editor brings its own menu bar
 * (File, Edit, View, History, Help) and stacking a second header above it
 * wastes vertical space on the one tool that needs it most. The thin project
 * bar earns its line by being the thing that connects a program to a job.
 */
export default async function LadderPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);
  return <LadderClient projects={projects.map((p) => ({ id: p.id, name: p.name }))} />;
}
