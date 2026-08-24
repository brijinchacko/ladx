import CadEditor from "@/components/cad/cad-editor";
import { requireUser } from "@/lib/auth/server";
import type { Drawing } from "@/lib/cad/types";
import { emptyDrawing } from "@/lib/cad/types";
import { db } from "@/lib/db/client";
import { cadDrawings, clients, projects } from "@/lib/db/schema";
import { getCompany, listProjects } from "@/lib/platform/queries";
import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One drawing.
 *
 * The project, client and company come down with it so the generated title
 * block carries the same project number that is on the FDS and the same company
 * name that is on the letterhead. A drawing whose title block disagrees with the
 * document pack is the sort of thing that gets picked up at handover.
 */
export default async function CadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db()
    .select({
      drawing: cadDrawings,
      projectName: projects.name,
      projectCode: projects.code,
      clientName: clients.name,
    })
    .from(cadDrawings)
    .leftJoin(projects, eq(projects.id, cadDrawings.projectId))
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(cadDrawings.id, id), eq(cadDrawings.userId, user.id)))
    .limit(1);
  if (!row) notFound();

  // Every sheet in this set, for the tree. A drawing filed against a project is
  // one sheet of that project's package; a loose one sits with the other loose
  // ones, which is the only grouping there is for it.
  const [company, sheets, userProjects] = await Promise.all([
    getCompany(user.id),
    db()
      .select({ id: cadDrawings.id, name: cadDrawings.name, updatedAt: cadDrawings.updatedAt })
      .from(cadDrawings)
      .where(
        row.drawing.projectId
          ? and(eq(cadDrawings.userId, user.id), eq(cadDrawings.projectId, row.drawing.projectId))
          : and(eq(cadDrawings.userId, user.id), isNull(cadDrawings.projectId)),
      )
      .orderBy(cadDrawings.name),
    listProjects(user.id),
  ]);

  return (
    <CadEditor
      drawingId={row.drawing.id}
      projectId={row.drawing.projectId}
      sheets={sheets.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() }))}
      projects={userProjects.map((p) => ({ id: p.id, name: p.name }))}
      name={row.drawing.name}
      initial={(row.drawing.data as Drawing) ?? emptyDrawing()}
      projectName={row.projectName ?? undefined}
      titleFields={{
        projectName: row.projectName ?? undefined,
        projectNumber: row.projectCode ?? undefined,
        client: row.clientName ?? undefined,
        company: company?.name ?? undefined,
        drawnBy: user.displayName ?? user.email.split("@")[0],
      }}
    />
  );
}
