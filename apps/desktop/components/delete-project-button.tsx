"use client";

import { deleteProject } from "@/lib/invoke";
import { Button } from "@ladx/ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!confirm("Delete this project? Removes the local row and stored file.")) return;
    setBusy(true);
    try {
      await deleteProject(projectId);
      router.push("/");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "delete failed");
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
