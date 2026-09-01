/**
 * The pieces the admin pages are built from.
 *
 * Server components, deliberately. Every one of them takes data and returns
 * markup with no state and no effect, so there is no reason to ship them to
 * the browser, and a good reason not to: the pages that use them are server
 * components that also call `ago` and `bytes` directly, which only works if
 * this file stays on the server. The one piece that needs a hook lives in
 * admin-tabs.tsx.
 */

import Link from "next/link";
import type { ReactNode } from "react";

/* ─────────────────────────────── pieces ─────────────────────────────── */

/**
 * One number and what it counts.
 *
 * `tabular-nums` throughout, because a column of figures that shifts as the
 * digits change is a column nobody can compare down.
 */
export function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number | string;
  note?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
        {label}
      </div>
      <div className="mt-1 font-display text-[1.75rem] font-bold leading-none tabular-nums text-ink-900">
        {typeof value === "number" ? value.toLocaleString("en-GB") : value}
      </div>
      {note && <div className="mt-1 text-[11.5px] leading-snug text-ink-500">{note}</div>}
    </>
  );
  const cls = `block rounded-md border border-ink-200 bg-white p-3.5 transition-colors${
    href ? " hover:border-ink-400" : ""
  }`;
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Section({
  title,
  blurb,
  right,
  children,
}: { title: string; blurb?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink-900">
          {title}
        </h2>
        {blurb && <p className="text-[12.5px] text-ink-500">{blurb}</p>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * A bar chart of a daily series.
 *
 * Deliberately not a line: these are counts of discrete days, and a line
 * between two days implies values in between that were never measured. The
 * scale is printed rather than implied, because a bar chart with no axis is a
 * shape, not a measurement.
 */
export function DayBars({
  data,
  label,
  splitLabel,
}: {
  data: { day: string; total: number; authed?: number }[];
  label: string;
  /** When set, the authed portion is drawn darker and named. */
  splitLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-ink-200 p-4 text-[12.5px] text-ink-400">
        Nothing recorded yet.
      </p>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.total));
  const sum = data.reduce((n, d) => n + d.total, 0);

  return (
    <div className="rounded-md border border-ink-200 bg-white p-4">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-500">
          {sum.toLocaleString("en-GB")} over {data.length} days · peak {max.toLocaleString("en-GB")}
        </span>
        {splitLabel && (
          <span className="ml-auto flex items-center gap-3 font-mono text-[10.5px] text-ink-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-ink-800" />
              {splitLabel}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-teal-400" />
              visitors
            </span>
          </span>
        )}
      </div>
      <div className="flex h-28 items-end gap-px">
        {data.map((d) => {
          const h = (d.total / max) * 100;
          const authed = d.authed ?? 0;
          const authedH = d.total > 0 ? (authed / d.total) * 100 : 0;
          return (
            <div
              key={d.day}
              title={`${d.day}: ${d.total.toLocaleString("en-GB")}${
                splitLabel ? ` (${authed} ${splitLabel})` : ""
              }`}
              className="flex min-w-0 flex-1 flex-col justify-end"
              style={{ height: "100%" }}
            >
              <div className="w-full bg-teal-400" style={{ height: `${Math.max(h, 1)}%` }}>
                {splitLabel && authed > 0 && (
                  <div className="w-full bg-ink-800" style={{ height: `${authedH}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-400">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-ink-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50/60 text-left">
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "unknown";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function ago(d: Date | string | null | undefined): string {
  if (!d) return "never";
  const t = typeof d === "string" ? new Date(d) : d;
  const secs = Math.floor((Date.now() - t.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  const days = Math.floor(secs / 86400);
  if (days < 31) return `${days} d ago`;
  return t.toLocaleDateString("en-GB");
}
