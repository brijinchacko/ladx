import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { CATEGORY_ORDER, TEMPLATES, templatesByCategory } from "@/content/templates";
import { requireUser } from "@/lib/auth/server";
import { listProjects } from "@/lib/platform/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Documents, inside Studio.
 *
 * Different from the public library, on purpose. The public page sells the
 * templates to somebody who has never seen them; this one is for somebody with
 * projects, so it leads with generating a filled document for one of them and
 * treats browsing as the secondary action.
 */
export default async function StudioDocumentsPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <>
      <WorkspaceHeader
        title="Documents"
        subtitle={`${TEMPLATES.length} templates. Open one here, then attach it to a project or start a new one.`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <section className="mb-8 rounded-md border border-ink-200 bg-ink-50/50 p-5">
          <h2 className="font-display text-[14px] font-bold text-ink-900">
            Generate from a project
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
            Open a project and its current phase lists the documents it produces, each generating
            itself with your company letterhead and the client already filled in.
          </p>
          {projects.length === 0 ? (
            <Link
              href="/studio/projects"
              className="mt-3 inline-block rounded-md bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Create a project
            </Link>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {projects.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/studio/projects/${p.id}`}
                    className="inline-block rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900"
                  >
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {CATEGORY_ORDER.map((category) => {
          const items = templatesByCategory(category);
          if (!items.length) return null;
          return (
            <section key={category} className="mb-7">
              <h2 className="mb-3 border-b border-ink-100 pb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
                {category}
              </h2>
              <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={`/studio/documents/t/${t.slug}`}
                      className="group flex h-full flex-col rounded-md border border-ink-200 bg-white p-3.5 transition-colors hover:border-ink-400"
                    >
                      <span className="mb-1.5 inline-block w-fit bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                        {t.abbr}
                      </span>
                      <span className="font-display text-[13.5px] font-bold leading-snug text-ink-900 group-hover:text-teal-700">
                        {t.title}
                      </span>
                      <span className="mt-1 text-[12px] leading-relaxed text-ink-500">
                        {t.summary}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
