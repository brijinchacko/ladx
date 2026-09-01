import { Section, Table, ago } from "@/components/studio/admin-chrome";
import { listUsers } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE = 50;

/**
 * Everybody with an account.
 *
 * The columns are what somebody was made, not what they are worth: projects,
 * programs, applications, drawings, documents. A person who signed up and
 * built nothing shows as a row of zeros, which is the useful thing to see.
 *
 * There is no password column, no key column and no session token here, and
 * there is no code path that could add one by accident: lib/admin/queries names
 * every column it selects.
 */
export default async function AdminUsersPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin();
  const { q, page } = await searchParams;
  const pageNo = Math.max(1, Number(page) || 1);

  const { rows, total } = await listUsers({
    search: q,
    limit: PAGE,
    offset: (pageNo - 1) * PAGE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
      <Section
        title={`${total.toLocaleString("en-GB")} accounts`}
        blurb={q ? `matching "${q}"` : "newest first"}
        right={
          <form method="get" className="flex items-center gap-1.5">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search email or name"
              className="w-56 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
            />
            <button
              type="submit"
              className="rounded-md bg-ink-900 px-2.5 py-1 text-[12px] font-medium text-white"
            >
              Search
            </button>
            {q && (
              <Link href="/studio/admin/users" className="text-[12px] text-ink-500 underline">
                Clear
              </Link>
            )}
          </form>
        }
      >
        <Table
          head={[
            "Account",
            "Joined",
            "Last signed in",
            "Projects",
            "Ladder",
            "HMI",
            "CAD",
            "Docs",
            "Chats",
            "Model",
            "",
          ]}
        >
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-3 py-4 text-[12.5px] text-ink-400">
                No account matches that.
              </td>
            </tr>
          ) : (
            rows.map((u) => (
              <tr key={u.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50">
                <td className="px-3 py-2">
                  <Link
                    href={`/studio/admin/users/${u.id}`}
                    className="font-medium text-ink-900 hover:text-teal-700"
                  >
                    {u.displayName || u.email}
                  </Link>
                  {u.displayName && (
                    <div className="font-mono text-[10.5px] text-ink-400">{u.email}</div>
                  )}
                  {u.role === "admin" && (
                    <span className="mt-0.5 inline-block rounded-sm border border-teal-300 bg-teal-50 px-1 py-px font-mono text-[9.5px] uppercase tracking-[0.08em] text-teal-800">
                      admin
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-500">
                  {u.createdAt.toLocaleDateString("en-GB")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-500">{ago(u.lastSessionAt)}</td>
                <Num n={u.projects} />
                <Num n={u.programs} />
                <Num n={u.hmi} />
                <Num n={u.drawings} />
                <Num n={u.documents} />
                <Num n={u.conversations} />
                <td className="px-3 py-2 text-center">
                  <span
                    title={
                      u.hasProvider
                        ? "A provider key is on file. It is encrypted and this page cannot read it."
                        : "No provider connected, so nothing AI works for this account."
                    }
                    className={u.hasProvider ? "text-teal-600" : "text-ink-400"}
                  >
                    {u.hasProvider ? "yes" : "no"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/studio/admin/users/${u.id}`}
                    className="text-[12px] text-teal-700 underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))
          )}
        </Table>

        {pages > 1 && (
          <div className="mt-3 flex items-center gap-2 text-[12.5px]">
            {pageNo > 1 && (
              <Link
                href={`/studio/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(pageNo - 1) })}`}
                className="rounded-md border border-ink-200 px-2 py-1 text-ink-700 hover:border-ink-400"
              >
                Previous
              </Link>
            )}
            <span className="text-ink-400">
              Page {pageNo} of {pages}
            </span>
            {pageNo < pages && (
              <Link
                href={`/studio/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(pageNo + 1) })}`}
                className="rounded-md border border-ink-200 px-2 py-1 text-ink-700 hover:border-ink-400"
              >
                Next
              </Link>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return (
    <td className={`px-3 py-2 text-center tabular-nums ${n > 0 ? "text-ink-800" : "text-ink-400"}`}>
      {n}
    </td>
  );
}
