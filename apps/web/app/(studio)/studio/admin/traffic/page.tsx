import { DayBars, Section, Stat, Table } from "@/components/studio/admin-chrome";
import {
  metricsEnabled,
  topPaths,
  topReferrers,
  trafficByDay,
  trafficSince,
} from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * How busy the site is.
 *
 * Counted server side with no cookie, no address and no visitor id, so these
 * are page views and not people. That distinction is stated on the page rather
 * than left for somebody to assume the wrong way round: ten views is ten
 * readings, which might be one person refreshing.
 *
 * The trade is deliberate. A figure that cannot be turned into a person needs
 * no consent banner, survives every ad blocker, and is the same number for
 * everybody. What it cannot tell you is how many distinct people came, and
 * nothing on this page pretends otherwise.
 */
export default async function AdminTrafficPage({
  searchParams,
}: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const { days: raw } = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(raw)) ? Number(raw) : 30;

  const [enabled, series, paths, referrers, since] = await Promise.all([
    metricsEnabled(),
    trafficByDay(days),
    topPaths(days, 40),
    topReferrers(days, 20),
    trafficSince(),
  ]);

  const total = series.reduce((n, d) => n + d.total, 0);
  const authed = series.reduce((n, d) => n + d.authed, 0);
  const busiest = series.reduce<{ day: string; total: number } | null>(
    (best, d) => (!best || d.total > best.total ? d : best),
    null,
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      {!enabled && (
        <p className="mb-5 rounded-md border border-warning-border bg-warning-bg p-3 text-[12.5px] leading-relaxed text-warning">
          Counting is off. The middleware signs its batches with a token derived from{" "}
          <code className="font-mono">LADX_SECRETS_KEY</code>, and that variable is not set on this
          server, so nothing is being recorded. Set it and the figures start from the next page
          anybody reads.
        </p>
      )}

      <Section
        title="Page views"
        blurb={`Last ${days} days.${since ? ` Counting began ${since}.` : ""}`}
        right={
          <div className="flex gap-1">
            {[7, 30, 90, 365].map((d) => (
              <a
                key={d}
                href={`/studio/admin/traffic?days=${d}`}
                className={`rounded-sm border px-2 py-0.5 text-[11.5px] ${
                  d === days
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-200 text-ink-600 hover:border-ink-400"
                }`}
              >
                {d === 365 ? "1 y" : `${d} d`}
              </a>
            ))}
          </div>
        }
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <Stat label="Views" value={total} note="not visitors" />
          <Stat label="Signed in" value={authed} note={pct(authed, total)} />
          <Stat label="Visitors" value={total - authed} note={pct(total - authed, total)} />
          <Stat
            label="Busiest day"
            value={busiest ? busiest.total : 0}
            note={busiest?.day ?? "nothing yet"}
          />
        </div>
        <DayBars data={series} label={`Views a day, last ${days}`} splitLabel="signed in" />
      </Section>

      <Section title="Most read" blurb="Ids are collapsed, so this is pages rather than rows.">
        <Table head={["Page", "Views", "Signed in", "Visitors"]}>
          {paths.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-4 text-[12.5px] text-ink-400">
                Nothing recorded in this window.
              </td>
            </tr>
          ) : (
            paths.map((p) => (
              <tr key={p.path} className="border-b border-ink-50 last:border-0">
                <td className="max-w-[24rem] truncate px-3 py-1.5 font-mono text-[11.5px] text-ink-800">
                  {p.path}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-900">
                  {p.total.toLocaleString("en-GB")}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-500">{p.authed}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-500">
                  {p.total - p.authed}
                </td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      <Section
        title="Came from"
        blurb="The referring host only. A full referring URL can carry a search term, so it is never stored."
      >
        <Table head={["Host", "Views"]}>
          {referrers.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-3 py-4 text-[12.5px] text-ink-400">
                Nobody arrived from another site in this window, or nobody sent a referrer.
              </td>
            </tr>
          ) : (
            referrers.map((r) => (
              <tr key={r.host} className="border-b border-ink-50 last:border-0">
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-800">{r.host}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-900">
                  {r.total.toLocaleString("en-GB")}
                </td>
              </tr>
            ))
          )}
        </Table>
      </Section>

      <p className="mt-6 rounded-md border border-ink-200 bg-ink-50/60 p-3 text-[12px] leading-relaxed text-ink-600">
        <strong className="font-semibold text-ink-800">What is stored.</strong> One row per day,
        page and signed-in flag, holding a number. No cookie is set, no address is kept, no session
        is written down, and there is no column in the table where one could go. That is why these
        are views rather than visitors, and why the cookie page can go on saying that nothing here
        follows anybody.
      </p>
    </div>
  );
}

function pct(n: number, of: number): string {
  if (of === 0) return "nothing yet";
  return `${Math.round((n / of) * 100)}% of views`;
}
