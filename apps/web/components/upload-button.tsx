"use client";

import { Button } from "@ladx/ui";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function UploadButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/projects", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        project?: { id: string };
        parseError?: string | null;
      };

      if (!res.ok) {
        setError(data.error ?? `upload failed (${res.status})`);
        return;
      }

      if (data.parseError) {
        // Project row exists but parser failed, surface the error and
        // still navigate so the user can see / delete it.
        setError(`parsed failed: ${data.parseError}`);
      }

      if (data.project?.id) {
        router.push(`/projects/${data.project.id}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input ref={inputRef} type="file" accept=".l5x,.xml" onChange={onFile} className="hidden" />
      <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4 mr-2" />
        {busy ? "Uploading…" : "Upload project"}
      </Button>
      {error && <p className="text-xs text-danger max-w-xs text-right">{error}</p>}
    </div>
  );
}
