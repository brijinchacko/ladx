import HmiHomeClient from "@/components/studio/hmi-home-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { hmiProjects } from "@/lib/db/schema";
import { listProjects } from "@/lib/platform/queries";
import type { HmiRow } from "@ladx/hmi";
import type { HmiDoc } from "@ladx/hmi";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * HMI.
 *
 * A SCADA application belongs to a project, because that is where its tags
 * are: the screens bind to the ladder program's tag table rather than to a
 * second one kept in step by hand.
 */
export default async function HmiPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project: wanted } = await searchParams;

  const [rows, projects] = await Promise.all([
    db()
      .select()
      .from(hmiProjects)
      .where(eq(hmiProjects.userId, user.id))
      .orderBy(desc(hmiProjects.updatedAt)),
    listProjects(user.id),
  ]);

  const nameOf = new Map(projects.map((p) => [p.id, p.name]));
  const applications: HmiRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    projectId: r.projectId,
    projectName: r.projectId ? (nameOf.get(r.projectId) ?? null) : null,
    // Counted defensively: the column is jsonb and a row from an older build
    // can be any shape, and a home screen that throws is worse than one that
    // says zero.
    screens: Array.isArray((r.doc as HmiDoc | null)?.screens)
      ? (r.doc as HmiDoc).screens.length
      : 0,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <>
      <WorkspaceHeader
        title="HMI"
        subtitle="Operator screens, bound to the same tags the ladder runs on."
      />
      <HmiHomeClient
        applications={applications}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultProjectId={wanted && nameOf.has(wanted) ? wanted : null}
      />
    </>
  );
}
