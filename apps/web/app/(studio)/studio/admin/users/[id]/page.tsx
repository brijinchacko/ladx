import { Section, Stat, Table, ago } from "@/components/studio/admin-chrome";
import RoleControl from "@/components/studio/admin-role";
import { getUserDetail } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/admin";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * One account.
 *
 * What they made and when they were last here. Not what is in any of it: a
 * project name is needed to say which project, and the contents of somebody
 * else's program, drawing or document are theirs. There is no "view as" here
 * and there should never be one.
 */
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;

  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const { user, projects, sessions, events, provider } = detail;

  return (
    <div className="mx-auto max-w-4xl px-5 py-6">
      <div className="mb-5">
        <Link href="/studio/admin/users" className="text-[12.5px] text-ink-500 hover:text-ink-900">
          Back to people
        </Link>
        <h2 className="mt-1 font-display text-[1.4rem] font-bold tracking-[-0.015em] text-ink-900">
          {user.displayName || user.email}
        </h2>
        <p className="font-mono text-[12px] text-ink-500">{user.email}</p>
      </div>

      <div className="mb-8 grid gap-2 sm:grid-cols-4">
        <Stat label="Joined" value={user.createdAt.toLocaleDateString("en-GB")} />
        <Stat label="Last signed in" value={ago(sessions[0]?.createdAt)} />
        <Stat label="Projects" value={projects.length} />
        <Stat label="Role" value={user.role} />
      </div>

      <Section title="Role" blurb="An administrator can see this area and everybody in it.">
        {user.id === me.id ? (
          <p className="rounded-md border border-ink-200 bg-ink-50 p-3 text-[12.5px] text-ink-600">
            This is your own account. Change your own role from another administrator's account, or
            with the grant script, so the last administrator cannot lock everybody out by accident.
          </p>
        ) : (
          <RoleControl userId={user.id} role={user.role} email={user.email} />
        )}
      </Section>

      <Section title="Model provider" blurb="Whether one is connected. Never which key.">
        {provider.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-200 p-3 text-[12.5px] text-ink-400">
            None connected, so nothing that needs a model works for this account.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {provider.map((p) => (
              <li
                key={p.kind}
                className="rounded-sm border border-ink-200 bg-white px-2 py-1 font-mono text-[11.5px] text-ink-700"
              >
                {p.kind}
                <span className="ml-1.5 text-ink-400">
                  since {p.createdAt.toLocaleDateString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Projects" blurb="Names and dates only.">
        <Table head={["Project", "Phase", "Created", "Last touched"]}>
          {projects.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-[12.5px] text-ink-400">
                No projects.
              </td>
            </tr>
          ) : (
            projects.map((p) => (
              <tr key={p.id} className="border-b border-ink-50 last:border-0">
                <td className="px-3 py-1.5 text-ink-800">{p.name}</td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-500">{p.phase}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-ink-500">
                  {p.createdAt.toLocaleDateString("en-GB")}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-ink-500">{ago(p.updatedAt)}</td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      <Section title="Sessions" blurb="The last ten sign-ins.">
        <Table head={["Signed in", "Expires"]}>
          {sessions.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-3 py-4 text-[12.5px] text-ink-400">
                Never signed in.
              </td>
            </tr>
          ) : (
            sessions.map((s, i) => (
              <tr
                key={`${s.createdAt.toISOString()}-${i}`}
                className="border-b border-ink-50 last:border-0"
              >
                <td className="px-3 py-1.5 text-ink-700">{s.createdAt.toLocaleString("en-GB")}</td>
                <td className="px-3 py-1.5 text-ink-500">{s.expiresAt.toLocaleString("en-GB")}</td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      <Section title="Audit trail" blurb="What this account did, newest first.">
        <Table head={["When", "Event", "Subject"]}>
          {events.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-[12.5px] text-ink-400">
                Nothing logged for this account.
              </td>
            </tr>
          ) : (
            events.map((e, i) => (
              <tr
                key={`${e.timestamp.toISOString()}-${i}`}
                className="border-b border-ink-50 last:border-0"
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-ink-400">
                  {e.timestamp.toLocaleString("en-GB")}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-800">{e.event}</td>
                <td className="max-w-[18rem] truncate px-3 py-1.5 font-mono text-[11px] text-ink-400">
                  {e.subjectId ?? ""}
                </td>
              </tr>
            ))
          )}
        </Table>
      </Section>
    </div>
  );
}
