"use client";

import type { XrefEntry } from "@/lib/xref/xref";
import { AlertTriangle, Grid2x2Check, MonitorCog, PencilRuler, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * The cross reference, as a list and a detail.
 *
 * The list is every tag, most used first, with a count per tool so the shape
 * of the program reads at a glance. The detail is one tag with every use as a
 * link into the tool it lives in. Findings sit above both, because a tag the
 * HMI binds to that the program does not have is the thing this page exists
 * to catch, and it should not have to be scrolled to.
 */
export function TagXref({
  projectId,
  entries,
  findings,
  initialTag,
  hasProgram,
}: {
  projectId: string;
  entries: XrefEntry[];
  findings: { tag: string; finding: string }[];
  initialTag: string | null;
  hasProgram: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(initialTag ?? entries[0]?.tag ?? null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.tag.toLowerCase().includes(q) ||
        (e.comment ?? "").toLowerCase().includes(q) ||
        (e.address ?? "").toLowerCase().includes(q),
    );
  }, [entries, query]);

  const current = entries.find((e) => e.tag === selected) ?? null;

  if (!hasProgram && entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Grid2x2Check className="mx-auto h-6 w-6 text-ink-400" />
          <p className="mt-3 text-[14.5px] font-medium text-ink-900">No tags yet</p>
          <p className="mt-1 text-[13.5px] text-ink-500">
            Write or import a program for this project and every tag in it appears here, with
            everywhere it is used.
          </p>
          <Link
            href={`/studio/ladder?project=${projectId}`}
            className="mt-4 inline-block rounded-md bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Open Ladder
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {findings.length > 0 && (
        <div className="shrink-0 border-b border-warning-border bg-warning-bg px-6 py-2.5">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {findings.length} thing{findings.length === 1 ? "" : "s"} worth a look
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[12.5px] text-warning">
            {findings.slice(0, 8).map((f) => (
              <li key={`${f.tag}-${f.finding}`}>
                <button
                  type="button"
                  onClick={() => setSelected(f.tag)}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {f.tag}
                </button>{" "}
                {f.finding}
              </li>
            ))}
            {findings.length > 8 && <li>and {findings.length - 8} more</li>}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* the list */}
        <div className="flex w-80 shrink-0 flex-col border-r border-ink-100">
          <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tag, address or comment"
              aria-label="Find a tag"
              className="h-7 w-full bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-ink-400"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {shown.map((e) => (
              <button
                key={e.tag}
                type="button"
                onClick={() => setSelected(e.tag)}
                className={`flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                  e.tag === selected ? "bg-ink-100" : "hover:bg-ink-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px] text-ink-900">
                    {e.tag}
                  </span>
                  <span className="block truncate text-[11.5px] text-ink-500">
                    {[e.type, e.address, e.comment].filter(Boolean).join(" · ") ||
                      (e.declared ? "" : "not declared")}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1.5 font-mono text-[10.5px] tabular-nums text-ink-400">
                  {e.program.length > 0 && <span title="rungs">{e.program.length}L</span>}
                  {e.hmi.length > 0 && <span title="HMI">{e.hmi.length}H</span>}
                  {e.cad.length > 0 && <span title="drawings">{e.cad.length}D</span>}
                  {e.total === 0 && <span className="text-warning">0</span>}
                </span>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-3 py-6 text-center text-[12.5px] text-ink-500">No tag matches.</p>
            )}
          </div>
        </div>

        {/* the detail */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {current ? (
            <div className="mx-auto max-w-3xl px-8 py-6">
              <p className="font-mono text-[18px] text-ink-900">{current.tag}</p>
              <p className="mt-0.5 text-[13px] text-ink-500">
                {current.declared
                  ? [current.type, current.address, current.comment].filter(Boolean).join(" · ") ||
                    "Declared"
                  : "Not declared in the program"}
                {" · "}
                {current.total} use{current.total === 1 ? "" : "s"}
              </p>

              <Section
                icon={Grid2x2Check}
                title="Program"
                count={current.program.length}
                href={`/studio/ladder?project=${projectId}`}
                empty="No rung reads or writes it."
              >
                {current.program.map((u, i) => (
                  <li key={`${u.routine}-${u.rung}-${i}`} className="flex items-baseline gap-3">
                    <span className="w-24 shrink-0 font-mono text-[12px] text-ink-500">
                      {u.routine} {u.rung}
                    </span>
                    <span
                      className={`w-14 shrink-0 font-mono text-[11.5px] ${
                        u.role === "writes" ? "text-teal-700" : "text-ink-700"
                      }`}
                    >
                      {u.instruction}
                    </span>
                    <span className="text-[12.5px] text-ink-600">
                      {u.role}
                      {u.comment ? ` · ${u.comment}` : ""}
                    </span>
                  </li>
                ))}
              </Section>

              <Section
                icon={MonitorCog}
                title="HMI"
                count={current.hmi.length}
                empty="No screen shows it and no alarm watches it."
              >
                {current.hmi.map((u, i) => (
                  <li key={`${u.applicationId}-${i}`} className="flex items-baseline gap-3">
                    <Link
                      href={`/studio/hmi/${u.applicationId}`}
                      className="w-40 shrink-0 truncate text-[12.5px] text-teal-700 hover:underline"
                    >
                      {u.application}
                      {u.screen ? ` › ${u.screen}` : ""}
                    </Link>
                    <span className="text-[12.5px] text-ink-600">{u.use}</span>
                  </li>
                ))}
              </Section>

              <Section
                icon={PencilRuler}
                title="Drawings"
                count={current.cad.length}
                empty="No drawing labels it."
              >
                {current.cad.map((u, i) => (
                  <li key={`${u.drawingId}-${i}`} className="flex items-baseline gap-3">
                    <Link
                      href={`/studio/cad/${u.drawingId}`}
                      className="w-40 shrink-0 truncate text-[12.5px] text-teal-700 hover:underline"
                    >
                      {u.drawing}
                    </Link>
                    <span className="truncate font-mono text-[12px] text-ink-600">{u.text}</span>
                  </li>
                ))}
              </Section>
            </div>
          ) : (
            <p className="p-8 text-[13.5px] text-ink-500">Pick a tag.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  href,
  empty,
  children,
}: {
  icon: typeof Grid2x2Check;
  title: string;
  count: number;
  href?: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
        <Icon className="h-3.5 w-3.5 text-ink-400" />
        {title}
        <span className="font-mono text-[11px] font-normal text-ink-400">{count}</span>
        {href && count > 0 && (
          <Link
            href={href}
            className="ml-auto text-[12px] font-normal text-teal-700 hover:underline"
          >
            Open
          </Link>
        )}
      </h2>
      {count === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-ink-500">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">{children}</ul>
      )}
    </section>
  );
}
