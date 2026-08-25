import { DayBars, Section, Stat, Table, ago } from "@/components/studio/admin-chrome";
import { eventCounts, recentEvents, signupsByDay, totals, trafficByDay } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/admin";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * The overview.
 *
 * Ordered by what a question would actually be asked in: is anybody here, are
 * they building anything, and is anything on fire. Counts of rows rather than
 * an invented engagement score, because a row is a thing somebody made and a
 * score is a thing this page made up.
 */
export default async function AdminOverviewPage() {
  await requireAdmin();

  const [t, signups, traffic, events, byEvent] = await Promise.all([
    totals(),
    signupsByDay(30),
    trafficByDay(30),
    recentEvents(25),
    eventCounts(7),
  ]);

  const built =
    t.projects + t.ladderPrograms + t.hmiApplications + t.drawings + t.documents + t.knowledgeDocs;

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <Section title="People" blurb="Accounts, and how many are signed in now.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Accounts" value={t.users} href="/studio/admin/users" />
          <Stat label="New this week" value={t.usersThisWeek} note="last 7 days" />
          <Stat label="Live sessions" value={t.activeSessions} note="not yet expired" />
          <Stat
            label="With a model"
            value={t.providersConnected}
            note="have connected a provider key"
          />
        </div>
      </Section>

      <Section
        title="What has been built"
        blurb={`${built.toLocaleString("en-GB")} things across every tool.`}
      >
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Projects" value={t.projects} />
          <Stat label="Clients" value={t.clients} />
          <Stat label="Ladder programs" value={t.ladderPrograms} />
          <Stat label="HMI applications" value={t.hmiApplications} />
          <Stat label="Drawings" value={t.drawings} />
          <Stat label="Documents" value={t.documents} />
          <Stat label="Knowledge files" value={t.knowledgeDocs} />
          <Stat label="Plan tasks" value={t.tasks} />
        </div>
      </Section>

      <Section title="Sign-ups" blurb="One bar a day, including the days with none.">
        <DayBars data={signups} label="New accounts a day" />
      </Section>

      <Section
        title="Pages read"
        blurb="Counted without a cookie."
        right={
          <Link href="/studio/admin/traffic" className="text-[12.5px] text-teal-700 underline">
            Traffic in full
          </Link>
        }
      >
        <DayBars data={traffic} label="Page views a day" splitLabel="signed in" />
      </Section>

      <Section title="Busiest events" blurb="From the audit log, last seven days.">
        {byEvent.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-200 p-4 text-[12.5px] text-ink-400">
            Nothing logged in the last week.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {byEvent.slice(0, 18).map((e) => (
              <li
                key={e.event}
                className="rounded-sm border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] text-ink-600"
              >
                {e.event}
                <span className="ml-1.5 tabular-nums text-ink-900">{e.n}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Latest activity" blurb="Newest first.">
        <Table head={["When", "Event", "Who", "Subject"]}>
          {events.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-[12.5px] text-ink-400">
                The audit log is empty.
              </td>
            </tr>
          ) : (
            events.map((e, i) => (
              <tr
                key={`${e.timestamp.toISOString()}-${i}`}
                className="border-b border-ink-50 last:border-0"
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-ink-400">
                  {ago(e.timestamp)}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-800">{e.event}</td>
                <td className="px-3 py-1.5 text-ink-600">{e.email ?? e.actor}</td>
                <td className="max-w-[16rem] truncate px-3 py-1.5 font-mono text-[11px] text-ink-400">
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
