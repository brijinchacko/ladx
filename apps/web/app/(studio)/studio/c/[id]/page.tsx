import StudioChat from "@/components/studio/studio-chat";
import { WorkspaceHeader } from "@/components/studio/workspace-header";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { listMessages } from "@/lib/db/conversations";
import { preferredProvider } from "@/lib/db/provider-keys";
import { conversations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Scoped to the owner, so a conversation id from someone else is a 404.
  const [convo] = await db()
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)))
    .limit(1);
  if (!convo) notFound();

  const [messages, provider] = await Promise.all([
    listMessages(convo.id),
    preferredProvider(user.id),
  ]);

  return (
    <>
      <WorkspaceHeader title={convo.title?.trim() || "Chat"} />
      <StudioChat
        conversationId={convo.id}
        hasProvider={Boolean(provider)}
        initialMessages={messages
          .filter((m) => m.role !== "system")
          // ChatTurn carries an id, which React uses as the list key. Reusing
          // the persisted message id keeps those keys stable across a refresh.
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          }))}
      />
    </>
  );
}
