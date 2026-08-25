"use client";

import {
  type GanttTask,
  addDays,
  barFor,
  daysBetween,
  ganttWindow,
  isWeekend,
  linksFor,
  monthBands,
  scheduleProblems,
  toISODate,
} from "@/lib/platform/gantt";
import { AlertTriangle, Link2, Link2Off } from "lucide-react";
import { useMemo, useRef, useState } from "react";

/** How wide a day is, per zoom level. Days need room for a label; quarters do not. */
const ZOOM = {
  day: { px: 30, label: "Days" },
  week: { px: 13, label: "Weeks" },
  month: { px: 5, label: "Months" },
} as const;
export type Zoom = keyof typeof ZOOM;

const ROW_H = 30;
const NAME_W = 260;

const STATUS_FILL: Record<GanttTask["status"], string> = {
  todo: "bg-ink-300",
  doing: "bg-teal-500",
  blocked: "bg-[#B4531A]",
  done: "bg-ink-500",
};

export interface GanttGroup {
  key: string;
  label: string;
  tasks: GanttTask[];
}

/**
 * The plan as a schedule rather than a list.
 *
 * A Gantt earns its space by answering two questions a list cannot: what
 * overlaps, and what is waiting on what. So bars are draggable (the plan is
 * the thing being edited, not a read-only picture of one), dependencies are
 * drawn as real links, and a link that cannot hold — a cycle, or a successor
 * starting before its predecessor ends — is marked rather than quietly drawn
 * as if it were fine.
 *
 * Rows are grouped, by lifecycle phase inside a project and by project across
 * them, because an ungrouped list of forty bars is a picture of a plan rather
 * than a usable one.
 */
