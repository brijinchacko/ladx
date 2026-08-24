import CadList from "@/components/studio/cad-list";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { cadDrawings, projects } from "@/lib/db/schema";
import { listProjects } from "@/lib/platform/queries";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function CadIndexPage() {
  const user = await requireUser();

  const [drawings, projectList] = await Promise.all([
    db()
      .select({
        id: cadDrawings.id,
        name: cadDrawings.name,
        projectId: cadDrawings.projectId,
        projectName: projects.name,
        updatedAt: cadDrawings.updatedAt,
      })
      .from(cadDrawings)
      .leftJoin(projects, eq(projects.id, cadDrawings.projectId))
      .where(eq(cadDrawings.userId, user.id))
      .orderBy(desc(cadDrawings.updatedAt)),
    listProjects(user.id),
  ]);

  return (
    <>
      <WorkspaceHeader
        title="CAD"
        subtitle="2D drafting for panel layouts, wiring schematics and general arrangements."
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          <CadList
            drawings={drawings.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() }))}
            projects={projectList.map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>
      </div>
    </>
  );
}
