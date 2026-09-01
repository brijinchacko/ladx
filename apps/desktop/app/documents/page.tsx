"use client";

/**
 * Documents, on the desktop.
 *
 * The one surface here that does not use the database. A document is the
 * deliverable: it goes in the pack that leaves with the machine, and it has to
 * open for somebody who has never installed this application. So it is a
 * markdown file in the project folder, filed where that kind of document
 * belongs, and the folder is the thing that gets backed up and handed over.
 *
 * Which means this needs a project open, and says so rather than quietly
 * writing somewhere temporary.
 */

import {
  type ProjectDocument,
  documentFileName,
  folderKindFor,
  listDocuments,
  readDocument,
  writeDocument,
} from "@/lib/document-host";
import { useProjectFolder } from "@/lib/project-folder";
import {
  type DocFormat,
  type DocTemplate,
  DocumentEditor,
  TEMPLATES,
  autoFillValues,
  fillTemplate,
  markdownToHtml,
} from "@ladx/documents";
import { FileText, FolderOpen, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface OpenDoc {
  doc: ProjectDocument;
  content: string;
}

export default function DocumentsPage() {
  const { project, loading } = useProjectFolder();
  const [docs, setDocs] = useState<ProjectDocument[] | null>(null);
  const [open, setOpen] = useState<OpenDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!project) return;
    try {
      setDocs(await listDocuments(project.path));
      setError(null);
    } catch (err) {
      setDocs([]);
      setError(err instanceof Error ? err.message : "The project's documents could not be read.");
    }
  }, [project]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <p className="p-6 text-[13px] text-ink-500">Looking…</p>;

  if (!project) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mb-4 text-[14px] leading-relaxed text-ink-600">
          A document belongs to a job. It is written into the project folder, filed where that kind
          of document goes, so it is in the pack that leaves with the machine rather than in a
          database only this application can read.
        </p>
        <Link
          href="/workspace"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-ink-900 px-3 text-sm font-medium text-white hover:bg-ink-700"
        >
          <FolderOpen className="h-4 w-4" />
          Open a project first
        </Link>
      </div>
    );
  }

  async function create(template: DocTemplate) {
    if (!project || busy) return;
    setBusy(true);
    try {
      const file = template.files[0];
      if (!file) throw new Error(`${template.abbr} has no file to write.`);

      const values = autoFillValues({
        project: { name: project.name, code: project.code, site: null },
        client: project.client ? { name: project.client } : null,
        company: null,
        author: "",
        templateAbbr: template.abbr,
      });

      const body = fillTemplate(file.body, values);
      const kind = folderKindFor(template.category);
      const name = documentFileName(values.DOC_NO ?? "", template.title, "md");
      await writeDocument(project.path, kind, name, body);
      await refresh();
      setOpen({ doc: { folder: "", filename: name, kind, bytes: body.length }, content: body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That document could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(doc: ProjectDocument) {
    if (!project) return;
    setBusy(true);
    try {
      const content = await readDocument(project.path, doc);
      if (content === null) throw new Error(`${doc.filename} could not be read.`);
      setOpen({ doc, content });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That document could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-ink-100 bg-ink-50 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] text-ink-700 hover:bg-ink-50"
          >
            All documents
          </button>
          <span className="truncate text-[12.5px] text-ink-500">
            {project.name} · {open.doc.folder || open.doc.kind}
          </span>
        </div>
        <DocumentEditor
          key={open.doc.filename}
          documentId={open.doc.filename}
          projectId={project.id}
          initialTitle={open.doc.filename.replace(/\.md$/i, "")}
          initialContent={open.content}
          templateAbbr={null}
          /*
           * Saved back into the same folder under the same name.
           *
           * The title is the filename here rather than a separate field: the
           * document is a file, and a file whose name and heading disagree is
           * the thing that gets attached to the wrong email.
           */
          onSave={async ({ title, content }) => {
            try {
              await writeDocument(
                project.path,
                open.doc.kind,
                title.endsWith(".md") ? title : `${title}.md`,
                content,
              );
              await refresh();
              return true;
            } catch {
              return false;
            }
          }}
          /*
           * Rendered here and written into the project, not downloaded.
           *
           * The project folder is the handover pack. A PDF in Downloads is a
           * PDF nobody will find when the job is being issued, and on a
           * machine with no network there is no route to render it anyway.
           */
          exportAs={{
            kind: "save",
            label: "Save to project",
            /*
             * No Word here.
             *
             * The docx library is written for Node and its published build
             * throws a SyntaxError the moment a browser evaluates it, which is
             * what this app is. Transpiling it does not help. A button that
             * silently does nothing is worse than three that work, so it is
             * absent rather than broken, and the HTML export opens in Word
             * well enough for somebody who needs to edit one.
             */
            formats: ["pdf", "html", "md"],
            save: (format) => exportDocument(format, open, project),
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-8 p-8">
        <header>
          <h1 className="mb-1 text-3xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-ink-500">
            Written into {project.name}, filed where each kind belongs.
          </p>
        </header>

        {error && (
          <p className="rounded-md border border-danger bg-danger-bg px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">
            {docs === null ? "In this project" : `${docs.length} in this project`}
          </h2>
          {docs === null ? (
            <p className="text-[13px] text-ink-500">Reading…</p>
          ) : docs.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              None yet. Start one from a template below and it lands in the right folder.
            </p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={`${d.folder}/${d.filename}`}>
                  <button
                    type="button"
                    onClick={() => void openDoc(d)}
                    disabled={busy}
                    className="flex w-full items-center gap-3 rounded-md border border-ink-100 px-3 py-2 text-left hover:bg-ink-50 disabled:opacity-50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-ink-400" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-900">
                      {d.filename}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-400">{d.folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">Start one from a template</h2>
          <p className="mb-3 text-xs text-ink-500">
            Every one is a working document rather than an outline: the tables, the acceptance
            criteria and the sign-off blocks are already in it.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => void create(t)}
                disabled={busy}
                className="flex items-start gap-3 rounded-lg border border-ink-100 p-3 text-left hover:border-ink-300 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ink-400" />
                ) : (
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                )}
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink-900">
                    {t.abbr} · {t.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-500">
                    {t.summary}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * One document, in the format somebody is going to send.
 *
 * All four are produced in process: the same markdown parser feeds the HTML,
 * the PDF and the .docx, which is the whole reason there is one parser.
 */
async function exportDocument(
  format: DocFormat,
  open: OpenDoc,
  project: { path: string; name: string; code?: string | null; client?: string | null },
): Promise<string> {
  const title = open.doc.filename.replace(/\.md$/i, "");
  // The abbreviation the renderers stamp on the page. The filename already
  // leads with the document number, so there is nothing better to take it from
  // than the folder the document lives in.
  const abbr = open.doc.kind === "test" ? "TEST" : open.doc.kind === "handover" ? "HO" : "DOC";
  const docProject = { name: project.name, code: project.code, site: null };
  const client = project.client ? { name: project.client } : null;

  if (format === "md") {
    return writeDocument(project.path, open.doc.kind, `${title}.md`, open.content);
  }
  if (format === "html") {
    return writeDocument(
      project.path,
      open.doc.kind,
      `${title}.html`,
      markdownToHtml(open.content),
    );
  }
  if (format === "pdf") {
    // Loaded when somebody asks for the format, not on every page view. Both
    // writers are large, and docx does not survive being bundled eagerly.
    const { renderPdf } = await import("@ladx/documents/lib/render-pdf");
    const blob = renderPdf({
      title,
      abbr,
      markdown: open.content,
      project: docProject,
      client,
      company: null,
    });
    return writeDocument(project.path, open.doc.kind, `${title}.pdf`, await toBase64(blob), true);
  }
  // The Blob variant: there is no Node Buffer in a webview, and Packer.toBuffer
  // fails at the last step after doing all the work.
  const { renderDocxBlob } = await import("@ladx/documents/lib/render-docx");
  const bytes = await renderDocxBlob({
    title,
    abbr,
    markdown: open.content,
    project: docProject,
    client,
    company: null,
  });
  return writeDocument(project.path, open.doc.kind, `${title}.docx`, await toBase64(bytes), true);
}

/**
 * Bytes, as something the save command can carry.
 *
 * The command takes a string, because everything else written into a project
 * is text. A PDF is not, so it goes as base64 and the Rust side is told to
 * decode it. Building the string a chunk at a time rather than spreading the
 * array into String.fromCharCode, which throws on a document of any size.
 */
async function toBase64(data: Blob | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}
