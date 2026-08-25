import { PhaseSelect } from "@/components/platform/project-controls";
import DeliverableRow from "@/components/studio/deliverable-row";
import DocumentList from "@/components/studio/document-list";
import OnboardingGate from "@/components/studio/onboarding-gate";
import PhaseNav from "@/components/studio/phase-nav";
import ProjectBriefPanel from "@/components/studio/project-brief";
import ProjectChatDock from "@/components/studio/project-chat-dock";
import ProjectDrawings from "@/components/studio/project-drawings";
import ProjectPlanner, { type PlannerTask } from "@/components/studio/project-planner";
import ProjectSummary from "@/components/studio/project-summary";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { UploadButton } from "@/components/upload-button";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { cadDrawings, documents, ladderPrograms, projectTasks } from "@/lib/db/schema";
import { missingFor } from "@/lib/platform/brief";
import { ACTIVE_PHASES, PHASES, deliverablesFor, getPhase } from "@/lib/platform/lifecycle";
import { getClient, getCompany, getProject, listClients } from "@/lib/platform/queries";
import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const TOOL_LINK: Record<string, { href: string; label: string }> = {
  ladder: { href: "/studio/ladder", label: "Ladder editor" },
  chat: { href: "/studio", label: "Chat" },
  convert: { href: "/studio/convert", label: "Convert" },
  knowledge: { href: "/studio/knowledge", label: "Knowledge" },
  documents: { href: "/studio/documents", label: "Template library" },
};

/**
 * The project workspace.
 *
 * This is where the platform stops being five separate tools and becomes one.
 * The design basis sits at the top, because it is what every document on the
 * page is written from. The lifecycle runs under it, the current phase shows the
 * documents it produces, and the tools for the phase are one click away. A
 * person running a real job works down this page.
 *
 * Deleting the project is not on it. A destructive action does not belong on the
 * page you are working in all day, one slip away from the phase selector; it
 * lives on the project's row in the sidebar, where you are choosing between
 * projects rather than working inside one.
 */
/**
 * Rungs in a stored program, without trusting its shape.
 *
 * The column is jsonb, so a row written by an older build can be any shape at
 * all. A project page that throws because one program is odd is worse than one
 * that says zero.
 */
function rungCount(program: unknown): number {
  if (!program || typeof program !== "object") return 0;
  const p = program as { routines?: unknown; rungs?: unknown };
  // Routines win when present, and a program saved before routines existed
  // still has its rungs on the flat field. Counting only one of the two
  // reports half the library as empty.
  if (Array.isArray(p.routines) && p.routines.length > 0) {
    return p.routines.reduce(
      (n: number, r: unknown) =>
        n +
        (Array.isArray((r as { rungs?: unknown })?.rungs)
          ? (r as { rungs: unknown[] }).rungs.length
          : 0),
      0,
    );
  }
  return Array.isArray(p.rungs) ? p.rungs.length : 0;
}

