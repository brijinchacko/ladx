import { requireUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { acceptInvite } from "@/lib/teams/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * The end of an invitation link.
 *
 * Under /studio so the middleware sends a signed out visitor to sign in (or
 * up) and back here. The account has to match the address the invitation
 * went to, and the page says so rather than silently doing nothing.
 */
export default async function AcceptInvitePage({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const user = await requireUser();
  const { token } = await searchParams;

  const result = token
    ? await acceptInvite(user.id, user.email, token)
    : { ok: false as const, why: "This link is missing its invitation." };

  if (result.ok) {
    auditInBackground({
      userId: user.id,
      actor: user.email,
      event: "workspace_joined",
      subjectId: result.workspaceId,
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="font-display text-[1.3rem] font-bold text-ink-900">
          {result.ok ? "You are in" : "That did not work"}
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-600">
          {result.ok
            ? "The workspace's projects, clients and documents are yours to work on now, and what you make is theirs to see."
            : result.why}
        </p>
        <Link
          href={result.ok ? "/studio/projects" : "/studio/settings"}
          className="mt-6 inline-block rounded-md bg-ink-900 px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
        >
          {result.ok ? "Open the projects" : "Back to Settings"}
        </Link>
      </div>
    </div>
  );
}
