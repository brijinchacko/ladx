"use client";

import { FileText, FileUp, Paperclip, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface DocRow {
  id: string;
  title: string;
  kind: "generated" | "uploaded";
  templateSlug: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number;
  projectId: string | null;
  updatedAt: string;
}

/** ~4.5 MB of file once base64 is accounted for. */
const MAX_BYTES = 4_400_000;

/**
 * Documents attached to a client or a project.
 *
 * Two kinds side by side, because to the person using it they are one list:
 * the FDS being written and the client's datasheet sit in the same folder in
 * their head. The generated ones open in the editor, the uploaded ones open in
 * a preview.
 */
export default function DocumentList({
  documents,
  clientId,
  projectId,
  emptyHint,
}: {
  documents: DocRow[];
  clientId?: string;
  projectId?: string;
  emptyHint?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      setError("That file is over 4 MB. Larger files need object storage, which is not wired up.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, ""),
          kind: "uploaded",
          clientId: clientId ?? null,
          projectId: projectId ?? null,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileData: dataUrl,
        }),
      });
      if (!res.ok) {
        setError("Could not upload that file.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50"
        >
          <FileUp className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Upload a file"}
        </button>
        <span className="font-mono text-[11px] text-ink-400">PDF, images, spreadsheets</span>
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}

      {documents.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-200 px-4 py-6 text-center text-[13.5px] text-ink-500">
          {emptyHint ?? "No documents yet."}
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-100">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
              {d.kind === "uploaded" ? (
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-400" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-teal-700" />
              )}
              <Link href={`/studio/documents/${d.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink-900">
                  {d.title}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-400">
                  {d.kind === "uploaded"
                    ? `${d.fileName ?? "file"} · ${Math.max(1, Math.round(d.byteSize / 1400))} kB`
                    : "Editable document"}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(d.id, d.title)}
                aria-label={`Delete ${d.title}`}
                className="shrink-0 text-ink-400 transition-colors hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
