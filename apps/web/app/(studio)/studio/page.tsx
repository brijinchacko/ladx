import StudioChat from "@/components/studio/studio-chat";
import { StudioStart } from "@/components/studio/studio-start";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { listPrograms } from "@/lib/db/ladder";
import { preferredProvider } from "@/lib/db/provider-keys";
import { listProjects } from "@/lib/platform/queries";
import { platformKey } from "@/lib/providers/free-tier";

export const dynamic = "force-dynamic";

/**
 * Home.
 *
 * Chat, with the work above it. The chat box on its own answered "ask me
 * anything" and left "where was I" unanswered, which is the question somebody
 * opening Studio in the morning actually has.
 */
export default async function StudioHome() {
  const user = await requireUser();
  const [provider, projects, programs] = await Promise.all([
    preferredProvider(user.id),
    listProjects(user.id),
    listPrograms(user.id),
  ]);

  // A project is worth returning to differently depending on whether there is
  // anything in it yet, and that is one lookup rather than a query per card.
  const withProgram = new Set(programs.map((p) => p.projectId).filter(Boolean));

  return (
    <>
      <WorkspaceHeader
        title="Studio"
        subtitle="Your projects, and the assistant that reads them."
      />
      <StudioStart
        projects={projects.slice(0, 3).map((p) => ({
          id: p.id,
          name: p.name,
          clientName: p.clientName,
          hasProgram: withProgram.has(p.id),
        }))}
      />
      <StudioChat hasProvider={Boolean(provider) || Boolean(platformKey())} />
    </>
  );
}
