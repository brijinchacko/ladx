import { TagXref } from "@/components/studio/tag-xref";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { getProject } from "@/lib/platform/queries";
import { xrefForProject } from "@/lib/xref/load";
import { xrefFindings } from "@/lib/xref/xref";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Where every tag is used.
 *
 * One page for the question that used to take five tools to answer: the rungs
 * that read and write it, the screens that show it, the drawings that label
 * it, the alarms that watch it. Built from what is stored, on every open, so
 * it is never out of date with respect to the program.
 */
export default async function ProjectTagsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tag?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tag } = await searchParams;

  const project = await getProject(user.id, id);
  if (!project) notFound();

  const entries = await xrefForProject(user.id, id);
  const findings = xrefFindings(entries);

  return (
    <>
      <WorkspaceHeader
        title="Where used"
        subtitle={`${project.name}: every tag, and every place it appears`}
        actions={
          <Link
            href={`/studio/projects/${id}`}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
          >
            Back to project
          </Link>
        }
      />
      <TagXref
        projectId={id}
        entries={entries}
        findings={findings}
        initialTag={tag ?? null}
        hasProgram={entries.some((e) => e.declared)}
      />
    </>
  );
}
