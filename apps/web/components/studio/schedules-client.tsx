"use client";

import { ladxProgramToIr } from "@ladx/studio";
import type { Alarm, AlarmIssue, IoIssue, IoPoint } from "@ladx/types";
import { Bell, Cable, Download, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface Schedules {
  io: { points: IoPoint[]; issues: IoIssue[]; inputs: number; outputs: number; csv: string } | null;
  alarms: { alarms: Alarm[]; issues: AlarmIssue[]; csv: string } | null;
}

export function SchedulesClient({
  programs,
  openOn,
}: {
  programs: { id: string; name: string; program: unknown }[];
  /**
   * The program to open on, when this was reached from a project.
   *
   * Null means it was reached from the sidebar, where there is no project and
   * the most recently touched program is the reasonable default.
   */
  openOn?: string | null;
}) {
  const [chosen, setChosen] = useState<string>(openOn ?? programs[0]?.id ?? "");
  const [data, setData] = useState<Schedules | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const build = useCallback(
    async (id: string) => {
      if (!id) return;
      const found = programs.find((p) => p.id === id);
      if (!found) return;
      setBusy(true);
      setError(null);
      setData(null);
      try {
        // Converted here rather than on the server, because this is the same
        // conversion the editor uses and a second path would eventually disagree
        // with it about what a rung means.
        const built = await fetch("/api/ladder/schedule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            project: ladxProgramToIr(found.program as Parameters<typeof ladxProgramToIr>[0]),
          }),
        });
        const out = await built.json();
        if (!built.ok) throw new Error(out.error ?? "The schedule could not be built.");
        setData(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The schedule could not be built.");
      } finally {
        setBusy(false);
      }
    },
    [programs],
  );

  useEffect(() => {
    void build(chosen);
  }, [chosen, build]);

  const download = (csv: string, name: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (programs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10 text-center">
        <Cable className="mx-auto mb-3 h-5 w-5 text-ink-400" />
        <p className="text-[13.5px] text-ink-600">No programs yet.</p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Write one in Ladder, or open an L5X in Convert, and its schedules appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-ink-500"
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {busy && <span className="text-[12.5px] text-ink-500">Reading…</span>}
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {data?.io && (
        <Section
          icon={<Cable className="h-4 w-4" />}
          title="I/O list"
          count={`${data.io.inputs} in, ${data.io.outputs} out`}
          onDownload={() => download(data.io?.csv ?? "", "io-list.csv")}
          issues={data.io.issues.map((i) => ({ check: i.check, tag: i.tag, detail: i.detail }))}
        >
          <Table
            head={["Tag", "Type", "Device", "Address", "Description"]}
            rows={data.io.points.map((p) => [
              p.tag,
              p.signal,
              p.device ?? "",
              p.address ?? "",
              p.description ?? "",
            ])}
          />
        </Section>
      )}

      {data?.alarms && (
        <Section
          icon={<Bell className="h-4 w-4" />}
          title="Alarm list"
          count={`${data.alarms.alarms.filter((a) => !a.follows_other_alarms).length} conditions`}
          onDownload={() => download(data.alarms?.csv ?? "", "alarm-list.csv")}
          issues={data.alarms.issues.map((i) => ({ check: i.check, tag: i.tag, detail: i.detail }))}
        >
          {data.alarms.alarms.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-ink-500">
              Nothing in this program looks like an alarm. That is a normal answer for a program
              that does not raise any.
            </p>
          ) : (
            <Table
              head={["Tag", "Message", "Latched", "Raised by", "Cleared by", ""]}
              rows={data.alarms.alarms.map((a) => [
                a.tag,
                a.description ?? "",
                a.latched ? "yes" : "no",
                a.raised_by.join(" "),
                a.cleared_by.join(" ") || "nothing",
                a.follows_other_alarms ? "summary" : "",
              ])}
            />
          )}
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  onDownload,
  issues,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: string;
  onDownload: () => void;
  issues: { check: string; tag: string; detail: string }[];
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-ink-400">{icon}</span>
        <h2 className="font-semibold text-ink-900">{title}</h2>
        <span className="text-[12.5px] text-ink-500">{count}</span>
        <button
          type="button"
          onClick={onDownload}
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-ink-200 px-2.5 text-[12.5px] text-ink-600 hover:border-ink-400"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ink-100">{children}</div>

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {issues.map((i) => (
            <li key={`${i.check}${i.tag}`} className="flex gap-2 text-[12.5px] leading-snug">
              {/* Nothing here is an error. Each one is something worth a look,
                  and several are normal on a working machine: a spare input is
                  not a fault. */}
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              <span className="text-ink-600">
                {i.tag && <span className="font-mono text-[11.5px] text-ink-500">{i.tag}</span>}{" "}
                {i.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full border-collapse text-[12.5px]">
      <thead>
        <tr className="border-b border-ink-100 bg-ink-50/60 text-left">
          {head.map((h) => (
            <th key={h} className="px-3 py-2 font-medium text-ink-600">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.join("|")} className="border-b border-ink-50 last:border-0">
            {r.map((cell, i) => (
              <td
                key={`${head[i]}-${cell}`}
                className={`px-3 py-1.5 ${i === 0 ? "font-mono text-ink-900" : "text-ink-600"}`}
              >
                {cell || <span className="text-ink-400">-</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
