import AttachProject from "@/components/studio/attach-project";
import { DocumentEditorHost } from "@/components/studio/document-editor-host";
import { ShareDocument } from "@/components/studio/share-document";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { documents, projects } from "@/lib/db/schema";
import { listProjects } from "@/lib/platform/queries";
import { accessIds } from "@/lib/teams/access";
import { getTemplate, isDocStatus } from "@ladx/documents";
import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One document, open in Studio.
 *
 * A generated document opens in the editor. An uploaded file opens in a preview
 * pane, because there is nothing to edit: it is somebody else's PDF.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [row] = await db()
    .select({ doc: documents, projectName: projects.name })
    .from(documents)
    .leftJoin(projects, eq(projects.id, documents.projectId))
    .where(and(eq(documents.id, id), inArray(documents.userId, await accessIds(user.id))))
    .limit(1);
  if (!row) notFound();

  const doc = row.doc;
  const template = doc.templateSlug ? getTemplate(doc.templateSlug) : undefined;

  if (doc.kind === "uploaded") {
    const isPdf = (doc.mimeType ?? "").includes("pdf");
    const isImage = (doc.mimeType ?? "").startsWith("image/");
    return (
      <>
        <WorkspaceHeader
          title={doc.title}
          subtitle={[doc.fileName, row.projectName].filter(Boolean).join("  ·  ")}
          actions={
            <a
              href={`/api/documents/${doc.id}?raw=1`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
            >
              Open original
            </a>
          }
        />
        <div className="min-h-0 flex-1 bg-ink-50 p-4">
          {isPdf || isImage ? (
            // An embedded preview, so a datasheet does not need a round trip
            // through the downloads folder to be read.
            <iframe
              title={doc.title}
              src={`/api/documents/${doc.id}?raw=1`}
              className="h-full w-full rounded-md border border-ink-200 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-sm text-center text-[14px] text-ink-500">
                No inline preview for {doc.mimeType ?? "this file type"}. Use Open original to view
                it.
              </p>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader
        title={template?.title ?? doc.title}
        subtitle={row.projectName ? `Project: ${row.projectName}` : "Not linked to a project yet"}
        actions={
          doc.projectId ? (
            <>
              <ShareDocument
                documentId={doc.id}
                shareToken={doc.shareToken}
                expiresAt={doc.shareExpiresAt?.toISOString() ?? null}
              />
              <Link
                href={`/studio/projects/${doc.projectId}`}
                className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
              >
                Back to project
              </Link>
            </>
          ) : (
            <AttachProject
              documentId={doc.id}
              projects={(await listProjects(user.id)).map((p) => ({ id: p.id, name: p.name }))}
            />
          )
        }
      />
      <DocumentEditorHost
        documentId={doc.id}
        projectId={doc.projectId}
        initialTitle={doc.title}
        initialContent={doc.content}
        templateAbbr={template?.abbr ?? null}
        status={isDocStatus(doc.status) ? doc.status : "draft"}
      />
    </>
  );
}
