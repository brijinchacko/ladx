import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { SCRATCH } from "@/lib/db/ladder";
import { hmiProjects } from "@/lib/db/schema";
import { listProjects } from "@/lib/platform/queries";
import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * "Open this project's HMI", resolved on the server.
 *
 * The ladder editor knows which project is open and nothing else; whether that
 * project has an HMI application, and which one, is a question for the
 * database. Answering it here rather than in the editor means the link is
 * right even when the application was created in another tab a minute ago.
 *
 * One application, go straight to it. Several, or none, go to the list with
 * the project already chosen, because picking between two is a decision and
 * creating one is a side effect that has no business happening on a GET.
 */
export default async function OpenHmiPage({
  searchParams,
}: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireUser();
  const { project } = await searchParams;

  // Checked against the user's own projects rather than trusted: the id comes
  // from a query string, and resolving somebody else's would at best land on
  // an empty list under a name that is not theirs.
  const projects = await listProjects(user.id);
  const scratch = project === SCRATCH || !project;
  const projectId = scratch ? null : (projects.find((p) => p.id === project)?.id ?? null);
  if (!scratch && !projectId) redirect("/studio/hmi");

  const rows = await db()
    .select({ id: hmiProjects.id })
    .from(hmiProjects)
    .where(
      projectId === null
        ? and(eq(hmiProjects.userId, user.id), isNull(hmiProjects.projectId))
        : and(eq(hmiProjects.userId, user.id), eq(hmiProjects.projectId, projectId)),
    )
    .orderBy(desc(hmiProjects.updatedAt));

  if (rows.length === 1 && rows[0]) redirect(`/studio/hmi/${rows[0].id}`);
  redirect(projectId ? `/studio/hmi?project=${encodeURIComponent(projectId)}` : "/studio/hmi");
}
