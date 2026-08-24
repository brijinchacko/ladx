"use client";

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
}: {
  projectId: string;
  slug: string;
  title: string;
  abbr: string;
  summary: string;
  existingId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, projectId, templateSlug: slug, kind: "generated" }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      router.push(`/studio/documents/${id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-ink-100 px-4 py-3">
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
              onClick={create}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 font-mono text-[11px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {busy ? "Creating" : "Create"}
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
