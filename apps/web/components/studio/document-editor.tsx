"use client";

import { markdownToHtml } from "@/lib/platform/document";
import { Download, Eye, FileText, Pencil, Save, SplitSquareHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "edit" | "split" | "preview";

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
}: {
  documentId: string;
  projectId: string | null;
  initialTitle: string;
  initialContent: string;
  templateAbbr: string | null;
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
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (res.ok) {
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

  const downloadBase = projectId ? `/api/projects/${projectId}/document?doc=${documentId}` : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

        {downloadBase && (
          <div className="flex items-center gap-1">
            {(
              [
                { fmt: "pdf", label: "PDF" },
                { fmt: "docx", label: "Word" },
                { fmt: "html", label: "HTML" },
                { fmt: "md", label: "MD" },
              ] as const
            ).map((f) => (
              <a
                key={f.fmt}
                href={`${downloadBase}&format=${f.fmt}`}
                target="_blank"
                rel="noreferrer"
                title={`Download as ${f.label}`}
                className="flex h-7 items-center gap-1 rounded-md border border-ink-200 bg-white px-2 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
              >
                {f.fmt === "pdf" && <Download className="h-3 w-3" />}
                {f.label}
              </a>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {status && <span className="font-mono text-[11.5px] text-ink-500">{status}</span>}
          {dirty && !status && (
            <span className="font-mono text-[11.5px] text-amber-700">Unsaved</span>
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
