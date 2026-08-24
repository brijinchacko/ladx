import KnowledgeClient from "@/components/studio/knowledge-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function StudioKnowledgePage() {
  await requireUser();
  return (
    <>
      <WorkspaceHeader
        title="Knowledge"
        subtitle="Index your manuals and ask them questions, with the passage each answer came from."
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <KnowledgeClient />
      </div>
    </>
  );
}
