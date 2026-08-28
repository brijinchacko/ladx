"use client";

import { BriefPrompt } from "@/components/studio/project-brief";
import type { BriefKey, ProjectBrief } from "@ladx/documents";
import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One deliverable in a project phase.
 *
 * Two states, and the difference matters. Before the document exists, the
 * action is "Create", which makes an editable copy seeded from the template
 * with this project's details already in it. After that, it is "Open", because
 * the copy is the document now and regenerating would throw away the edits.
 *
 * Creating stops to ask when the design basis is missing something this
 * particular document is written from. An FDS with no controller named in it is
 * not a draft, it is a form; asking for the three or four facts at the moment
 * they are needed is what makes the generated document worth opening.
 *
 * The download links sit alongside so a finished document can be handed over
 * without opening it first.
 */
export default function DeliverableRow({
  projectId,
  slug,
  title,
  abbr,
  summary,
  existingId,
  missing,
}: {
  projectId: string;
  slug: string;
  title: string;
  abbr: string;
  summary: string;
  existingId: string | null;
  missing: BriefKey[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  async function create(answers: ProjectBrief) {
    setBusy(true);
    try {
      // Saved first, so the document generates with the answers already on the
      // project rather than carrying a copy of them.
      if (Object.keys(answers).length > 0) {
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: answers }),
        });
      }

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, projectId, templateSlug: slug, kind: "generated" }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      setAsking(false);
      router.push(`/studio/documents/${id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (missing.length > 0) setAsking(true);
    else void create({});
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-ink-100 px-4 py-3">
      {asking && (
        <BriefPrompt
          documentTitle={abbr}
          keys={missing}
          busy={busy}
          onCancel={() => setAsking(false)}
          onSubmit={create}
        />
      )}

      <span className="shrink-0 bg-ink-900 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-white">
        {abbr}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-display text-[14px] font-bold text-ink-900">
          {title}
          {existingId && (
            <span className="flex items-center gap-1 font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-teal-700">
              <FileText className="h-3 w-3" />
              started
            </span>
          )}
        </p>
        <p className="truncate text-[12.5px] text-ink-500">{summary}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {existingId ? (
          <>
            <Link
              href={`/studio/documents/${existingId}`}
              className="rounded-md bg-ink-900 px-3 py-1.5 font-mono text-[11px] text-white transition-opacity hover:opacity-90"
            >
              Open
            </Link>
            {(["pdf", "docx"] as const).map((fmt) => (
              <a
                key={fmt}
                href={`/api/projects/${projectId}/document?doc=${existingId}&format=${fmt}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400"
              >
                {fmt === "pdf" ? "PDF" : "Word"}
              </a>
            ))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={start}
              disabled={busy}
              title={
                missing.length > 0
                  ? `Asks for ${missing.length} detail${missing.length === 1 ? "" : "s"} first`
                  : undefined
              }
              className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 font-mono text-[11px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy && !asking && <Loader2 className="h-3 w-3 animate-spin" />}
              {busy && !asking ? "Creating" : "Create"}
            </button>
            {(["pdf", "docx"] as const).map((fmt) => (
              <a
                key={fmt}
                href={`/api/projects/${projectId}/document?slug=${slug}&format=${fmt}`}
                target="_blank"
                rel="noreferrer"
                title={`Download the blank ${fmt.toUpperCase()} filled with this project's details`}
                className="rounded-md border border-ink-200 px-2.5 py-1.5 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400"
              >
                {fmt === "pdf" ? "PDF" : "Word"}
              </a>
            ))}
          </>
        )}
      </div>
    </li>
  );
}