export default async function ProjectWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { phase: phaseParam } = await searchParams;
  const project = await getProject(user.id, id);
  if (!project) notFound();

  const [company, client, projectDocs, drawings, tasks, clients, programs] = await Promise.all([
    getCompany(user.id),
    project.clientId ? getClient(user.id, project.clientId) : Promise.resolve(null),
    db()
      .select({
        id: documents.id,
        title: documents.title,
        kind: documents.kind,
        templateSlug: documents.templateSlug,
        fileName: documents.fileName,
        mimeType: documents.mimeType,
        byteSize: documents.byteSize,
        projectId: documents.projectId,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(and(eq(documents.userId, user.id), eq(documents.projectId, id)))
      .orderBy(desc(documents.updatedAt)),
    db()
      .select({
        id: cadDrawings.id,
        name: cadDrawings.name,
        updatedAt: cadDrawings.updatedAt,
      })
      .from(cadDrawings)
      .where(and(eq(cadDrawings.userId, user.id), eq(cadDrawings.projectId, id)))
      .orderBy(desc(cadDrawings.updatedAt)),
    db()
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.userId, user.id), eq(projectTasks.projectId, id)))
      .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt)),
    listClients(user.id),
    db()
      .select({
        id: ladderPrograms.id,
        name: ladderPrograms.name,
        program: ladderPrograms.program,
        updatedAt: ladderPrograms.updatedAt,
      })
      .from(ladderPrograms)
      .where(and(eq(ladderPrograms.userId, user.id), eq(ladderPrograms.projectId, id))),
  ]);

  // A deliverable that has already been started opens rather than regenerating,
  // so an edited document is never silently replaced by a fresh template.
  const startedByTemplate = new Map(
    projectDocs.filter((d) => d.templateSlug).map((d) => [d.templateSlug as string, d.id]),
  );

  // The phase being looked at, which is not necessarily the one the project is
  // in: looking ahead at what the FAT needs should not move the project into it.
  const viewingId = ACTIVE_PHASES.some((p) => p.id === phaseParam)
    ? (phaseParam as typeof project.phase)
    : project.phase;
  const onSummary = viewingId === "summary";
  const currentPhase = getPhase(viewingId);
  const deliverables = deliverablesFor(viewingId);
  const companyReady = Boolean(company?.name);

  return (
    <>
      <WorkspaceHeader
        title={project.name}
        subtitle={[project.code, client?.name, project.site].filter(Boolean).join("  ·  ")}
        actions={
          <>
            <OnboardingGate
              projectId={project.id}
              projectName={project.name}
              brief={project.brief ?? {}}
              onboarded={Boolean(project.onboardedAt)}
            />
            <PhaseSelect
              projectId={project.id}
              phase={project.phase}
              phases={PHASES.map((p) => ({ id: p.id, name: p.name, step: p.step }))}
            />
          </>
        }
      />

      {/* The pane scrolls, not the page, so the sidebar and this header stay put. */}
      {/* `relative` is load-bearing, not decoration. The upload inputs inside
          are Tailwind `sr-only`, which is position:absolute, and with no
          positioned ancestor they resolve against the initial containing block
          instead of this scroller. Their static position sits deep in the
          content, so they landed a thousand pixels down the document and
          stretched the page itself: the whole shell scrolled and the sidebar
          slid up out of view. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-7">
          <nav className="mb-5 font-mono text-[11.5px] text-ink-400">
            <Link href="/studio/projects" className="hover:text-ink-700">
              Projects
            </Link>
            <span className="mx-2" aria-hidden="true">
              /
            </span>
            {client ? (
              <Link href={`/studio/clients/${client.id}`} className="hover:text-ink-700">
                {client.name}
              </Link>
            ) : (
              <span className="text-ink-300">No client assigned</span>
            )}
          </nav>

          {project.description && (
            <p className="mb-7 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">
              {project.description}
            </p>
          )}

          {/*
            The lifecycle, pinned. It is what you steer with, so it stays put
            while the rest of the page scrolls under it.
          */}
          <PhaseNav
            projectId={project.id}
            viewing={viewingId}
            current={project.phase}
            phases={ACTIVE_PHASES.map((p) => {
              const items = deliverablesFor(p.id);
              return {
                id: p.id,
                step: p.step,
                name: p.name,
                purpose: p.purpose,
                deliverableCount: items.length,
                startedCount: items.filter((d) => startedByTemplate.has(d.slug)).length,
              };
            })}
          />

          {project.description && !onSummary && (
            <p className="mb-7 mt-6 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">
              {project.description}
            </p>
          )}

          {/*
            Summary is the project itself: its own details, the plan, and the
            design basis. Every other phase is the documents it produces.
          */}
          {onSummary ? (
            <div className="mt-6 space-y-8">
              <ProjectSummary
                projectId={project.id}
                fields={{
                  name: project.name,
                  code: project.code,
                  site: project.site,
                  description: project.description,
                  clientId: project.clientId,
                }}
                clients={clients.map((c) => ({ id: c.id, name: c.name }))}
                brief={project.brief ?? {}}
                counts={{
                  documents: projectDocs.length,
                  drawings: drawings.length,
                  programs: programs.length,
                }}
              />

              <ProjectPlanner
                projectId={project.id}
                clientName={client?.name ?? null}
                startedSlugs={[...startedByTemplate.keys()]}
                tasks={tasks.map(
                  (t): PlannerTask => ({
                    id: t.id,
                    title: t.title,
                    detail: t.detail,
                    phase: t.phase,
                    status: t.status,
                    owner: t.owner,
                    startsOn: t.startsOn,
                    dependsOn: t.dependsOn,
                    dueOn: t.dueOn,
                    templateSlug: t.templateSlug,
                    position: t.position,
                  }),
                )}
              />

              <ProjectBriefPanel projectId={project.id} brief={project.brief ?? {}} />
            </div>
          ) : (
            <div className="mt-6">
              {/* current phase */}
              <section className="mb-10 rounded-sm border border-ink-200 bg-white">
                <div className="border-b border-ink-100 bg-ink-50/60 px-5 py-3">
                  <div className="flex items-baseline gap-3">
                    <h2 className="font-display text-[1.05rem] font-bold text-ink-900">
                      {currentPhase.step ? `${currentPhase.step}. ` : ""}
                      {currentPhase.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-[13.5px] text-ink-500">{currentPhase.purpose}</p>
                </div>

                <div className="p-5">
                  {!companyReady && (
                    <p className="mb-5 rounded-sm border-l-2 border-amber-500 bg-amber-50 py-2 pl-3 text-[13px] text-amber-800">
                      Add your company profile in{" "}
                      <Link href="/studio/settings" className="underline">
                        Settings
                      </Link>{" "}
                      so generated documents carry your logo and letterhead.
                    </p>
                  )}

                  {deliverables.length > 0 ? (
                    <>
                      <h3 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                        Deliverables
                      </h3>
                      <ul className="space-y-2.5">
                        {deliverables.map((d) => (
                          <DeliverableRow
                            key={d.slug}
                            projectId={project.id}
                            slug={d.slug}
                            title={d.title}
                            abbr={d.abbr}
                            summary={d.summary}
                            existingId={startedByTemplate.get(d.slug) ?? null}
                            missing={missingFor(d.slug, project.brief)}
                          />
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-[13.5px] text-ink-500">
                      No documents in this phase. The project is complete.
                    </p>
                  )}

                  {currentPhase.tools.length > 0 && (
                    <div className="mt-6 border-t border-ink-100 pt-4">
                      <h3 className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                        Tools for this phase
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {currentPhase.tools.map((t) => {
                          const link = TOOL_LINK[t];
                          if (!link) return null;
                          return (
                            <Link
                              key={t}
                              href={link.href}
                              className="rounded-sm border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900"
                            >
                              {link.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* every document filed against this project */}
              <section id="documents" className="mb-10 scroll-mt-16">
                <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">
                  Documents{projectDocs.length > 0 && ` (${projectDocs.length})`}
                </h2>
                <p className="mb-3 text-[13px] text-ink-500">
                  Everything generated or uploaded for this project. Generated documents open in the
                  Studio editor.
                </p>
                <DocumentList
                  documents={projectDocs.map((d) => ({
                    ...d,
                    updatedAt: d.updatedAt.toISOString(),
                  }))}
                  projectId={project.id}
                  emptyHint="No documents yet. Create one from the deliverables above, or upload a file."
                />
              </section>

              {/* CAD */}
              <section className="mb-10">
                <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">
                  Drawings{drawings.length > 0 && ` (${drawings.length})`}
                </h2>
                <p className="mb-3 text-[13px] text-ink-500">
                  Panel layouts, wiring schematics and general arrangements, drawn here or imported.
                </p>
                <ProjectDrawings
                  projectId={project.id}
                  drawings={drawings.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() }))}
                />
              </section>

              {/* The ladder program written for this project. Separate from the
                  uploaded file below: one is authored here, the other is
                  somebody else's export. Both can exist at once. */}
              <section className="rounded-sm border border-ink-100 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-ink-900">Ladder program</h2>
                    <p className="mt-0.5 text-[13px] text-ink-500">
                      {programs.length > 0
                        ? (() => {
                            const n = rungCount(programs[0]?.program);
                            return `${programs[0]?.name ?? "Untitled"} · ${n} rung${n === 1 ? "" : "s"}`;
                          })()
                        : "Nothing written for this project yet."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/studio/ladder?project=${project.id}`}
                      className="rounded-sm border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
                    >
                      {programs.length > 0 ? "Open in Ladder" : "Write one"}
                    </Link>
                    {programs.length > 0 && (
                      <>
                        <Link
                          href={`/studio/monitor?project=${project.id}`}
                          className="rounded-sm border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
                        >
                          Run it
                        </Link>
                        <Link
                          href={`/studio/convert?project=${project.id}`}
                          className="rounded-sm border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
                        >
                          Convert
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* the PLC file, if one was uploaded to this project */}
              <section className="rounded-sm border border-ink-100 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-[15px] font-semibold text-ink-900">PLC program file</h2>
                    <p className="mt-0.5 text-[13px] text-ink-500">
                      {project.r2Key
                        ? `${project.vendor ?? "Uploaded"} · ${
                            project.tagCount
                          } tags · ${project.routineCount} routines`
                        : "Optional. Upload an L5X or PLCopen file to parse and chat against it."}
                    </p>
                  </div>
                  {!project.r2Key && <UploadButton />}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <ProjectChatDock projectId={project.id} projectName={project.name} />
    </>
  );
}
