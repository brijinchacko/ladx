import PlannerWorkspace from "@/components/studio/planner-workspace";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projectTasks } from "@/lib/db/schema";
import { listClients, listProjects } from "@/lib/platform/queries";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * The planner, as a tool rather than a tab inside one project.
 *
 * A project page can only ever answer "what is left on this job". The question
 * that actually decides what somebody does on Monday is "what is happening
 * across all of them", and that needs every project's tasks on one timeline
 * with the same today line through them.
 *
 * It sits under Workspace rather than Tools: Ladder and CAD make things, this
 * is about the work itself, which is the same distinction that puts Clients
 * there.
 */
export default async function PlannerPage({
  searchParams,
}: { searchParams: Promise<{ project?: string; client?: string }> }) {
  const user = await requireUser();
  const { project: wanted, client: wantedClient } = await searchParams;

  const [projects, clients, tasks] = await Promise.all([
    listProjects(user.id),
    listClients(user.id),
    db()
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.userId, user.id))
      .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt)),
  ]);

  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <>
      <WorkspaceHeader
        title="Planner"
        subtitle="Every project on one timeline. Drag a bar to reschedule it."
      />
      <PlannerWorkspace
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          clientId: p.clientId,
          phase: p.phase,
        }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          phase: t.phase,
          status: t.status,
          startsOn: t.startsOn,
          dueOn: t.dueOn,
          dependsOn: t.dependsOn,
          owner: t.owner,
          projectId: t.projectId,
          projectName: projectById.get(t.projectId)?.name ?? null,
        }))}
        initialProjectId={wanted && projectById.has(wanted) ? wanted : null}
        initialClientId={wantedClient ?? null}
      />
    </>
  );
}
