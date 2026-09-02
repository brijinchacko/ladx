"use client";

import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * What can be done to a project from the list.
 *
 * Two things, both of which belong where projects are chosen between rather
 * than inside one. Duplicate makes the next job for the same client: same
 * client, scope, design basis and drawing set, no program, no number. Delete
 * is here and only here, because inside a project the phase selector and the
 * deliverables are one click apart and a Delete among them is a slip waiting
 * to happen.
 */
export function ProjectRowMenu({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"copy" | "delete" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function duplicate() {
    setBusy("copy");
    setOpen(false);
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
      if (!res.ok) return;
      const { id: newId } = (await res.json()) as { id: string };
      router.push(`/studio/projects/${newId}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${name}"? Its documents and drawings go with it. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setOpen(false);
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="absolute right-3 top-1/2 -translate-y-1/2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Options for ${name}`}
        aria-expanded={open}
        disabled={busy !== null}
        className={`flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-all hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50 ${
          open ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100"
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 animate-slide-down overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={duplicate}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Copy className="h-3.5 w-3.5 shrink-0 text-ink-400" />
            {busy === "copy" ? "Copying…" : "Duplicate"}
          </button>
          <button
            type="button"
            onClick={remove}
            className="flex w-full items-center gap-2 border-t border-ink-100 px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-ink-50"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
            Delete project
          </button>
        </div>
      )}
    </div>
  );
}
