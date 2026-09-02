// POST /api/conversations/:id/email, emails the current user a copy of
// the conversation. Project name is included if scoped.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { conversations, messages, projects } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/client";
import { transcriptEmail } from "@/lib/email/templates";
import { env } from "@/lib/env";
import { accessIds } from "@/lib/teams/access";
import { and, asc, eq, inArray } from "drizzle-orm";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;
  const { id } = await params;

  const convoRows = await db()
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), inArray(conversations.userId, await accessIds(user.id))))
    .limit(1);
  const convo = convoRows[0];
  if (!convo) return Response.json({ error: "not found" }, { status: 404 });

  const msgRows = await db()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convo.id))
    .orderBy(asc(messages.createdAt));

  let projectName: string | null = null;
  if (convo.projectId) {
    const pRows = await db()
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, convo.projectId))
      .limit(1);
    projectName = pRows[0]?.name ?? null;
  }

  const tpl = transcriptEmail({
    projectName,
    messages: msgRows.map((m) => ({ role: m.role, content: m.content })),
    appUrl: env.appUrl,
  });

  const result = await sendEmail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });

  if (!result.ok) {
    return Response.json({ error: result.error ?? "email failed" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
