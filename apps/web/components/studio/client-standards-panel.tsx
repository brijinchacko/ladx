import type { ClientStandards } from "@/lib/db/schema";
import { hasStandards } from "@/lib/platform/client-records";
import Link from "next/link";

/**
 * The client's conventions, on the job they apply to.
 *
 * This is the point of recording them. A standards pack sitting on a client
 * page is a filing cabinet; the same pack on the project somebody is working on
 * is the difference between a job delivered right and a job delivered again.
 *
 * Read only here, and linked back to the client to change. An engineer working
 * a job should not be editing the client's standards by accident, and the
 * standards are a property of the client rather than of this project: changing
 * them here would either mean changing them for every other job too, silently,
 * or forking them, which is how two versions of the truth start.
 */
export default function ClientStandardsPanel({
  clientId,
  clientName,
  standards,
}: {
  clientId: string;
  clientName: string;
  standards: ClientStandards | null;
}) {
  if (!hasStandards(standards) || !standards) {
    return (
      <section className="rounded-md border border-ink-100 bg-ink-50 p-4">
        <h2 className="font-display font-bold text-[14px] text-ink-900">
          {clientName} has no standards recorded
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-500 leading-relaxed">
          Tag naming, drawing numbers, preferred hardware and what they want handed over. Recording
          them once puts them on every job for this client, instead of in one engineer's head.
        </p>
        <Link
          href={`/studio/clients/${clientId}`}
          className="mt-2 inline-block font-medium text-[13px] text-teal-700 hover:underline"
        >
          Record them
        </Link>
      </section>
    );
  }

  const rows: [string, string | null][] = [
    ["Tag naming", standards.tagConvention],
    ["Drawing numbers", standards.drawingNumbering],
    ["PLC", standards.preferredPlc],
    ["HMI", standards.preferredHmi],
    ["Drives", standards.preferredDrive],
    ["Screen conventions", standards.hmiConvention],
    ["Alarm conventions", standards.alarmConvention],
    ["Handover", standards.documentRequirements],
    ["Notes", standards.notes],
  ];

  return (
    <section className="rounded-md border border-teal-500">
      <header className="flex flex-wrap items-baseline gap-x-3 border-teal-500 border-b bg-teal-50 px-4 py-2.5">
        <h2 className="font-display font-bold text-[14px] text-ink-900">
          How {clientName} wants it done
        </h2>
        <Link
          href={`/studio/clients/${clientId}`}
          className="ml-auto text-[12.5px] text-ink-500 hover:text-teal-800"
        >
          Change on the client
        </Link>
      </header>

      <dl className="divide-y divide-ink-100">
        {rows
          .filter(([, v]) => typeof v === "string" && v.trim())
          .map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-4 gap-y-0.5 px-4 py-2">
              <dt className="w-40 shrink-0 font-mono text-[10.5px] text-ink-400 uppercase tracking-[0.1em]">
                {k}
              </dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] text-ink-700 leading-relaxed">
                {v}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
