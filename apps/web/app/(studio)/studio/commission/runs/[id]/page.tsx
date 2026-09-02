import { TestRunClient } from "@/components/studio/test-run-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects, testRuns } from "@/lib/db/schema";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One acceptance test, being carried out.
 *
 * Laid out for a phone as much as a desk, because on site the laptop is on
 * the panel and the engineer is at the valve. Each step is a card with three
 * large buttons and a line for what was seen; the result is saved as it is
 * ticked, so a dead battery loses nothing.
 */
export default async function TestRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db()
    .select({ run: testRuns, projectName: projects.name })
    .from(testRuns)
    .leftJoin(projects, eq(projects.id, testRuns.projectId))
    .where(and(eq(testRuns.id, id), inArray(testRuns.userId, await accessIds(user.id))))
    .limit(1);
  if (!row) notFound();
  const { run, projectName } = row;

  return (
    <>
      <WorkspaceHeader
        title={run.title}
        subtitle={[
          run.kind === "sat" ? "Site acceptance test" : "Factory acceptance test",
          projectName,
        ]
          .filter(Boolean)
          .join("  ·  ")}
        actions={
          <Link
            href={
              run.projectId ? `/studio/commission?project=${run.projectId}` : "/studio/commission"
            }
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
          >
            Back to Commissioning
          </Link>
        }
      />
      <TestRunClient
        run={{
          id: run.id,
          title: run.title,
          kind: run.kind,
          plan: run.plan as Parameters<typeof TestRunClient>[0]["run"]["plan"],
          results: (run.results ?? {}) as Parameters<typeof TestRunClient>[0]["run"]["results"],
          notes: run.notes ?? "",
          signedBy: run.signedBy,
          signedRole: run.signedRole,
          signedAt: run.signedAt?.toISOString() ?? null,
          documentId: run.documentId,
        }}
        defaultSigner={user.displayName ?? ""}
      />
    </>
  );
}
