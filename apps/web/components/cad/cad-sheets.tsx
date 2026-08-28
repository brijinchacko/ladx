"use client";

import { FilePlus2, Files, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface SheetRow {
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * The sheets in this set.
 *
 * A drawing is not a document, it is a sheet in a package, and the thing an
 * engineer does constantly is move between them: check what terminal number the
 * I/O sheet used, then go back to the schematic. Sending them to a list page to
 * do that is the difference between a tool and a viewer, and it is the reason
 * the ladder editor has a project tree rather than a file picker.
 *
 * Scoped to the project when the open drawing belongs to one, because that is
 * what a set is. A loose drawing shows the loose drawings.
 */
export default function CadSheets({
  sheets,
  currentId,
  projectId,
  projectName,
  onOpen,
  onDirtyCheck,
}: {
  sheets: SheetRow[];
  currentId: string;
  projectId: string | null;
  projectName: string | null;
  /** Navigating away, so the editor can save first if it needs to. */
  onOpen: (id: string) => void;
  /** True when there is unsaved work. Asked before leaving a sheet. */
  onDirtyCheck: () => boolean;
}) {
  const router = useRouter();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuFor]);

  async function addSheet() {
    setBusy(true);
    try {
      const res = await fetch("/api/cad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New sheet",
          projectId,
          data: { version: 1, layers: [], entities: [] },
        }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      go(id);
    } finally {
      setBusy(false);
    }
  }

  function go(id: string) {
    if (id === currentId) return;
    if (
      onDirtyCheck() &&
      !window.confirm("This sheet has unsaved changes. Leave it and lose them?")
    ) {
      return;
    }
    onOpen(id);
  }

  async function rename(id: string) {
    const name = draft.trim();
    setRenaming(null);
    if (!name) return;
    await fetch(`/api/cad/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the sheet "${name}"? This cannot be undone.`)) return;
    setMenuFor(null);
    await fetch(`/api/cad/${id}`, { method: "DELETE" });
    if (id === currentId) {
      const next = sheets.find((s) => s.id !== id);
      if (next) onOpen(next.id);
      else router.push("/studio/cad");
      return;
    }
    router.refresh();
  }

  return (
    <div ref={ref} className="flex h-full flex-col bg-ink-50/40">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
        <Files className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
          {projectName ?? "Loose drawings"}
        </span>
        <button
          type="button"
          onClick={addSheet}
          disabled={busy}
          aria-label="New sheet"
          title="New sheet in this set"
          className="flex h-5 w-5 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FilePlus2 className="h-3 w-3" />}
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-px overflow-y-auto p-1.5">
        {sheets.length === 0 && (
          <li className="px-2 py-2 text-[11.5px] leading-snug text-ink-400">
            This is the only sheet so far.
          </li>
        )}
        {sheets.map((s) => {
          const active = s.id === currentId;
          if (renaming === s.id) {
            return (
              <li key={s.id} className="px-1 py-0.5">
                <input
                  ref={(el) => el?.select()}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => rename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(s.id);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="w-full rounded border border-ink-400 bg-white px-1.5 py-1 text-[12px] outline-none"
                />
              </li>
            );
          }
          return (
            <li key={s.id} className="group relative">
              <button
                type="button"
                onClick={() => go(s.id)}
                className={`flex w-full items-center rounded-md py-1.5 pl-2 pr-6 text-left text-[12.5px] transition-colors ${
                  active ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                aria-label={`Options for ${s.name}`}
                className={`absolute right-0.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded transition-opacity ${
                  menuFor === s.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                } ${active ? "text-white hover:bg-white/15" : "text-ink-400 hover:bg-ink-200"}`}
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
              {menuFor === s.id && (
                <div className="absolute right-1 top-full z-30 mt-0.5 w-36 overflow-hidden rounded-md border border-ink-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuFor(null);
                      setDraft(s.name);
                      setRenaming(s.id);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-ink-700 hover:bg-ink-50"
                  >
                    <Pencil className="h-3 w-3 opacity-60" />
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id, s.name)}
                    className="flex w-full items-center gap-2 border-t border-ink-100 px-2.5 py-1.5 text-left text-[12px] text-red-700 hover:bg-ink-50"
                  >
                    <Trash2 className="h-3 w-3 opacity-60" />
                    Delete sheet
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
