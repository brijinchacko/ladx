import CadEditor from "@/components/cad/cad-editor";
import { requireUser } from "@/lib/auth/server";
import type { Drawing } from "@/lib/cad/types";
import { emptyDrawing } from "@/lib/cad/types";
import { db } from "@/lib/db/client";
import { cadDrawings, projects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db()
    .select({ drawing: cadDrawings, projectName: projects.name })
    .from(cadDrawings)
    .leftJoin(projects, eq(projects.id, cadDrawings.projectId))
    .where(and(eq(cadDrawings.id, id), eq(cadDrawings.userId, user.id)))
    .limit(1);
  if (!row) notFound();

  return (
    <CadEditor
      drawingId={row.drawing.id}
      name={row.drawing.name}
      initial={(row.drawing.data as Drawing) ?? emptyDrawing()}
      projectName={row.projectName ?? undefined}
    />
  );
}
