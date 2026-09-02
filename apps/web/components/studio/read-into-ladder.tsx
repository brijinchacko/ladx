"use client";

import { Grid2x2Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Open an uploaded PLC file in Ladder.
 *
 * For a project uploaded before uploads produced a ladder program. New uploads
 * arrive with one; this reads the stored file the same way, once, and then
 * every tool sees the program. The button disappears with the reason for it.
 */
export function ReadIntoLadder({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function read() {
    if (done) {
      router.push(`/studio/ladder?project=${projectId}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/ir`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not read the file.");
        return;
      }
      const { rungs, dropped } = (await res.json()) as { rungs: number; dropped: number };
      if (dropped > 0) {
        // Say what did not make it before leaving the page that can say it.
        // The editor has no floating point and no structured text; a routine
        // in either is still in the file, just not on the screen it opens on.
        // The next click opens the editor.
        setNote(
          `Read ${rungs} rung${rungs === 1 ? "" : "s"}. ${dropped} thing${dropped === 1 ? "" : "s"} the ladder editor cannot show ${dropped === 1 ? "is" : "are"} still in the file.`,
        );
        setDone(true);
        router.refresh();
        return;
      }
      router.push(`/studio/ladder?project=${projectId}`);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={read}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-sm bg-ink-900 px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Grid2x2Check className="h-3.5 w-3.5" />
        {busy ? "Reading…" : done ? "Open" : "Open in Ladder"}
      </button>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {note && <p className="max-w-xs text-right text-[12px] text-ink-500">{note}</p>}
    </div>
  );
}
