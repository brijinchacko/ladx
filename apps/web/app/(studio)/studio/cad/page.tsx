import CadHome, { type CadRow } from "@/components/studio/cad-home";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { cadDrawings, projects } from "@/lib/db/schema";
import { getCompany, listProjects } from "@/lib/platform/queries";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * CAD, before a drawing is open.
 *
 * Leads with the sheets somebody would actually start, rather than a list of
 * files and a New button. The set a control panel ships with already exists;
 * making people find it after opening a blank canvas would waste the one thing
 * this tool has over a generic drawing app.
 */
export default async function CadIndexPage() {
  const user = await requireUser();

  const [rows, userProjects, company] = await Promise.all([
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
    getCompany(user.id),
  ]);

  const drawings: CadRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    projectId: r.projectId,
    projectName: r.projectName,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <>
      <WorkspaceHeader
        title="CAD"
        subtitle={`${drawings.length} drawing${drawings.length === 1 ? "" : "s"}. Panel layouts, schematics and general arrangements.`}
      />
      <CadHome
        drawings={drawings}
        projects={userProjects.map((p) => ({ id: p.id, name: p.name }))}
        company={company ? { name: company.name ?? undefined } : null}
      />
    </>
  );
}
