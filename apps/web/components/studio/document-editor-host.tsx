"use client";

import { saveDocumentViaApi } from "@/components/studio/document-host";
import { type DocFormat, type DocStatus, DocumentEditor } from "@ladx/documents";
import { useRouter } from "next/navigation";

/**
 * The editor, with the web's answers to its questions.
 *
 * A client component on purpose. The page that renders it is a server
 * component, and a server component cannot hand a function to a client one:
 * Next refuses with "Functions cannot be passed directly to Client Components",
 * which is exactly what the document page did with `onSave` and the export
 * link builder. Every document opened onto that error. Here the page passes
 * plain values and this builds the functions on the client, where they belong.
 */
export function DocumentEditorHost({
  documentId,
  projectId,
  initialTitle,
  initialContent,
  templateAbbr,
  status,
}: {
  documentId: string;
  projectId: string | null;
  initialTitle: string;
  initialContent: string;
  templateAbbr: string | null;
  status: DocStatus;
}) {
  const router = useRouter();

  async function onStatusChange(next: DocStatus): Promise<boolean> {
    const res = await fetch(`/api/documents/${documentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    // The project page shows the state on its deliverable rows.
    if (res.ok) router.refresh();
    return res.ok;
  }

  return (
    <DocumentEditor
      documentId={documentId}
      projectId={projectId}
      initialTitle={initialTitle}
      initialContent={initialContent}
      templateAbbr={templateAbbr}
      status={status}
      onStatusChange={onStatusChange}
      onSave={saveDocumentViaApi}
      exportAs={
        projectId
          ? {
              kind: "link",
              href: (format: DocFormat) =>
                `/api/projects/${projectId}/document?doc=${documentId}&format=${format}`,
            }
          : undefined
      }
    />
  );
}
