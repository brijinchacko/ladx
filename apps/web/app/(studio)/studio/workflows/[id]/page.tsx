import { WorkflowRunClient } from "@/components/studio/workflow-run-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects, workflowRuns } from "@/lib/db/schema";
import { listWorkflows } from "@/lib/parsers/spawn";
import type { WorkflowRun } from "@/lib/parsers/spawn";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** One run, read back: every step, what went in, what came out. */
export default async function WorkflowRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db()
    .select({ run: workflowRuns, projectName: projects.name })
    .from(workflowRuns)
    .leftJoin(projects, eq(projects.id, workflowRuns.projectId))
    .where(and(eq(workflowRuns.id, id), inArray(workflowRuns.userId, await accessIds(user.id))))
    .limit(1);
  if (!row) notFound();

  let definition = null;
  try {
    definition = (await listWorkflows()).find((w) => w.name === row.run.workflow) ?? null;
  } catch {
    definition = null;
  }

  return (
    <>
      <WorkspaceHeader
        title={row.run.request}
        subtitle={[row.run.workflow, row.projectName].filter(Boolean).join("  ·  ")}
        actions={
          <Link
            href={`/studio/workflows${row.run.projectId ? `?project=${row.run.projectId}` : ""}`}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
          >
            All runs
          </Link>
        }
      />
      <WorkflowRunClient
        id={row.run.id}
        definition={definition}
        initialRun={(row.run.run as WorkflowRun | null) ?? null}
        initialStatus={row.run.status}
        initialError={row.run.lastError ?? null}
      />
    </>
  );
}
