import StudioSidebar from "@/components/studio/studio-sidebar";
import { requireUser } from "@/lib/auth/server";
import { listUserConversations } from "@/lib/db/conversations";
import { listProjects } from "@/lib/platform/queries";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/**
 * LADX Studio.
 *
 * One shell, every tool inside it. Previously the ladder editor, Convert and
 * Documents lived in the marketing site layout, so opening one from the app
 * dropped you onto the public website complete with its header, footer and
 * "Start free" button. That is the thing this layout exists to stop: from here
 * on, a tool is a pane in the workspace, not a different site.
 *
 * The whole subtree requires an account, which the middleware enforces on the
 * /studio prefix and requireUser enforces again here.
 */
export default async function StudioLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  const [conversations, projects] = await Promise.all([
    listUserConversations(user.id, 8),
    listProjects(user.id),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-white text-ink-900">
      <StudioSidebar
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt.toISOString(),
        }))}
        projects={projects.slice(0, 6).map((p) => ({
          id: p.id,
          name: p.name,
          phase: p.phase,
        }))}
        userName={user.displayName}
        userEmail={user.email}
      />
      {/* min-h-0 so a tool that scrolls internally does not push the page. */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
