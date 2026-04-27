"use client";

import { Button } from "@ladx/ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!confirm("Delete this project? The file will be permanently removed.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        alert(`Delete failed (${res.status})`);
        return;
      }
      router.push("/projects");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={busy}>
      <Trash2 className="h-4 w-4 mr-2" />
      Delete
    </Button>
  );
}
