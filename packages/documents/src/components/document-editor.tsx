"use client";

import {
  Bold,
  Code,
  Download,
  Eye,
  FileText,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Save,
  SplitSquareHorizontal,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { markdownToHtml } from "../lib/document";
import { DOC_STATUSES, type DocStatus, docReadOnly } from "../lib/status";

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
 * An edit to the text, with where the cursor ends up.
 *
 * Every toolbar button and the list continuation produce one of these, so the
 * textarea is written in exactly one place and the selection is restored after
 * React has rendered the new value rather than fought over during the event.
 */
interface Edit {
  text: string;
  start: number;
  end: number;
}

function wrap(text: string, start: number, end: number, before: string, after: string): Edit {
  const inner = text.slice(start, end);
  // Pressing Bold on bold text takes the bold off, which is what every other
  // editor does and what a finger expects.
  const already =
    text.slice(start - before.length, start) === before &&
    text.slice(end, end + after.length) === after;
  if (already) {
    return {
      text: text.slice(0, start - before.length) + inner + text.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    };
  }
  const placeholder = inner || "text";
  const out = text.slice(0, start) + before + placeholder + after + text.slice(end);
  return {
    text: out,
    start: start + before.length,
    end: start + before.length + placeholder.length,
  };
}

/** The start and end of the lines the selection touches. */
function lineSpan(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const toBreak = text.indexOf("\n", end);
  const to = toBreak === -1 ? text.length : toBreak;
  return [from, to];
}

/**
 * Put a prefix on every selected line, or take it off if it is already there.
 *
 * Numbered lists count up. A heading replaces whatever heading marker is
 * there, so pressing the button on a `#` line makes it `##` rather than `## #`.
 */
function prefixLines(
  text: string,
  start: number,
  end: number,
  prefix: string | ((n: number) => string),
  strip: RegExp,
): Edit {
  const [from, to] = lineSpan(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const allHave = lines.every((l) => strip.test(l));
  const changed = lines.map((l, i) => {
    const bare = l.replace(strip, "");
    if (allHave) return bare;
    return (typeof prefix === "function" ? prefix(i + 1) : prefix) + bare;
  });
  const block = changed.join("\n");
  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: from,
    end: from + block.length,
  };
}

const TABLE = `| Item | Value | Notes |
| --- | --- | --- |
|  |  |  |
|  |  |  |
`;

/**
 * Continue a list when Enter is pressed inside one.
 *
 * Returns nothing when the line is not a list item, so Enter does what Enter
 * does. Enter on an empty item ends the list, which is the way out of it.
 */
function continueList(text: string, at: number): Edit | null {
  const from = text.lastIndexOf("\n", at - 1) + 1;
  const line = text.slice(from, at);
  const m = /^(\s*)(?:([-*])|(\d+)\.)(\s+)(\[[ x]\]\s+)?(.*)$/.exec(line);
  if (!m) return null;
  const [, indent, bullet, number, gap, check, rest] = m;
  if (!rest?.trim()) {
    // An empty item: leave the list.
    return { text: text.slice(0, from) + text.slice(at), start: from, end: from };
  }
  const marker = bullet ? `${bullet}${gap}` : `${Number(number) + 1}.${gap}`;
  const next = `\n${indent}${marker}${check ? "[ ] " : ""}`;
  return {
    text: text.slice(0, at) + next + text.slice(at),
    start: at + next.length,
    end: at + next.length,
  };
}

/**
 * Editing a generated document.
 *
 * A template gets an FDS about ninety percent of the way there; the last ten
 * percent is the actual job, and it happens here rather than in Word. The
 * preview is the same renderer the exported HTML uses, so what is on screen is
 * what comes out of the file.
 *
 * The text is Markdown, but nobody should need to know that to use it. The
 * toolbar writes the marks, Enter continues a list, and Cmd+B does what it
 * does everywhere. The source stays plain text on purpose: a document that can
 * be read in any editor and diffed line by line is worth more on a controlled
 * project than one that can only be opened here.
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
  status = "draft",
  onStatusChange,
  onSave,
  exportAs,
}: {
  documentId: string;
  projectId: string | null;
  initialTitle: string;
  initialContent: string;
  templateAbbr: string | null;
  /** Where the document is in its life. Approved and superseded are read only. */
  status?: DocStatus;
  /** Move it to another state. Returns whether that landed. */
  onStatusChange?: (status: DocStatus) => Promise<boolean>;
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
  const [status_, setStatus_] = useState<DocStatus>(status);
  const [notice, setNotice] = useState<string | null>(null);
  const savedRef = useRef({ title: initialTitle, content: initialContent });
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  const readOnly = docReadOnly(status_);
  const dirty = title !== savedRef.current.title || content !== savedRef.current.content;
  const html = useMemo(() => markdownToHtml(content), [content]);

  // Narrow screens get one pane, because two halves of 400 pixels is neither.
  useEffect(() => {
    if (window.innerWidth < 900) setMode(readOnly ? "preview" : "edit");
    else if (readOnly) setMode("preview");
  }, [readOnly]);

  // Warn before losing an unsaved edit to a document somebody may have spent
  // twenty minutes on.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // Put the cursor back where an edit left it, once React has the new text.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `content` is the trigger, not a value the effect reads; it runs once the new text has rendered.
  useEffect(() => {
    const sel = pendingSelection.current;
    const ta = areaRef.current;
    if (!sel || !ta) return;
    pendingSelection.current = null;
    ta.focus();
    ta.setSelectionRange(sel[0], sel[1]);
  }, [content]);

  function apply(edit: Edit) {
    pendingSelection.current = [edit.start, edit.end];
    setContent(edit.text);
  }

  /** Run one of the toolbar actions against the current selection. */
  function act(action: string) {
    const ta = areaRef.current;
    if (!ta || readOnly) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const t = content;
    switch (action) {
      case "bold":
        return apply(wrap(t, s, e, "**", "**"));
      case "italic":
        return apply(wrap(t, s, e, "_", "_"));
      case "code":
        return apply(wrap(t, s, e, "`", "`"));
      case "heading":
        return apply(prefixLines(t, s, e, "## ", /^#{1,6}\s+/));
      case "bullets":
        return apply(prefixLines(t, s, e, "- ", /^\s*[-*]\s+/));
      case "numbers":
        return apply(prefixLines(t, s, e, (n) => `${n}. `, /^\s*\d+\.\s+/));
      case "link": {
        const inner = t.slice(s, e) || "link text";
        const out = `${t.slice(0, s)}[${inner}](https://)${t.slice(e)}`;
        const urlAt = s + inner.length + 3;
        return apply({ text: out, start: urlAt, end: urlAt + 8 });
      }
      case "table": {
        const [from] = lineSpan(t, s, s);
        const atLineStart = from === s;
        const block = (atLineStart ? "" : "\n") + TABLE;
        const out = t.slice(0, s) + block + t.slice(s);
        const firstCell = s + block.indexOf("|  |") + 2;
        return apply({ text: out, start: firstCell, end: firstCell });
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b" || k === "i") {
        e.preventDefault();
        act(k === "b" ? "bold" : "italic");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
      const edit = continueList(content, ta.selectionStart);
      if (edit) {
        e.preventDefault();
        apply(edit);
      }
    }
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    setNotice(null);
    try {
      const ok = await onSave({ id: documentId, title, content }).catch(() => false);
      if (ok) {
        savedRef.current = { title, content };
        setNotice("Saved");
      } else {
        setNotice("Could not save");
      }
    } finally {
      setSaving(false);
      setTimeout(() => setNotice(null), 2500);
    }
  }

  async function moveTo(next: DocStatus) {
    if (!onStatusChange || next === status_) return;
    if (
      docReadOnly(status_) &&
      next === "draft" &&
      !window.confirm("Revise this document? It goes back to Draft and can be edited again.")
    ) {
      return;
    }
    if (next === "approved" && dirty) {
      setNotice("Save first, then approve what was saved.");
      setTimeout(() => setNotice(null), 3000);
      return;
    }
    const ok = await onStatusChange(next).catch(() => false);
    if (ok) setStatus_(next);
    else {
      setNotice("Could not change the status");
      setTimeout(() => setNotice(null), 2500);
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

  const TOOLS: { id: string; icon: typeof Bold; label: string }[] = [
    { id: "bold", icon: Bold, label: "Bold (⌘B)" },
    { id: "italic", icon: Italic, label: "Italic (⌘I)" },
    { id: "heading", icon: Heading2, label: "Heading" },
    { id: "bullets", icon: List, label: "Bullet list" },
    { id: "numbers", icon: ListOrdered, label: "Numbered list" },
    { id: "table", icon: Table2, label: "Insert a table" },
    { id: "link", icon: Link2, label: "Link" },
    { id: "code", icon: Code, label: "Code" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {exported && (
        <p
          className="shrink-0 truncate border-ink-100 border-b bg-ink-50 px-4 py-1.5 text-[11.5px] text-ink-600"
          title={exported}
        >
          {exported}
        </p>
      )}

      {/* bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50 px-4 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={readOnly}
          aria-label="Document title"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-[14px] font-bold text-ink-900 outline-none transition-colors hover:border-ink-200 focus:border-ink-500 focus:bg-white disabled:hover:border-transparent"
        />
        {templateAbbr && (
          <span className="shrink-0 bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
            {templateAbbr}
          </span>
        )}

        {onStatusChange && (
          <select
            value={status_}
            onChange={(e) => void moveTo(e.target.value as DocStatus)}
            aria-label="Document status"
            title={DOC_STATUSES.find((s) => s.id === status_)?.about}
            className={`h-7 rounded-md border px-2 text-[12px] outline-none transition-colors ${
              status_ === "approved"
                ? "border-success-border bg-success-bg text-success"
                : status_ === "review"
                  ? "border-warning-border bg-warning-bg text-warning"
                  : "border-ink-200 bg-white text-ink-700"
            }`}
          >
            {DOC_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
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
            const off = readOnly && m.id !== "preview";
            return (
              <button
                key={m.id}
                type="button"
                title={off ? "Read only until revised" : m.label}
                disabled={off}
                onClick={() => setMode(m.id)}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40 ${
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
          {notice && <span className="font-mono text-[11.5px] text-ink-500">{notice}</span>}
          {dirty && !notice && (
            <span className="font-mono text-[11.5px] text-warning">Unsaved</span>
          )}
          {readOnly ? (
            <button
              type="button"
              onClick={() => void moveTo("draft")}
              className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 text-[12px] font-medium text-ink-700 transition-colors hover:border-ink-400"
            >
              <Pencil className="h-3.5 w-3.5" />
              Revise
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="flex h-7 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* formatting, only while there is something to format */}
      {mode !== "preview" && !readOnly && (
        <div className="flex shrink-0 items-center gap-0.5 border-b border-ink-100 bg-white px-3 py-1">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                // Mouse down rather than click, so the textarea keeps its
                // selection: a click would take focus first and lose it.
                onMouseDown={(e) => {
                  e.preventDefault();
                  act(tool.id);
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
          <span className="ml-2 hidden text-[11.5px] text-ink-400 sm:inline">
            Plain text underneath. Enter continues a list.
          </span>
        </div>
      )}

      {/* panes */}
      <div className="flex min-h-0 flex-1">
        {mode !== "preview" && (
          <div className={`flex min-h-0 flex-col ${mode === "split" ? "w-1/2" : "w-full"}`}>
            <textarea
              ref={areaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={onKeyDown}
              readOnly={readOnly}
              spellCheck
              aria-label="Document text"
              className="min-h-0 flex-1 resize-none border-0 bg-white px-6 py-5 font-sans text-[14px] leading-7 text-ink-900 outline-none"
              placeholder="Start writing. Headings, lists and tables are on the bar above."
            />
          </div>
        )}

        {mode === "split" && <div className="w-px shrink-0 bg-ink-100" />}

        {mode !== "edit" && (
          <div
            className={`min-h-0 overflow-y-auto bg-ink-50 ${mode === "split" ? "w-1/2" : "w-full"}`}
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