export default function GanttChart({
  groups,
  zoom = "week",
  onReschedule,
  onSelect,
  selectedId,
  onLink,
}: {
  groups: GanttGroup[];
  zoom?: Zoom;
  /** Committed on drop, never mid-drag: one write per gesture, not per pixel. */
  onReschedule?: (id: string, startsOn: string, dueOn: string) => void;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  /** Set or clear a predecessor. Null clears it. */
  onLink?: (id: string, dependsOn: string | null) => void;
}) {
  const dayPx = ZOOM[zoom].px;
  const scrollRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => groups.flatMap((g) => g.tasks), [groups]);
  const { from, days } = useMemo(() => ganttWindow(all), [all]);
  const links = useMemo(() => linksFor(all), [all]);
  const problems = useMemo(() => scheduleProblems(all), [all]);
  const bands = useMemo(() => monthBands(from, days), [from, days]);

  /** Which task is being dragged, and how. Null when nothing is. */
  const [drag, setDrag] = useState<{
    id: string;
    mode: "move" | "start" | "end";
    originX: number;
    offset: number;
    span: number;
    deltaDays: number;
  } | null>(null);

  /** Picking a predecessor: the successor waiting for a click on its target. */
  const [linking, setLinking] = useState<string | null>(null);

  // Row order has to match between the name column and the chart, so both
  // render from one flattened list rather than mapping groups twice.
  const rows = useMemo(() => {
    const out: (
      | { kind: "group"; label: string; key: string }
      | { kind: "task"; task: GanttTask }
    )[] = [];
    for (const g of groups) {
      out.push({ kind: "group", label: g.label, key: g.key });
      for (const t of g.tasks) out.push({ kind: "task", task: t });
    }
    return out;
  }, [groups]);

  const rowIndexOf = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.kind === "task") m.set(r.task.id, i);
    });
    return m;
  }, [rows]);

  const todayOffset = daysBetween(from, new Date());
  const width = days * dayPx;

  function beginDrag(e: React.PointerEvent, t: GanttTask, mode: "move" | "start" | "end") {
    const bar = barFor(t, from);
    if (!bar || !onReschedule) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      id: t.id,
      mode,
      originX: e.clientX,
      offset: bar.offset,
      span: bar.span,
      deltaDays: 0,
    });
  }

  function onDragMove(e: React.PointerEvent) {
    if (!drag) return;
    // Snapped to whole days as it moves. A plan is scheduled in days, so a bar
    // that slides smoothly and then jumps on drop lies about where it will land.
    setDrag({ ...drag, deltaDays: Math.round((e.clientX - drag.originX) / dayPx) });
  }

  function endDrag() {
    if (!drag) return;
    const { id, mode, offset, span, deltaDays } = drag;
    setDrag(null);
    if (deltaDays === 0 || !onReschedule) return;

    let newOffset = offset;
    let newSpan = span;
    if (mode === "move") newOffset = offset + deltaDays;
    if (mode === "start") {
      // Dragging the head past the tail would invert the bar; stop at one day.
      const delta = Math.min(deltaDays, span - 1);
      newOffset = offset + delta;
      newSpan = span - delta;
    }
    if (mode === "end") newSpan = Math.max(1, span + deltaDays);

    const start = addDays(from, newOffset);
    const end = addDays(from, newOffset + newSpan - 1);
    onReschedule(id, toISODate(start), toISODate(end));
  }

  const dragged = (t: GanttTask) => {
    const bar = barFor(t, from);
    if (!bar) return null;
    if (!drag || drag.id !== t.id) return bar;
    if (drag.mode === "move") return { ...bar, offset: bar.offset + drag.deltaDays };
    if (drag.mode === "start") {
      const d = Math.min(drag.deltaDays, bar.span - 1);
      return { ...bar, offset: bar.offset + d, span: bar.span - d };
    }
    return { ...bar, span: Math.max(1, bar.span + drag.deltaDays) };
  };

  const badLink = (from_: string, to: string) =>
    problems.backwards.some((b) => b.from === from_ && b.to === to);

  return (
    <div className="flex min-h-0 flex-col">
      {(problems.cycles.length > 0 || problems.backwards.length > 0) && (
        <p className="flex items-start gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {problems.cycles.length > 0 &&
              `${problems.cycles.length} task${problems.cycles.length === 1 ? "" : "s"} wait on a chain that leads back to itself, so nothing in it can start. `}
            {problems.backwards.length > 0 &&
              `${problems.backwards.length} link${problems.backwards.length === 1 ? " runs" : "s run"} backwards: the work starts before what it waits for has finished.`}
          </span>
        </p>
      )}

      {linking && (
        <p className="border-b border-teal-200 bg-teal-50 px-3 py-1.5 text-[12px] text-teal-900">
          Click the task this one waits for.{" "}
          <button
            type="button"
            onClick={() => setLinking(null)}
            className="underline underline-offset-2"
          >
            Cancel
          </button>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* names, fixed while the timeline scrolls under the pointer */}
        <div className="shrink-0 border-r border-ink-200" style={{ width: NAME_W }}>
          <div className="h-[38px] border-b border-ink-200 bg-ink-50/60" />
          {rows.map((r, i) =>
            r.kind === "group" ? (
              <div
                key={`g-${r.key}`}
                className="flex items-center bg-ink-50/60 px-3 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-500"
                style={{ height: ROW_H }}
              >
                {r.label}
              </div>
            ) : (
              // A flex row of two sibling buttons rather than one button
              // containing another: nested buttons are invalid HTML and the
              // browser resolves them by dropping one, which silently loses
              // either the row click or the link toggle.
              <div
                key={r.task.id}
                className={`flex items-center gap-1.5 pr-2 transition-colors ${
                  selectedId === r.task.id ? "bg-teal-50" : "hover:bg-ink-50"
                }`}
                style={{ height: ROW_H }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (linking && linking !== r.task.id) {
                      onLink?.(linking, r.task.id);
                      setLinking(null);
                    } else onSelect?.(r.task.id);
                  }}
                  className={`min-w-0 flex-1 truncate py-0 pl-3 text-left text-[12.5px] ${
                    selectedId === r.task.id ? "text-ink-900" : "text-ink-700"
                  }`}
                >
                  {r.task.title}
                </button>
                {r.task.owner && (
                  <span className="shrink-0 font-mono text-[10px] text-ink-400">
                    {initials(r.task.owner)}
                  </span>
                )}
                {onLink && (
                  <button
                    type="button"
                    title={
                      r.task.dependsOn ? "Clear what this waits for" : "Set what this waits for"
                    }
                    onClick={() => {
                      if (r.task.dependsOn) onLink(r.task.id, null);
                      else setLinking(r.task.id);
                    }}
                    className="shrink-0 text-ink-300 transition-colors hover:text-teal-700"
                  >
                    {r.task.dependsOn ? (
                      <Link2Off className="h-3 w-3" />
                    ) : (
                      <Link2 className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
            ),
          )}
        </div>

        {/* the timeline */}
        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            {/* header: months over days */}
            <div className="sticky top-0 z-10 h-[38px] border-b border-ink-200 bg-ink-50/60">
              <div className="relative h-[19px]">
                {bands.map((b) => (
                  <span
                    key={`${b.label}-${b.start}`}
                    className="absolute truncate border-r border-ink-200 px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-500"
                    style={{ left: b.start * dayPx, width: b.span * dayPx }}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="relative h-[19px]">
                {zoom === "day" &&
                  Array.from({ length: days }, (_, i) => (
                    <span
                      key={addDays(from, i).toISOString()}
                      className="absolute text-center font-mono text-[9.5px] tabular-nums text-ink-400"
                      style={{ left: i * dayPx, width: dayPx }}
                    >
                      {addDays(from, i).getDate()}
                    </span>
                  ))}
              </div>
            </div>

            {/* weekend shading, drawn once behind everything */}
            <div className="pointer-events-none absolute inset-x-0" style={{ top: 38, bottom: 0 }}>
              {Array.from({ length: days }, (_, i) =>
                isWeekend(addDays(from, i)) ? (
                  <div
                    key={addDays(from, i).toISOString()}
                    className="absolute inset-y-0 bg-ink-50/70"
                    style={{ left: i * dayPx, width: dayPx }}
                  />
                ) : null,
              )}
            </div>

            {/* today */}
            {todayOffset >= 0 && todayOffset < days && (
              <div
                className="pointer-events-none absolute z-20 w-px bg-teal-600"
                style={{ left: todayOffset * dayPx + dayPx / 2, top: 38, bottom: 0 }}
              >
                <span className="absolute -left-[13px] -top-[15px] rounded-sm bg-teal-600 px-1 font-mono text-[9px] text-white">
                  now
                </span>
              </div>
            )}

            {/* dependency links, under the bars */}
            <svg
              className="pointer-events-none absolute left-0 z-10"
              style={{ top: 38, width, height: rows.length * ROW_H }}
              aria-hidden="true"
            >
              <title>Dependencies</title>
              {links.map((l) => {
                const a = rowIndexOf.get(l.from);
                const b = rowIndexOf.get(l.to);
                if (a === undefined || b === undefined) return null;
                const ta = all.find((t) => t.id === l.from);
                const tb = all.find((t) => t.id === l.to);
                if (!ta || !tb) return null;
                const ba = dragged(ta);
                const bb = dragged(tb);
                if (!ba || !bb) return null;
                const x1 = (ba.offset + ba.span) * dayPx;
                const y1 = a * ROW_H + ROW_H / 2;
                const x2 = bb.offset * dayPx;
                const y2 = b * ROW_H + ROW_H / 2;
                const bad = badLink(l.from, l.to);
                const mid = Math.max(x1 + 8, x2 - 8);
                return (
                  <g key={`${l.from}-${l.to}`}>
                    <path
                      d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`}
                      fill="none"
                      stroke={bad ? "#B4531A" : "#9AA7B2"}
                      strokeWidth={bad ? 1.6 : 1.1}
                      strokeDasharray={bad ? "3 2" : undefined}
                    />
                    <path d={`M ${x2} ${y2} l -4 -3 v 6 z`} fill={bad ? "#B4531A" : "#9AA7B2"} />
                  </g>
                );
              })}
            </svg>

            {/* rows */}
            <div className="relative z-10">
              {rows.map((r) => {
                if (r.kind === "group") {
                  return (
                    <div key={`g-${r.key}`} className="bg-ink-50/40" style={{ height: ROW_H }} />
                  );
                }
                const t = r.task;
                const bar = dragged(t);
                const inCycle = problems.cycles.includes(t.id);
                return (
                  <div key={t.id} className="relative" style={{ height: ROW_H }}>
                    {bar ? (
                      bar.milestone ? (
                        <span
                          title={`${t.title} — a single date, so it is drawn as a milestone`}
                          className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 ${
                            inCycle ? "bg-[#B4531A]" : STATUS_FILL[t.status]
                          }`}
                          style={{ left: bar.offset * dayPx + dayPx / 2 - 5 }}
                        />
                      ) : (
                        <button
                          type="button"
                          onPointerDown={(e) => beginDrag(e, t, "move")}
                          onPointerMove={onDragMove}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          onClick={() => onSelect?.(t.id)}
                          title={`${t.title}${t.owner ? ` · ${t.owner}` : ""}`}
                          className={`group absolute top-1/2 flex h-[15px] -translate-y-1/2 items-center rounded-[2px] ${
                            inCycle ? "bg-[#B4531A]" : STATUS_FILL[t.status]
                          } ${onReschedule ? "cursor-grab active:cursor-grabbing" : ""} ${
                            selectedId === t.id ? "ring-2 ring-teal-600 ring-offset-1" : ""
                          } ${t.status === "done" ? "opacity-55" : ""}`}
                          style={{
                            left: bar.offset * dayPx,
                            width: Math.max(dayPx, bar.span * dayPx),
                          }}
                        >
                          {onReschedule && (
                            <>
                              <span
                                onPointerDown={(e) => beginDrag(e, t, "start")}
                                onPointerMove={onDragMove}
                                onPointerUp={endDrag}
                                className="absolute -left-0.5 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                                style={{ background: "rgba(255,255,255,0.6)" }}
                              />
                              <span
                                onPointerDown={(e) => beginDrag(e, t, "end")}
                                onPointerMove={onDragMove}
                                onPointerUp={endDrag}
                                className="absolute -right-0.5 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                                style={{ background: "rgba(255,255,255,0.6)" }}
                              />
                            </>
                          )}
                        </button>
                      )
                    ) : (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-300"
                        style={{ left: Math.max(0, todayOffset * dayPx) }}
                      >
                        no dates
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export { ZOOM };
