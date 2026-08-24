import CadEditor from "@/components/cad/cad-editor";
import { requireUser } from "@/lib/auth/server";
import type { Drawing } from "@/lib/cad/types";
import { emptyDrawing } from "@/lib/cad/types";
import { db } from "@/lib/db/client";
import { cadDrawings, clients, projects } from "@/lib/db/schema";
import { getCompany } from "@/lib/platform/queries";
import { and, eq } from "drizzle-orm";
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

  const company = await getCompany(user.id);

  return (
    <CadEditor
      drawingId={row.drawing.id}
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
