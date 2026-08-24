import ClientForm, { DeleteClientButton } from "@/components/platform/client-form";
import { NewProjectForm } from "@/components/platform/project-controls";
import DocumentList from "@/components/studio/document-list";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getPhase } from "@/lib/platform/lifecycle";
import { getClient, listProjects } from "@/lib/platform/queries";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One client, and everything that belongs to them.
 *
 * Three tabs' worth of material on one page, because a client is not a form:
 * it is their details, the jobs you are doing for them, and the paperwork that
 * goes with those jobs. Splitting them across routes would mean three
 * navigations to answer "what is happening with Acme".
 */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const client = await getClient(user.id, id);
  if (!client) notFound();

  const [allProjects, clientDocs] = await Promise.all([
    listProjects(user.id),
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
      .where(and(eq(documents.userId, user.id), eq(documents.clientId, id)))
      .orderBy(desc(documents.updatedAt)),
  ]);

  const projects = allProjects.filter((p) => p.clientId === id);

  return (
    <>
      <WorkspaceHeader
        title={client.name}
        subtitle={[client.industry, client.city, client.country].filter(Boolean).join("  ·  ")}
        actions={<DeleteClientButton id={client.id} name={client.name} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-10 p-6">
          {/* projects for this client */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="font-display text-[15px] font-bold text-ink-900">
                Projects{projects.length > 0 && ` (${projects.length})`}
              </h2>
              {/* Pre-selects this client, so a project started here belongs here. */}
              <NewProjectForm
                clients={[{ id: client.id, name: client.name }]}
                defaultClientId={client.id}
              />
            </div>

            {projects.length === 0 ? (
              <p className="rounded-md border border-dashed border-ink-200 px-4 py-6 text-center text-[13.5px] text-ink-500">
                No projects for {client.name} yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-100">
                {projects.map((p) => {
                  const phase = getPhase(p.phase);
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/studio/projects/${p.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-ink-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-ink-900">
                            {p.name}
                            {p.code && (
                              <span className="ml-2 font-mono text-[11.5px] text-ink-400">
                                {p.code}
                              </span>
                            )}
                          </span>
                          {p.site && (
                            <span className="block truncate text-[12px] text-ink-500">
                              {p.site}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 rounded-sm border border-teal-300 bg-teal-50 px-2 py-0.5 font-mono text-[10.5px] text-teal-700">
                          {phase.step ? `${phase.step}. ` : ""}
                          {phase.name}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* client documents */}
          <section>
            <h2 className="mb-1 font-display text-[15px] font-bold text-ink-900">Documents</h2>
            <p className="mb-3 text-[13px] text-ink-500">
              Anything that belongs to this client: their standards, site drawings, signed
              acceptance sheets, purchase orders.
            </p>
            <DocumentList
              documents={clientDocs.map((d) => ({ ...d, updatedAt: d.updatedAt.toISOString() }))}
              clientId={client.id}
              emptyHint="Nothing filed against this client yet. Upload their site standard or a signed acceptance sheet."
            />
          </section>

          {/* details */}
          <section className="border-t border-ink-100 pt-8">
            <h2 className="mb-4 font-display text-[15px] font-bold text-ink-900">Details</h2>
            <ClientForm initial={client} />
          </section>
        </div>
      </div>
    </>
  );
}
