import UseTemplate from "@/components/studio/use-template";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listProjects } from "@/lib/platform/queries";
import { getTemplate } from "@ladx/documents";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A template, read inside Studio.
 *
 * The same template has a public page under /documents, but that one is written
 * for a stranger deciding whether to download a blank file. Sending a signed-in
 * user out to it threw them into the marketing site in a new tab, and the file
 * they got back had nothing of their project in it.
 *
 * This page keeps them in the application and ends in the only two things they
 * can actually want: put this document in a project they already have, or start
 * the project here and put it in that.
 */
export default async function StudioTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const template = getTemplate(slug);
  if (!template) notFound();

  const user = await requireUser();
  const projects = await listProjects(user.id);
  const related = (template.related ?? [])
    .map((s) => getTemplate(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <>
      <WorkspaceHeader
        title={template.title}
        subtitle={`${template.abbr} · ${template.category}`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <nav className="mb-5 flex items-center gap-2 font-mono text-[11px] text-ink-400">
          <Link href="/studio/documents" className="transition-colors hover:text-ink-700">
            Documents
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink-600">{template.abbr}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="min-w-0">
            <p className="max-w-2xl text-[14.5px] leading-relaxed text-ink-700">
              {template.purpose}
            </p>

            <section className="mt-6 border-l-2 border-teal-600 py-1 pl-4">
              <h2 className="font-display text-[14px] font-bold text-ink-900">
                Do you need this one?
              </h2>
              <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-600">
                {template.whenYouNeedIt}
              </p>
            </section>

            <section className="mt-7">
              <h2 className="mb-3 border-b border-ink-100 pb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
                What is in it
              </h2>
              <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {template.outline.map((section, i) => (
                  <li
                    key={section}
                    className="flex items-baseline gap-2.5 text-[13.5px] text-ink-700"
                  >
                    <span className="font-mono text-[10.5px] tabular-nums text-ink-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {section}
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-7 grid gap-5 border-y border-ink-100 py-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                  Written by
                </h3>
                <p className="text-[13.5px] text-ink-700">{template.writtenBy}</p>
              </div>
              <div>
                <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                  Approved by
                </h3>
                <p className="text-[13.5px] text-ink-700">{template.approvedBy}</p>
              </div>
              {template.standards?.length ? (
                <div className="sm:col-span-2">
                  <h3 className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                    Written against
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {template.standards.map((s) => (
                      <li
                        key={s}
                        className="border border-ink-200 px-1.5 py-0.5 font-mono text-[11px] text-ink-600"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="mt-7">
              <h2 className="mb-3 border-b border-ink-100 pb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
                Preview
              </h2>
              {template.files.map((file) => (
                <figure key={file.name} className="mb-5">
                  <figcaption className="mb-1.5 flex flex-wrap items-baseline gap-2.5">
                    <span className="font-mono text-[12px] font-semibold text-ink-800">
                      {file.name}
                    </span>
                    {file.note && <span className="text-[12.5px] text-ink-500">{file.note}</span>}
                  </figcaption>
                  <div className="max-h-[380px] overflow-auto rounded-md border border-ink-200 bg-ink-50">
                    <pre className="p-3.5 font-mono text-[11px] leading-relaxed text-ink-700">
                      {file.body}
                    </pre>
                  </div>
                </figure>
              ))}
            </section>

            {related.length > 0 && (
              <section className="mt-7">
                <h2 className="mb-3 border-b border-ink-100 pb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
                  Travels with
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/studio/documents/t/${r.slug}`}
                        className="group flex items-start gap-2.5 rounded-md border border-ink-200 p-3 transition-colors hover:border-ink-400"
                      >
                        <span className="mt-[2px] shrink-0 bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-600">
                          {r.abbr}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-display text-[13.5px] font-bold text-ink-900 group-hover:text-teal-700">
                            {r.title}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-500">
                            {r.summary}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-4">
            <UseTemplate
              slug={template.slug}
              title={template.title}
              projects={projects.map((p) => ({
                id: p.id,
                name: p.name,
                clientName: p.clientName,
              }))}
            />
            <p className="mt-3 px-1 text-[12px] leading-relaxed text-ink-400">
              The document opens in the Studio editor. From there it exports to PDF and Word with
              your company letterhead and the client details already on it.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
