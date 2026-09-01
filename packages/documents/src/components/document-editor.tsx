"use client";

import { Download, Eye, FileText, Pencil, Save, SplitSquareHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { markdownToHtml } from "../lib/document";

type Mode = "edit" | "split" | "preview";

/** What a document can be handed over as. */
export type DocFormat = "pdf" | "docx" | "html" | "md";

const LABELS: Record<DocFormat, string> = {
  pdf: "PDF",
  docx: "Word",
  html: "HTML",
  md: "MD",
};

/**
 * All four, unless a surface says otherwise.
 *
 * A surface may not be able to do all of them, and the honest answer is to
 * offer fewer rather than a button that does nothing. The desktop cannot
 * produce .docx: the library is written for Node and its published build
 * throws a SyntaxError when a browser evaluates it.
 */
const ALL_FORMATS: DocFormat[] = ["pdf", "docx", "html", "md"];

/**
 * Editing a generated document.
 *
 * A template gets an FDS about ninety percent of the way there; the last ten
 * percent is the actual job, and it happens here rather than in Word. The
 * preview is the same renderer the exported HTML uses, so what is on screen is
 * what comes out of the file.
 *
 * Saving is explicit rather than automatic. These are controlled documents with
 * revision numbers on them, and a silent autosave to something a client has
 * already been sent is the wrong default.
 */
export default function DocumentEditor({
  documentId,
  projectId,
  initialTitle,
  initialContent,
  templateAbbr,
  onSave,
  exportAs,
}: {
  documentId: string;
  projectId: string | null;
  initialTitle: string;
  initialContent: string;
  templateAbbr: string | null;
  /**
   * Where the document is written.
   *
   * Required, so a surface says where rather than inheriting the web's answer.
   * This posted to an API route, which is right on the web and impossible on
   * the desktop, where documents are files in a project folder and there is no
   * server to post to.
   *
   * Returns whether it landed, so the editor can say "Saved" only when it did.
   */
  onSave: (doc: { id: string; title: string; content: string }) => Promise<boolean>;
  /**
   * How the four export formats are offered.
   *
   * Two surfaces do genuinely different things, so this is a choice rather
   * than two optional props that could both be set. The web links to a route
   * that renders and downloads; the desktop renders in process and writes the
   * file into the project folder, because that folder is the handover pack and
   * a browser download is not.
   *
   * Absent means no export controls, which is honest. It used to build a link
   * to a web API route unconditionally, so the desktop showed four buttons
   * that navigated to a 404.
   */
  exportAs?:
    | { kind: "link"; href: (format: DocFormat) => string; formats?: DocFormat[] }
    | {
        kind: "save";
        label: string;
        save: (format: DocFormat) => Promise<string>;
        formats?: DocFormat[];
      };
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [mode, setMode] = useState<Mode>("split");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const savedRef = useRef({ title: initialTitle, content: initialContent });

  const dirty = title !== savedRef.current.title || content !== savedRef.current.content;
  const html = useMemo(() => markdownToHtml(content), [content]);

  // Warn before losing an unsaved edit to a document somebody may have spent
  // twenty minutes on.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const ok = await onSave({ id: documentId, title, content }).catch(() => false);
      if (ok) {
        savedRef.current = { title, content };
        setStatus("Saved");
      } else {
        setStatus("Could not save");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 2500);
    }
  }

  // Cmd/Ctrl+S is what anybody editing a document will press.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const [exported, setExported] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {exported && (
        <p
          className="shrink-0 truncate border-ink-100 border-b bg-ink-50/60 px-4 py-1.5 text-[11.5px] text-ink-600"
          title={exported}
        >
          {exported}
        </p>
      )}

      {/* bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-4 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-[14px] font-bold text-ink-900 outline-none transition-colors hover:border-ink-200 focus:border-ink-500 focus:bg-white"
        />
        {templateAbbr && (
          <span className="shrink-0 bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
            {templateAbbr}
          </span>
        )}

        <div className="flex items-center gap-0.5 rounded-md border border-ink-200 bg-white p-0.5">
          {(
            [
              { id: "edit", icon: Pencil, label: "Edit" },
              { id: "split", icon: SplitSquareHorizontal, label: "Split" },
              { id: "preview", icon: Eye, label: "Preview" },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                title={m.label}
                onClick={() => setMode(m.id)}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  mode === m.id ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        {exportAs && (
          <div className="flex items-center gap-1">
            {(exportAs.formats ?? ALL_FORMATS).map((fmt) =>
              exportAs.kind === "link" ? (
                <a
                  key={fmt}
                  href={exportAs.href(fmt)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Download as ${LABELS[fmt]}`}
                  className="flex h-7 items-center gap-1 rounded-md border border-ink-200 bg-white px-2 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
                >
                  {fmt === "pdf" && <Download className="h-3 w-3" />}
                  {LABELS[fmt]}
                </a>
              ) : (
                <button
                  key={fmt}
                  type="button"
                  title={`${exportAs.label} as ${LABELS[fmt]}`}
                  onClick={() =>
                    void exportAs
                      .save(fmt)
                      .then((path) => setExported(`Saved to ${path}`))
                      .catch((err) =>
                        setExported(err instanceof Error ? err.message : "Could not save that."),
                      )
                  }
                  className="flex h-7 items-center gap-1 rounded-md border border-ink-200 bg-white px-2 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
                >
                  {fmt === "pdf" && <Download className="h-3 w-3" />}
                  {LABELS[fmt]}
                </button>
              ),
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {status && <span className="font-mono text-[11.5px] text-ink-500">{status}</span>}
          {dirty && !status && (
            <span className="font-mono text-[11.5px] text-warning">Unsaved</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="flex h-7 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      {/* panes */}
      <div className="flex min-h-0 flex-1">
        {mode !== "preview" && (
          <div className={`flex min-h-0 flex-col ${mode === "split" ? "w-1/2" : "w-full"}`}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none border-0 bg-white p-5 font-mono text-[12.5px] leading-relaxed text-ink-800 outline-none"
              placeholder="Markdown. Headings with #, tables with pipes, bullets with a dash."
            />
          </div>
        )}

        {mode === "split" && <div className="w-px shrink-0 bg-ink-100" />}

        {mode !== "edit" && (
          <div
            className={`min-h-0 overflow-y-auto bg-ink-50/30 ${mode === "split" ? "w-1/2" : "w-full"}`}
          >
            <div className="mx-auto max-w-3xl bg-white p-8 shadow-sm">
              {content.trim() ? (
                <article
                  className="doc-preview"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: markdownToHtml escapes every value before applying markup, and is covered by tests.
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <p className="flex items-center gap-2 text-[13.5px] text-ink-400">
                  <FileText className="h-4 w-4" />
                  Nothing to preview yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
