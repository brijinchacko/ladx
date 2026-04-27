import { ProjectChat } from "@/components/project-chat";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { conversations, messages, projects } from "@/lib/db/schema";
import type { ChatTurn } from "@ladx/ui";
import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectChatPage({ params }: PageProps) {
  const { projectId } = await params;
  const user = await requireUser();

  const projectRows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
    .limit(1);

  const project = projectRows[0];
  if (!project) notFound();

  // Load the most recent conversation for this project (if any) and its
  // messages so the user can pick up where they left off. New turns thread
  // onto the same row.
  const lastConvo = await db()
    .select()
    .from(conversations)
    .where(and(eq(conversations.projectId, projectId), eq(conversations.userId, user.id)))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  let initialMessages: ChatTurn[] = [];
  let initialConversationId: string | undefined;
  if (lastConvo[0]) {
    initialConversationId = lastConvo[0].id;
    const rows = await db()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, lastConvo[0].id))
      .orderBy(asc(messages.createdAt));
    initialMessages = rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-ink-100 px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-ink-500">
            <Link href="/projects" className="hover:text-ink-900">
              Projects
            </Link>
            {" / "}
            <Link href={`/projects/${projectId}`} className="hover:text-ink-900">
              {project.name}
            </Link>
          </p>
          <h1 className="font-semibold text-ink-900 truncate">{project.name} · Chat</h1>
        </div>
        <p className="text-xs text-ink-500 shrink-0">
          {project.vendor} · {project.routineCount} routines · {project.tagCount} tags
        </p>
      </header>
      <ProjectChat
        projectId={projectId}
        initialMessages={initialMessages}
        initialConversationId={initialConversationId}
      />
    </div>
  );
}
