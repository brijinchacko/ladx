"use client";

import { pickAndParseProject } from "@/lib/invoke";
import { Button } from "@ladx/ui";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UploadProjectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const row = await pickAndParseProject();
      if (!row) return; // user cancelled
      router.push(`/project?id=${row.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="primary" onClick={go} disabled={busy}>
        <Upload className="h-4 w-4 mr-2" />
        {busy ? "Importing…" : "Open project"}
      </Button>
      {error && <p className="text-xs text-danger max-w-xs text-right">{error}</p>}
    </div>
  );
}
