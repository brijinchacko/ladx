import StudioChat from "@/components/studio/studio-chat";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { preferredProvider } from "@/lib/db/provider-keys";
import { platformKey } from "@/lib/providers/free-tier";

export const dynamic = "force-dynamic";

export default async function StudioHome() {
  const user = await requireUser();
  const provider = await preferredProvider(user.id);

  return (
    <>
      <WorkspaceHeader
        title="Chat"
        subtitle="Ask for ladder logic, structured text, or an explanation of a routine."
      />
      <StudioChat hasProvider={Boolean(provider) || Boolean(platformKey())} />
    </>
  );
}
