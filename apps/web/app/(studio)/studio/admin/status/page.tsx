import { Section, Stat, Table, bytes } from "@/components/studio/admin-chrome";
import { dbStatus, tableSizes } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/admin";
import { activationIsOpen, licenceCounts } from "@/lib/db/licences";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Whether the thing is working.
 *
 * Everything here is measured when the page is opened rather than read from a
 * cache, which is the whole point: a status page showing a green tick from ten
 * minutes ago is worse than no status page, because it is believed.
 *
 * The service checks report configuration, not reachability. Whether Resend
 * will accept a message can only be learned by sending one, and a status page
 * that emails somebody every time it is opened is a status page that gets
 * turned off. So this says "a key is set" or "no key is set", which is the
 * thing that is actually wrong most of the time.
 */
export default async function AdminStatusPage() {
  await requireAdmin();

  const [db, tables, lic] = await Promise.all([
    dbStatus(),
    tableSizes().catch(() => []),
    licenceCounts().catch(() => ({ total: 0, active: 0, activated: 0 })),
  ]);

  const uptimeSecs = Math.floor(process.uptime());
  const services: { name: string; ok: boolean; note: string }[] = [
    {
      name: "Database",
      ok: db.ok,
      note: db.ok ? `${db.latencyMs} ms, ${bytes(db.sizeBytes)}` : (db.error ?? "unreachable"),
    },
    {
      name: "Secrets key",
      ok: Boolean(env.secretsKey),
      note: env.secretsKey
        ? "set, so provider keys can be sealed and traffic can be counted"
        : "not set: nobody can save a provider key and nothing is counted",
    },
    {
      name: "Outbound email",
      ok: Boolean(env.resendApiKey),
      note: env.resendApiKey
        ? `set, sending as ${env.fromEmail}`
        : "no RESEND_API_KEY: welcome, reset and magic-link mail is silently not sent",
    },
    {
      name: "File storage",
      ok: Boolean(env.r2.bucket),
      note: env.r2.bucket
        ? `R2 bucket ${env.r2.bucket}`
        : "no bucket configured: uploaded project files fall back to local disk",
    },
    {
      name: "Desktop activation",
      // Open mode is a finding, not a setting: it means the endpoint accepts
      // any key, which is exactly the thing the licences table exists to stop.
      ok: !activationIsOpen(),
      note: activationIsOpen()
        ? `LADX_ACTIVATION_OPEN is set, so any licence key activates. ${lic.active} real keys issued; unset it once they are out.`
        : `${lic.active} live keys, ${lic.activated} activated on a machine.`,
    },
    {
      name: "Shared inference key",
      ok: Boolean(env.openrouterApiKey),
      note: env.openrouterApiKey
        ? "set: accounts with no key of their own fall back to the free tier"
        : "not set: every account must connect its own provider",
    },
  ];

  const failing = services.filter((s) => !s.ok);

  return (
    <div className="mx-auto max-w-4xl px-5 py-6">
      <Section
        title={failing.length === 0 ? "Everything configured" : `${failing.length} to look at`}
        blurb="Measured now, not cached."
      >
        <ul className="space-y-1.5">
          {services.map((s) => (
            <li
              key={s.name}
              className="flex items-start gap-2.5 rounded-md border border-ink-200 bg-white px-3 py-2"
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                  s.ok ? "bg-teal-500" : "bg-danger"
                }`}
              />
              <span className="min-w-0">
                <span className="text-[13px] font-medium text-ink-900">{s.name}</span>
                <span className="ml-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-400">
                  {s.ok ? "ok" : "attention"}
                </span>
                <span className="block text-[12px] leading-snug text-ink-500">{s.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="This process" blurb="The Node process serving these pages.">
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat label="Uptime" value={duration(uptimeSecs)} />
          <Stat label="Node" value={process.version} />
          <Stat label="Environment" value={process.env.NODE_ENV ?? "unknown"} />
          <Stat label="Heap" value={bytes(process.memoryUsage().heapUsed)} />
        </div>
      </Section>

      <Section title="Database" blurb={db.version ?? "unreachable"}>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Stat label="Round trip" value={db.latencyMs === null ? "n/a" : `${db.latencyMs} ms`} />
          <Stat label="Size" value={bytes(db.sizeBytes)} />
          <Stat
            label="Migrations applied"
            value={db.migrations === null ? "unknown" : db.migrations}
          />
        </div>
        <Table head={["Table", "Rows", "Size"]}>
          {tables.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-[12.5px] text-ink-400">
                Could not read the table statistics.
              </td>
            </tr>
          ) : (
            tables.map((t) => (
              <tr key={t.table} className="border-b border-ink-50 last:border-0">
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-800">{t.table}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-700">
                  {t.rows.toLocaleString("en-GB")}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-500">
                  {bytes(t.bytes)}
                </td>
              </tr>
            ))
          )}
        </Table>
        <p className="mt-2 text-[11.5px] leading-snug text-ink-400">
          Row counts come from the planner's own statistics, so they are an estimate that drifts
          between vacuums rather than an exact count. Close enough to spot a table that is
          unexpectedly empty or unexpectedly enormous, which is what this is for.
        </p>
      </Section>
    </div>
  );
}

function duration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}
