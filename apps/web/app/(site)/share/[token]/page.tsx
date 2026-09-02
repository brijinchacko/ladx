import { AuthLink } from "@/components/auth/auth-link";
import { db } from "@/lib/db/client";
import { conversations, messages, users } from "@/lib/db/schema";
import { SITE } from "@/lib/seo/schema";
import { ChatMessage } from "@ladx/ui";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db()
    .select({ title: conversations.title })
    .from(conversations)
    .where(eq(conversations.shareToken, token))
    .limit(1);

  return {
    title: row?.title?.trim() || "Shared conversation",
    // A shared link is meant for the person it was sent to, not for search.
    robots: { index: false, follow: false },
    alternates: { canonical: `${SITE.url}/share/${token}` },
  };
}

/**
 * A shared conversation, read only and open to anyone with the link.
 *
 * Public on purpose, which is what "share" means, so nothing here is gated. The
 * token is the credential: 24 random bytes, minted per share and separate from
 * the row id, so a private URL never becomes a public one. Revoking sets it to
 * null and every copy of the link stops working at once.
 *
 * No reply box. This is a transcript, not a way into somebody's account.
 */
export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [convo] = await db()
    .select({
      id: conversations.id,
      title: conversations.title,
      sharedAt: conversations.sharedAt,
      authorName: users.displayName,
      authorEmail: users.email,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.userId))
    .where(eq(conversations.shareToken, token))
    .limit(1);

  if (!convo) notFound();

  const turns = await db()
    .select({ id: messages.id, role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, convo.id))
    .orderBy(asc(messages.createdAt));

  const author = convo.authorName?.trim() || convo.authorEmail.split("@")[0];

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8 border-b border-ink-100 pb-5">
        <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-400">
          Shared conversation
        </p>
        <h1 className="font-display text-[1.7rem] font-extrabold leading-tight tracking-[-0.02em] text-ink-900">
          {convo.title?.trim() || "Untitled chat"}
        </h1>
        <p className="mt-2 text-[13px] text-ink-500">
          Shared by {author}
          {convo.sharedAt &&
            ` on ${convo.sharedAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}`}
        </p>
      </header>

      <div className="rounded-md border border-ink-100">
        {turns
          .filter((t) => t.role !== "system")
          .map((t) => (
            <ChatMessage key={t.id} role={t.role as "user" | "assistant"} content={t.content} />
          ))}
      </div>

      <footer className="mt-8 border-t border-ink-100 pt-6 text-center">
        <p className="text-[14px] text-ink-600">
          This was written in LADX Studio, the AI workbench for automation engineers.
        </p>
        <AuthLink
          mode="sign-up"
          next="/projects"
          className="mt-3 inline-block rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Try it free
        </AuthLink>
      </footer>
    </div>
  );
}
