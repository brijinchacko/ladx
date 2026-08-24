import { DeleteProjectButton, PhaseSelect } from "@/components/platform/project-controls";
import { UploadButton } from "@/components/upload-button";
import { getTemplate } from "@/content/templates";
import { requireUser } from "@/lib/auth/server";
import { ACTIVE_PHASES, PHASES, deliverablesFor, getPhase } from "@/lib/platform/lifecycle";
import { getClient, getCompany, getProject } from "@/lib/platform/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const TOOL_LINK: Record<string, { href: string; label: string }> = {
  ladder: { href: "/studio", label: "Ladder editor" },
  chat: { href: "/chat", label: "Chat" },
  convert: { href: "/convert", label: "Convert" },
  knowledge: { href: "/knowledge", label: "Knowledge" },
  documents: { href: "/documents", label: "Template library" },
};

/**
 * The project workspace.
 *
 * This is where the platform stops being five separate tools and becomes one.
 * The lifecycle runs across the top; the current phase shows the documents it
 * produces, each of which generates itself from this project, its client and the
 * company profile; and the tools for the phase are one click away. A person
 * running a real job works down this page.
 */
export default async function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) notFound();

  const [company, client] = await Promise.all([
    getCompany(user.id),
    project.clientId ? getClient(user.id, project.clientId) : Promise.resolve(null),
  ]);

  const currentPhase = getPhase(project.phase);
  const deliverables = deliverablesFor(project.phase);
  const companyReady = Boolean(company?.name);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <nav className="mb-5 font-mono text-[11.5px] text-ink-400">
        <Link href="/projects" className="hover:text-ink-700">
          Projects
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight">{project.name}</h1>
            {project.code && (
              <span className="font-mono text-[13px] text-ink-400">{project.code}</span>
            )}
          </div>
          <p className="mt-1.5 text-[14px] text-ink-500">
            {client ? (
              <Link href={`/clients/${client.id}`} className="text-teal-700 hover:underline">
                {client.name}
              </Link>
            ) : (
              <span className="text-ink-400">No client assigned</span>
            )}
            {project.site ? `  ·  ${project.site}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <PhaseSelect
            projectId={project.id}
            phase={project.phase}
            phases={PHASES.map((p) => ({ id: p.id, name: p.name, step: p.step }))}
          />
          <DeleteProjectButton projectId={project.id} />
        </div>
      </header>

      {project.description && (
        <p className="mb-8 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">
          {project.description}
        </p>
      )}

      {/* lifecycle stepper */}
      <section className="mb-10">
        <h2 className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
          Lifecycle
        </h2>
        <ol className="flex flex-wrap gap-1.5">
          {ACTIVE_PHASES.map((p) => {
            const active = p.id === project.phase;
            const done = (p.step ?? 0) < (currentPhase.step ?? 0);
            return (
              <li key={p.id} className="flex-1">
                <div
                  className={`border-t-2 pt-2 ${
                    active ? "border-teal-600" : done ? "border-ink-400" : "border-ink-200"
                  }`}
                >
                  <span
                    className={`block font-mono text-[10px] ${active ? "text-teal-700" : "text-ink-400"}`}
                  >
                    {p.step}
                  </span>
                  <span
                    className={`block text-[12.5px] font-medium ${active ? "text-ink-900" : done ? "text-ink-600" : "text-ink-400"}`}
                  >
                    {p.name}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

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
              <Link href="/settings" className="underline">
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
                {deliverables.map((d) => {
                  const template = getTemplate(d.slug);
                  const hasDoc = template?.files.some((f) => f.kind === "markdown");
                  const mdFile = template?.files.find((f) => f.kind === "markdown");
                  return (
                    <li
                      key={d.slug}
                      className="flex flex-wrap items-center gap-3 border border-ink-100 px-4 py-3"
                    >
                      <span className="shrink-0 bg-ink-900 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-white">
                        {d.abbr}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[14px] font-bold text-ink-900">{d.title}</p>
                        <p className="truncate text-[12.5px] text-ink-500">{d.summary}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {hasDoc && (
                          <a
                            href={`/api/projects/${project.id}/document?slug=${d.slug}${mdFile ? `&file=${encodeURIComponent(mdFile.name)}` : ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-sm bg-ink-900 px-3 py-1.5 font-mono text-[11px] text-white transition-opacity hover:opacity-90"
                          >
                            Generate
                          </a>
                        )}
                        <Link
                          href={`/documents/${d.slug}`}
                          className="rounded-sm border border-ink-200 px-3 py-1.5 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400"
                        >
                          Files
                        </Link>
                      </div>
                    </li>
                  );
                })}
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
  );
}
