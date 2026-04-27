import { and, desc, eq } from "drizzle-orm";
import { db } from "./client";
import { conversations, messages } from "./schema";

export async function ensureConversation(opts: {
  userId: string;
  conversationId?: string;
  projectId?: string;
}) {
  if (opts.conversationId) {
    const existing = await db()
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, opts.conversationId), eq(conversations.userId, opts.userId)))
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const [created] = await db()
    .insert(conversations)
    .values({
      userId: opts.userId,
      projectId: opts.projectId,
    })
    .returning();
  if (!created) throw new Error("conversation insert returned no row");
  return created;
}

export async function appendMessage(opts: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
}) {
  const [row] = await db()
    .insert(messages)
    .values({
      conversationId: opts.conversationId,
      role: opts.role,
      content: opts.content,
    })
    .returning();
  if (!row) throw new Error("message insert returned no row");
  return row;
}

export async function listMessages(conversationId: string) {
  return db()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function listUserConversations(userId: string, limit = 20) {
  return db()
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
}
